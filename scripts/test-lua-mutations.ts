import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type Mutation = {
  name: string;
  find: string;
  replace: string;
};

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = join(projectRoot, "plugins", "hub.koplugin", "hubclient.lua");
const testPath = "plugins/tests/hubclient.test.ts";
const vitest = join(
  projectRoot,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "vitest.cmd" : "vitest"
);
const source = readFileSync(sourcePath, "utf8");

// Stryker cannot parse Lua. These deliberately small, valid source mutations
// target the security and failure-handling decisions that matter most. The
// runner succeeds only when the normal Fengari behavior suite kills every one.
const mutations: Mutation[] = [
  {
    name: "accept public HTTP",
    find: 'if server_url:match("^https://") then return true end',
    replace: 'if server_url:match("^http") then return true end',
  },
  {
    name: "allow deceptive URL userinfo",
    find: 'if authority:find("@", 1, true) then return nil end',
    replace: "if false then return nil end",
  },
  {
    name: "allow a leading zero in the first IPv4 octet",
    find: '(#a > 1 and a:sub(1, 1) == "0")',
    replace: '(#a > 1 and a:sub(1, 1) == "x")',
  },
  {
    name: "allow IPv4 octets above 255",
    find: "if a > 255 or b > 255 or c > 255 or d > 255 then return false end",
    replace: "if false then return false end",
  },
  {
    name: "widen the lower 172 private-network boundary",
    find: "return a == 172 and b >= 16 and b <= 31",
    replace: "return a == 172 and b >= 0 and b <= 31",
  },
  {
    name: "widen the upper 172 private-network boundary",
    find: "return a == 172 and b >= 16 and b <= 31",
    replace: "return a == 172 and b >= 16 and b <= 255",
  },
  {
    name: "skip the required-settings guard",
    find:
      'if not self.server_url or self.server_url == "" or not self.api_token or self.api_token == "" then',
    replace: "if false then",
  },
  {
    name: "skip request-time URL validation",
    find: "if not HubClient.isValidServerUrl(self.server_url) then",
    replace: "if false then",
  },
  {
    name: "drop the bearer-token value",
    find: '["Authorization"] = "Bearer " .. self.api_token,',
    replace: '["Authorization"] = "Bearer ",',
  },
  {
    name: "follow redirects with credentials",
    find: "redirect = false,",
    replace: "redirect = true,",
  },
  {
    name: "report a thrown socket error as success",
    find: "return false, code, nil",
    replace: "return true, code, nil",
  },
  {
    name: "report a connection failure as success",
    find: "return false, code, nil",
    replace: "return true, code, nil",
  },
  {
    name: "accept non-2xx status codes",
    find: "if code < 200 or code >= 300 then",
    replace: "if code < 200 and code >= 300 then",
  },
  {
    name: "report a 2xx response as failure",
    find: "return true, table.concat(sink), code",
    replace: "return false, table.concat(sink), code",
  },
];

function applyMutation(mutation: Mutation): string {
  const first = source.indexOf(mutation.find);
  const last = source.lastIndexOf(mutation.find);
  if (first === -1) {
    throw new Error(`Mutation anchor not found for: ${mutation.name}`);
  }
  if (first !== last) {
    // Two return statements intentionally have the same text. Qualify those
    // mutations below so each branch is exercised independently.
    if (mutation.find !== "return false, code, nil") {
      throw new Error(`Mutation anchor is not unique for: ${mutation.name}`);
    }
    const branchAnchor =
      mutation.name === "report a thrown socket error as success"
        ? "if not ok then"
        : 'if type(code) ~= "number" then';
    const branch = source.indexOf(branchAnchor);
    const occurrence = source.indexOf(mutation.find, branch);
    if (branch === -1 || occurrence === -1) {
      throw new Error(`Mutation branch anchor not found for: ${mutation.name}`);
    }
    return `${source.slice(0, occurrence)}${mutation.replace}${source.slice(
      occurrence + mutation.find.length
    )}`;
  }
  return `${source.slice(0, first)}${mutation.replace}${source.slice(first + mutation.find.length)}`;
}

function runBehaviorTests(luaPath: string) {
  return spawnSync(vitest, ["run", testPath], {
    cwd: projectRoot,
    env: { ...process.env, HUBCLIENT_LUA_PATH: luaPath },
    encoding: "utf8",
    timeout: 20_000,
  });
}

const temporaryDirectory = mkdtempSync(join(tmpdir(), "hub-lua-mutations-"));
try {
  const baseline = runBehaviorTests(sourcePath);
  if (baseline.error) throw baseline.error;
  if (baseline.status !== 0) {
    process.stdout.write(baseline.stdout);
    process.stderr.write(baseline.stderr);
    throw new Error("The baseline Lua behavior suite must pass before mutation testing.");
  }

  let survived = 0;
  for (const [index, mutation] of mutations.entries()) {
    const mutantPath = join(temporaryDirectory, `hubclient-${index + 1}.lua`);
    writeFileSync(mutantPath, applyMutation(mutation), "utf8");
    const result = runBehaviorTests(mutantPath);
    if (result.error) throw result.error;

    if (result.status === 0) {
      survived += 1;
      console.error(`SURVIVED: ${mutation.name}`);
    } else {
      console.log(`KILLED: ${mutation.name}`);
    }
  }

  if (survived > 0) {
    throw new Error(`${survived} of ${mutations.length} curated Lua mutations survived.`);
  }

  console.log(`Lua mutation score: ${mutations.length}/${mutations.length} killed.`);
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}
