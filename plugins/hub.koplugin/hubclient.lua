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
-- Hosts that are only reachable from inside the reader's own network. Over
-- http:// the bearer token travels in clear text, so this list is what bounds
-- that exposure to a network the reader controls instead of the open internet.
-- Every IPv4 pattern is anchored at both ends on purpose: a *name* that merely
-- looks private ("10.example.com", "192.168.1.1.evil.com") must not match.
local function isPrivateHost(host)
    if host == "localhost" or host == "[::1]" then return true end

    local a, b, c, d = host:match("^(%d+)%.(%d+)%.(%d+)%.(%d+)$")
    if a then
        -- Reject ambiguous legacy forms such as 010.0.0.1. Some resolvers
        -- interpret a leading zero as octal, which would turn decimal 10 into
        -- public address 8 after this validator had classified it as private.
        if (#a > 1 and a:sub(1, 1) == "0")
            or (#b > 1 and b:sub(1, 1) == "0")
            or (#c > 1 and c:sub(1, 1) == "0")
            or (#d > 1 and d:sub(1, 1) == "0") then
            return false
        end
        a, b, c, d = tonumber(a), tonumber(b), tonumber(c), tonumber(d)
        if a > 255 or b > 255 or c > 255 or d > 255 then return false end

        if a == 127 or a == 10 then return true end
        if a == 192 and b == 168 then return true end
        if a == 169 and b == 254 then return true end

        -- 172.16/12 is 172.16 through 172.31, not the whole 172.x space — a
        -- looser 172.* check would hand the token to public addresses.
        return a == 172 and b >= 16 and b <= 31
    end

    -- .local is reserved for mDNS (RFC 6762), so it resolves on the local link
    -- only and can't be registered by anyone.
    return host:match("^.+%.local$") ~= nil
end

-- Extracts the bare host from a URL, dropping port and path.
local function hostOf(server_url)
    local authority = server_url:match("^%a[%w+.-]*://([^/?#]+)")
    if not authority then return nil end

    -- Reject userinfo instead of parsing around it: it has no legitimate use
    -- here, and "http://192.168.1.1@evil.com" reads as private at a glance
    -- while actually resolving to evil.com.
    if authority:find("@", 1, true) then return nil end
    for i = 1, #authority do
        local byte = authority:byte(i)
        if byte <= 32 or byte == 127 then return nil end
    end

    -- A bracketed IPv6 literal keeps its colons; everything else splits on the
    -- first colon to drop the port.
    local v6 = authority:match("^(%[[^%]]*%])")
    if v6 then return v6:lower() end
    return (authority:match("^([^:]+)") or ""):lower()
end

-- https:// is always accepted. http:// is accepted only for a private/LAN
-- host, which is what makes a self-hosted stack on the home network usable
-- without a certificate. The trade-off is real and deliberate: on http:// the
-- bearer token is readable by anyone else on that Wi-Fi, so the allowance
-- stops at addresses that can't be reached from outside the network.
-- Enforced here as well as at the settings/env entry points, since this is the
-- last place before the token goes on the wire.
function HubClient.isValidServerUrl(server_url)
    if type(server_url) ~= "string" then return false end
    local host = hostOf(server_url)
    if not host or host == "" then return false end
    if server_url:match("^https://") then return true end
    if not server_url:match("^http://") then return false end
    return isPrivateHost(host)
end

function HubClient:request(method, path, body)
    if not self.server_url or self.server_url == "" or not self.api_token or self.api_token == "" then
        return false, "not_configured", nil
    end
    if not HubClient.isValidServerUrl(self.server_url) then
        logger.warn("HubClient: refusing to send credentials to an insecure server URL")
        return false, "insecure_url", nil
    end

    local sink = {}
    local request = {
        url = self.server_url:gsub("/*$", "") .. path,
        method = method,
        headers = {
            ["Authorization"] = "Bearer " .. self.api_token,
        },
        sink = ltn12.sink.table(sink),
        -- luasocket follows redirects by default, and its tredirect() carries
        -- the original `headers` table over to the new location even when that
        -- location is a different host — which would hand the Authorization
        -- bearer token to whoever controls it. The Hub server never redirects,
        -- so nothing legitimate is lost by refusing to follow them.
        redirect = false,
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
