import { describe, expect, it } from "vitest";
import { sniffImageType } from "./body";

const png = (extra: number[] = []) =>
  new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...extra]);
const jpeg = (extra: number[] = []) => new Uint8Array([0xff, 0xd8, 0xff, ...extra]);

describe("sniffImageType", () => {
  it("identifies PNG and JPEG from their magic bytes", () => {
    expect(sniffImageType(png([0, 0, 0, 13]))).toBe("image/png");
    expect(sniffImageType(jpeg([0xe0, 0x00]))).toBe("image/jpeg");
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
});
