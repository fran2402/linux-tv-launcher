# linux-tv-launcher

<img width="1907" height="1068" alt="image" src="https://github.com/user-attachments/assets/56e6908a-a0a5-4465-9899-bb4f9ecf8e5e" />
<img width="1914" height="1058" alt="image" src="https://github.com/user-attachments/assets/7ad51d1a-7336-4f80-afc7-c65aa06312b2" />


A living-room home screen for a Linux PC on a TV. A realist landscape painting from a museum's open collection (or a photo from Unsplash) fills the screen and dissolves into a glaze of its own colours on the left, where a big clock, the date, the weather and your apps sit. Everything works with a remote's arrow keys, OK and Back.

- **Your apps** along the bottom. YouTube and YouTube Music to start with; add, change, reorder and remove them from **Edit apps**, each with its own icon.
- **Paintings**: realist western oil landscapes (1600–1895) from the Cleveland Museum of Art, Art Institute of Chicago, The Met, Minneapolis Institute of Art and SMK, plus the Rijksmuseum and Harvard Art Museums with a free key. A new set every hour. Photographs that show the frame are skipped.
- **Weather** from Open-Meteo: now, the next hours (with sunset or sunrise), feels-like, wind, humidity and tomorrow. After sunset the page goes dark.
- **Now playing**: whatever a media player on the computer reports over MPRIS (YouTube Music in Firefox, Spotify, VLC…), with previous / play-pause / next.

After 5 minutes without a key press only the painting, the time and what's playing stay; the next key brings the rest back.

No dependencies beyond Python 3 (standard library only) and Firefox.

## Install

```sh
sudo pacman -S --needed python firefox curl     # or your distribution's equivalents
git clone https://github.com/fran2402/linux-tv-launcher ~/linux-tv-launcher
~/linux-tv-launcher/scripts/start.sh
```

`start.sh` starts the server (if it isn't running) and opens the launcher full screen in a separate Firefox profile in kiosk mode. To start it on login and get a Home key, use the lines in `i3/linux-tv-launcher.conf` (i3) or `hypr/linux-tv-launcher.lua` (Hyprland 0.55+). Check what your remote's Home button sends with `xev` or `wev` and bind `scripts/home.sh` to it: it closes the app the launcher opened and brings the launcher back.

## Using it

| Key | |
|---|---|
| Left / Right | Along a row |
| Up / Down | Between rows: your apps, the painting (Next, Previous, Keep this one), the player |
| OK (Enter) | Open, press |
| Back (Escape, Backspace, BrowserBack) | Back to the apps; from the apps, only the painting and the time |

A mouse works too.

## Your apps

Choose **Edit apps** (the last tile) to:

- **Add an app**: a name, a short line about it (shown when it's selected), and what it opens: a **website** (opens in a new window of your everyday Firefox, full screen) or a **program** (a command such as `flatpak run com.spotify.Client`, run without a shell).
- **Give it an icon**: choose an image file (PNG, JPEG, WebP, GIF, SVG or ICO, up to 2 MB), or type an image address, a file path or an icon-theme name (e.g. `spotify`). Leave both empty and the launcher finds one: the website's own icon, or the program's icon from your icon theme (Flatpak exports included). On the home screen every icon is drawn as a white mark.
- Move apps **Up** and **Down**, **Edit** them or **Remove** them (press Remove twice).

Up/Down move through the editor, OK presses, Back closes the form and then the editor. Changes are saved straight away.

The apps are kept in `~/.config/linux-tv-launcher/apps.json` and the icons you chose in `~/.config/linux-tv-launcher/icons/`. You can edit `apps.json` by hand too:

```json
[
  { "id": "youtube", "name": "YouTube", "about": "Videos & subscriptions", "url": "https://www.youtube.com" },
  { "id": "spotify", "name": "Spotify", "about": "Music", "cmd": ["flatpak", "run", "com.spotify.Client"], "icon": "com.spotify.Client" }
]
```

## Settings

Everything is optional. Copy `config.example.json` to `~/.config/linux-tv-launcher/config.json` (or `config.json` next to `server.py`) and change what you need:

| Key | Default | |
|---|---|---|
| `port` | `8765` | Where the server listens (always on 127.0.0.1) |
| `weather_location` | worked out from your connection | A place name like `"Zagreb"`, or `{"lat": 45.81, "lon": 15.98, "name": "Zagreb"}` |
| `weather_units` | `"celsius"` | or `"fahrenheit"` |
| `language` | `"en-GB"` | Used to look up `weather_location` |
| `home_art` | `"paintings"` | `"photos"` for Unsplash landscape photos instead (needs `unsplash_access_key`) |
| `painting_seconds` | `72` | How long each painting stays |
| `paintings_per_hour` | `50` | How many paintings are drawn each hour |
| `museums` | all that are available | e.g. `["cma", "aic", "met", "mia", "smk", "rijks", "harvard"]` |
| `rijksmuseum_key`, `harvard_key` | | Free keys from rijksmuseum.nl and harvardartmuseums.org/collections/api |
| `unsplash_access_key` | | unsplash.com/developers → New Application → Access Key |
| `unsplash_queries` | landscapes | Your own Unsplash searches, e.g. `["alpine lake", "fjord"]` |
| `firefox` | `"firefox"` | Firefox command, e.g. `"firefox-developer-edition"` |
| `firefox_profile` | Firefox's default | A profile folder for the apps' Firefox windows |

Restart the server after changing it (`pkill -f linux-tv-launcher/server.py`, then `scripts/start.sh`).

Each museum's list is refreshed weekly and kept, with the downloaded paintings (the newest 120) and the icons the launcher found, in `~/.local/state/linux-tv-launcher/`. The server log is `server.log` there.

## Developing

Run `python3 server.py` and open http://127.0.0.1:8765.

| Endpoint | |
|---|---|
| `GET /api/home` | your apps and the display settings |
| `GET /api/weather`, `/api/nowplaying` | weather; what's playing |
| `GET /api/paintings`, `/api/screensaver` | this hour's paintings; Unsplash photos |
| `GET /api/icon/app/<id>` | an app's icon |
| `POST /api/apps` | `{"apps": [...]}` replaces your apps |
| `POST /api/apps/icon` | `{"id", "data": base64 image}` sets an app's icon; `"data": null` removes it |
| `POST /api/launch` | `{"id"}` opens an app |
| `POST /api/nowplaying` | `{"action": "playpause" \| "next" \| "previous"}` |

POST requests need the header `X-TV-Launcher: 1`. That forces a CORS preflight the server never approves, so websites open in Firefox can't launch, add or change apps. Requests addressed to any host other than `127.0.0.1:<port>` or `localhost:<port>` are refused.

## Credits

Fonts (SIL Open Font License, in `web/vendor/fonts/`): DM Serif Display, Cormorant Garamond, Cormorant SC, IM Fell English, Newsreader, Instrument Sans, IBM Plex Mono. Icons: [Phosphor](https://phosphoricons.com) (MIT). Weather: [Open-Meteo](https://open-meteo.com). Paintings: the open-access collections of the museums above.

## License

MIT
