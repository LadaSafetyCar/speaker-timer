# Speaker Timer

A speaker-facing meeting timer. The whole screen turns green, amber and red, and the digits are sized to fill the display so they can be read from the lectern. Inspired by [fangfufu/toastmaster-timer](https://github.com/fangfufu/toastmaster-timer).

It is plain HTML, CSS and JavaScript. There is no build step, and it works offline once installed.

## Features

- **Opens on the clock.** The start-up screen is the speaker-facing clock, ready to go. Everything else lives behind the **gear (Settings)** in the top-right corner, which hides while a timer runs.
- **Big clock.** The digits are sized to fill the screen width or height (whichever runs out first) every time the digit count changes. Landscape gives the biggest digits. Each digit sits in a fixed-width slot, so the clock never shifts sideways as it counts.
- **Controls** sit bottom-right, with the main action rightmost and away from the clock:
  - Before a run there is only one button, **Start**.
  - During a run, **Simple mode** works like the iPhone timer: **Stop** (back to the start time) and **Pause/Resume**.
  - **Conference mode** adds **Reset**, so there are three: **Reset**, **Stop** and **Pause/Resume**.
  - The controls fade to half strength while the clock runs, so they don't distract the speaker.
  - **Reset** needs a second tap within 3 s, so a stray touch can't wipe a speech in progress. It returns the clock to its start time without recording anything.
  - **Stop** in Conference mode records the time and shows the results, where **Resume timer** undoes an accidental stop. In Simple mode it returns straight to the start time.
  - **Keyboard:** Space starts or pauses, Esc stops, R resets, and ← → change slot.
- **Count down or count up** (Settings).
  - Count down starts at the red (max) time and **holds at 0:00** once the speaker reaches it, while the colours carry on.
  - The summary always shows the real time taken.
- **Colours and times** (Settings): each colour has a tick box and its own time.
  - Green, Amber and Red each have a time. Flashing is set in seconds after red.
  - Untick a colour to skip it. The screen keeps the colour before it, so with Amber off it stays green until red.
  - Amber starts halfway between green and red, and stays halfway when those change unless you set it yourself.
- **Simple mode:** one timer. The last **4 unique** timers are kept as one-tap presets in Settings.
- **Conference mode:** an editable agenda (role, name, min, amber, max) with time used per slot.
  - The clock screen shows the current slot, with ‹ › to move between slots.
  - After each Stop it moves to the next slot.
  - The agenda saves itself, and you can save and load it as a `.json` file.
- **During a timer:** the screen stays awake and the app goes full screen.

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

## Branding

Tourism Australia branding follows the brand guidelines. The conference theme is **Sea Country**, and only that one colour stream is used:

- **Clock screen:**
  - Waiting, and running until green, the background is **Sea Country Dark (#0D6E9C)** with white digits (AA in the brand's accessibility chart) in bold Poppins.
  - The keyline logo (`brand/ta-logo-keyline.svg`) sits centred at the top and hides on Start.
  - From green onwards, only the signal colours show.
- **Settings:**
  - Light mode has neutral greys and the full-colour Desert logo (`brand/ta-logo-desert.svg`), with a short Sea Country Dark rule under the title. Dark mode uses the keyline logo.
  - Buttons use **Sea Country Dark (#0D6E9C)**.
- **Launch logo:** the keyline logo on Sea Country Dark.
  - The app shows the logo itself for 1.5 s on every fresh launch (after a swipe-away and reopen), then fades into the clock. A tap skips it.
  - This is needed because iPadOS's own launch image (`splash/`) is saved when the icon is added and often shows too briefly to see. The two match in size and position, so the hand-over is seamless.
- **Graphic shapes (the storytelling wave device) are not used**, by choice.
- **Typefaces:** the brand's Google fallback fonts, **Poppins** for text and the clock and **Libre Baskerville** for headings. The corporate typefaces are deliberately not used. The Windows fallbacks named in the guidelines (Century Gothic, Georgia) are listed as backups.
- **Signal colours** (green, amber, red, flashing) are never replaced by brand colours, so the speaker can't confuse them. The flashing alternates red with near-black for maximum contrast.

The logo files are Tourism Australia brand assets. Use them only as the brand guidelines allow.

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
splash/               iPad launch screens (with logo)
brand/                Tourism Australia logo files
fonts/                Poppins and Libre Baskerville (SIL Open Font License), self-hosted for offline use
```
