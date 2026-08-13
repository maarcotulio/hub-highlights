import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { MAX_COVER_BYTES } from "@/lib/http/body";

const mocks = vi.hoisted(() => ({
  authorizeWebhook: vi.fn(),
  findBook: vi.fn(),
  updateBook: vi.fn(),
  upload: vi.fn(),
  getPublicUrl: vi.fn(),
  fromBucket: vi.fn(),
  createAdminClient: vi.fn(),
}));

vi.mock("@/lib/webhook-auth", () => ({ authorizeWebhook: mocks.authorizeWebhook }));
vi.mock("@/lib/db", () => ({
  prisma: {
    book: { findFirst: mocks.findBook, update: mocks.updateBook },
  },
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));

import { POST } from "./route";

function coverRequest(
  filename: string,
  body: Uint8Array,
  options: { md5?: string; contentLength?: string } = {}
) {
  const md5 = options.md5 ?? "book-md5";
  const requestBody = body.buffer.slice(
    body.byteOffset,
    body.byteOffset + body.byteLength
  ) as ArrayBuffer;
  return new NextRequest(
    `https://hub.example/api/webhook/cover?md5=${encodeURIComponent(md5)}&filename=${encodeURIComponent(filename)}`,
    {
      method: "POST",
      body: requestBody,
      headers:
        options.contentLength === undefined
          ? undefined
          : { "content-length": options.contentLength },
    }
  );
}

async function expectError(response: Response, status: number) {
  expect(response.status).toBe(status);
  const body = await response.json();
  expect(body).toEqual({ error: expect.any(String) });
  expect(body.error.trim()).not.toBe("");
}

describe("POST /api/webhook/cover", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorizeWebhook.mockResolvedValue({ user: { id: "user-1" } });
    mocks.findBook.mockImplementation(async ({ where }: { where: { userId: string; md5: string } }) =>
      where.userId === "user-1" && where.md5 === "book-md5"
        ? { id: "book-1", userId: "user-1", md5: "book-md5" }
        : null
    );
    mocks.upload.mockResolvedValue({ error: null });
    mocks.getPublicUrl.mockReturnValue({ data: { publicUrl: "https://storage.example/cover" } });
    mocks.fromBucket.mockReturnValue({ upload: mocks.upload, getPublicUrl: mocks.getPublicUrl });
    mocks.createAdminClient.mockReturnValue({ storage: { from: mocks.fromBucket } });
    mocks.updateBook.mockResolvedValue({ id: "book-1" });
  });

  it("rejects an unauthenticated cover before persistence or storage", async () => {
    mocks.authorizeWebhook.mockResolvedValue({
      response: Response.json({ error: "Unauthorized" }, { status: 401 }),
    });
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

    const response = await POST(coverRequest("cover.png", png));

    await expectError(response, 401);
    expect(mocks.findBook).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.updateBook).not.toHaveBeenCalled();
  });

  it("requires a book content checksum before querying persistence", async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

    const response = await POST(coverRequest("cover.png", png, { md5: "" }));

    await expectError(response, 400);
    expect(mocks.findBook).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("uses PNG content bytes even when filename metadata claims another type", async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);

    const response = await POST(coverRequest("payload.txt", png));

    expect(response.status).toBe(200);
    expect(mocks.upload).toHaveBeenCalledWith(
      "user-1/book-1.png",
      expect.any(Uint8Array),
      { contentType: "image/png", upsert: true }
    );
  });

  it("stores and returns a successful JPEG cover with a cache-busted public URL", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_786_464_000_000);
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);

    const response = await POST(coverRequest("payload.png", jpeg));
    const coverUrl = "https://storage.example/cover?v=1786464000000";

    expect(response.status).toBe(200);
    expect(mocks.fromBucket).toHaveBeenCalledWith("covers");
    expect(mocks.upload).toHaveBeenCalledWith(
      "user-1/book-1.jpg",
      expect.any(Uint8Array),
      { contentType: "image/jpeg", upsert: true }
    );
    expect(mocks.updateBook).toHaveBeenCalledWith({
      where: { id: "book-1" },
      data: { coverUrl },
    });
    await expect(response.json()).resolves.toEqual({ ok: true, coverUrl });
  });

  it("rejects non-image bytes even when filename metadata claims PNG", async () => {
    const html = new TextEncoder().encode("<html>not an image</html>");

    const response = await POST(coverRequest("cover.png", html));

    await expectError(response, 400);
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("does not upload a cover for another user's matching book identifier", async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

    const response = await POST(coverRequest("cover.png", png, { md5: "foreign-book-md5" }));

    await expectError(response, 404);
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("rejects an oversized cover before content sniffing or storage", async () => {
    const response = await POST(
      coverRequest("cover.png", new Uint8Array(), { contentLength: String(MAX_COVER_BYTES + 1) })
    );

    await expectError(response, 413);
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("rejects an empty cover body", async () => {
    const response = await POST(coverRequest("cover.png", new Uint8Array()));

    await expectError(response, 400);
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("does not persist a cover URL when object storage rejects the upload", async () => {
    mocks.upload.mockResolvedValue({ error: { message: "Storage unavailable" } });
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);

    const response = await POST(coverRequest("cover.jpg", jpeg));

    await expectError(response, 502);
    expect(mocks.updateBook).not.toHaveBeenCalled();
  });
});
