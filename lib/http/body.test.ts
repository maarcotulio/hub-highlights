import { describe, expect, it } from "vitest";
import type { NextRequest } from "next/server";
import { MAX_COVER_BYTES, MAX_UPLOAD_BYTES, readLimitedBody, sniffImageType } from "./body";

const png = (extra: number[] = []) =>
  new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...extra]);
const jpeg = (extra: number[] = []) => new Uint8Array([0xff, 0xd8, 0xff, ...extra]);

function streamingRequest(
  chunks: number[][],
  options: { contentLength?: string; onCancel?: () => void; failAfter?: number } = {}
): NextRequest {
  let index = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (options.failAfter === index) {
        controller.error(new Error("stream interrupted"));
        return;
      }
      const chunk = chunks[index++];
      if (chunk) controller.enqueue(new Uint8Array(chunk));
      else controller.close();
    },
    cancel() {
      options.onCancel?.();
    },
  });
  const headers = new Headers();
  if (options.contentLength !== undefined) {
    headers.set("content-length", options.contentLength);
  }
  return { body, headers } as NextRequest;
}

describe("readLimitedBody", () => {
  it("keeps the self-hosted upload ceiling at the documented 16 MiB", () => {
    expect(MAX_UPLOAD_BYTES).toBe(16_777_216);
  });

  it("keeps the cover upload ceiling aligned with the 2 MiB storage limit", () => {
    expect(MAX_COVER_BYTES).toBe(2_097_152);
  });

  it("returns payloads below the byte limit", async () => {
    const result = await readLimitedBody(streamingRequest([[1, 2], [3, 4]]), 5);

    expect([...new Uint8Array(result!)]).toEqual([1, 2, 3, 4]);
  });

  it("accepts a payload exactly at the byte limit", async () => {
    const result = await readLimitedBody(streamingRequest([[1, 2], [3, 4]]), 4);

    expect([...new Uint8Array(result!)]).toEqual([1, 2, 3, 4]);
  });

  it.each([
    ["below", "3", [1, 2, 3]],
    ["exactly at", "4", [1, 2, 3, 4]],
  ])("accepts a declared payload %s the byte limit", async (_label, contentLength, payload) => {
    const result = await readLimitedBody(streamingRequest([payload], { contentLength }), 4);

    expect([...new Uint8Array(result!)]).toEqual(payload);
  });

  it("rejects and cancels a streamed payload as soon as it exceeds the limit", async () => {
    let cancelled = false;
    const request = streamingRequest([[1, 2, 3], [4, 5]], {
      onCancel: () => {
        cancelled = true;
      },
    });

    expect(await readLimitedBody(request, 4)).toBeNull();
    expect(cancelled).toBe(true);
  });

  it("rejects an oversized declared length before consuming the stream", async () => {
    let cancelled = false;
    const request = streamingRequest([[1]], {
      contentLength: "5",
      onCancel: () => {
        cancelled = true;
      },
    });

    expect(await readLimitedBody(request, 4)).toBeNull();
    expect(cancelled).toBe(false);
  });

  it("does not trust malformed content-length metadata", async () => {
    const request = streamingRequest([[1, 2, 3], [4, 5]], { contentLength: "not-a-number" });

    expect(await readLimitedBody(request, 4)).toBeNull();
  });

  it("does not reject a small body solely because content-length is malformed", async () => {
    const request = streamingRequest([[1, 2, 3]], { contentLength: "not-a-number" });

    expect([...new Uint8Array((await readLimitedBody(request, 4))!)]).toEqual([1, 2, 3]);
  });

  it("returns an empty buffer when the request has no body", async () => {
    const request = { body: null, headers: new Headers() } as NextRequest;

    expect((await readLimitedBody(request, 4))?.byteLength).toBe(0);
  });

  it("never returns a partial body when the stream is interrupted", async () => {
    const request = streamingRequest([[1, 2], [3, 4]], { failAfter: 1 });

    await expect(readLimitedBody(request, 4)).rejects.toThrow("stream interrupted");
  });
});

describe("sniffImageType", () => {
  it("identifies PNG and JPEG from their magic bytes", () => {
    expect(sniffImageType(png([0, 0, 0, 13]))).toBe("image/png");
    expect(sniffImageType(jpeg([0xe0, 0x00]))).toBe("image/jpeg");
  });

  it("accepts an image whose body is exactly the complete magic header", () => {
    expect(sniffImageType(png())).toBe("image/png");
    expect(sniffImageType(jpeg())).toBe("image/jpeg");
  });

  it("rejects non-image payloads regardless of what the filename claimed", () => {
    // The pre-fix route derived the content type from `?filename=`, so each of
    // these would have been stored in the public bucket as an image.
    expect(sniffImageType(new TextEncoder().encode("<html>hi</html>"))).toBeNull();
    expect(sniffImageType(new TextEncoder().encode("GIF89a"))).toBeNull();
    expect(sniffImageType(new Uint8Array([0x25, 0x50, 0x44, 0x46]))).toBeNull();
  });

  it("rejects truncated headers rather than guessing", () => {
    expect(sniffImageType(new Uint8Array([]))).toBeNull();
    expect(sniffImageType(new Uint8Array([0x89, 0x50]))).toBeNull();
    expect(sniffImageType(new Uint8Array([0xff, 0xd8]))).toBeNull();
  });

  it("rejects full-length headers when only one magic byte matches", () => {
    expect(sniffImageType(new Uint8Array([0x89, 0, 0, 0, 0, 0, 0, 0]))).toBeNull();
    expect(sniffImageType(new Uint8Array([0xff, 0, 0]))).toBeNull();
  });
});
