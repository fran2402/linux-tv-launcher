-- linux-tv-launcher on Hyprland (0.55+, Lua config): paste these into ~/.config/hypr/hyprland.lua.
-- The i3 equivalent is i3/linux-tv-launcher.conf. Firefox sets its Wayland app id from --name.
-- mainMod is whatever your config's SUPER/mod key local is already called.

-- Start on login, inside your existing hyprland.start handler:
-- hl.on("hyprland.start", function()
--   hl.exec_cmd("~/linux-tv-launcher/scripts/start.sh")
-- end)

-- Home key: close whatever is playing and bring the launcher back, full screen.
-- home.sh closes the Firefox window the launcher opened, then refocuses the launcher and
-- sets it full screen.
local tvHome = "~/linux-tv-launcher/scripts/home.sh"
hl.bind("XF86HomePage",        hl.dsp.exec_cmd(tvHome))
hl.bind(mainMod .. " + Escape", hl.dsp.exec_cmd(tvHome))

-- Full screen, no chrome: the launcher. Sites open in your normal Firefox, which the
-- launcher puts full screen itself.
hl.window_rule({
    name  = "tv-launcher-fullscreen",
    match = { class = "^tvlauncher$" },

    fullscreen  = true,
    border_size = 0,
    rounding    = 0,
})

-- Apps the launcher opens in your normal Firefox profile: when the launcher starts
-- Firefox it uses the app id "tvapp", and this puts it full screen on top of the launcher,
-- like an overlay. Firefox is told too, so it's its own F11 full screen (toolbars slide
-- down at the top edge). If Firefox was already running, server.py fullscreens the new
-- window itself. Home (home.sh) closes it and the launcher takes full screen back.
hl.window_rule({
    name  = "tv-launcher-firefox-overlay",
    match = { class = "^tvapp$" },

    fullscreen  = true,
    border_size = 0,
    rounding    = 0,
})

-- Keep the launcher full screen on its own: when the app window covering it
-- closes, Hyprland refocuses the launcher automatically (there's nothing else left on
-- that workspace to focus) but it comes back tiled, not full screen, because the rule
-- above only forces fullscreen once, the moment a window first opens. This repeating
-- timer re-forces it the instant that happens, and only then: it acts solely on
-- "tvlauncher is the active window but isn't full screen", so it never steals focus
-- away from whatever you're doing on another workspace. fullscreen_state with action
-- "set" is a harmless no-op on any tick where it's not needed.
hl.timer(function()
    local launcher = hl.get_windows({ class = "^tvlauncher$" })[1]
    if launcher and launcher.active and launcher.fullscreen ~= 2 then
        hl.exec_cmd([[hyprctl dispatch 'hl.dsp.window.fullscreen_state({ internal = 2, client = 2, action = "set" })']])
    end
end, { timeout = 400, type = "repeat" })
