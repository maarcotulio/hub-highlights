--[[--
Cover thumbnail extraction. `document:getCoverPageImage()` is implemented on
every KOReader document backend (CreDocument/PdfDocument/DjvuDocument/
PicDocument) and handles its own lazy loading — no separate render step
needed. Used both right after closing a book (document already open, near
zero extra cost) and for the this-month backfill on a forced sync (opens
each book briefly just to grab its cover).
--]]--

local DocumentRegistry = require("document/documentregistry")
local RenderImage = require("ui/renderimage")
local DataStorage = require("datastorage")
local lfs = require("libs/libkoreader-lfs")
local logger = require("logger")

local HubCover = {}

local MAX_W, MAX_H = 300, 450

-- Per-call filename. A single shared path used to be enough, but two callers
-- can be in flight at once: the cover backfill queue in hubsync.lua yields to
-- UIManager between books, and onCloseDocument fires in those gaps. Sharing
-- one file meant they could overwrite each other's PNG (uploading book A's
-- cover under book B's md5) or os.remove the file the other was about to read.
local tmp_counter = 0

local function tmpPngPath()
    local cache_dir = DataStorage:getDataDir() .. "/cache"
    if not lfs.attributes(cache_dir, "mode") then
        lfs.mkdir(cache_dir)
    end
    tmp_counter = tmp_counter + 1
    return string.format("%s/hub_cover_tmp_%d_%d.png", cache_dir, os.time(), tmp_counter)
end

-- Extracts filepath's cover, scaled down to a thumbnail, as a PNG on disk.
-- Returns the temp file path, or nil if the format is unsupported or
-- extraction otherwise fails (never raises). The caller owns the returned
-- file and is responsible for os.remove'ing it.
function HubCover.extractCoverPng(filepath)
    local ok_open, document = pcall(function()
        return DocumentRegistry:openDocument(filepath)
    end)
    if not ok_open or not document then
        return nil
    end

    local out_path
    local ok_extract, err = pcall(function()
        local bb = document:getCoverPageImage()
        if not bb then return end

        local w, h = bb:getWidth(), bb:getHeight()
        if w > MAX_W or h > MAX_H then
            local scale = math.min(MAX_W / w, MAX_H / h)
            bb = RenderImage:scaleBlitBuffer(bb, math.floor(w * scale), math.floor(h * scale), true)
        end

        out_path = tmpPngPath()
        bb:writePNG(out_path)
        bb:free()
    end)
    document:close()

    if not ok_extract then
        logger.warn("HubCover: extraction failed for", filepath, err)
        return nil
    end
    return out_path
end

return HubCover
