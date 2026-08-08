--[[--
Highlights Hub: periodically pushes KOReader highlights, reading stats, and
book covers to a Highlights Hub server. See plugins/hub.koplugin/hubsync.lua
for the sync pass itself; this file is the KOReader-facing shell (menu,
settings dialog, scheduling, lifecycle hooks).

`is_doc_only = false` loads this into both FileManager and ReaderUI, so the
periodic timer keeps running from the file browser and `onCloseDocument`
still fires when reading.
--]]--

local DataStorage = require("datastorage")
local LuaSettings = require("luasettings")
local NetworkMgr = require("ui/network/manager")
local UIManager = require("ui/uimanager")
local MultiInputDialog = require("ui/widget/multiinputdialog")
local WidgetContainer = require("ui/widget/container/widgetcontainer")
local util = require("util")
local logger = require("logger")
local _ = require("gettext")
local T = require("ffi/util").template

local HubClient = require("hubclient")
local HubCover = require("hubcover")
local HubEnv = require("hubenv")
local HubSync = require("hubsync")

local DEFAULT_INTERVAL_MIN = 30
local INTERVAL_OPTIONS_MIN = { 15, 30, 60 }

local Hub = WidgetContainer:extend{
    name = "hub",
    is_doc_only = false,
}

function Hub:init()
    self.settings = LuaSettings:open(DataStorage:getSettingsDir() .. "/hub.lua")
    self:loadEnvFile()

    self.periodic_task = function()
        HubSync.run(self.settings, "periodic")
        self:scheduleNextSync()
    end
    self:scheduleNextSync()

    if self.ui and self.ui.menu then
        self.ui.menu:registerToMainMenu(self)
    end
end

-- Pre-seeds server_url/api_token from a .env file sitting next to this
-- plugin (self.path, set by PluginLoader), so credentials can be dropped in
-- via USB instead of typed on-device. Present and non-empty .env values win
-- over whatever's already in settings; missing ones just leave it as-is, so
-- the Settings dialog still works for anyone not using a .env file.
function Hub:loadEnvFile()
    if not self.path then return end
    local env = HubEnv.load(self.path .. "/.env")
    if not env then return end

    if env.SERVER_URL and env.SERVER_URL ~= "" then
        self.settings:saveSetting("server_url", env.SERVER_URL:gsub("/*$", ""))
    end
    if env.API_TOKEN and env.API_TOKEN ~= "" then
        self.settings:saveSetting("api_token", env.API_TOKEN)
    end
    self.settings:flush()
end

function Hub:scheduleNextSync()
    UIManager:unschedule(self.periodic_task)
    local interval_min = self.settings:readSetting("interval_min") or DEFAULT_INTERVAL_MIN
    UIManager:scheduleIn(interval_min * 60, self.periodic_task)
end

function Hub:onCloseWidget()
    UIManager:unschedule(self.periodic_task)
end

function Hub:onSuspend()
    UIManager:unschedule(self.periodic_task)
end

function Hub:onResume()
    self:scheduleNextSync()
end

function Hub:onNetworkConnected()
    HubSync.run(self.settings, "periodic")
end

-- Captures the just-closed book's cover while its document is still open
-- (DocumentRegistry ref-counts by file, so this doesn't re-render anything)
-- and uploads it immediately if online. Cheap, opportunistic complement to
-- the this-month backfill "Force sync" does.
function Hub:onCloseDocument()
    local doc = self.ui and self.ui.document
    if not doc or not doc.file then return end
    local filepath = doc.file

    local server_url = self.settings:readSetting("server_url")
    local api_token = self.settings:readSetting("api_token")
    if not server_url or server_url == "" or not api_token or api_token == "" then return end
    if not NetworkMgr:isOnline() then return end

    local ok_md5, md5 = pcall(util.partialMD5, filepath)
    if not ok_md5 or not md5 then return end

    local png_path = HubCover.extractCoverPng(filepath)
    if not png_path then return end

    local client = HubClient:new{ server_url = server_url, api_token = api_token }
    local ok = client:uploadCover(md5, png_path)
    if not ok then
        logger.dbg("Hub: onCloseDocument cover upload failed for", filepath)
    end
    os.remove(png_path)
end

function Hub:showSettingsDialog()
    self.settings_dialog = MultiInputDialog:new{
        title = _("Highlights Hub settings"),
        fields = {
            {
                text = self.settings:readSetting("server_url") or "",
                hint = _("Server URL, e.g. https://your-app.vercel.app"),
            },
            {
                text = self.settings:readSetting("api_token") or "",
                hint = _("API token (from /dashboard/settings)"),
            },
        },
        buttons = {
            {
                {
                    text = _("Cancel"),
                    id = "close",
                    callback = function()
                        UIManager:close(self.settings_dialog)
                    end,
                },
                {
                    text = _("Save"),
                    callback = function()
                        local fields = self.settings_dialog:getFields()
                        self.settings:saveSetting("server_url", fields[1]:gsub("/*$", ""))
                        self.settings:saveSetting("api_token", fields[2])
                        self.settings:flush()
                        UIManager:close(self.settings_dialog)
                    end,
                },
            },
        },
    }
    UIManager:show(self.settings_dialog)
    self.settings_dialog:onShowKeyboard()
end

function Hub:intervalMenuItems()
    local items = {}
    for _, minutes in ipairs(INTERVAL_OPTIONS_MIN) do
        table.insert(items, {
            text = T(_("Every %1 minutes"), minutes),
            keep_menu_open = true,
            checked_func = function()
                return (self.settings:readSetting("interval_min") or DEFAULT_INTERVAL_MIN) == minutes
            end,
            callback = function()
                self.settings:saveSetting("interval_min", minutes)
                self.settings:flush()
                self:scheduleNextSync()
            end,
        })
    end
    return items
end

function Hub:addToMainMenu(menu_items)
    menu_items.hub = {
        text = _("Highlights Hub"),
        sorting_hint = "more_tools",
        sub_item_table = {
            {
                text = _("Force sync"),
                keep_menu_open = true,
                callback = function()
                    HubSync.run(self.settings, "forced")
                end,
            },
            {
                text = _("Settings…"),
                keep_menu_open = true,
                callback = function()
                    self:showSettingsDialog()
                end,
            },
            {
                text = _("Sync interval"),
                sub_item_table = self:intervalMenuItems(),
            },
        },
    }
end

return Hub
