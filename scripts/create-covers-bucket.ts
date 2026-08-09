import { createClient } from "@supabase/supabase-js";

const BUCKET = "covers";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY in the environment.");
    process.exit(1);
  }

  const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

  const { data: buckets, error: listError } = await supabase.storage.listBuckets();
  if (listError) {
    console.error(listError);
    process.exit(1);
  }

  if (buckets.some((b) => b.name === BUCKET)) {
    console.log(`Bucket "${BUCKET}" already exists — nothing to do.`);
    return;
  }

  const { error } = await supabase.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: 2 * 1024 * 1024, // 2MiB, in bytes — the Storage API rejects the "2MiB" string config.toml uses
    allowedMimeTypes: ["image/png", "image/jpeg"],
  });
  if (error) {
    console.error(error);
    process.exit(1);
  }
  console.log(`Bucket "${BUCKET}" created.`);
}

main();
