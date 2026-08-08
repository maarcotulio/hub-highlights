--[[--
Orchestrates one sync pass. `mode == "periodic"` is a silent background tick
(uploads changed metadata/annotations files + statistics.sqlite3 only, no UI
noise). `mode == "forced"` is the user tapping "Force sync" in the plugin
menu: same uploads, plus a backfill of covers for every book read this
calendar month (via ReadHistory), with UI feedback since it's an explicit,
deliberate action.

Every item in both queues below is processed one at a time via
UIManager:scheduleIn rather than a tight loop, so a slow/unreachable server
doesn't freeze the UI for the whole batch. If a request fails at the network
level (no response at all — the server host is unreachable), the rest of
the current queue is skipped instead of retrying the same dead host once
per remaining file: with ~15s timeouts, a real library's worth of files
would otherwise block the UI for several minutes on a single wrong
server_url.
--]]--

local NetworkMgr = require("ui/network/manager")
local UIManager = require("ui/uimanager")
local InfoMessage = require("ui/widget/infomessage")
local Notification = require("ui/widget/notification")
local lfs = require("libs/libkoreader-lfs")
local util = require("util")
local logger = require("logger")
local _ = require("gettext")
local T = require("ffi/util").template

local HubClient = require("hubclient")
local HubLibrary = require("hublibrary")
local HubCover = require("hubcover")

local HubSync = {}

local function buildMonthCoverQueue()
    local ok, ReadHistory = pcall(require, "readhistory")
    if not ok or not ReadHistory or not ReadHistory.hist then return {} end

    local now = os.date("*t")
    local month_start = os.time{
        year = now.year, month = now.month, day = 1, hour = 0, min = 0, sec = 0,
    }

    local seen = {}
    local queue = {}
    for _, item in ipairs(ReadHistory.hist) do
        if item.time and item.time >= month_start and item.select_enabled and not seen[item.file] then
            seen[item.file] = true
            table.insert(queue, item.file)
        end
    end
    return queue
end

local function buildUploadQueue(cache)
    local queue = HubLibrary.scanChangedFiles(cache)

    local stats_path = HubLibrary.statisticsPath()
    local stats_attr = lfs.attributes(stats_path)
    if stats_attr then
        local cached = cache[stats_path]
        if not cached or cached.mtime ~= stats_attr.modification or cached.size ~= stats_attr.size then
            table.insert(queue, {
                path = stats_path, filename = "statistics.sqlite3",
                mtime = stats_attr.modification, size = stats_attr.size,
            })
        end
    end
    return queue
end

-- Processes `queue[index+1]` and schedules the next one via UIManager
-- instead of looping tightly. Stops early (network_unreachable = true) on a
-- connection-level failure rather than working through the rest of the
-- queue against a host that just isn't answering.
local function processUploadQueue(client, cache, queue, index, uploaded, failed, on_done)
    index = index + 1
    if index > #queue then
        on_done(uploaded, failed, false)
        return
    end

    local entry = queue[index]
    local ok, _, http_code = client:uploadFile(entry.path, entry.filename)
    if ok then
        HubLibrary.markUploaded(cache, entry)
        uploaded = uploaded + 1
    else
        logger.warn("HubSync: upload failed for", entry.path)
        failed = failed + 1
        if http_code == nil then
            -- Never got a response at all — the server is unreachable, so
            -- every remaining item would just fail the same way. Stop here.
            on_done(uploaded, failed, true)
            return
        end
    end

    UIManager:scheduleIn(0.05, function()
        processUploadQueue(client, cache, queue, index, uploaded, failed, on_done)
    end)
end

local function processCoverQueue(client, queue, index, uploaded_count, on_done)
    index = index + 1
    if index > #queue then
        on_done(uploaded_count, false)
        return
    end

    local filepath = queue[index]
    local ok_md5, md5 = pcall(util.partialMD5, filepath)
    if ok_md5 and md5 then
        local png_path = HubCover.extractCoverPng(filepath)
        if png_path then
            local ok, _, http_code = client:uploadCover(md5, png_path)
            if ok then
                uploaded_count = uploaded_count + 1
            elseif http_code == nil then
                -- Server unreachable — same reasoning as processUploadQueue.
                os.remove(png_path)
                on_done(uploaded_count, true)
                return
            end
            os.remove(png_path)
        end
    end

    UIManager:scheduleIn(0.05, function()
        processCoverQueue(client, queue, index, uploaded_count, on_done)
    end)
end

-- settings: the plugin's LuaSettings object (server_url, api_token,
-- uploaded_files persisted there). mode: "periodic" | "forced".
function HubSync.run(settings, mode)
    mode = mode or "periodic"
    local server_url = settings:readSetting("server_url")
    local api_token = settings:readSetting("api_token")

    if not server_url or server_url == "" or not api_token or api_token == "" then
        if mode == "forced" then
            UIManager:show(InfoMessage:new{
                text = _("Highlights Hub isn't configured yet — set the server URL and API token in Settings first."),
                timeout = 4,
            })
        end
        return
    end

    if not NetworkMgr:isOnline() then
        if mode == "forced" then
            UIManager:show(InfoMessage:new{ text = _("No internet connection."), timeout = 3 })
        end
        return
    end

    local client = HubClient:new{ server_url = server_url, api_token = api_token }
    local cache = settings:readSetting("uploaded_files", {})

    local function finishSync(uploaded, failed, covers_uploaded, unreachable)
        settings:saveSetting("uploaded_files", cache)
        settings:flush()
        if not unreachable then
            client:heartbeat()
        end

        if mode == "forced" then
            local msg
            if unreachable then
                msg = _("Couldn't reach the Highlights Hub server — check the server URL in Settings.")
            elseif failed > 0 then
                msg = T(_("Sync finished with %1 error(s). %2 file(s), %3 cover(s) uploaded."),
                    failed, uploaded, covers_uploaded)
            else
                msg = T(_("Synced. %1 file(s), %2 cover(s) uploaded."), uploaded, covers_uploaded)
            end
            UIManager:show(Notification:new{ text = msg })
        end
    end

    local function runCoverBackfill(uploaded, failed, unreachable_already)
        if mode ~= "forced" or unreachable_already then
            finishSync(uploaded, failed, 0, unreachable_already)
            return
        end

        local queue = buildMonthCoverQueue()
        if #queue > 0 then
            UIManager:show(Notification:new{
                text = T(_("Syncing %1 book cover(s) read this month…"), #queue),
            })
        end
        processCoverQueue(client, queue, 0, 0, function(covers_uploaded, unreachable)
            finishSync(uploaded, failed, covers_uploaded, unreachable)
        end)
    end

    local upload_queue = buildUploadQueue(cache)
    processUploadQueue(client, cache, upload_queue, 0, 0, 0, runCoverBackfill)
end

return HubSync
