#!/bin/sh
# Start the launcher server (if it isn't running) and open the UI full screen, in kiosk mode,
# in its own Firefox profile (window class "tvlauncher" for the i3 and Hyprland rules).
set -eu

DIR="$(cd "$(dirname "$0")/.." && pwd)"
STATE="${XDG_STATE_HOME:-$HOME/.local/state}/linux-tv-launcher"
CONFIG="${XDG_CONFIG_HOME:-$HOME/.config}/linux-tv-launcher/config.json"
[ -f "$CONFIG" ] || CONFIG="$DIR/config.json"
setting() {
  python3 -c 'import json, sys
try:
    print(json.load(open(sys.argv[1])).get(sys.argv[2], sys.argv[3]))
except OSError:
    print(sys.argv[3])' "$CONFIG" "$1" "$2"
}
PORT="$(setting port 8765)"
FIREFOX="$(setting firefox firefox)"
URL="http://127.0.0.1:$PORT"
cd "$HOME"

mkdir -p "$STATE/firefox-ui"
cp "$DIR/firefox/user-ui.js" "$STATE/firefox-ui/user.js"

if ! curl -fs "$URL/api/ping" >/dev/null 2>&1; then
  python3 "$DIR/server.py" >>"$STATE/server.log" 2>&1 &
  i=0
  while [ $i -lt 30 ] && ! curl -fs "$URL/api/ping" >/dev/null 2>&1; do
    sleep 0.2
    i=$((i + 1))
  done
fi

exec "$FIREFOX" --new-instance --kiosk --profile "$STATE/firefox-ui" --class tvlauncher --name tvlauncher "$URL/"
