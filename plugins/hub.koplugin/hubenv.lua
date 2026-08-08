--[[--
Minimal KEY=VALUE .env reader, so the server URL and API token can be
pre-set by editing a text file (e.g. over USB) instead of typing them on
the device's on-screen keyboard.
--]]--

local HubEnv = {}

-- Returns { KEY = "value", ... } read from `path`, or nil if the file
-- doesn't exist. Ignores blank lines and lines starting with `#`; strips
-- one layer of surrounding quotes from values.
function HubEnv.load(path)
    local f = io.open(path, "r")
    if not f then return nil end

    local values = {}
    for line in f:lines() do
        local trimmed = line:match("^%s*(.-)%s*$")
        if trimmed ~= "" and not trimmed:match("^#") then
            local key, value = trimmed:match("^([%w_]+)%s*=%s*(.-)%s*$")
            if key then
                value = value:gsub('^"(.*)"$', "%1"):gsub("^'(.*)'$", "%1")
                values[key] = value
            end
        end
    end
    f:close()
    return values
end

return HubEnv
