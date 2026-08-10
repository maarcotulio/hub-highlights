-- Keep plugin metadata in English regardless of KOReader's selected language.
local _ = function(message) return message end
return {
    fullname = _("Highlights Hub"),
    description = _([[Syncs KOReader highlights, reading stats, and book covers to your Highlights Hub server.]]),
}
