import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { LuaHarness } from "./luaHarness";

let harness: LuaHarness;
let hubSyncSource: string;

beforeAll(() => {
  harness = new LuaHarness();
  hubSyncSource = readFileSync(
    process.env.HUBSYNC_LUA_PATH ?? join(__dirname, "..", "hub.koplugin", "hubsync.lua"),
    "utf8"
  );

  harness.run(`
    os.time = function() return test_now end
    os.remove = function(path)
      removed_files[path] = true
      return true
    end

    function newSettings(values)
      local settings = {
        values = values or {},
        save_count = 0,
        flush_count = 0,
      }
      function settings:readSetting(name, default)
        local value = self.values[name]
        if value == nil then return default end
        return value
      end
      function settings:saveSetting(name, value)
        self.values[name] = value
        self.save_count = self.save_count + 1
      end
      function settings:flush()
        self.flush_count = self.flush_count + 1
      end
      return settings
    end

    function drainScheduled()
      while #scheduled_callbacks > 0 do
        local callback = table.remove(scheduled_callbacks, 1)
        callback()
      end
    end

    package.preload["ui/network/manager"] = function()
      return {
        isOnline = function() return network_online end,
      }
    end
    package.preload["ui/uimanager"] = function()
      return {
        scheduleIn = function(_, delay, callback)
          schedule_count = schedule_count + 1
          table.insert(scheduled_delays, delay)
          if schedule_immediately then
            callback()
          else
            table.insert(scheduled_callbacks, callback)
          end
        end,
        show = function(_, message)
          table.insert(shown_messages, message)
        end,
      }
    end

    local function widget(kind)
      return {
        new = function(_, value)
          value.kind = kind
          return value
        end,
      }
    end
    package.preload["ui/widget/infomessage"] = function() return widget("info") end
    package.preload["ui/widget/notification"] = function() return widget("notification") end
    package.preload["libs/libkoreader-lfs"] = function()
      return {
        attributes = function(path) return file_attributes[path] end,
      }
    end
    package.preload["util"] = function()
      return {
        partialMD5 = function(path)
          if md5_errors[path] then error("fingerprint failed") end
          return md5_by_path[path]
        end,
      }
    end
    package.preload["logger"] = function()
      return {
        warn = function() warning_count = warning_count + 1 end,
      }
    end
    package.preload["ffi/util"] = function()
      return {
        template = function(message) return message end,
      }
    end

    HubClientStub = {}
    function HubClientStub.isValidServerUrl()
      return valid_server_url
    end
    function HubClientStub:new(properties)
      client_create_count = client_create_count + 1
      last_client_server_url = properties.server_url
      return setmetatable(properties, { __index = HubClientStub })
    end
    function HubClientStub:uploadFile(path, filename)
      table.insert(uploaded_file_paths, path)
      local behavior = upload_file_results[path]
      if behavior then return behavior.ok, behavior.error, behavior.code end
      return true, nil, 204
    end
    function HubClientStub:uploadCover(md5, path)
      table.insert(uploaded_cover_md5s, md5)
      uploaded_cover_path = path
      return cover_result.ok, cover_result.error, cover_result.code
    end
    function HubClientStub:heartbeat()
      heartbeat_count = heartbeat_count + 1
      return heartbeat_result.ok, heartbeat_result.error, heartbeat_result.code
    end
    package.preload["hubclient"] = function() return HubClientStub end

    HubLibraryStub = {}
    function HubLibraryStub.scanChangedFiles()
      return upload_queue, scan_skipped
    end
    function HubLibraryStub.statisticsPath()
      return "/settings/statistics.sqlite3"
    end
    function HubLibraryStub.changedFileEntry()
      return stats_entry, stats_changed
    end
    function HubLibraryStub.markUploaded(cache, entry)
      mark_uploaded_count = mark_uploaded_count + 1
      cache[entry.path] = {
        mtime = entry.mtime,
        size = entry.size,
        content_md5 = entry.content_md5,
        content_checked_at = test_now,
      }
    end
    package.preload["hublibrary"] = function() return HubLibraryStub end

    HubCoverStub = {
      extractCoverPng = function(filepath)
        extracted_cover_path = filepath
        return extracted_png_path
      end,
    }
    package.preload["hubcover"] = function() return HubCoverStub end

    ReadHistoryStub = { hist = {} }
    package.preload["readhistory"] = function() return ReadHistoryStub end
  `);
});

beforeEach(() => {
  harness.run(`
    test_now = 2000000
    network_online = true
    valid_server_url = true
    schedule_immediately = true
    schedule_count = 0
    scheduled_delays = {}
    scheduled_callbacks = {}
    shown_messages = {}
    warning_count = 0
    client_create_count = 0
    last_client_server_url = nil
    uploaded_file_paths = {}
    upload_file_results = {}
    uploaded_cover_md5s = {}
    uploaded_cover_path = nil
    heartbeat_count = 0
    heartbeat_result = { ok = true, error = nil, code = 204 }
    cover_result = { ok = true, error = nil, code = 204 }
    upload_queue = {}
    scan_skipped = 0
    stats_entry = nil
    stats_changed = false
    mark_uploaded_count = 0
    file_attributes = {}
    md5_by_path = {}
    md5_errors = {}
    extracted_cover_path = nil
    extracted_png_path = "/tmp/cover.png"
    removed_files = {}
    ReadHistoryStub.hist = {}
    settings = newSettings({
      server_url = "https://hub.example",
      api_token = "secret-token",
    })

    HubSync = (function()
      ${hubSyncSource}
    end)()
  `);
});

afterAll(() => {
  harness.close();
});

describe("HubSync request gates", () => {
  it("skips automatic work when automatic sync is disabled", () => {
    harness.run(`
      settings.values.auto_sync = false
      result = HubSync.run(settings, "periodic")
    `);

    expect(
      harness.boolean(
        "result.skipped == true and result.reason == 'automatic_sync_disabled'"
      )
    ).toBe(true);
    expect(harness.number("client_create_count")).toBe(0);
    expect(harness.number("schedule_count")).toBe(0);
  });

  it("fails safely when configuration, URL validation, or connectivity is missing", () => {
    harness.run(`
      missing = newSettings({})
      missing_result = HubSync.run(missing, "periodic")

      valid_server_url = false
      invalid_result = HubSync.run(settings, "periodic")
      valid_server_url = true

      network_online = false
      offline_result = HubSync.run(settings, "periodic")
    `);

    expect(
      harness.boolean(
        "missing_result.reason == 'not_configured' and " +
          "invalid_result.reason == 'invalid_url' and offline_result.reason == 'offline'"
      )
    ).toBe(true);
    expect(harness.number("client_create_count")).toBe(0);
  });

  it("applies the unreachable cooldown only to automatic passes", () => {
    harness.run(`
      settings.values.last_unreachable_at = test_now - 10
      periodic_result = HubSync.run(settings, "periodic")
      forced_result = HubSync.run(settings, "forced")
    `);

    expect(harness.boolean("periodic_result.reason == 'unreachable_cooldown'")).toBe(true);
    expect(
      harness.boolean(
        "forced_result.mode == 'forced' and HubSync.last_result == forced_result and " +
          "settings.values.last_unreachable_at == nil"
      )
    ).toBe(true);
    expect(harness.number("heartbeat_count")).toBe(1);
  });
});

describe("HubSync queue processing", () => {
  it("uploads changed files, persists their cache, and sends a heartbeat", () => {
    harness.run(`
      settings.values.server_url = "https://hub.example///"
      upload_queue = {
        {
          path = "/books/metadata.epub.lua",
          filename = "metadata.epub.lua",
          mtime = 10,
          size = 20,
          content_md5 = "metadata-md5",
        },
      }
      stats_entry = {
        path = "/settings/statistics.sqlite3",
        filename = "statistics.sqlite3",
        mtime = 30,
        size = 40,
        content_md5 = "stats-md5",
      }
      stats_changed = true

      result = HubSync.run(settings, "periodic")
      server_cache = settings.values.uploaded_files_by_server["https://hub.example"]
    `);

    expect(
      harness.boolean(
        "result == HubSync.last_result and result.files_uploaded == 2 and " +
          "result.files_failed == 0 and result.unreachable == false"
      )
    ).toBe(true);
    expect(harness.number("mark_uploaded_count")).toBe(2);
    expect(harness.number("heartbeat_count")).toBe(1);
    expect(harness.string("last_client_server_url")).toBe("https://hub.example");
    expect(
      harness.boolean(
        "server_cache['/books/metadata.epub.lua'].content_md5 == 'metadata-md5' and " +
          "server_cache['/settings/statistics.sqlite3'].content_md5 == 'stats-md5'"
      )
    ).toBe(true);
  });

  it("continues after a local file failure but stops after a connection failure", () => {
    harness.run(`
      upload_queue = {
        { path = "/books/missing.lua", filename = "missing.lua", mtime = 1, size = 1 },
        { path = "/books/live.lua", filename = "live.lua", mtime = 2, size = 2 },
      }
      upload_file_results["/books/missing.lua"] = {
        ok = false, error = "cannot_open", code = nil,
      }
      local_result = HubSync.run(settings, "periodic")

      upload_queue = {
        { path = "/books/unreachable.lua", filename = "unreachable.lua", mtime = 3, size = 3 },
        { path = "/books/not-attempted.lua", filename = "not-attempted.lua", mtime = 4, size = 4 },
      }
      upload_file_results = {
        ["/books/unreachable.lua"] = {
          ok = false, error = "timeout", code = nil,
        },
      }
      connection_result = HubSync.run(settings, "periodic")
    `);

    expect(
      harness.boolean(
        "local_result.files_failed == 1 and local_result.files_uploaded == 1 and " +
          "local_result.unreachable == false"
      )
    ).toBe(true);
    expect(
      harness.boolean(
        "connection_result.files_failed == 1 and connection_result.files_uploaded == 0 and " +
          "connection_result.unreachable == true and " +
          "connection_result.reason == 'server_unreachable'"
      )
    ).toBe(true);
    expect(
      harness.boolean(
        "#uploaded_file_paths == 3 and " +
          "uploaded_file_paths[3] == '/books/unreachable.lua' and " +
          "settings.values.last_unreachable_at == test_now"
      )
    ).toBe(true);
    expect(harness.number("heartbeat_count")).toBe(1);
  });

  it("distinguishes an HTTP heartbeat failure from an unreachable heartbeat", () => {
    harness.run(`
      heartbeat_result = { ok = false, error = "server error", code = 503 }
      http_result = HubSync.run(settings, "periodic")

      heartbeat_result = { ok = false, error = "timeout", code = nil }
      unreachable_result = HubSync.run(settings, "periodic")
    `);

    expect(
      harness.boolean(
        "http_result.heartbeat_failed == 1 and http_result.unreachable == false"
      )
    ).toBe(true);
    expect(
      harness.boolean(
        "unreachable_result.heartbeat_failed == 1 and unreachable_result.unreachable == true and " +
          "unreachable_result.reason == 'heartbeat_unreachable' and " +
          "settings.values.last_unreachable_at == test_now"
      )
    ).toBe(true);
  });

  it("keeps a 404 cover pending until metadata exists, then caches a successful retry", () => {
    harness.run(`
      local path = "/books/book.epub"
      file_attributes[path] = { modification = 10, size = 20 }
      md5_by_path[path] = "book-md5"
      settings.values.pending_covers = {
        ["https://hub.example"] = {
          [path] = { mtime = 10, size = 20 },
        },
      }
      cover_result = { ok = false, error = "missing", code = 404 }

      missing_result = HubSync.run(settings, "periodic")
      pending_after_404 =
        settings.values.pending_covers["https://hub.example"][path] ~= nil

      cover_result = { ok = true, error = nil, code = 204 }
      retry_result = HubSync.run(settings, "periodic")
      pending_after_retry =
        settings.values.pending_covers["https://hub.example"][path] ~= nil
      cover_cache = settings.values.uploaded_covers["https://hub.example"]["book-md5"]
    `);

    expect(
      harness.boolean(
        "missing_result.covers_failed == 1 and " +
          "missing_result.reason == 'cover_missing_book' and pending_after_404"
      )
    ).toBe(true);
    expect(
      harness.boolean(
        "retry_result.covers_uploaded == 1 and pending_after_retry == false and " +
          "cover_cache.source_mtime == 10 and cover_cache.source_size == 20"
      )
    ).toBe(true);
    expect(harness.boolean("removed_files['/tmp/cover.png'] == true")).toBe(true);
  });

  it("coalesces an automatic request received during an active pass", () => {
    harness.run(`
      schedule_immediately = false
      first_result = HubSync.run(settings, "periodic")
      overlapping_result = HubSync.run(settings, "periodic")
      running_before_drain = HubSync.isRunning()
      queued_before_drain = #scheduled_callbacks
      drainScheduled()
    `);

    expect(
      harness.boolean(
        "overlapping_result.skipped == true and " +
          "overlapping_result.reason == 'already_running' and running_before_drain"
      )
    ).toBe(true);
    expect(harness.number("queued_before_drain")).toBe(1);
    expect(harness.number("client_create_count")).toBe(2);
    expect(harness.number("heartbeat_count")).toBe(2);
    expect(harness.boolean("HubSync.isRunning() == false")).toBe(true);
  });

  it("cancels an in-flight automatic pass when the preference is disabled", () => {
    harness.run(`
      schedule_immediately = false
      result = HubSync.run(settings, "periodic")
      settings.values.auto_sync = false
      drainScheduled()
    `);

    expect(
      harness.boolean(
        "result.cancelled == true and result.files_uploaded == 0 and " +
          "HubSync.last_result == result"
      )
    ).toBe(true);
    expect(harness.number("heartbeat_count")).toBe(0);
  });
});
