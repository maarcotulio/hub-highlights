import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { MAX_UPLOAD_BYTES } from "@/lib/http/body";

const mocks = vi.hoisted(() => ({
  authorizeWebhook: vi.fn(),
  ingestUpload: vi.fn(),
}));

vi.mock("@/lib/webhook-auth", () => ({ authorizeWebhook: mocks.authorizeWebhook }));
vi.mock("@/lib/ingest", () => ({ ingestUpload: mocks.ingestUpload }));

import { POST } from "./route";

function uploadRequest(filename: string | null, body: Uint8Array, contentLength?: string) {
  const url = new URL("https://hub.example/api/webhook/upload");
  if (filename !== null) url.searchParams.set("filename", filename);
  const headers = contentLength === undefined ? undefined : { "content-length": contentLength };
  const requestBody = body.buffer.slice(
    body.byteOffset,
    body.byteOffset + body.byteLength
  ) as ArrayBuffer;
  return new NextRequest(url, { method: "POST", body: requestBody, headers });
}

describe("POST /api/webhook/upload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorizeWebhook.mockResolvedValue({ user: { id: "user-1" } });
    mocks.ingestUpload.mockResolvedValue({
      status: "success",
      kind: "highlights",
      imported: 1,
      skipped: 0,
      fileName: "metadata.epub.lua",
    });
  });

  it("stops before parsing when webhook authentication fails", async () => {
    mocks.authorizeWebhook.mockResolvedValue({
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });

    const response = await POST(uploadRequest("metadata.epub.lua", new Uint8Array([1])));

    expect(response.status).toBe(401);
    expect(mocks.ingestUpload).not.toHaveBeenCalled();
  });

  it("requires an explicit filename", async () => {
    const response = await POST(uploadRequest(null, new Uint8Array([1])));

    expect(response.status).toBe(400);
    expect(mocks.ingestUpload).not.toHaveBeenCalled();
  });

  it("passes bounded raw bytes to ingestion under the authenticated user", async () => {
    const payload = new Uint8Array([1, 2, 3, 4]);

    const response = await POST(uploadRequest("metadata.epub.lua", payload));

    expect(response.status).toBe(200);
    expect(mocks.ingestUpload).toHaveBeenCalledWith(
      "user-1",
      "metadata.epub.lua",
      expect.any(ArrayBuffer)
    );
    expect([...new Uint8Array(mocks.ingestUpload.mock.calls[0][2])]).toEqual([...payload]);
  });

  it("rejects a declared oversized payload before ingestion", async () => {
    const response = await POST(
      uploadRequest("statistics.sqlite3", new Uint8Array(), String(MAX_UPLOAD_BYTES + 1))
    );

    expect(response.status).toBe(413);
    expect(mocks.ingestUpload).not.toHaveBeenCalled();
  });

  it("maps parser rejection to a bad request response", async () => {
    mocks.ingestUpload.mockResolvedValue({
      status: "error",
      reason: "corrupt",
      fileName: "metadata.epub.lua",
    });

    const response = await POST(uploadRequest("metadata.epub.lua", new Uint8Array([1])));

    expect(response.status).toBe(400);
  });
});
