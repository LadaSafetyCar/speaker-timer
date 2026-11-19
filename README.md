# Speaker Timer

A speaker-facing meeting timer. The whole screen turns green, amber and red, and the digits are sized to fill the display so they can be read from the lectern. Inspired by [fangfufu/toastmaster-timer](https://github.com/fangfufu/toastmaster-timer).

It is plain HTML, CSS and JavaScript. There is no build step, and it works offline once installed.

## Features

- **Big clock.** A condensed bold face is fitted to the screen width or height (whichever runs out first) every time the digit count changes. Landscape gives the biggest digits.
- **Count down or count up**, chosen before you start.
  - Count down starts at the max time and **holds at 0:00** once the speaker reaches max. The colours keep going: red at max, flashing 30 s later.
  - Count up shows elapsed time.
  - Either way, the summary shows the real time taken and how far under or over it was.
- **Simple mode**: set Green (min) and Red (max), then Start. The last **4 unique** timers (min, max and direction) appear as one-tap presets.
- **Conference mode**: an editable agenda (role, name, min, max) with time used per slot. After each stop it selects the next slot, ready for the next speaker. The agenda saves itself in the browser, and you can export and import it as a `.json` file.
- **Signals:** green at min, amber halfway between min and max, red at max, flashing 30 s past max.
- **Choose the colours:** tick or untick Green, Amber, Red and Flashing at the bottom of the setup screen. When a colour is off, the screen keeps the colour before it. For example, with Amber off it stays green until red. The choice is saved on the device and applies to both modes.
- **Timer controls:** pause/resume and stop buttons in the corner. On a keyboard, Space pauses and Esc stops.
- **During a timer:** the screen stays awake (Wake Lock) and the app goes full screen.

## Using it on an iPad

**Install it from Safari** (Share → *Add to Home Screen*). Run it from the Home Screen icon, not a Safari tab:
- It opens full screen with no address bar, and works with no Wi-Fi.
- iPadOS keeps its saved agenda. Safari can clear storage for sites you haven't visited in 7 days.

The app shows this tip in Safari until it is dismissed.

What the app does for iPad:
- **Screen stays awake.** It uses the Wake Lock API, plus a silent looping video as a fallback for older iPadOS and for Home Screen apps before iPadOS 18.4. *Before an important meeting*, also set **Settings → Display & Brightness → Auto-Lock → Never**, because no web app can guarantee it.
- **Clock fitted to the screen** in landscape, portrait and Split View/Stage Manager, and re-fitted on rotation. Landscape gives the biggest digits.
- **Touch targets of at least 44 pt.** No double-tap zoom, pinch or scroll bounce on the timer screen. The pause and stop buttons are 68 px.
- **Pressed Stop by mistake?** Tap **Resume timer** on the summary. The clock carries on as if it never stopped, and the time spent on the summary still counts.
- **Save file** opens the Share sheet (Save to Files, AirDrop). **Load file** opens the Files app.
- **Dark launch screens** for every current iPad size. Without them, iOS flashes white on launch.
- **Smart/Magic Keyboard shortcuts:** Space pauses, Esc stops.

**Optional:** lock the iPad to this app with **Guided Access** (Settings → Accessibility → Guided Access, then triple-click the top button). Then nobody at the lectern can swipe out of it.

## Run locally

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000. Service workers work on `localhost` without HTTPS.

## How the PWA part works

A site becomes an installable PWA when it has three things, all in this folder:

1. **`manifest.webmanifest`**: name, icons (192 px, 512 px and a maskable 512 px), `display: fullscreen` and theme colours. `index.html` links it with `<link rel="manifest">`. It also links the Apple touch icon and the `apple-mobile-web-app-*` meta tags for iOS.
2. **`sw.js`**: a service worker that caches the app files on first visit, so the app opens with no network at all. It serves from the cache first and refreshes the cache in the background.
3. **HTTPS.** Every host listed below gives you this for free.

**When you deploy changes**, bump `VERSION` in `sw.js` (`v1` → `v2`). Installed copies then drop their old cache. If you add a new file (another font or image), also add it to the `SHELL` list in `sw.js`.

To check installability, open the site in Chrome, open DevTools, go to **Application → Manifest**, and look for warnings.

### Installing on devices

- **Android (Chrome):** ⋮ menu → *Install app* (or *Add to Home screen*).
- **iPhone/iPad (Safari):** Share → *Add to Home Screen*.
- **Desktop (Chrome/Edge):** the install icon in the address bar.

## Hosting

All of these are free for a site like this, serve HTTPS, and work with the service worker.

### GitHub Pages (recommended; same as the original project)

1. Create a GitHub repo and push this folder to the `main` branch.
2. Open the repo's **Settings → Pages → Build and deployment**, and set **Source: GitHub Actions**.
3. The included `.github/workflows/deploy.yml` publishes on every push. The site goes live at `https://<user>.github.io/<repo>/`.

All paths in the app are relative, so it works under the `/<repo>/` subpath without changes.

### Cloudflare Pages / Netlify

Connect the repo, or drag and drop the folder in their dashboard. Use no build command, and set the output directory to `/`. You get a `*.pages.dev` or `*.netlify.app` URL, and you can add your own domain.

## Files

```
index.html            markup for setup, timer and summary screens
app.css               styles (the timer screen uses a fixed signal palette)
app.js                timer engine, modes, agenda, storage, wake lock
sw.js                 offline cache
manifest.webmanifest  PWA metadata
icons/                app icons
splash/               iPad launch screens
fonts/                Barlow and Barlow Condensed (SIL Open Font License), self-hosted for offline use
```
