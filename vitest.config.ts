import { configDefaults, defineConfig } from "vitest/config";
import { fileURLToPath } from "url";

export default defineConfig({
  envDir: false,
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  test: {
    environment: "node",
    exclude: [
      ...configDefaults.exclude,
      ".stryker-tmp/**",
      "tests/integration/**/*.integration.test.ts",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "html"],
      reportsDirectory: "coverage",
      include: [
        "lib/**/*.ts",
        "app/api/**/route.ts",
        "app/**/actions.ts",
        "app/auth/confirm/page.tsx",
        "app/reset-password/page.tsx",
        "proxy.ts",
      ],
      exclude: ["**/*.test.ts", "**/*.test.tsx"],
    },
  },
});
