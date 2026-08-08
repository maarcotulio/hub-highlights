import { defineConfig } from "vitest/config";
import { fileURLToPath } from "url";

export default defineConfig({
  envDir: false,
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  test: {
    environment: "node",
  },
});
