import type { NextConfig } from "next";

const isVercelBuild = process.env.VERCEL === "1";

const nextConfig: NextConfig = {
  // The Docker self-hosted image runs the traced standalone server. Vercel
  // has its own Next adapter and expects the regular .next output; keeping
  // standalone out of that build avoids its server-trace post-processing from
  // looking for a trace file that Next may not leave in the expected location.
  ...(isVercelBuild ? {} : { output: "standalone" }),
};

export default nextConfig;
