import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { lua, lauxlib, lualib, to_jsstring, to_luastring, type LuaState } from "fengari";

let state: LuaState;

function runLua(source: string): void {
  const status = lauxlib.luaL_dostring(state, to_luastring(source));
  if (status === lua.LUA_OK) return;

  const message = to_jsstring(lua.lua_tolstring(state, -1));
  lua.lua_pop(state, 1);
  throw new Error(message);
}

function luaBoolean(expression: string): boolean {
  runLua(`__test_result = (${expression})`);
  lua.lua_getglobal(state, to_luastring("__test_result"));
  const result = Boolean(lua.lua_toboolean(state, -1));
  lua.lua_pop(state, 1);
  return result;
}

function luaString(value: string): string {
  return JSON.stringify(value);
}

beforeAll(() => {
  state = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(state);

  const hubClientSource = readFileSync(
    process.env.HUBCLIENT_LUA_PATH ?? join(__dirname, "..", "hub.koplugin", "hubclient.lua"),
    "utf8"
  );
  runLua(`
    package.preload["socket.http"] = function()
      return {
        request = function(request)
          captured_request = request
          if http_behavior == "throw" then
            error("simulated socket failure")
          end
          if http_behavior == "connection_failure" then
            return nil, "timeout"
          end
          if http_behavior == "non_numeric_status" then
            return 1, "invalid status", {}, nil
          end
          if http_behavior == "server_error" then
            return 1, 503, {}, "HTTP/1.1 503 Service Unavailable"
          end
          if request.sink then
            request.sink("response body")
            request.sink(nil)
          end
          return 1, 204, {}, "HTTP/1.1 204 No Content"
        end,
      }
    end
    package.preload["ltn12"] = function()
      return {
        sink = {
          table = function(target)
            return function(chunk)
              if chunk then table.insert(target, chunk) end
              return 1
            end
          end,
        },
        source = {
          string = function(value)
            local sent = false
            return function()
              if sent then return nil end
              sent = true
              return value
            end
          end,
        },
      }
    end
    package.preload["socket"] = function()
      return {
        skip = function(count, ...)
          return select(count + 1, ...)
        end,
      }
    end
    package.preload["socketutil"] = function()
      return {
        FILE_BLOCK_TIMEOUT = 1,
        FILE_TOTAL_TIMEOUT = 1,
        set_timeout = function() end,
        reset_timeout = function() end,
      }
    end
    package.preload["socket.url"] = function()
      return { escape = function(value) return value end }
    end
    package.preload["logger"] = function()
      return { warn = function() end }
    end

    HubClient = (function()
      ${hubClientSource}
    end)()
  `);
});

beforeEach(() => {
  runLua(`
    captured_request = nil
    http_behavior = "success"
  `);
});

afterAll(() => {
  lua.lua_close(state);
});

describe("HubClient.isValidServerUrl", () => {
  it.each([
    "https://hub.example.com",
    "https://203.0.113.10:8443/path",
    "http://localhost:3000",
    "http://127.0.0.1",
    "http://127.255.255.255",
    "http://10.0.0.1",
    "http://10.255.255.255",
    "http://172.16.0.1",
    "http://172.31.255.255",
    "http://192.168.0.1",
    "http://169.254.255.255",
    "http://reader.local:8000",
    "http://[::1]:8000",
  ])("allows an encrypted or explicitly local destination: %s", (url) => {
    expect(luaBoolean(`HubClient.isValidServerUrl(${luaString(url)})`)).toBe(true);
  });

  it.each([
    "http://hub.example.com",
    "http://172.15.255.255",
    "http://172.32.0.1",
    "http://192.168.1.1.evil.com",
    "http://private-10.0.0.1.example.com",
    "http://hub.local.evil.com",
    "http://192.168.1.1@evil.com",
    "https://trusted.example@evil.com",
    "http://127.999.0.1",
    "http://10.256.0.1",
    "http://172.16.999.1",
    "http://192.168.1.999",
    "http://169.254.256.1",
    "http://010.0.0.1",
    "http://0127.0.0.1",
    "http://0172.16.0.1",
    "http://0192.168.1.1",
    "http://0169.254.1.1",
    "http://.local",
    "http://[2001:db8::1]",
    "https:// hub.example.com",
    "https://hub example.com",
    "https://?missing-host",
    "https://:443",
    "ftp://192.168.1.1",
    "//192.168.1.1",
    "not-a-url",
    "",
  ])("rejects a public, deceptive, or malformed destination: %s", (url) => {
    expect(luaBoolean(`HubClient.isValidServerUrl(${luaString(url)})`)).toBe(false);
  });

  it("rejects non-string input", () => {
    expect(luaBoolean("HubClient.isValidServerUrl(nil)")).toBe(false);
    expect(luaBoolean("HubClient.isValidServerUrl({})")).toBe(false);
  });

  it("allows exactly the 172.16 through 172.31 private range over HTTP", () => {
    for (let secondOctet = 0; secondOctet <= 255; secondOctet += 1) {
      const url = `http://172.${secondOctet}.0.1`;
      const expected = secondOctet >= 16 && secondOctet <= 31;
      expect(luaBoolean(`HubClient.isValidServerUrl(${luaString(url)})`), url).toBe(expected);
    }
  });
});

describe("HubClient.request", () => {
  it("fails before networking when either required setting is missing", () => {
    runLua(`
      local missing_url = HubClient:new{ api_token = "secret-token" }
      missing_url_ok, missing_url_error, missing_url_code = missing_url:heartbeat()
      local missing_token = HubClient:new{ server_url = "https://hub.example.com" }
      missing_token_ok, missing_token_error, missing_token_code = missing_token:heartbeat()
    `);

    expect(
      luaBoolean(
        "missing_url_ok == false and missing_url_error == 'not_configured' and missing_url_code == nil"
      )
    ).toBe(true);
    expect(
      luaBoolean(
        "missing_token_ok == false and missing_token_error == 'not_configured' and missing_token_code == nil"
      )
    ).toBe(true);
    expect(luaBoolean("captured_request == nil")).toBe(true);
  });

  it("sends the bearer token while explicitly disabling redirects", () => {
    runLua(`
      captured_request = nil
      local client = HubClient:new{
        server_url = "https://hub.example.com",
        api_token = "secret-token",
      }
      request_ok = client:request("POST", "/api/webhook/heartbeat", "")
    `);

    expect(luaBoolean("request_ok == true")).toBe(true);
    expect(luaBoolean('captured_request.headers["Authorization"] == "Bearer secret-token"')).toBe(
      true
    );
    expect(luaBoolean("captured_request.redirect == false")).toBe(true);
  });

  it("refuses an insecure destination before creating a network request", () => {
    runLua(`
      captured_request = nil
      local client = HubClient:new{
        server_url = "http://hub.example.com",
        api_token = "secret-token",
      }
      request_ok, request_error = client:request("POST", "/api/webhook/heartbeat", "")
    `);

    expect(luaBoolean("request_ok == false and request_error == 'insecure_url'")).toBe(true);
    expect(luaBoolean("captured_request == nil")).toBe(true);
  });

  it("turns a thrown socket error into a connection failure", () => {
    runLua(`
      http_behavior = "throw"
      local client = HubClient:new{
        server_url = "https://hub.example.com",
        api_token = "secret-token",
      }
      request_ok, request_error, request_code = client:heartbeat()
    `);

    expect(
      luaBoolean(
        "request_ok == false and type(request_error) == 'string' and request_code == nil"
      )
    ).toBe(true);
  });

  it.each([
    ["connection_failure", "timeout"],
    ["non_numeric_status", "invalid status"],
  ])("treats %s as a failure without an HTTP status", (behavior, error) => {
    runLua(`
      http_behavior = ${luaString(behavior)}
      local client = HubClient:new{
        server_url = "https://hub.example.com",
        api_token = "secret-token",
      }
      request_ok, request_error, request_code = client:heartbeat()
    `);

    expect(
      luaBoolean(
        `request_ok == false and request_error == ${luaString(error)} and request_code == nil`
      )
    ).toBe(true);
  });

  it("returns the status line and code for a non-2xx response", () => {
    runLua(`
      http_behavior = "server_error"
      local client = HubClient:new{
        server_url = "https://hub.example.com",
        api_token = "secret-token",
      }
      request_ok, request_error, request_code = client:heartbeat()
    `);

    expect(
      luaBoolean(
        "request_ok == false and request_error == 'HTTP/1.1 503 Service Unavailable' and request_code == 503"
      )
    ).toBe(true);
  });

  it("returns the response body and numeric code after a 2xx response", () => {
    runLua(`
      local client = HubClient:new{
        server_url = "https://hub.example.com",
        api_token = "secret-token",
      }
      request_ok, response_body, request_code = client:heartbeat()
    `);

    expect(
      luaBoolean(
        "request_ok == true and response_body == 'response body' and request_code == 204"
      )
    ).toBe(true);
  });
});
