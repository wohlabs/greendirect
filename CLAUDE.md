# CLAUDE.md

Guidance for Claude Code (and other agents) working in this repository.

## Project overview

GreenDirect is a cross-browser extension (Chrome, Firefox, Edge) built with
[Extension.js](https://extension.js.org) and React 18 + TypeScript. It adds a
side panel where users can see a list of popular websites paired with greener
alternatives (e.g. `google.com` → `ecosia.org`) and set each pair to one of
three modes with a three-stage flower toggle (or all at once with "Set all"):
**Off** does nothing; **Suggest** (the default for every pair) shows a small
suggestion banner on every visit to the site; **Redirect** sends the user to
the alternative after a 5-second countdown they can cancel.

## Commands

Install dependencies first: `npm install`.

### Dev / build

- `npm run dev` — run the extension in development mode with hot reload
  (defaults to Chromium; add `-- --browser=firefox` or `-- --browser=edge`
  to target another browser).
- `npm run build` — production build for Chromium.
- `npm run build:chrome` / `npm run build:firefox` / `npm run build:edge` —
  production build for a specific browser.
- `npm run preview` — preview the production build in the browser.
- `npm run start` — start a built extension without rebuilding.

Build output goes to `dist/`.

### Test

There is no `npm test` script yet. Tests use Node's built-in test runner
(`node:test`) directly against the TypeScript source (Node 22+ can run
`.ts` files natively, no transpile step needed):

```
node --test src/*.test.ts
```

`src/redirects.ts` has a test file (`src/redirects.test.ts`), covering
hostname matching, redirect resolution, and the default/stored-redirect
merge logic. `src/manifest.json` has one too (`src/manifest.test.ts`),
asserting its content script's match patterns stay in sync with
`defaultRedirects`. Add new `*.test.ts` files next to the module they
cover.

### Lint / type-check

There is no ESLint or Prettier config in this repo. The closest thing to a
lint step is the TypeScript compiler in `--noEmit` mode, using the strict
`tsconfig.json` already in place:

```
npx tsc --noEmit
```

Run this after any non-trivial change, since `strict` mode is on.

## Architecture

The extension has three independent entry points, wired together through
`src/manifest.json` (which uses Extension.js's `chromium:` / `firefox:`
prefixed keys to express per-browser manifest differences — Manifest V3 on
Chromium, V2 on Firefox):

- **`src/background.ts`** — the background service worker (Chromium) /
  background script (Firefox). Its only job is opening the side panel in a
  way that works around each browser's quirks: Chromium's `chrome.sidePanel`
  API only affects future toolbar clicks and must run synchronously inside
  the click's message listener; Firefox's `sidebarAction.open()` only works
  from a real user-input handler, so it's wired to the toolbar click
  directly; Safari has no side panel API at all, so it falls back to
  opening the sidebar page in a normal tab.

- **`src/content/`** — a content script injected at `document_start` into
  the specific sites listed in `defaultRedirects` (`src/redirects.ts`) --
  the manifest's `content_scripts[0].matches` is a match pattern per
  redirect source domain, not `<all_urls>`, since Chrome Web Store review
  flags broad host permissions and this only needs to run where a redirect
  could actually fire. `src/manifest.test.ts` fails if that list drifts
  out of sync with `defaultRedirects`. `scripts.tsx` is the Extension.js entry
  point; it mounts a `Root` component into a shadow root (isolated from
  host-page styles so the widget can't be broken, or leak style into, the
  page it's injected into) that renders `RedirectOverlay.tsx` whenever the
  current page matches a pair in `'redirect'` mode. `Root` reads the stored
  redirect list on load and re-checks whenever storage changes;
  when a match is found it does *not* navigate immediately. Instead the
  overlay appears on top of the page for 5 seconds ("Redirecting to
  `<target>`. The earth loves you.", with a countdown bar and a small
  sprouting-leaf animation) before performing the redirect
  (`window.location.assign`). The overlay has two buttons: "Redirect now"
  jumps ahead immediately, and "Stay on this site" cancels the redirect
  and dismisses the overlay for the rest of that page's lifetime (until
  the next navigation re-injects the content script). A page whose
  matching pair is `'off'` (or with no matching pair at all) shows nothing
  and behaves exactly as if the feature weren't there.

  When there's no active redirect, `Root` also renders `SuggestionBanner.tsx`
  whenever `resolveSuggestion` (see `src/redirects.ts`) finds that the most
  specific pair for the current hostname is in `'suggest'` mode. Unlike the
  overlay, the banner is small, bottom-right, and non-blocking, and it never
  navigates anywhere on its own. It reads "Greener alternative to `<site>`:
  `<alternative>`" plus the pair's description, with:
  - "Go to `<alternative>`" -- a one-off trip, carrying the search term over
    exactly like a redirect would (both go through `resolveTargetUrl`). No
    setting changes.
  - "Always redirect" -- sets the pair to `'redirect'`, which hands off to
    the normal RedirectOverlay countdown on the next storage-change check,
    exactly as if the user had picked Redirect in the sidebar.
  - "Stop suggesting" -- sets the pair to `'off'`.
  - "Not now" and × -- both use the same `onDismiss` handler and don't touch
    storage; they hide the banner for the rest of the
    tab's visit to that domain, reappearing on a new tab or after navigating
    away and back -- the exact same per-tab dismissal mechanism as "Stay on
    this site" above, tracked separately in `background.ts`
    (`REDIRECT_OVERLAY_DISMISSAL_*` vs. `SUGGESTION_DISMISSAL_*` messages) so
    one never affects the other.
  "Always redirect" and "Stop suggesting" deliberately get the same visual
  weight: moving a pair down should be exactly as easy as moving it up.

- **`src/sidebar/`** — the side panel UI. `SidebarApp.tsx` is a React
  component that loads the current redirect list, lets the user set each
  pair's mode (or all of them with "Set all"), and persists changes back to
  storage; `scripts.tsx` mounts it into `index.html`. Each pair's mode is a
  three-stage flower toggle (`.flower3` in `styles.css`): three radio
  inputs laid over the track as invisible thirds (so a click picks the
  stage under the pointer and arrow keys move between stages), with the
  flower drawn by `.slider:before` from a single `--flower-bloom` number --
  0 = closed bud (Off), 0.5 = half-open (Suggest), 1 = full bloom
  (Redirect).

- **`src/redirects.ts`** — the shared domain module all three surfaces
  depend on, and the natural place to look first when changing redirect
  behavior. It defines `RedirectMode` (`'off' | 'suggest' | 'redirect'`), the
  `Redirect` type -- including `mode` and `userConfigured`, which is
  false/undefined until the user explicitly chooses that pair's mode (the
  sidebar flower or "Set all", or "Always redirect"/"Stop suggesting" on the
  banner) -- and the built-in `defaultRedirects` list (each tagged with an
  `effort` of `easy` / `medium` / `hard`; every pair ships in `'suggest'`
  mode, so nothing ever redirects until the user picks Redirect), plus:
  - `normalizeMode` — reads a stored pair's mode. Versions before modes
    existed saved an `enabled` boolean; it converts those without changing
    what anyone sees: on → `'redirect'`, off and never touched → `'suggest'`
    (those pairs were already showing the old "want to turn it on?" banner
    on every visit), off by the user's choice → `'off'`.
  - `resolveSuggestion` — matches the current URL's hostname against *all*
    redirects (including subdomains), takes the longest match, and returns
    it (with the URL "Go to ..." should open) only when that pair is in
    `'suggest'` mode, or `null` otherwise.
  - `resolveTargetUrl` — where visiting the current URL should send the
    user for one specific pair; shared by the overlay and the banner so both
    land in the same place.
  - `resolveRedirectTarget` — matches the current URL's hostname against
    pairs in `'redirect'` mode (including subdomains) and returns the
    longest match's `resolveTargetUrl`.
    When that redirect has a `searchMapping` (search engines and a few
    product-search sites — see the `defaultRedirects` entries with a
    `searchMapping` field, and the comments on the `SearchMapping` /
    `SearchMappingLocation` types above `Redirect`) and the current page is
    a recognized search-results page on the source site, the actual search
    term is carried over to the equivalent search on the target (e.g.
    `google.com/search?q=clothes` -> `ecosia.org/search?q=clothes`, or
    `shein.com/pdsearch/jeans/` -> `thredup.com/search?q=jeans` for a site
    that encodes the term in the path instead of a query param). Otherwise
    — no mapping, or the current page isn't a search page in that shape —
    it preserves the path/query as-is for pairs without a `searchMapping`,
    or lands on the target's homepage for pairs that have one (a
    source-specific path has no equivalent meaning on a differently
    structured target site).
  - `mergeRedirects` — reconciles the shipped defaults with what's saved in
    storage, so editing `defaultRedirects` (new description, changed target,
    removed entry) propagates to existing users without clobbering a mode
    they've already chosen.
  - `readStoredRedirects` / `saveRedirects` — thin wrappers over
    `browser.storage.local` (promise-based, used whenever `browser` exists,
    i.e. Firefox) or `chrome.storage.local` (callback-based, Chromium) under
    the shared key `greendirect.redirects`. Each browser gets exactly one
    calling convention -- never a callback on `browser.*`. `readStoredRedirects`
    only writes back when merging with the defaults actually changed
    something: Firefox fires `storage.onChanged` for every write, even an
    identical one, and the content script and sidebar both re-read on every
    change, so an unconditional write-on-read is a self-feeding loop there
    (Chromium drops no-op writes and hides it).
  - `onStorageChanged` / `sendExtensionMessage` — the same one-namespace-only
    treatment for `storage.onChanged` and `runtime.sendMessage`. Both prefer
    `browser.*` when present: on Firefox, `chrome.runtime.sendMessage(msg)`
    without a callback returns nothing (no promise), which would drop the
    background script's reply. Nothing outside `redirects.ts` should touch
    `chrome.storage` / `browser.storage` directly.

Data flow: the content script and sidebar both call into `redirects.ts` to
read/write the same `chrome.storage.local` entry, so a mode change in the
sidebar takes effect on the next navigation via the content script's
`storage.onChanged` listener — there is no messaging between background,
content script, and sidebar beyond the "open sidebar" request.

## Notes

- `extension.config.js` configures a persistent browser profile per target
  browser (`dist/extension-profile-<browser>`) used by `npm run dev`.
- **Firefox permissions are declared separately.** `chromium:permissions`
  in `src/manifest.json` only applies to Chromium builds; Firefox needs its
  own `firefox:permissions` (currently just `storage`). This is easy to miss
  because `npm run dev` injects `tabs` and `storage` into every Firefox build
  (Extension.js' dev-only `DEV_INJECTED_PERMISSIONS_MV2`), so everything
  works in dev while a packaged Firefox build has no `browser.storage` and
  silently loses every saved setting. `src/manifest.test.ts` guards
  `storage`. When changing permissions, verify with a real `npm run
  build:firefox` and check `dist/firefox/manifest.json`, not a dev run.
  Firefox deliberately doesn't get `tabs`: the code only reads `sender.tab.id`
  and `tabs.onRemoved`, neither of which needs it, and it adds an install
  warning.
- `src/storage.test.ts` simulates Firefox's storage semantics (promise-only
  `browser.*`, `onChanged` on every write) and Chromium's; run it with the
  other tests when touching anything in the storage/messaging helpers.
- `STORE.md` holds store-listing metadata (Chrome Web Store / Firefox
  Add-ons / Edge Add-ons) — keep it in sync when permissions or behavior
  change, since store submissions ask for this at submission time.
