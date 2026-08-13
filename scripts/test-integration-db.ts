import { spawnSync, type SpawnSyncOptions } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const integrationRoot = join(projectRoot, "tests", "integration");
const projectId = "hub-integration";
const databaseUrl = "postgresql://postgres:postgres@127.0.0.1:55322/postgres";
const binaryExtension = process.platform === "win32" ? ".cmd" : "";

function localBinary(name: string) {
  const path = join(projectRoot, "node_modules", ".bin", `${name}${binaryExtension}`);
  if (!existsSync(path)) {
    throw new Error(`Missing local ${name} binary. Run the project's normal dependency install first.`);
  }
  return path;
}

const commandEnvironment = {
  ...process.env,
  SUPABASE_TELEMETRY_DISABLED: "1",
};

function run(command: string, args: string[], options: SpawnSyncOptions = {}) {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    env: commandEnvironment,
    stdio: "inherit",
    ...options,
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} exited with status ${result.status}`);
  }
}

function assertLoopbackDatabase(url: string) {
  const parsed = new URL(url);
  const loopbackHosts = new Set(["127.0.0.1", "localhost", "[::1]"]);
  if (
    !["postgres:", "postgresql:"].includes(parsed.protocol) ||
    !loopbackHosts.has(parsed.hostname) ||
    parsed.port !== "55322" ||
    parsed.pathname !== "/postgres"
  ) {
    throw new Error(`Refusing to run destructive integration tests against ${parsed.origin}`);
  }
}

const supabase = localBinary("supabase");
const prisma = localBinary("prisma");
const vitest = localBinary("vitest");

assertLoopbackDatabase(databaseUrl);

let started = false;
try {
  const docker = spawnSync("docker", ["info"], { stdio: "ignore" });
  if (docker.error || docker.status !== 0) {
    throw new Error(
      "The local database integration suite requires Docker to be installed and running."
    );
  }
  run(supabase, ["db", "start", "--workdir", integrationRoot]);
  started = true;

  const databaseEnvironment = {
    ...commandEnvironment,
    DATABASE_URL: databaseUrl,
    DIRECT_URL: databaseUrl,
  };

  run(prisma, ["migrate", "deploy"], { env: databaseEnvironment });
  run(vitest, ["run", "--config", "vitest.integration.config.ts"], {
    env: databaseEnvironment,
  });
} finally {
  if (started) {
    run(supabase, ["stop", "--workdir", integrationRoot, "--project-id", projectId, "--no-backup"]);
  }
}
