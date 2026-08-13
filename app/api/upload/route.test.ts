import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import { MAX_UPLOAD_BYTES } from "@/lib/http/body";

const mocks = vi.hoisted(() => ({
  getSessionDbUser: vi.fn(),
  ingestUpload: vi.fn(),
}));

vi.mock("@/lib/currentUser", () => ({ getSessionDbUser: mocks.getSessionDbUser }));
vi.mock("@/lib/ingest", () => ({ ingestUpload: mocks.ingestUpload }));

import { POST } from "./route";

function requestWithFile(file?: File, contentLength?: string): NextRequest {
  const formData = new FormData();
  if (file) formData.set("file", file);
  const headers = new Headers();
  if (contentLength !== undefined) headers.set("content-length", contentLength);
  return { headers, formData: async () => formData } as NextRequest;
}

async function expectError(response: Response, status: number) {
  expect(response.status).toBe(status);
  const body = await response.json();
  expect(body).toEqual({ error: expect.any(String) });
  expect(body.error.trim()).not.toBe("");
}

describe("POST /api/upload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSessionDbUser.mockResolvedValue({ id: "user-1" });
    mocks.ingestUpload.mockResolvedValue({
      status: "success",
      kind: "highlights",
      imported: 1,
      skipped: 0,
      fileName: "metadata.epub.lua",
    });
  });

  it("requires an authenticated session before parsing multipart data", async () => {
    mocks.getSessionDbUser.mockResolvedValue(null);
    const request = requestWithFile(new File(["content"], "metadata.epub.lua"));
    const formData = vi.spyOn(request, "formData");

    const response = await POST(request);

    await expectError(response, 401);
    expect(formData).not.toHaveBeenCalled();
  });

  it("rejects an oversized declared request before buffering multipart data", async () => {
    const request = requestWithFile(undefined, String(MAX_UPLOAD_BYTES + 1));
    const formData = vi.spyOn(request, "formData");

    const response = await POST(request);

    await expectError(response, 413);
    expect(formData).not.toHaveBeenCalled();
  });

  it.each([
    ["below the limit", String(MAX_UPLOAD_BYTES - 1)],
    ["exactly at the limit", String(MAX_UPLOAD_BYTES)],
    ["malformed", "not-a-number"],
  ])("does not reject a valid file when declared length is %s", async (_label, contentLength) => {
    const file = new File(["content"], "metadata.epub.lua");

    const response = await POST(requestWithFile(file, contentLength));

    expect(response.status).toBe(200);
    expect(mocks.ingestUpload).toHaveBeenCalledOnce();
  });

  it("requires a file field", async () => {
    const response = await POST(requestWithFile());

    await expectError(response, 400);
    expect(mocks.ingestUpload).not.toHaveBeenCalled();
  });

  it("accepts a file exactly at the configured size limit", async () => {
    const file = new File([new Uint8Array(MAX_UPLOAD_BYTES)], "statistics.sqlite3");

    const response = await POST(requestWithFile(file));

    expect(response.status).toBe(200);
    expect(mocks.ingestUpload).toHaveBeenCalledWith(
      "user-1",
      "statistics.sqlite3",
      expect.objectContaining({ byteLength: MAX_UPLOAD_BYTES })
    );
  });

  it("maps an ingestion rejection to a bad request response", async () => {
    mocks.ingestUpload.mockResolvedValue({
      status: "error",
      reason: "corrupt",
      fileName: "metadata.epub.lua",
    });
    const file = new File(["corrupt"], "metadata.epub.lua");

    const response = await POST(requestWithFile(file));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      status: "error",
      reason: "corrupt",
      fileName: "metadata.epub.lua",
    });
  });

  it("rejects a file one byte over the configured size limit", async () => {
    const file = new File([new Uint8Array(MAX_UPLOAD_BYTES + 1)], "statistics.sqlite3");

    const response = await POST(requestWithFile(file));

    await expectError(response, 413);
    expect(mocks.ingestUpload).not.toHaveBeenCalled();
  });
});
