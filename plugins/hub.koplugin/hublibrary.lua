--[[--
Finds the files the Hub server ingests: each book's `metadata.<ext>.lua` (or
standalone `<book>.<ext>.annotations.lua`) under the KOReader home folder, and
the general `statistics.sqlite3`. Tracks per-file mtime/size plus a cheap
content fingerprint in the caller's settings cache so unchanged books aren't
re-uploaded every cycle. The cache is scoped by server URL by hubsync.lua.
--]]--

local DataStorage = require("datastorage")
local lfs = require("libs/libkoreader-lfs")
local util = require("util")
local logger = require("logger")

local HubLibrary = {}

local CONTENT_CHECK_INTERVAL_SEC = 24 * 60 * 60

local function isMetadataOrAnnotations(name)
    return name:match("^metadata%.[^.]+%.lua$") ~= nil
        or name:match("%.annotations%.lua$") ~= nil
end

-- Real e-reader libraries can be large, and some jailbreak setups have
-- symlinks that loop back on themselves. Skip links rather than recursing into
-- them and keep a hard depth limit as an additional backstop.
local MAX_DEPTH = 20

local function scanDir(dir, results, depth)
    if depth > MAX_DEPTH then
        logger.warn("HubLibrary: max scan depth reached, stopping at", dir)
        return
    end

    local ok, iter, dir_obj = pcall(lfs.dir, dir)
    if not ok then
        logger.dbg("HubLibrary: cannot open dir", dir)
        return
    end
    for entry in iter, dir_obj do
        if entry ~= "." and entry ~= ".." then
            local path = dir .. "/" .. entry
            if lfs.symlinkattributes(path, "mode") ~= "link" then
                local mode = lfs.attributes(path, "mode")
                if mode == "directory" then
                    scanDir(path, results, depth + 1)
                elseif mode == "file" and isMetadataOrAnnotations(entry) then
                    table.insert(results, path)
                end
            end
        end
    end
end

-- Recursively walks the KOReader home folder for every metadata/annotations
-- file. Falls back to no results if the home folder isn't configured yet.
function HubLibrary.findMetadataFiles()
    local ok, filemanagerutil = pcall(require, "apps/filemanager/filemanagerutil")
    local home = ok and filemanagerutil.getHomeFolder()
    if not home or home == "" then return {} end

    local results = {}
    scanDir(home, results, 0)
    return results
end

local function fingerprint(path)
    local ok, value = pcall(util.partialMD5, path)
    if ok and value then return value end
    logger.dbg("HubLibrary: could not fingerprint", path, value)
    return nil
end

local function makeEntry(path, filename, attr, cached, changed)
    local entry = {
        path = path,
        filename = filename or path:match("([^/]+)$") or path,
        mtime = attr.modification,
        size = attr.size,
    }

    -- A changed stat always gets a new fingerprint after the upload. Keeping
    -- this on the entry means markUploaded can persist it only after 2xx.
    if changed then
        entry.content_md5 = fingerprint(path)
        return entry, true
    end

    -- mtime + size remains the cheap fast path. Once a day, verify content so
    -- an editor/device that preserves both values cannot leave stale data in
    -- the server forever. Old cache entries are fingerprinted once as well,
    -- without forcing a re-upload.
    local now = os.time()
    if cached and cached.content_md5
        and cached.content_checked_at
        and now - cached.content_checked_at < CONTENT_CHECK_INTERVAL_SEC then
        return nil, false
    end

    local current_fingerprint = fingerprint(path)
    if current_fingerprint and cached and cached.content_md5
        and current_fingerprint ~= cached.content_md5 then
        entry.content_md5 = current_fingerprint
        return entry, true
    end

    if cached then
        cached.content_md5 = current_fingerprint or cached.content_md5
        cached.content_checked_at = now
    end
    return nil, false
end

-- Returns { {path=, filename=, mtime=, size=, content_md5=}, ... }, number
-- of unchanged files. `cache` is the cache for one destination server.
function HubLibrary.scanChangedFiles(cache)
    cache = cache or {}
    local changed = {}
    local unchanged = 0
    local live = {}
    for _, path in ipairs(HubLibrary.findMetadataFiles()) do
        live[path] = true
        local attr = lfs.attributes(path)
        if attr then
            local cached = cache[path]
            local same_stat = cached
                and cached.mtime == attr.modification
                and cached.size == attr.size
            local entry, is_changed = makeEntry(path, nil, attr, cached, not same_stat)
            if is_changed then
                table.insert(changed, entry)
            else
                unchanged = unchanged + 1
            end
        end
    end

    -- Do not retain cache records for deleted books/annotations. This also
    -- bounds settings-file growth after a library is reorganized.
    for path in pairs(cache) do
        if not live[path] and not lfs.attributes(path) then
            cache[path] = nil
        end
    end

    return changed, unchanged
end

-- Builds the same cache-aware entry for statistics.sqlite3, which is outside
-- the home-folder metadata scan.
function HubLibrary.changedFileEntry(path, filename, cache)
    local attr = lfs.attributes(path)
    if not attr then return nil, false end
    cache = cache or {}
    local cached = cache[path]
    local same_stat = cached
        and cached.mtime == attr.modification
        and cached.size == attr.size
    return makeEntry(path, filename, attr, cached, not same_stat)
end

function HubLibrary.markUploaded(cache, entry)
    cache[entry.path] = {
        mtime = entry.mtime,
        size = entry.size,
        content_md5 = entry.content_md5,
        content_checked_at = os.time(),
    }
end

-- Same path statistics.koplugin itself uses for its own db, and what
-- ROADMAP.md documents as `koreader/settings/statistics.sqlite3`.
function HubLibrary.statisticsPath()
    return DataStorage:getSettingsDir() .. "/statistics.sqlite3"
end

return HubLibrary
