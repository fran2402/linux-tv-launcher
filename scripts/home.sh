#!/bin/sh
# Close the app the launcher opened and bring the launcher back. Bind this to the remote's Home key.

STATE="${XDG_STATE_HOME:-$HOME/.local/state}/linux-tv-launcher"

# A Firefox the launcher started itself (your Firefox wasn't running yet).
pkill -f -- '--class tvapp' 2>/dev/null || true

if [ -n "${HYPRLAND_INSTANCE_SIGNATURE:-}" ]; then
  # The window the launcher opened in your own Firefox: close just that one, not your whole browser.
  if [ -s "$STATE/app-window" ]; then
    hyprctl dispatch "hl.dsp.window.close({ window = \"address:$(cat "$STATE/app-window")\" })" >/dev/null 2>&1 || true
    rm -f "$STATE/app-window"
  fi
  hyprctl dispatch 'hl.dsp.focus({ window = "class:^tvlauncher$" })' >/dev/null 2>&1 || true
  hyprctl dispatch 'hl.dsp.window.fullscreen_state({ internal = 2, client = 2, action = "set" })' >/dev/null 2>&1 || true
else
  i3-msg '[class="tvlauncher"] focus, fullscreen enable' >/dev/null 2>&1 || true
fi
