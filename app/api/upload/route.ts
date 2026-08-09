import { NextResponse, type NextRequest } from "next/server";
import { getSessionDbUser } from "@/lib/currentUser";
import { ingestUpload } from "@/lib/ingest";
import { MAX_UPLOAD_BYTES } from "@/lib/http/body";

export async function POST(request: NextRequest) {
  const dbUser = await getSessionDbUser();
  if (!dbUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // formData() has to buffer the whole multipart body to parse it, so the
  // only place to stop an oversized upload is before that call.
  const declared = request.headers.get("content-length");
  if (declared !== null && Number(declared) > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: `File too large (max ${MAX_UPLOAD_BYTES / (1024 * 1024)} MiB)` },
      { status: 413 }
    );
  }

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: `File too large (max ${MAX_UPLOAD_BYTES / (1024 * 1024)} MiB)` },
      { status: 413 }
    );
  }

  const result = await ingestUpload(dbUser.id, file.name, await file.arrayBuffer());
  return NextResponse.json(result, { status: result.status === "error" ? 400 : 200 });
}
