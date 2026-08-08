--[[--
Finds the files the Hub server ingests: each book's `metadata.<ext>.lua` (or
standalone `<book>.<ext>.annotations.lua`) under the KOReader home folder, and
the general `statistics.sqlite3`. Tracks per-file mtime/size in the caller's
settings cache so unchanged books aren't re-uploaded every cycle.
--]]--

local DataStorage = require("datastorage")
local lfs = require("libs/libkoreader-lfs")
local logger = require("logger")

local HubLibrary = {}

local function isMetadataOrAnnotations(name)
    return name:match("^metadata%.[^.]+%.lua$") ~= nil
        or name:match("%.annotations%.lua$") ~= nil
end

-- Real e-reader libraries can be large, and some jailbreak setups have
-- symlinks that loop back on themselves (e.g. a shortcut folder pointing at
-- an ancestor) — recursing into those without protection can hang or crash
-- the app. MAX_DEPTH is a hard backstop regardless of symlinks; entries that
-- are themselves symlinks (checked via lfs.symlinkattributes, which — unlike
-- lfs.attributes — doesn't follow the link) are skipped outright rather than
-- recursed into, since that's the actual cycle vector.
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
-- file. Falls back to no results (rather than raising) if the home folder
-- isn't configured yet, since this may run before the user has set one.
function HubLibrary.findMetadataFiles()
    local ok, filemanagerutil = pcall(require, "apps/filemanager/filemanagerutil")
    local home = ok and filemanagerutil.getHomeFolder()
    if not home or home == "" then return {} end

    local results = {}
    scanDir(home, results, 0)
    return results
end

-- Returns { {path=, filename=, mtime=, size=}, ... } for files that are new
-- or changed since the last successful upload recorded in `cache`
-- (`{ [path] = {mtime=, size=} }`, persisted by the caller in plugin settings).
function HubLibrary.scanChangedFiles(cache)
    local changed = {}
    for _, path in ipairs(HubLibrary.findMetadataFiles()) do
        local attr = lfs.attributes(path)
        if attr then
            local cached = cache[path]
            if not cached or cached.mtime ~= attr.modification or cached.size ~= attr.size then
                table.insert(changed, {
                    path = path,
                    filename = path:match("([^/]+)$") or path,
                    mtime = attr.modification,
                    size = attr.size,
                })
            end
        end
    end
    return changed
end

function HubLibrary.markUploaded(cache, entry)
    cache[entry.path] = { mtime = entry.mtime, size = entry.size }
end

-- Same path statistics.koplugin itself uses for its own db, and what
-- ROADMAP.md documents as `koreader/settings/statistics.sqlite3`.
function HubLibrary.statisticsPath()
    return DataStorage:getSettingsDir() .. "/statistics.sqlite3"
end

return HubLibrary
