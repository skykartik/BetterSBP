# Changelog

Older notes (newest at the bottom).



Fullscreen console-style dashboard for Windows with Steam integration.

## Run
1. Install Node.js (https://nodejs.org)
2. In this folder: `npm install` then `npm start`

## Keys
Arrows move, Enter selects, Esc/Backspace goes back, Tab or Q/E switches tabs,
F1/Home opens Control Center, O options, F search, Ctrl+Q quits,
Ctrl+Alt+D brings the dashboard back after a game.
Gamepad: D-pad/stick, A select, B back, X options, Y search, LB/RB tabs, Guide/Start Control Center.

## What is automatic
- Installed Steam games (all library folders), real games only (tools/DLC/runtimes hidden)
- Background, logo, cover, description, genres, trailer from Steam (cached)
- Game soundtrack: yt-dlp is downloaded automatically on first run, then each game's OST is cached
  and starts playing when you hover the game
- Steam news in Explore; playtime from your Steam account

## Optional
`%APPDATA%/dash/config.json`:
`{ "steamApiKey": "KEY", "ost": true }`
The API key adds trophy progress (needs a public Steam profile).

Power menu is disabled by default: set `POWER_ENABLED = true` in main.js.
Preview without Electron: open renderer/index.html in a browser (demo data).

## In-app Steam (v0.3)

Everything stays inside betterSBP and works with keyboard, mouse and gamepad:

- **Settings** (all 13 pages): Network (with connection test), Users and Accounts, Family (PIN), System, Storage, Sound, Screen, Accessories, Saved Data, Notifications, Captures. No page opens an external window.
- **Library** (all owned games, installed marked), **Store** (featured shelves + on-screen-keyboard search + game pages), **Gallery** (Steam, betterSBP and Windows screenshots with a lightbox), **Friends**, **Profile**, **Trophies / Achievements**.
- Friends' online status needs a free Steam Web API key: Settings > Users and Accounts. Without it, only cached names are shown.
- Only Install / Buy / Message hand off to Steam, since Steam must complete those itself.
- Hotkeys: F12 toggles fullscreen; Ctrl+Alt+S takes a capture; Ctrl+Alt+D restores the window.

## What's new in v0.4

- **In-app Explore / game hub**: pressing Down on a game shows a strip (news, trailers, screenshots, add-ons, achievements, activity). News opens in an in-app reader, never the browser.
- **No empty cards**: art/description fallback chain is Steam CDN → store API → Wikipedia → generated gradient. Trailers fall back to a YouTube search via yt-dlp if installed.
- **Low-power mode**: while a game runs, betterSBP drops its priority, throttles and hides itself (toggle in Settings → System).
- **Downloads without Steam**: Library/Store → Install downloads with SteamCMD (fetched automatically on Windows). Enter your Steam account name once; the password and Guard code are asked via the on-screen keyboard and never saved. Finished games are registered with Steam.
- **Guide button**: when betterSBP is active, the controller's middle button is intercepted and brings back betterSBP instead of Steam Big Picture (toggle in Settings → Accessories).
- **Media / Apps**: PS-style Media home, All Apps, App Library, TV & Video with embedded YouTube TV.
- **Store**: PS-style tabs (Latest, Collections, Deals, Browse), search, sort and genre menus, in-app game page, wishlist.
- **Gallery**: icon chips and tiles, with Discover/empty fallbacks.

### Known limits
Not tested on real Windows/Steam/controller yet. The Guide-button interception and `steam://close/bigpicture` are best-effort. Buying still hands off to Steam, and launching a downloaded game needs Steam running in the background. YouTube controller mapping is best-effort. Friends' online status needs a Steam API key.

## v0.5

- **Steam account in betterSBP** (Profile → Steam account): sign in with account name, password and Steam Guard code. Gives friends' online status, **in-app chat** (via the `steam-user` package, no Steam client needed) and unlocks downloads. The password is never saved; only Steam's refresh token is kept, encrypted with the OS keystore.
- **No browser / Steam hand-offs**: Install uses the in-app downloader, Buy and store pages open in an in-app Steam web view (controller-navigable, Select/F1 to return). Only *launching* a game still goes through Steam.
- **Media** now has just YouTube (with logo and info cards), TV & Video and Media Gallery.
- **YouTube TV** runs on the castlabs Electron build (Widevine DRM), the same approach as marcosrg9/YouTubeTV. Run `npm install` to fetch it. A normal Electron build still works for non-DRM videos.
- **More metadata**: SteamSpy, PCGamingWiki and the Wikipedia infobox fill developer, publisher, genre, release and rating when Steam has none.
- **Library auto-refresh**: the Steam library folders are watched, so new installs/uninstalls appear within seconds.
- **Navigation**: scrolling now always reveals section headings and reaches the true top/bottom of a page.
- Fixed CSS class collisions that drew dark pills behind menu labels and stat values.

Setup: `npm install` then `npm start`.

## v0.6 — betterSBP
- Renamed to **betterSBP** (better Steam Big Picture). Steam-style wording throughout.
- **Sound themes**: PS-style glassy bells or Steam-style clicks (Settings → Sound → Sound theme).
- **Performance mode** (Settings → Display) on by default: no blur/grain/animated backdrops, lazy-rendered cards, idle gamepad polling slowed.
- **Lean Steam launch** (Settings → System): starts Steam with `-silent -no-browser -nofriendsui -nochatui`, kills `steamwebhelper` and lowers Steam priority. Side effect: Steam's own overlay/in-Steam store are unavailable while a game runs.
- **Guide/Home button** while a game runs opens the betterSBP in-game control bar (Resume / Home / Close game…), not Steam. Reads XInput ordinal 100; if Steam Input grabs the button, disable "Guide button focuses Steam" in Steam's controller settings.
- **Steam login** PS-style "Who's using this controller?" screen with account picker, username/password + Steam Guard, and **QR code** login.
- Boot "Press the A button" start screen (toggle in System).
- Profile settings list, Profile page (Overview/Games/Friends/Shared), Storage page, Game and legal info, per-game Properties (launch options).
- Library: All/Installed/Recently played/Most played/Favorites + collections, add non-Steam games.
- Downloads moved to the top bar beside search with a progress ring.

### v0.6.1
- **Steam login stays signed in**: refresh token stored encrypted and auto-renewed; network drops, Steam outages and sleep/wake just retry with back-off (also re-tries on wake, unlock and every 10 min). You are only signed out if Steam itself revokes the session (e.g. password change / "sign out everywhere").
- Game hub strip now has **Activities / Trending videos / Add-Ons** sections (DLC fetched from the Steam store); hero Play button turns into a **download progress button** while the game is installing.
- Control Center: PS-style side panels for **Notifications** (Do Not Disturb), **Official news**, **Sound** (output device, overall/music/video volumes, theme), **Music**, **Microphone** (input device, live level, mute).
- Library: **Sort by** menu and "All: N" count. Store: cart + account menu (wishlist, purchase history, redeem key, wallet).
- PS-style on-screen keyboard (symbols page, L2 backspace, R2 space).
- Steam extras: Community tile, Steam Input config per game, Steam screenshots folder.

### v0.6.2
- Home tiles are plain translucent white; Friends / Gallery / Community / Controllers moved to the top bar beside Downloads and Search.
- Context menus show a fade + arrow when more entries are below.
- **No more Web API key.** Library, friends and chat come from your Steam sign-in. Users and Accounts shows your account, profile edit and sign out.
- **Sign-in on start** (own UI: gamepad list, QR or password). Skipped automatically when a saved login exists.
- **Launch games directly** (Settings > System > Launch games). betterSBP reads the game's own launch entry from Steam and starts the exe itself with SteamAppId set. If the game closes immediately it offers to launch through Steam from then on. In Steam mode `steamwebhelper` is killed every 3 s.
- Own UI instead of Steam web pages: Community (friends activity, game hubs, news), per-game hub (news, reviews, screenshots, friends), native profile editing (name, about, picture). Only secure checkout, wallet, key redeem and account pages still open Steam's page in-app.
- Fixed clipped focus ring on hub/news cards.

### v0.7
- **Music**: songs are matched to the game by title (no more one song for every game), the search looks at 10 results and skips the ones that don't match, music no longer starts before the dashboard/setup, and the old cache is cleared once.
- **Hero** text cross-fades when you switch games (no blank gap). Search opens the on-screen keyboard and the list no longer flickers. The game menu no longer scrolls past its last item.
- **Steam sign-in** now looks and works like the Steam client: account name, password, Remember me, Sign in button and a live QR on the right. Steam Guard screen says "approve in the app or enter the code" and continues by itself when you approve.
- **Login survives rebuilds**: data now lives in a fixed `%APPDATA%\betterSBP` folder (old folders are migrated once).
- **Setup screen** at start for Steam and Discord, shown only when something is not yet signed in / skipped.
- **Discord** tab in Friends (next to Steam): servers, voice channels with members, join / leave, mute / deafen / volume, speaking indicator, and Discord notifications as pop-ups. It drives the real Discord app through its local RPC: Discord must be open, and you create a free Discord application once and paste its Client ID + Secret (the setup page explains it). Discord does not let third-party apps carry voice or read DMs, so this is the supported route.
- **Pop-ups** in the corner for friends coming online, starting a game, Steam messages and Discord notifications (over games too). Toggle: Settings > Notifications.
- Real **YouTube / Steam / Discord logos** are downloaded once and cached. Activity cards are plain glass; filler cards removed.

### v0.7.1
- **QR sign-in**: the login library only allowed 30 s per attempt, so the code "expired" while you scanned it. It now allows 10 minutes and renews itself; the dialog says "Scanned, approve on your phone".
- **Who you are** now comes only from the in-app Steam sign-in (name, picture, Steam ID, playtime, screenshots). The local Steam profile is no longer read unless you turn it on in Settings > Users and Accounts.
- **Profiles**: another player's profile now shows *their* games (hours, last 2 weeks) and *their* friends (public data only; private ones say so). Your own profile shows your library / friends / screenshots. Profile editing: name, real name, about, picture from your screenshots or an image file.
- **Library**: refreshes by itself when sign-in finishes (no stale "sign in" note); shows non-Steam shortcuts you added in Steam (shortcuts.vdf) and manifest-installed games.
- **Store / Explore**: "Recommended for you" uses the tags Steam's store learned for your account, minus what you own. Explore is now sections (Friends playing, Recommended, News, Popular, Your captures).
- **Community hubs**: Screenshots, Artwork, Guides and Workshop pulled from the real Steam Community hub pages.
- **In-game menu** (Guide button): see-through (no dark screen), one press opens and one press closes (the overlay no longer reads the Guide button twice), plus a Screenshot item.
- **Search**: small keyboard docked at the bottom; B closes only the keyboard, B again closes search.
- **Downloads**: SteamCMD cannot use a QR sign-in, so it asks for the password once; if it stalls the prompt now appears by itself, and "Install with Steam instead" is in the item menu.
- **Account menu**: Switch User signs out and opens the sign-in; Online Status really sets Steam's status (Online / Invisible).
- Real YouTube mark is now built in (not fetched).

### v0.8.0
- **Community reviews** loader hardened (falls back to all languages, strips BBCode). **Controller icon** opens its page directly, so Back returns to where you were. **Online dots** (green = online, blue = in game) on every friends list. The Steam shield icon on a profile opens your account page. New gallery icon. The home hero text now swaps instantly (no slide).
- **Friends** opens as a right-hand side panel.
- **Non-Steam games**: artwork + description borrowed from the Steam store when the exact name exists there (otherwise the program's own icon); store page / community hub only when Steam has the game; "Show on home screen" switch per game (Library, game menu, Settings > Library and Home Screen). Shortcuts imported from Steam start hidden, games you add yourself start shown.
- **Profile customisation** (all through your Steam session): picture (animated avatars you own, or upload), avatar frame, profile background, mini-profile background, name, real name, custom URL, about, full privacy settings. Profile pages (yours and others) have Games, Friends, Screenshots, Artwork, Reviews, Wishlist and Groups tabs.
- **Store**: real Steam cart in-app (add, remove, totals), free games added to your library in-app, real wishlist sync, redeem a product key in-app, purchase history and wallet, "More like this" and Reviews on the store page. Paying opens Steam's own secure payment form *inside* betterSBP.
- **Settings**: new Interface, Library and Home Screen, In-Game and Friends and Chat pages (clock, start tab, home sort, shortcut import, Family Sharing, Guide button, lean Steam, status, per-type pop-ups, show offline friends).

## v0.8.1
- Steam QR login: login timeout is now set correctly (no more "QR expired"), start timeout and a "Show QR" button instead of an endless spinner, auto-renew when the code expires.
- Steam username/password login now goes through steam-session with a long timeout and Steam Guard prompts (wrong code re-asks) instead of bouncing back to the login.
- "Select your profile" at boot only appears when signed in to Steam in the app.
- Game music stays silent until you reach the home screen.
- Downloads page hides the Steam account row when you are signed in.
- Friends: new Xbox tab with Xbox sign-in (device code) and friend list.
- Media row: Xbox Cloud Gaming app (needs Game Pass Ultimate).
- Home row: no slide animation on the last tile.
- New media player: title, buffered timeline with knob, times, ±10 s, big play/pause, volume, speed, buffering spinner, auto-hiding controls, mouse + controller input.

## v0.8.2
- Library: games unlocked with a manifest / lua script (SteamTools `config/stplug-in/*.lua`, GreenLuma `AppList`) now appear in the library.
- Xbox Cloud Gaming: logo is fetched (not drawn), app opens with Edge client hints, reports load failures.
- Media player: full gamepad focus (D-pad moves between buttons, LB/RB ±10 s, X speed, Y mute, B close).
- Discord: no setup screens. Put the application's client id/secret into `discord.config.json` once; users just press Connect.
- Xbox friends: profile view and chat (Xbox Live messaging).
- Keyboards slightly smaller; gamepad typing shortcuts (LT backspace, RT space, Y shift, LB symbols, RB done).
- Controller glyphs: Xbox letters or PlayStation symbols everywhere, auto-detected, with a manual setting (Accessories → Button layout).
- Profile menu: "Log out" now exits betterSBP (no Steam sign-out).
- After a game exits, betterSBP forces itself back to the front (several attempts).
- Store pages: silent trailer behind the page, reviews section + "read all reviews" with filter; missing posters are looked up automatically.
- Storage: `C:` / `c:` duplicates merged; drives (and Steam libraries on them) show up live when plugged in.
- SteamCMD: first-run self-update handled up front, password passed when known, progress read from the install manifest, real error text.
- Sounds: new soft "thock" sound theme for the console theme.
- Explore: no store games; scrolling down shows many sections (continue playing, downloads, friends, news, trailers, not played, biggest games, captures, videos).
- Manage game content (DLC) is a real list with owned state and buying.
- Home row: short shared easing for row shift and tile growth (alive but no late slide).

## v0.8.3
- Reviews: new loader with retries/timeouts, rating summary (e.g. "Very Positive 92%") and review list on every game page, "Reviews" card on the game's hub, filterable full list.
- YouTube / Xbox Cloud Gaming: apps are pre-loaded in the background while their tile is highlighted, open with a tile-grows-to-fullscreen launch animation (no splash screen), solid brand-coloured covers with logos fetched from the web.
- Friends: tab icons aligned in one row; panel drops down from the top bar; Add friend (Steam code / link / SteamID, Xbox gamertag); Steam friend requests with accept/decline; Xbox messages have timeouts and clear errors.
- Start-up movie (Settings → Customization): one file, a random movie from a folder, or none; skip with any button.
- Battery with percentage and colour on the home bar and in the quick menu (Settings → Interface / Power).
- Storage: uninstall games per drive.
- Steam Family section (members, shared games, Family View status).
- New settings pages: Customization, Controller and Steam Input (symbols, swap A/B, stick sensitivity, repeat speed, per-game Steam Input on/off inside betterSBP), Power and Performance.
- In-app, controller-friendly file manager replaces the Windows file dialog (profile picture, add non-Steam game, start-up movie); can be turned off in Controller settings.

## v0.8.4
- Apps (YouTube, Xbox Cloud Gaming) open from the home-row tile as well as the bottom icon, warm up in the background and use the supplied covers with a launch animation.
- Discord is the real Discord web app inside betterSBP: just log in once, no developer app or setup.
- Xbox friends fall back to a simpler list when the first endpoint is empty; friends can be added; Steam/Xbox/Discord tabs aligned.
- Storage loads asynchronously, picks up new drives automatically and lets you uninstall games.
- Battery indicator (home top + quick menu), coloured by level.
- Friends opened from the in-game menu return to that menu when closed.
- Non-Steam games show on the home screen again.
- Default start-up movie (renderer/assets/startup.webm); Customization has: betterSBP intro / one movie / random folder / nothing.

## v0.8.5
- Discord now lives in betterSBP's own screens: log in once (the embedded discord.com page is only used for that), then browse Servers → channels, Direct messages, Friends, read and send messages, and join voice channels (Mute / Deafen / Leave panel). Voice runs through a hidden Discord client controlled by betterSBP.
- Past messages load in Steam, Xbox and Discord chats, with day separators and times.
- Clock and battery sit together; click the battery to open its settings (Show battery toggle).
- Non-Steam artwork matching rewritten (fuzzy name match, retries, "Refresh artwork" clears the match).
- Settings shortcuts next to the feature: Library, Gallery, Downloads, Friends, Apps, Store and the quick-menu panels each get a button to their settings page.
- Fix: the packaged zip previously dropped renderer/assets/*.png (empty YouTube / Xbox tiles).

## v0.8.6
- Artwork: games that are not on Steam are looked up on the Epic Games Store, then GOG, then Wikipedia (poster, wide art, logo, description). Steam posters that are missing now fall back to the store's own asset list, then header art, then a full re-fetch before giving up.
- Library tiles show a blurred "Installed" label instead of a green dot.
- Steam Family: requests have timeouts and a Try again button, so it can no longer sit on "Loading".
- Storage / Library: Steam is also found via the machine-wide registry key and by scanning drives (Steam, SteamLibrary, Games\Steam...). If Steam isn't installed, betterSBP keeps its own library folder for SteamCMD downloads.
- Xbox: "Sign in with Microsoft" runs Microsoft's own login in the same browser session as Xbox Cloud Gaming, so one login covers both. The phone-code login stays as an alternative (friends only).
- YouTube: ad removal, SponsorBlock skipping and Shorts hiding (Settings > Interface > YouTube), plus a "Game console" look (PlayStation user agent). Inspired by community wrappers such as VacuumTube; the code is our own.
- Fix: per-game Steam Input page crashed (rowT2).

## v0.8.7
- Fix: Storage crashed (`acct0 is not defined`).
- Xbox Cloud Gaming: the browser identity now matches the real engine version (it claimed Chrome 126 while being newer, which some sites reject).
- Home: no slide animation when moving up/down between the game row, hero buttons and the strip.
- Discord: chats open at the newest message, every message is selectable (Reply / Copy), a typing bar stays at the bottom, and friends / DMs show online status and what they play (read through Discord's gateway). Steam and Xbox chats got the same bar and open at the bottom.
- Xbox chats read the real message text (photo / voice / video / GIF are labelled).
- Community: friends are cards with round full-size avatars.
- On-screen keyboard: real backspace and shift icons; arrow keys move between keys, Enter presses the highlighted key (or submits if you only typed).
- Minimal battery icon. Settings shortcut buttons are small pills.
- Library posters: missing ones are fetched in parallel (6 at a time) from the store's own asset list and remembered, so they never go grey again.
- Steam Family section removed. Reviews retry across two network routes and say why they failed. Store pages list trailers next to screenshots. The main game-page button is solid white like the selected state. The in-game menu is fully see-through.

## v0.8.8
- First-run setup wizard (welcome, accounts, network, sound and look, behavior). Re-run it from Settings > Run setup again.
- Simple mode (default): fewer top-bar icons and a short Settings list. Toggle in Settings; "Show all settings" brings back the rest.
- Wi-Fi and Bluetooth are managed in the app (Settings > Network / Bluetooth) via netsh and Windows Bluetooth APIs. Needs testing on real Windows.
- Xbox Cloud Gaming fix: app views no longer use the Chromium sandbox (it failed to start on some PCs) and dead views are handled.
- Hero/list slide animations replaced with fades; single PlayStation sound set with one "Sounds" toggle.
- Message pop-ups for Discord (gateway) and Xbox (inbox polling); chat composer overlap and search caret fixed.
- Game downloads use the in-app Steam login (optional encrypted stored password).
