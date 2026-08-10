--[[--
Orchestrates one sync pass. Automatic passes upload changed metadata,
annotations and statistics, plus covers queued when a book closes. A manual
"Sync now" also backfills covers for the rolling last 30 days.

All work is serialized and each item yields back to UIManager. A cover is
never extracted or uploaded synchronously from onCloseDocument: it is persisted
as pending work and folded into the active/next sync pass.
--]]--

local NetworkMgr = require("ui/network/manager")
local UIManager = require("ui/uimanager")
local InfoMessage = require("ui/widget/infomessage")
local Notification = require("ui/widget/notification")
local lfs = require("libs/libkoreader-lfs")
local util = require("util")
local logger = require("logger")
-- Keep plugin UI text in English regardless of KOReader's selected language.
local _ = function(message) return message end
local T = require("ffi/util").template

local HubClient = require("hubclient")
local HubLibrary = require("hublibrary")
local HubCover = require("hubcover")

local HubSync = {}

-- After a connection-level failure, stay quiet for this long instead of
-- retrying (and blocking the UI) on every periodic tick / book close. Manual
-- "Sync now" always bypasses this.
local UNREACHABLE_COOLDOWN_SEC = 15 * 60
local COVER_BACKFILL_SEC = 30 * 24 * 60 * 60

local running = false
local pending_periodic = false
local cover_phase_active = false
HubSync.last_result = nil

local function serverKey(server_url)
    return (server_url or ""):gsub("/*$", "")
end

local function serverTable(settings, setting_name, server_url)
    local all = settings:readSetting(setting_name, {})
    if type(all) ~= "table" then all = {} end
    local key = serverKey(server_url)
    if type(all[key]) ~= "table" then all[key] = {} end
    return all, all[key], key
end

local function saveServerTable(settings, setting_name, all)
    settings:saveSetting(setting_name, all)
    settings:flush()
end

local function automaticEnabled(settings)
    -- nil is deliberately treated as enabled to preserve the old default for
    -- existing installations that have never seen this preference.
    return settings:readSetting("auto_sync") ~= false
end

local function automaticPassCancelled(settings, result)
    if result.mode == "periodic" and not automaticEnabled(settings) then
        result.cancelled = true
        return true
    end
    return false
end

function HubSync.isRunning()
    return running
end

function HubSync.isInCooldown(settings)
    local last = settings:readSetting("last_unreachable_at")
    return last ~= nil and (os.time() - last) < UNREACHABLE_COOLDOWN_SEC
end

function HubSync.recordUnreachable(settings)
    settings:saveSetting("last_unreachable_at", os.time())
    settings:flush()
end

function HubSync.clearUnreachable(settings)
    if settings:readSetting("last_unreachable_at") then
        settings:saveSetting("last_unreachable_at", nil)
        settings:flush()
    end
end

local function buildUploadQueue(cache)
    local queue, skipped = HubLibrary.scanChangedFiles(cache)

    local stats_path = HubLibrary.statisticsPath()
    local stats_entry, stats_changed = HubLibrary.changedFileEntry(
        stats_path, "statistics.sqlite3", cache)
    if stats_entry then
        table.insert(queue, stats_entry)
    elseif stats_changed then
        skipped = skipped + 1
    end
    return queue, skipped
end

local function addPendingCover(pending, filepath, attr)
    if filepath and attr then
        pending[filepath] = {
            mtime = attr.modification,
            size = attr.size,
        }
    end
end

local function removePendingCover(pending, removed, filepath)
    if pending[filepath] then
        removed[filepath] = pending[filepath]
        pending[filepath] = nil
    end
end

local function buildCoverQueue(settings, server_url, mode, pending, removed)
    local queue = {}
    local seen = {}

    -- Drop pending entries for files that were deleted. ReadHistory can retain
    -- paths long after a book is removed from the device.
    for filepath in pairs(pending) do
        local attr = lfs.attributes(filepath)
        if not attr then
            removePendingCover(pending, removed, filepath)
        elseif not seen[filepath] then
            seen[filepath] = true
            table.insert(queue, { filepath = filepath, pending = true })
        end
    end

    if mode ~= "forced" then return queue end

    local ok, ReadHistory = pcall(require, "readhistory")
    if not ok or not ReadHistory or not ReadHistory.hist then return queue end

    local now = os.time()
    local oldest = now - COVER_BACKFILL_SEC
    for _, item in ipairs(ReadHistory.hist) do
        if item.file and item.time
            and item.time >= oldest and item.time <= now
            and item.select_enabled and not seen[item.file] then
            -- Ignore stale history entries whose source book is gone. They do
            -- not represent an upload failure and must not create a permanent
            -- pending queue.
            if lfs.attributes(item.file) then
                seen[item.file] = true
                table.insert(queue, { filepath = item.file, pending = false })
            end
        end
    end
    return queue
end

local function processUploadQueue(client, settings, all_caches, server_url, cache,
        queue, index, result, persistCache, on_done)
    if automaticPassCancelled(settings, result) then
        on_done(false)
        return
    end
    index = index + 1
    if index > #queue then
        on_done(false)
        return
    end

    local entry = queue[index]
    local ok, error_code, http_code = client:uploadFile(entry.path, entry.filename)
    if ok then
        HubLibrary.markUploaded(cache, entry)
        result.files_uploaded = result.files_uploaded + 1
        -- Persist after every success so a power loss or partial queue does
        -- not make the next pass re-upload all preceding files.
        persistCache()
    else
        logger.warn("HubSync: upload failed for", entry.path)
        result.files_failed = result.files_failed + 1
        if http_code == nil and error_code ~= "cannot_open" and error_code ~= "empty" then
            -- Never got a response at all — every remaining item would fail
            -- against the same dead host, so stop this queue. Local file
            -- errors still count as item failures and allow the queue on.
            result.unreachable = true
            result.reason = "server_unreachable"
            on_done(true)
            return
        end
    end

    UIManager:scheduleIn(0.05, function()
        processUploadQueue(client, settings, all_caches, server_url, cache,
            queue, index, result, persistCache, on_done)
    end)
end

local function processCoverQueue(client, settings, all_caches, all_pending,
        server_url, cover_cache, pending, removed_pending, queue, index, result,
        persistCoverState, on_done)
    if automaticPassCancelled(settings, result) then
        on_done(false)
        return
    end
    index = index + 1
    if index > #queue then
        on_done(false)
        return
    end

    local item = queue[index]
    local filepath = item.filepath
    local attr = lfs.attributes(filepath)
    if not attr then
        -- A deleted history entry is not a server failure. Pending entries are
        -- removed by buildCoverQueue, but this also handles a deletion between
        -- queue construction and processing.
        removePendingCover(pending, removed_pending, filepath)
        persistCoverState()
        result.covers_skipped = result.covers_skipped + 1
        UIManager:scheduleIn(0.05, function()
            processCoverQueue(client, settings, all_caches, all_pending,
                server_url, cover_cache, pending, removed_pending,
                queue, index, result, persistCoverState, on_done)
        end)
        return
    end

    local ok_md5, md5 = pcall(util.partialMD5, filepath)
    if not ok_md5 or not md5 then
        logger.warn("HubSync: could not identify cover source", filepath)
        addPendingCover(pending, filepath, attr)
        result.covers_failed = result.covers_failed + 1
        persistCoverState()
        UIManager:scheduleIn(0.05, function()
            processCoverQueue(client, settings, all_caches, all_pending,
                server_url, cover_cache, pending, removed_pending,
                queue, index, result, persistCoverState, on_done)
        end)
        return
    end

    local cached = cover_cache[md5]
    if cached and cached.source_mtime == attr.modification
        and cached.source_size == attr.size then
        removePendingCover(pending, removed_pending, filepath)
        result.covers_skipped = result.covers_skipped + 1
        persistCoverState()
        UIManager:scheduleIn(0.05, function()
            processCoverQueue(client, settings, all_caches, all_pending,
                server_url, cover_cache, pending, removed_pending,
                queue, index, result, persistCoverState, on_done)
        end)
        return
    end

    local png_path = HubCover.extractCoverPng(filepath)
    if not png_path then
        logger.warn("HubSync: cover extraction failed for", filepath)
        addPendingCover(pending, filepath, attr)
        result.covers_failed = result.covers_failed + 1
        persistCoverState()
        UIManager:scheduleIn(0.05, function()
            processCoverQueue(client, settings, all_caches, all_pending,
                server_url, cover_cache, pending, removed_pending,
                queue, index, result, persistCoverState, on_done)
        end)
        return
    end

    local ok, error_code, http_code = client:uploadCover(md5, png_path)
    os.remove(png_path)
    if ok then
        cover_cache[md5] = {
            source_mtime = attr.modification,
            source_size = attr.size,
            uploaded_at = os.time(),
        }
        removePendingCover(pending, removed_pending, filepath)
        result.covers_uploaded = result.covers_uploaded + 1
        -- A cover is considered deduplicated only after the server confirms
        -- the upload. Persist both cache and pending work at that point.
        persistCoverState()
    else
        logger.warn("HubSync: cover upload failed for", filepath, http_code)
        addPendingCover(pending, filepath, attr)
        result.covers_failed = result.covers_failed + 1
        if http_code == 404 then
            result.reason = "cover_missing_book"
        end
        persistCoverState()
        if http_code == nil and error_code ~= "cannot_open" and error_code ~= "empty" then
            result.unreachable = true
            result.reason = "server_unreachable"
            on_done(true)
            return
        end
    end

    UIManager:scheduleIn(0.05, function()
        processCoverQueue(client, settings, all_caches, all_pending,
            server_url, cover_cache, pending, removed_pending,
            queue, index, result, persistCoverState, on_done)
    end)
end

local function errorCount(result)
    return result.files_failed + result.covers_failed + result.heartbeat_failed
end

local function finalMessage(result)
    local errors = errorCount(result)
    if result.unreachable then
        return T(_("Server unreachable. %1 file(s), %2 cover(s) uploaded; %3 error(s). Check the server URL and network."),
            result.files_uploaded, result.covers_uploaded, errors)
    end
    if errors > 0 then
        if result.reason == "cover_missing_book" then
            return T(_("Sync completed with %1 error(s): %2 file(s), %3 cover(s). The cover is pending until its book metadata is available."),
                errors, result.files_uploaded, result.covers_uploaded)
        end
        return T(_("Sync completed with %1 error(s): %2 file(s), %3 cover(s) uploaded."),
            errors, result.files_uploaded, result.covers_uploaded)
    end
    if result.files_uploaded == 0 and result.covers_uploaded == 0 then
        return _("Nothing new to sync.")
    end
    return T(_("Sync complete: %1 file(s), %2 cover(s) uploaded."),
        result.files_uploaded, result.covers_uploaded)
end

local function finishSync(settings, client, mode, result, all_caches, all_pending,
        server_url, persistCache, persistCoverState)
    if not result.unreachable and not result.cancelled then
        local heartbeat_ok, _, heartbeat_code = client:heartbeat()
        if not heartbeat_ok then
            result.heartbeat_failed = 1
            logger.warn("HubSync: heartbeat failed", heartbeat_code)
            if heartbeat_code == nil then
                result.unreachable = true
                result.reason = "heartbeat_unreachable"
            end
        end
    end

    persistCache()
    persistCoverState()
    if result.unreachable then
        HubSync.recordUnreachable(settings)
    elseif not result.cancelled then
        HubSync.clearUnreachable(settings)
    end

    running = false
    cover_phase_active = false
    HubSync.last_result = result

    if mode == "forced" then
        UIManager:show(Notification:new{ text = finalMessage(result), timeout = 5 })
    end

    -- A reconnect/timer event during a run is coalesced into one follow-up
    -- automatic pass, never a second concurrent queue.
    if pending_periodic then
        pending_periodic = false
        if automaticEnabled(settings) then
            UIManager:scheduleIn(0.1, function()
                HubSync.run(settings, "periodic")
            end)
        end
    end
end

-- Queues a cover without doing any network or document work in the close
-- callback. The pending record survives a plugin restart and is retried after
-- metadata uploads, which is important when the server returns 404 first.
function HubSync.enqueueCover(settings, filepath)
    if not automaticEnabled(settings) then return false end
    if not filepath or filepath == "" then return false end
    local server_url = settings:readSetting("server_url")
    local api_token = settings:readSetting("api_token")
    if not server_url or server_url == "" or not api_token or api_token == "" then
        return false
    end

    local attr = lfs.attributes(filepath)
    if not attr then return false end
    local all_pending, pending, key = serverTable(settings, "pending_covers", server_url)
    addPendingCover(pending, filepath, attr)
    all_pending[key] = pending
    saveServerTable(settings, "pending_covers", all_pending)

    if running then
        -- If the cover phase already passed, arrange one coalesced follow-up;
        -- otherwise the active pass reloads pending state before that phase.
        if cover_phase_active then pending_periodic = true end
    else
        HubSync.run(settings, "periodic")
    end
    return true
end

-- `mode == "periodic"` is a silent automatic/background pass. `mode ==
-- "forced"` is the explicit user action and always bypasses auto_sync and the
-- unreachable cooldown.
function HubSync.run(settings, mode)
    mode = mode or "periodic"

    if mode == "periodic" and not automaticEnabled(settings) then
        return { skipped = true, reason = "automatic_sync_disabled" }
    end

    if running then
        if mode == "periodic" then
            pending_periodic = true
        else
            UIManager:show(InfoMessage:new{
                text = _("A sync is already in progress."),
                timeout = 3,
            })
        end
        return { skipped = true, reason = "already_running" }
    end

    if mode == "forced" then
        -- This is deliberately before queue construction and network work, so
        -- even an empty sync gives immediate visual confirmation.
        UIManager:show(Notification:new{ text = _("Sync started…"), timeout = 2 })
    end

    local server_url = settings:readSetting("server_url")
    local api_token = settings:readSetting("api_token")

    if not server_url or server_url == "" or not api_token or api_token == "" then
        if mode == "forced" then
            UIManager:show(InfoMessage:new{
                text = _("Highlights Hub isn't configured yet — set the server URL and API token in Settings first."),
                timeout = 4,
            })
        end
        return { skipped = true, reason = "not_configured" }
    end

    server_url = serverKey(server_url)
    if not HubClient.isValidServerUrl(server_url) then
        if mode == "forced" then
            UIManager:show(InfoMessage:new{
                text = _("The server URL must use https://, or http:// with a local network address such as http://192.168.1.50:8000 — the API token is sent with every request, so plain http:// to a public host would expose it."),
                timeout = 5,
            })
        end
        return { skipped = true, reason = "invalid_url" }
    end

    if not NetworkMgr:isOnline() then
        if mode == "forced" then
            UIManager:show(InfoMessage:new{ text = _("No internet connection."), timeout = 3 })
        end
        return { skipped = true, reason = "offline" }
    end

    if mode == "periodic" and HubSync.isInCooldown(settings) then
        return { skipped = true, reason = "unreachable_cooldown" }
    end

    local client = HubClient:new{ server_url = server_url, api_token = api_token }
    local all_caches, cache, key = serverTable(settings, "uploaded_files_by_server", server_url)
    local all_cover_caches, cover_cache = serverTable(settings, "uploaded_covers", server_url)
    local all_pending, pending = serverTable(settings, "pending_covers", server_url)
    local removed_pending = {}

    running = true
    cover_phase_active = false
    local result = {
        mode = mode,
        files_uploaded = 0,
        files_skipped = 0,
        covers_uploaded = 0,
        covers_skipped = 0,
        files_failed = 0,
        covers_failed = 0,
        heartbeat_failed = 0,
        unreachable = false,
        cancelled = false,
        reason = nil,
    }

    local function persistCache()
        all_caches[key] = cache
        saveServerTable(settings, "uploaded_files_by_server", all_caches)
    end

    local function persistCoverState()
        -- onCloseDocument can enqueue work between two yielded cover items.
        -- Merge the latest settings value so that active work never overwrites
        -- a newly queued path; compare source stats before applying removals so
        -- a newer enqueue for the same path also wins.
        local latest_all, latest = serverTable(settings, "pending_covers", server_url)
        for filepath, state in pairs(latest) do
            if pending[filepath] == nil and removed_pending[filepath] == nil then
                pending[filepath] = state
            end
        end
        for filepath, old_state in pairs(removed_pending) do
            local latest_state = latest[filepath]
            if latest_state
                and (latest_state.mtime ~= old_state.mtime
                    or latest_state.size ~= old_state.size) then
                pending[filepath] = latest_state
            else
                latest[filepath] = nil
            end
        end
        for filepath, state in pairs(pending) do
            latest[filepath] = state
        end
        all_pending, pending = latest_all, pending
        removed_pending = {}
        all_cover_caches[key] = cover_cache
        all_pending[key] = pending
        saveServerTable(settings, "uploaded_covers", all_cover_caches)
        saveServerTable(settings, "pending_covers", all_pending)
    end

    local function complete(result_from_queue)
        finishSync(settings, client, mode, result_from_queue, all_caches,
            all_pending, server_url, persistCache, persistCoverState)
    end

    -- Delay all socket/document work one UI turn, after the immediate Force
    -- sync notification has had a chance to render.
    UIManager:scheduleIn(0, function()
        local upload_queue, skipped = buildUploadQueue(cache)
        result.files_skipped = skipped
        processUploadQueue(client, settings, all_caches, server_url, cache,
            upload_queue, 0, result, persistCache, function(unreachable)
                if unreachable then
                    complete(result)
                    return
                end

                -- Reload pending state so a book closed while files were being
                -- uploaded is included in this same pass.
                local latest_pending_all, latest_pending = serverTable(
                    settings, "pending_covers", server_url)
                all_pending, pending = latest_pending_all, latest_pending
                removed_pending = {}
                local cover_queue = buildCoverQueue(
                    settings, server_url, mode, pending, removed_pending)
                all_pending[key] = pending
                if mode == "forced" and #cover_queue > 0 then
                    UIManager:show(Notification:new{
                        text = T(_("Checking %1 cover(s)…"), #cover_queue),
                        timeout = 3,
                    })
                end
                -- Persist the force-sync window as pending before processing,
                -- so an interrupted pass can resume rather than silently drop
                -- a cover.
                for _, item in ipairs(cover_queue) do
                    local attr = lfs.attributes(item.filepath)
                    addPendingCover(pending, item.filepath, attr)
                    removed_pending[item.filepath] = nil
                end
                persistCoverState()
                cover_phase_active = true
                processCoverQueue(client, settings, all_caches, all_pending,
                    server_url, cover_cache, pending, removed_pending,
                    cover_queue, 0, result, persistCoverState,
                    function(cover_unreachable)
                        if cover_unreachable then
                            result.unreachable = true
                            result.reason = result.reason or "server_unreachable"
                        end
                        complete(result)
                    end)
            end)
    end)

    return result
end

return HubSync
