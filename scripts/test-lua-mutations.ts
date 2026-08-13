import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type Mutation = {
  name: string;
  find: string;
  replace: string;
  branchAnchor?: string;
};

type MutationTarget = {
  name: string;
  sourcePath: string;
  testPath: string;
  environmentVariable: string;
  mutations: Mutation[];
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
    branchAnchor: "if not ok then",
  },
  {
    name: "report a connection failure as success",
    find: "return false, code, nil",
    replace: "return true, code, nil",
    branchAnchor: 'if type(code) ~= "number" then',
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

const extraTargets: MutationTarget[] = [
  {
    name: "hublibrary",
    sourcePath: join(projectRoot, "plugins", "hub.koplugin", "hublibrary.lua"),
    testPath: "plugins/tests/hublibrary.test.ts",
    environmentVariable: "HUBLIBRARY_LUA_PATH",
    mutations: [
      {
        name: "remove recursive scan depth limit",
        find: "if depth > MAX_DEPTH then",
        replace: "if false then",
      },
      {
        name: "recurse through symbolic links",
        find: 'if lfs.symlinkattributes(path, "mode") ~= "link" then',
        replace: 'if lfs.symlinkattributes(path, "mode") == "link" then',
      },
      {
        name: "require a filename to match both supported patterns",
        find:
          'return name:match("^metadata%.[^.]+%.lua$") ~= nil\n' +
          '        or name:match("%.annotations%.lua$") ~= nil',
        replace:
          'return name:match("^metadata%.[^.]+%.lua$") ~= nil\n' +
          '        and name:match("%.annotations%.lua$") ~= nil',
      },
      {
        name: "extend the content verification fast path by one boundary second",
        find: "now - cached.content_checked_at < CONTENT_CHECK_INTERVAL_SEC",
        replace: "now - cached.content_checked_at <= CONTENT_CHECK_INTERVAL_SEC",
      },
      {
        name: "treat an identical fingerprint as changed",
        find: "and current_fingerprint ~= cached.content_md5 then",
        replace: "and current_fingerprint == cached.content_md5 then",
      },
      {
        name: "retain cache records for deleted books",
        find: "if not live[path] and not lfs.attributes(path) then",
        replace: "if false then",
      },
      {
        name: "cache successful uploads under the filename instead of path",
        find: "cache[entry.path] = {",
        replace: "cache[entry.filename] = {",
      },
      {
        name: "treat a new statistics file as unchanged",
        find: "return makeEntry(path, filename, attr, cached, not same_stat)",
        replace: "return makeEntry(path, filename, attr, cached, false)",
      },
    ],
  },
  {
    name: "hubsync",
    sourcePath: join(projectRoot, "plugins", "hub.koplugin", "hubsync.lua"),
    testPath: "plugins/tests/hubsync.test.ts",
    environmentVariable: "HUBSYNC_LUA_PATH",
    mutations: [
      {
        name: "disable automatic sync by default",
        find: 'return settings:readSetting("auto_sync") ~= false',
        replace: 'return settings:readSetting("auto_sync") == true',
      },
      {
        name: "invert the unreachable cooldown window",
        find: "(os.time() - last) < UNREACHABLE_COOLDOWN_SEC",
        replace: "(os.time() - last) > UNREACHABLE_COOLDOWN_SEC",
      },
      {
        name: "apply cooldown to forced sync",
        find: 'if mode == "periodic" and HubSync.isInCooldown(settings) then',
        replace: "if HubSync.isInCooldown(settings) then",
      },
      {
        name: "skip server URL validation",
        find: "if not HubClient.isValidServerUrl(server_url) then",
        replace: "if false then",
      },
      {
        name: "skip the offline guard",
        find: "if not NetworkMgr:isOnline() then",
        replace: "if false then",
      },
      {
        name: "treat a local file error as server unreachable",
        find:
          'if http_code == nil and error_code ~= "cannot_open" and error_code ~= "empty" then',
        replace: "if http_code == nil then",
        branchAnchor:
          "local ok, error_code, http_code = client:uploadFile(entry.path, entry.filename)",
      },
      {
        name: "forget a successfully uploaded file",
        find: "HubLibrary.markUploaded(cache, entry)",
        replace: "-- mutation: omit successful upload cache",
      },
      {
        name: "skip the completion heartbeat",
        find: "if not result.unreachable and not result.cancelled then",
        replace: "if false then",
      },
      {
        name: "forget the unreachable cooldown timestamp",
        find: "        HubSync.recordUnreachable(settings)",
        replace: "        -- mutation: omit unreachable timestamp",
      },
      {
        name: "leave the sync marked as running after completion",
        find: "    running = false",
        replace: "    running = true",
      },
      {
        name: "drop the pending-cover reason for a 404",
        find: "if http_code == 404 then",
        replace: "if false then",
      },
      {
        name: "drop the coalesced periodic follow-up",
        find: "if pending_periodic then",
        replace: "if false then",
      },
      {
        name: "ignore automatic-sync cancellation during a pass",
        find: 'if result.mode == "periodic" and not automaticEnabled(settings) then',
        replace: "if false then",
      },
      {
        name: "cache a successful cover under the wrong checksum",
        find: "cover_cache[md5] = {",
        replace: 'cover_cache["mutated-md5"] = {',
      },
    ],
  },
];

const targets: MutationTarget[] = [
  {
    name: "hubclient",
    sourcePath,
    testPath,
    environmentVariable: "HUBCLIENT_LUA_PATH",
    mutations,
  },
  ...extraTargets,
];

function applyMutation(source: string, mutation: Mutation): string {
  const first = source.indexOf(mutation.find);
  const last = source.lastIndexOf(mutation.find);
  if (first === -1) {
    throw new Error(`Mutation anchor not found for: ${mutation.name}`);
  }
  if (first !== last) {
    if (!mutation.branchAnchor) {
      throw new Error(`Mutation anchor is not unique for: ${mutation.name}`);
    }
    const branch = source.indexOf(mutation.branchAnchor);
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

function runBehaviorTests(target: MutationTarget, luaPath: string) {
  return spawnSync(vitest, ["run", target.testPath], {
    cwd: projectRoot,
    env: { ...process.env, [target.environmentVariable]: luaPath },
    encoding: "utf8",
    timeout: 20_000,
  });
}

const temporaryDirectory = mkdtempSync(join(tmpdir(), "hub-lua-mutations-"));
try {
  let survived = 0;
  let total = 0;

  for (const target of targets) {
    const source = readFileSync(target.sourcePath, "utf8");
    const baseline = runBehaviorTests(target, target.sourcePath);
    if (baseline.error) throw baseline.error;
    if (baseline.status !== 0) {
      process.stdout.write(baseline.stdout);
      process.stderr.write(baseline.stderr);
      throw new Error(
        `The ${target.name} Lua behavior suite must pass before mutation testing.`
      );
    }

    for (const [index, mutation] of target.mutations.entries()) {
      total += 1;
      const mutantPath = join(
        temporaryDirectory,
        `${target.name}-${index + 1}.lua`
      );
      writeFileSync(mutantPath, applyMutation(source, mutation), "utf8");
      const result = runBehaviorTests(target, mutantPath);
      if (result.error) throw result.error;

      if (result.status === 0) {
        survived += 1;
        console.error(`SURVIVED [${target.name}]: ${mutation.name}`);
      } else {
        console.log(`KILLED [${target.name}]: ${mutation.name}`);
      }
    }
  }

  if (survived > 0) {
    throw new Error(`${survived} of ${total} curated Lua mutations survived.`);
  }

  console.log(`Lua mutation score: ${total}/${total} killed.`);
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}
