# Desktop export: signing and store upload

`waica export desktop` turns a Project into an Electron app, one folder and one `.zip` per platform: the shape Steam, itch.io and Epic upload. The builds it writes are **unsigned**. This guide covers what a human does next: signing for macOS and Windows, and uploading to each store. None of it is automated, because every step needs the developer's own certificates and store accounts.

## The command and its flags

Run it from the Project folder, after `npm install`:

```sh
npx @waica/cli export desktop .
```

| Flag | Default | What it does |
|---|---|---|
| `[dir]` | `.` | The Project directory. It must hold `src/game.json` and `node_modules`. |
| `--platform linux,win32,darwin` | all three | The platforms to export, comma-separated. |
| `--out <dir>` | `<project>/export/` | Where the folders and zips go. The template's `.gitignore` already ignores `export/`. |
| `--name <s>` | `package.json` `name` | The app name: the window title and the product name in the `.exe`. The folders, the executable and the macOS bundle take it with `-` in place of each character a file name cannot hold (`\ / : * ? " < > \|`), so `Hero: Quest` exports `Hero- Quest.exe`. |
| `--icon <png>` | `src/art/icon.png` | The app icon. Without one, waica's default icon is used. The PNG is converted to `.ico` and `.icns` for you; 512×512 or larger looks best. |
| `--steam-app-id <n>` | `game.json` `desktop.steam.appId` | The Steam app id. |
| `--no-steam` | — | Leaves Steam out, even when `game.json` declares it (for example, for itch.io). |

It writes `<name>-linux-x64/`, `<name>-win32-x64/` and `<name>-darwin-arm64/`, each with its `.zip`. Re-exporting one platform replaces only that platform's folder and zip. The first export of each platform downloads its Electron zip into Electron's cache, so it needs the network. An export with Steam also installs `steamworks.js` 0.4.0 into the app, which needs the network too.

`game.json`'s `desktop` block configures the app. The MCP tool `configure_desktop` edits it, and `validate_project` checks it:

```json
"desktop": {
  "fullscreen": false,
  "scale": 2,
  "steam": { "appId": 480, "achievements": ["first-kill"], "stats": ["kills"] }
}
```

The window opens at `resolution` × `scale`, or 1280×720 without a resolution. F11 and Alt+Enter toggle fullscreen. The game reaches the desktop through `game.quit()`, `game.canQuit`, `game.setFullscreen()`, `game.isFullscreen()` and `game.achievements`. The engine README documents them.

## macOS: signing and notarization

Steam requires new macOS apps to be notarized ([Steamworks: platforms](https://partner.steamgames.com/doc/store/application/platforms)), and macOS refuses to open an unsigned app downloaded from the internet. You need an Apple Developer account, a **Developer ID Application** certificate in your keychain, and a Mac.

1. Unzip `<name>-darwin-arm64.zip` on the Mac, and keep its symlinks: use `ditto -x -k` or Finder, not a tool that flattens them.
2. Write `entitlements.plist`. Electron needs JIT. The Steam overlay injects a library, so it also needs `disable-library-validation` and `allow-dyld-environment-variables`. Do **not** add `com.apple.security.app-sandbox`: Steam does not support sandboxed apps.

   ```xml
   <?xml version="1.0" encoding="UTF-8"?>
   <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
   <plist version="1.0">
   <dict>
     <key>com.apple.security.cs.allow-jit</key><true/>
     <key>com.apple.security.cs.allow-unsigned-executable-memory</key><true/>
     <key>com.apple.security.cs.disable-library-validation</key><true/>
     <key>com.apple.security.cs.allow-dyld-environment-variables</key><true/>
   </dict>
   </plist>
   ```

3. Sign with the hardened runtime, the nested code first. `codesign --deep` signs the code in `Contents/Frameworks`, `Contents/MacOS` and the helper apps, but not binaries under `Contents/Resources`, and a build with Steam has some there: `steamworks.js`'s `.node` addons and `libsteam_api.dylib` in `Contents/Resources/app/node_modules`. notarytool rejects any Mach-O without a Developer ID signature, the hardened runtime and a timestamp, so sign those one by one before the bundle:

   ```sh
   IDENTITY="Developer ID Application: Your Name (TEAMID)"
   find "<name>.app/Contents/Resources" -type f \( -name '*.node' -o -name '*.dylib' \) \
     -exec codesign --force --options runtime --timestamp --sign "$IDENTITY" {} \;
   codesign --deep --force --options runtime --timestamp \
     --entitlements entitlements.plist --sign "$IDENTITY" "<name>.app"
   codesign --verify --deep --strict --verbose=2 "<name>.app"
   ```

   `--deep` signs from the outside in, with the same entitlements for every helper, and Apple advises against it for shipping. [`@electron/osx-sign`](https://github.com/electron/osx-sign) signs each nested binary of an Electron bundle on its own, inside out, and is the better tool for a release.

4. Notarize and staple:

   ```sh
   ditto -c -k --keepParent "<name>.app" "<name>-notarize.zip"
   xcrun notarytool submit "<name>-notarize.zip" --apple-id you@example.com --team-id TEAMID --password <app-specific-password> --wait
   xcrun stapler staple "<name>.app"
   ```

An unsigned build still runs on your own Mac. Since macOS 15 Sequoia, Control-click → **Open** no longer gets past Gatekeeper: open the app once, then go to **System Settings → Privacy & Security** and click **Open Anyway**. A build that came from another machine (exported on Linux or Windows, then downloaded or sent by AirDrop) is quarantined, and since the export changes the bundle, Gatekeeper can call it "damaged" and offer no Open Anyway. On your own Mac, clear the quarantine and sign it ad hoc:

```sh
xattr -dr com.apple.quarantine "<name>.app"
codesign --force --deep --sign - "<name>.app"
```

## Windows: signing the .exe

An unsigned `.exe` runs, but SmartScreen warns the player ("Windows protected your PC" → **More info** → **Run anyway**). To sign it you need a code-signing certificate (OV or EV) and Windows' `signtool`:

```powershell
signtool sign /fd sha256 /tr http://timestamp.digicert.com /td sha256 /a "<name>-win32-x64\<name>.exe"
signtool verify /pa "<name>-win32-x64\<name>.exe"
```

The export already writes the app's name and version into the `.exe`'s version resources, and the icon into it, from any host (no Wine needed).

## Linux: the Chromium sandbox

Since Ubuntu 23.10, and by default in 24.04, AppArmor can restrict unprivileged user namespaces (`kernel.apparmor_restrict_unprivileged_userns=1`). Electron then needs its `chrome-sandbox` helper owned by root with the setuid bit, which a zip unpacked by a normal user does not keep, and the app stops with `The SUID sandbox helper binary was found, but is not configured correctly`. Steam's own AppArmor profile usually lets a game launched from Steam through; a player who unzips an itch.io build may need, in the app folder:

```sh
sudo chown root:root chrome-sandbox && sudo chmod 4755 chrome-sandbox
```

or an AppArmor profile for the app. GitHub's Linux runners lift that restriction, so CI does not see it.

## Upload the signed copies

The folders and zips in `export/` stay unsigned: the macOS app is signed and notarized in its unzipped copy on the Mac (step 1 above), and nothing rebuilds a zip after `signtool`. Point every upload below (`ContentRoot`, `butler push`, `-BuildRoot`) at the folder you signed, not at `export/`, and zip a signed folder yourself if a store wants a zip.

## Steam: SteamCMD

Upload each platform's **folder** as a depot with SteamCMD and a build script (SteamPipe). Do not use the web uploader for macOS: it breaks the `.app` bundle's symlinks, and the app then does not start.

1. In Steamworks, create one depot per platform and set each depot's OS. Under **Installation → General**, add one launch option per OS: `<name>.exe` (Windows), `<name>` (Linux) and `<name>.app` (macOS).
2. Write `app_build_<appid>.vdf` with one `depot_build` per depot, each pointing `ContentRoot` at that platform's signed folder (see above).
3. Run `steamcmd +login <builder-account> +run_app_build /abs/path/app_build_<appid>.vdf +quit`, then set the build live on a branch in Steamworks.

The export puts `steam_appid.txt` inside `resources/app` and passes the app id to `steamworks.js` itself, through `init(appId)`, so nothing reads that file. When Steam launches the game, the app id comes from Steam. Valve advises against shipping `steam_appid.txt`: delete `resources/app/steam_appid.txt` from the folder you upload. `game.achievements` sends only the ids listed in `desktop.steam.achievements` and `desktop.steam.stats`. Declare them in Steamworks with the same API names, and declare every stat as **INT**: the shell sets and reads stats with Steam's integer calls, so Steam refuses a FLOAT stat (the terminal shows a warning) and a value outside −2147483648..2147483647 is not sent. Without a running Steam client, the game still runs, with `game.achievements.available === false`.

To test Steam before you have an app id, use Spacewar (app 480): `configure_desktop` with `steam: { appId: 480, achievements: ['ACH_WIN_ONE_GAME'], stats: ['NumGames'] }`. Then export, launch with the Steam client open, and press Shift+Tab for the overlay.

**Steam Deck:** an Electron app has been reported not to start there when added as a non-Steam game. Test a real Steam build on the Deck before you claim Deck support.

## itch.io: butler

Push each signed folder to its own channel with [butler](https://itch.io/docs/butler/pushing). Export with `--no-steam`, since itch.io has no Steam client:

```sh
npx @waica/cli export desktop . --no-steam
butler push "signed/<name>-win32-x64" you/your-game:windows
butler push "export/<name>-linux-x64" you/your-game:linux
butler push "signed/<name>-darwin-arm64" you/your-game:mac
```

(`signed/` stands for wherever you keep the signed copies; the Linux build has nothing to sign.)

butler keeps symlinks and uploads only what changed between versions. A channel holds up to 30 GB.

## Epic Games Store: BuildPatchTool

Epic uploads one folder per platform with BuildPatchTool, from the Epic Developer Portal:

```sh
BuildPatchTool -mode=UploadBinary -OrganizationId=<org> -ProductId=<product> -ArtifactId=<artifact> \
  -ClientId=<id> -ClientSecretEnvVar=EPIC_SECRET -BuildRoot="signed/<name>-win32-x64" \
  -CloudDir=build-cache -BuildVersion=1.0.0-win -AppLaunch="<name>.exe" -AppArgs=""
```

Export with `--no-steam` for Epic. `game.achievements` stays unavailable there: the store-agnostic API has no Epic backend yet.

## Not covered

There are no installers (NSIS, dmg, AppImage, deb), no automatic signing or notarization, and no auto-update. Each export is unsigned, so every signature above is a manual, human step.

Each platform gets one architecture: `linux-x64`, `win32-x64` and `darwin-arm64`. The macOS build does not start on an Intel Mac (Rosetta runs x64 code on Apple silicon, not the other way round), and there is no universal build; Steam hands the macOS depot to every macOS client, Intel ones included. There are no arm64 builds for Windows or Linux.
