/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
const config = {
  mutate: [
    "lib/safeRedirect.ts",
    "lib/securityHeaders.ts",
    "lib/http/body.ts",
    "lib/http/rateLimit.ts",
    "lib/auth/rateLimit.ts",
    "lib/apiToken.ts",
    "lib/webhook-auth.ts",
    "lib/currentUser.ts",
    "lib/auth/recoveryGrant.ts",
    "lib/parsers/koreader-lua.ts",
    "lib/parsers/koreader-sqlite.ts",
    "lib/parsers/normalize.ts",
    "lib/export/toObsidianMarkdown.ts",
    "lib/ingest.ts",
    "app/auth/confirm/actions.ts",
    "app/reset-password/actions.ts",
    "app/api/books/*/route.ts",
    "app/api/highlights/*/route.ts",
    "app/api/export/*/route.ts",
    "app/api/upload/route.ts",
    "app/api/settings/token/route.ts",
    "app/api/webhook/cover/route.ts",
    "app/api/webhook/upload/route.ts",
  ],
  testRunner: "vitest",
  vitest: {
    configFile: "vitest.config.ts",
    related: true,
  },
  checkers: ["typescript"],
  tsconfigFile: "tsconfig.json",
  coverageAnalysis: "perTest",
  concurrency: 2,
  timeoutMS: 10000,
  cleanTempDir: "always",
  reporters: ["clear-text", "progress", "html", "json"],
  htmlReporter: {
    fileName: "reports/mutation/mutation.html",
  },
  jsonReporter: {
    fileName: "reports/mutation/mutation.json",
  },
  ignorePatterns: [".next", "coverage", "dist", "data", "**/.env*"],
};

export default config;
