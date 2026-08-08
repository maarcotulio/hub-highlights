--[[--
Thin synchronous HTTP client matching the Highlights Hub webhook contract:
bearer-token auth, raw file bytes as the request body, everything else via
query params. Same blocking socket.http + ltn12 + socketutil pattern
wallabag.koplugin uses for its own API calls.
--]]--

local http = require("socket.http")
local ltn12 = require("ltn12")
local socket = require("socket")
local socketutil = require("socketutil")
local url = require("socket.url")
local logger = require("logger")

local HubClient = {}
HubClient.__index = HubClient

function HubClient:new(o)
    o = o or {}
    setmetatable(o, self)
    return o
end

-- Performs one request and returns `ok, body_or_err, status_code`.
-- `status_code` is nil when the request never reached the server at all
-- (timeout, connection refused, DNS failure, ...) — the caller's signal to
-- stop retrying the same unreachable host instead of blocking the UI thread
-- for one full timeout per remaining file. A numeric status_code (even a
-- non-2xx one) means the server did respond, so only that one item failed.
function HubClient:request(method, path, body)
    if not self.server_url or self.server_url == "" or not self.api_token or self.api_token == "" then
        return false, "not_configured", nil
    end

    local sink = {}
    local request = {
        url = self.server_url:gsub("/*$", "") .. path,
        method = method,
        headers = {
            ["Authorization"] = "Bearer " .. self.api_token,
        },
        sink = ltn12.sink.table(sink),
    }

    if body then
        request.source = ltn12.source.string(body)
        request.headers["Content-Length"] = tostring(#body)
        request.headers["Content-Type"] = "application/octet-stream"
    end

    socketutil:set_timeout(socketutil.FILE_BLOCK_TIMEOUT, socketutil.FILE_TOTAL_TIMEOUT)
    local ok, code, _, status = pcall(function()
        return socket.skip(1, http.request(request))
    end)
    socketutil:reset_timeout()

    if not ok then
        logger.warn("HubClient: request failed", request.url, code)
        return false, code, nil
    end
    if type(code) ~= "number" then
        -- http.request() returns (nil, error_string) when it never got a
        -- response — e.g. "timeout" or "connection refused" landed in `code`.
        logger.warn("HubClient: connection failed", request.url, code)
        return false, code, nil
    end
    if code < 200 or code >= 300 then
        return false, status or code, code
    end
    return true, table.concat(sink), code
end

function HubClient:uploadFile(filepath, filename)
    local f = io.open(filepath, "rb")
    if not f then return false, "cannot_open" end
    local content = f:read("*a")
    f:close()
    if not content or #content == 0 then return false, "empty" end

    local path = "/api/webhook/upload?filename=" .. url.escape(filename)
    return self:request("POST", path, content)
end

function HubClient:uploadCover(md5, pngPath)
    local f = io.open(pngPath, "rb")
    if not f then return false, "cannot_open" end
    local content = f:read("*a")
    f:close()
    if not content or #content == 0 then return false, "empty" end

    local path = "/api/webhook/cover?md5=" .. url.escape(md5) .. "&filename=cover.png"
    return self:request("POST", path, content)
end

function HubClient:heartbeat()
    return self:request("POST", "/api/webhook/heartbeat", "")
end

return HubClient
