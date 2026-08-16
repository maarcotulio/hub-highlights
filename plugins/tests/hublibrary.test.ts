import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { LuaHarness } from "./luaHarness";

let harness: LuaHarness;

beforeAll(() => {
  harness = new LuaHarness();
  const source = readFileSync(
    process.env.HUBLIBRARY_LUA_PATH ??
      join(__dirname, "..", "hub.koplugin", "hublibrary.lua"),
    "utf8"
  );

  harness.run(`
    test_now = 1000000
    os.time = function() return test_now end

    package.preload["datastorage"] = function()
      return {
        getSettingsDir = function() return "/settings" end,
      }
    end
    package.preload["logger"] = function()
      return {
        warn = function() warning_count = warning_count + 1 end,
        dbg = function() debug_count = debug_count + 1 end,
      }
    end
    package.preload["util"] = function()
      return {
        partialMD5 = function(path)
          fingerprint_calls[path] = (fingerprint_calls[path] or 0) + 1
          local node = fs_nodes[path]
          if not node or node.fingerprint_error then error("fingerprint failed") end
          return node.md5
        end,
      }
    end
    package.preload["libs/libkoreader-lfs"] = function()
      local module = {}
      function module.dir(path)
        local entries = fs_dirs[path]
        if not entries then error("directory unavailable") end
        local index = 0
        return function()
          index = index + 1
          return entries[index]
        end
      end
      function module.attributes(path, key)
        local node = fs_nodes[path]
        if key then return node and node[key] end
        return node
      end
      function module.symlinkattributes(path, key)
        local node = fs_nodes[path]
        if key == "mode" then
          return node and (node.symlink_mode or node.mode)
        end
        return node
      end
      return module
    end
    package.preload["apps/filemanager/filemanagerutil"] = function()
      return { getHomeFolder = function() return home_folder end }
    end

    HubLibrary = (function()
      ${source}
    end)()
    original_find_metadata_files = HubLibrary.findMetadataFiles
  `);
});

beforeEach(() => {
  harness.run(`
    test_now = 1000000
    home_folder = "/home"
    fs_nodes = {
      ["/home"] = { mode = "directory" },
    }
    fs_dirs = {
      ["/home"] = { ".", ".." },
    }
    fingerprint_calls = {}
    warning_count = 0
    debug_count = 0
    HubLibrary.findMetadataFiles = original_find_metadata_files
  `);
});

afterAll(() => {
  harness.close();
});

describe("HubLibrary discovery", () => {
  it("finds metadata and annotations recursively while skipping links and other files", () => {
    harness.run(`
      fs_dirs["/home"] = {
        ".", "..", "Books", "metadata.epub.lua", "notes.txt", "loop"
      }
      fs_nodes["/home/Books"] = { mode = "directory" }
      fs_nodes["/home/metadata.epub.lua"] = { mode = "file" }
      fs_nodes["/home/notes.txt"] = { mode = "file" }
      fs_nodes["/home/loop"] = { mode = "directory", symlink_mode = "link" }
      fs_dirs["/home/Books"] = {
        ".", "..", "Nested", "Novel.epub.annotations.lua", "cover.jpg"
      }
      fs_nodes["/home/Books/Nested"] = { mode = "directory" }
      fs_nodes["/home/Books/Novel.epub.annotations.lua"] = { mode = "file" }
      fs_nodes["/home/Books/cover.jpg"] = { mode = "file" }
      fs_dirs["/home/Books/Nested"] = { "metadata.pdf.lua" }
      fs_nodes["/home/Books/Nested/metadata.pdf.lua"] = { mode = "file" }

      discovered = HubLibrary.findMetadataFiles()
      discovered_set = {}
      for _, path in ipairs(discovered) do discovered_set[path] = true end
    `);

    expect(harness.number("#discovered")).toBe(3);
    expect(
      harness.boolean(
        'discovered_set["/home/metadata.epub.lua"] and ' +
          'discovered_set["/home/Books/Novel.epub.annotations.lua"] and ' +
          'discovered_set["/home/Books/Nested/metadata.pdf.lua"]'
      )
    ).toBe(true);
    expect(harness.boolean('discovered_set["/home/loop"] == nil')).toBe(true);
  });

  it("returns no files without a configured home folder", () => {
    harness.run(`
      home_folder = ""
      discovered = HubLibrary.findMetadataFiles()
    `);

    expect(harness.number("#discovered")).toBe(0);
  });

  it("stops recursive discovery at the documented depth limit", () => {
    harness.run(`
      local parent = "/home"
      for depth = 1, 22 do
        local name = "level-" .. depth
        fs_dirs[parent] = { name }
        local child = parent .. "/" .. name
        fs_nodes[child] = { mode = "directory" }
        parent = child
      end
      fs_dirs[parent] = { "metadata.epub.lua" }
      fs_nodes[parent .. "/metadata.epub.lua"] = { mode = "file" }

      discovered = HubLibrary.findMetadataFiles()
    `);

    expect(harness.number("#discovered")).toBe(0);
    expect(harness.number("warning_count")).toBe(1);
  });
});

describe("HubLibrary change cache", () => {
  it("fingerprints new files and only marks them cached after upload", () => {
    harness.run(`
      fs_nodes["/settings/statistics.sqlite3"] = {
        mode = "file", modification = 10, size = 20, md5 = "first-md5"
      }
      cache = {}
      entry, changed = HubLibrary.changedFileEntry(
        "/settings/statistics.sqlite3", "statistics.sqlite3", cache)
      cache_empty_before_mark = next(cache) == nil
      HubLibrary.markUploaded(cache, entry)
    `);

    expect(
      harness.boolean(
        "changed == true and entry.filename == 'statistics.sqlite3' and " +
          "entry.content_md5 == 'first-md5' and cache_empty_before_mark"
      )
    ).toBe(true);
    expect(
      harness.boolean(
        "cache['/settings/statistics.sqlite3'].mtime == 10 and " +
          "cache['/settings/statistics.sqlite3'].size == 20 and " +
          "cache['/settings/statistics.sqlite3'].content_checked_at == test_now"
      )
    ).toBe(true);
  });

  it("uses stat caching, then detects content drift after the daily check interval", () => {
    harness.run(`
      local path = "/settings/statistics.sqlite3"
      fs_nodes[path] = {
        mode = "file", modification = 10, size = 20, md5 = "first-md5"
      }
      cache = {}
      first_entry = HubLibrary.changedFileEntry(path, "statistics.sqlite3", cache)
      HubLibrary.markUploaded(cache, first_entry)

      fs_nodes[path].md5 = "changed-but-too-soon"
      soon_entry, soon_changed = HubLibrary.changedFileEntry(
        path, "statistics.sqlite3", cache)
      calls_before_stale_check = fingerprint_calls[path]

      test_now = test_now + 24 * 60 * 60
      stale_entry, stale_changed = HubLibrary.changedFileEntry(
        path, "statistics.sqlite3", cache)
    `);

    expect(
      harness.boolean(
        "soon_entry == nil and soon_changed == false and calls_before_stale_check == 1"
      )
    ).toBe(true);
    expect(
      harness.boolean(
        "stale_changed == true and stale_entry.content_md5 == 'changed-but-too-soon' and " +
          "fingerprint_calls['/settings/statistics.sqlite3'] == 2"
      )
    ).toBe(true);
  });

  it("backfills old cache fingerprints without forcing an upload", () => {
    harness.run(`
      local path = "/home/metadata.epub.lua"
      fs_nodes[path] = {
        mode = "file", modification = 10, size = 20, md5 = "current-md5"
      }
      cache = {
        [path] = { mtime = 10, size = 20 },
      }
      entry, changed = HubLibrary.changedFileEntry(path, nil, cache)
    `);

    expect(harness.boolean("entry == nil and changed == false")).toBe(true);
    expect(
      harness.boolean(
        "cache['/home/metadata.epub.lua'].content_md5 == 'current-md5' and " +
          "cache['/home/metadata.epub.lua'].content_checked_at == test_now"
      )
    ).toBe(true);
  });

  it("prunes deleted cache records while counting unchanged live files", () => {
    harness.run(`
      local live_path = "/home/metadata.epub.lua"
      fs_dirs["/home"] = { "metadata.epub.lua" }
      fs_nodes[live_path] = {
        mode = "file", modification = 10, size = 20, md5 = "current-md5"
      }
      cache = {
        [live_path] = {
          mtime = 10, size = 20, content_md5 = "current-md5",
          content_checked_at = test_now,
        },
        ["/home/deleted/metadata.epub.lua"] = {
          mtime = 1, size = 1, content_md5 = "stale",
          content_checked_at = test_now,
        },
      }
      changed_files, unchanged_count = HubLibrary.scanChangedFiles(cache)
    `);

    expect(harness.number("#changed_files")).toBe(0);
    expect(harness.number("unchanged_count")).toBe(1);
    expect(harness.boolean("cache['/home/deleted/metadata.epub.lua'] == nil")).toBe(true);
  });

  it("returns the KOReader statistics database path", () => {
    expect(harness.string("HubLibrary.statisticsPath()")).toBe(
      "/settings/statistics.sqlite3"
    );
  });
});
