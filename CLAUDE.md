# CLAUDE.md

Guidance for Claude Code (and other agents) working in this repository.

## Project overview

GreenDirect is a cross-browser extension (Chrome, Firefox, Edge) built with
[Extension.js](https://extension.js.org) and React 18 + TypeScript. It adds a
side panel where users can see a list of popular websites paired with greener
alternatives (e.g. `google.com` → `ecosia.org`), toggle each redirect on or
off individually, and use "Enable All" / "Disable All" shortcuts. When a
redirect is enabled, visiting the matching site sends the user straight to
its alternative.

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

Currently only `src/redirects.ts` has a test file
(`src/redirects.test.ts`), covering hostname matching, redirect resolution,
and the default/stored-redirect merge logic. Add new `*.test.ts` files
next to the module they cover.

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

- **`src/content/`** — a content script injected into every page
  (`document_start`, all URLs). `scripts.tsx` is the Extension.js entry
  point; it mounts a `Root` component into a shadow root (isolated from
  host-page styles so the widget can't be broken, or leak style into, the
  page it's injected into) that renders `RedirectOverlay.tsx` whenever the
  current page matches an enabled redirect. `Root` reads the stored
  redirect list on load and re-checks whenever storage changes;
  when a match is found it does *not* navigate immediately. Instead the
  overlay appears on top of the page for 5 seconds ("Redirecting to
  `<target>`. The earth loves you.", with a countdown bar and a small
  sprouting-leaf animation) before performing the redirect
  (`window.location.assign`). The overlay has two buttons: "Redirect now"
  jumps ahead immediately, and "Stay on this site" cancels the redirect
  and dismisses the overlay for the rest of that page's lifetime (until
  the next navigation re-injects the content script). A page with no
  matching, or no enabled, redirect never shows the overlay and behaves
  exactly as if the feature weren't there.

  When there's no active redirect, `Root` also renders `NudgeBanner.tsx`
  whenever `resolveNudgeCandidate` (see `src/redirects.ts`) finds a pair
  for the current hostname that's off by default and the user has never
  explicitly decided on (`Redirect.userConfigured` is falsy). Unlike the
  overlay, the banner is small, bottom-right, and non-blocking, and it
  never navigates anywhere itself -- it just asks "There's a greener
  alternative to `<site>`: `<alternative>`. Want to turn it on?" with
  three options: "Yes" (enables the redirect -- which then hands off to
  the normal RedirectOverlay countdown on the next storage-change check,
  exactly as if the user had flipped the switch in the sidebar), "No"
  (leaves it off), and "Remind me later". Both "Yes" and "No" set
  `userConfigured: true` on that pair so it's never nudged again anywhere.
  "Remind me later" (and the banner's × button) don't touch storage; they
  just dismiss the banner for the rest of the tab's visit to that domain,
  reappearing on a new tab or after navigating away and back -- the exact
  same per-tab dismissal mechanism as "Stay on this site" above, tracked
  separately in `background.ts` (`REDIRECT_OVERLAY_DISMISSAL_*` vs.
  `NUDGE_DISMISSAL_*` messages) so answering one never affects the other.

- **`src/sidebar/`** — the side panel UI. `SidebarApp.tsx` is a React
  component that loads the current redirect list, lets the user toggle
  redirects individually or all at once, and persists changes back to
  storage; `scripts.tsx` mounts it into `index.html`.

- **`src/redirects.ts`** — the shared domain module all three surfaces
  depend on, and the natural place to look first when changing redirect
  behavior. It defines the `Redirect` type -- including `userConfigured`,
  which is false/undefined until the user explicitly decides that pair's
  `enabled` value (a sidebar toggle, Enable All/Disable All, or a "Yes"/"No"
  answer on the nudge banner) and is what lets the nudge banner tell
  "off by default, never touched" apart from "off because the user turned
  it off" -- and the built-in `defaultRedirects` list (each tagged with an
  `effort` of `easy` / `medium` / `hard` — only `easy` redirects are enabled
  out of the box), plus:
  - `resolveNudgeCandidate` — matches the current URL's hostname against
    *all* redirects (including subdomains) the same way `resolveRedirectTarget`
    does, but returns the longest match only when it's off and
    `userConfigured` is falsy -- the pair `NudgeBanner.tsx` should offer to
    turn on, or `null` if there's nothing to nudge about on this page.
  - `resolveRedirectTarget` — matches the current URL's hostname against
    enabled redirects (including subdomains) and returns the longest match.
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
    removed entry) propagates to existing users without clobbering a toggle
    they've already flipped.
  - `readStoredRedirects` / `saveRedirects` — thin wrappers over
    `chrome.storage.local` / `browser.storage.local` (both callback- and
    promise-based storage APIs are handled, since Firefox differs from
    Chromium here) under the shared key `greendirect.redirects`.

Data flow: the content script and sidebar both call into `redirects.ts` to
read/write the same `chrome.storage.local` entry, so a toggle in the
sidebar takes effect on the next navigation via the content script's
`storage.onChanged` listener — there is no messaging between background,
content script, and sidebar beyond the "open sidebar" request.

## Notes

- `extension.config.js` configures a persistent browser profile per target
  browser (`dist/extension-profile-<browser>`) used by `npm run dev`.
- `STORE.md` holds store-listing metadata (Chrome Web Store / Firefox
  Add-ons / Edge Add-ons) — keep it in sync when permissions or behavior
  change, since store submissions ask for this at submission time.
