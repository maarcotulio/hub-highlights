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
local UIManager = require("ui/uimanager")
local MultiInputDialog = require("ui/widget/multiinputdialog")
local InfoMessage = require("ui/widget/infomessage")
local logger = require("logger")
local WidgetContainer = require("ui/widget/container/widgetcontainer")
-- Keep plugin UI text in English regardless of KOReader's selected language.
local _ = function(message) return message end
local T = require("ffi/util").template

local HubClient = require("hubclient")
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
        -- Keep the preference check in the callback as well as in the
        -- scheduler: a timer may already be queued when the user turns auto
        -- sync off.
        if self:isAutomaticSyncEnabled() then
            HubSync.run(self.settings, "periodic")
        end
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
--
-- The file is deleted once consumed. It has served its purpose the moment the
-- values reach plugin settings, and leaving it behind kept a second copy of
-- the API token in clear text on a device that mounts as USB mass storage —
-- readable by anyone who plugs in a cable, with no password prompt anywhere.
function Hub:loadEnvFile()
    if not self.path then return end
    local env_path = self.path .. "/.env"
    local env = HubEnv.load(env_path)
    if not env then return end

    if env.SERVER_URL and env.SERVER_URL ~= "" then
        local server_url = env.SERVER_URL:gsub("/*$", "")
        if HubClient.isValidServerUrl(server_url) then
            self.settings:saveSetting("server_url", server_url)
        else
            logger.warn("Hub: ignoring insecure SERVER_URL from .env")
        end
    end
    if env.API_TOKEN and env.API_TOKEN ~= "" then
        self.settings:saveSetting("api_token", env.API_TOKEN)
    end
    self.settings:flush()
    os.remove(env_path)
end

function Hub:isAutomaticSyncEnabled()
    -- nil preserves the historical default for settings files created before
    -- the toggle existed.
    return self.settings:readSetting("auto_sync") ~= false
end

function Hub:scheduleNextSync()
    UIManager:unschedule(self.periodic_task)
    if not self:isAutomaticSyncEnabled() then return end
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
    if self:isAutomaticSyncEnabled() then
        HubSync.run(self.settings, "periodic")
    end
end

-- Queue the just-closed book's cover. Extraction and HTTP happen in the
-- serialized sync worker instead of blocking the reader callback. The worker
-- persists this item so an offline close is retried later.
function Hub:onCloseDocument()
    if not self:isAutomaticSyncEnabled() then return end
    local doc = self.ui and self.ui.document
    if not doc or not doc.file then return end
    HubSync.enqueueCover(self.settings, doc.file)
end

function Hub:showSettingsDialog()
    self.settings_dialog = MultiInputDialog:new{
        title = _("Highlights Hub settings"),
        fields = {
            {
                text = self.settings:readSetting("server_url") or "",
                hint = _("Server URL, e.g. https://your-app.vercel.app or http://192.168.1.50:8000"),
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
                        local server_url = fields[1]:gsub("/*$", "")
                        -- Refuse public-host http:// here rather than silently
                        -- syncing the token in clear text across the internet.
                        if not HubClient.isValidServerUrl(server_url) then
                            UIManager:show(InfoMessage:new{
                                text = _("The server URL must use https://, or http:// with a local network address such as http://192.168.1.50:8000 — the API token is sent with every request, so plain http:// to a public host would expose it."),
                                timeout = 5,
                            })
                            return
                        end
                        self.settings:saveSetting("server_url", server_url)
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
    for _idx, minutes in ipairs(INTERVAL_OPTIONS_MIN) do
        table.insert(items, {
            text = T(_("Every %1 minutes"), minutes),
            keep_menu_open = true,
            enabled_func = function()
                return self:isAutomaticSyncEnabled()
            end,
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
        sorting_hint = "network",
        sub_item_table = {
            {
                text = _("Sync now"),
                keep_menu_open = true,
                enabled_func = function()
                    return not HubSync.isRunning()
                end,
                callback = function()
                    HubSync.run(self.settings, "forced")
                end,
            },
            {
                text = _("Automatic sync"),
                keep_menu_open = true,
                checked_func = function()
                    return self:isAutomaticSyncEnabled()
                end,
                callback = function()
                    self.settings:saveSetting("auto_sync", not self:isAutomaticSyncEnabled())
                    self.settings:flush()
                    self:scheduleNextSync()
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
