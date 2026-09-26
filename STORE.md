# Store metadata

Starter file generated from this template's manifest. Every store asks
for this material at submission time; keep it current as the code
changes instead of rewriting it at the end. Replace the placeholder
lines marked TODO before you submit.

Packaging your extension is local and free. Submitting the result to a
store is what [extension.dev](https://docs.extension.dev/publish/overview?utm_source=store-md)
does, and it sponsors Extension.js.

Last updated: 2026-09-26

## Listing

- Name: greendirect
- Summary: Suggests greener alternatives to popular sites, and redirects to them only if you choose.
- Description: TODO write two or three short paragraphs of user
  benefits. Describe what the user sees and gains, not how the code
  works.
- Category: TODO pick one per store (for example Productivity).
- Screenshots: TODO at least one 1280x800 screenshot per store.

## Privacy and data use

- This template collects, stores, and transmits no user data.
- The manifest declares data_collection_permissions: none for
  Firefox, which matches this behavior. If you add data collection,
  update the declaration, this section, and your privacy policy in
  the same change.
- Privacy policy URL: TODO required by every store once you collect
  any data.

## Chrome Web Store

### Single purpose

Points users from popular websites to greener alternatives. On the ~15
supported sites it shows a small suggestion banner; it redirects only on
sites the user has explicitly set to Redirect in the side panel or on the
banner. Nothing redirects by default.

### Permissions justification

- sidePanel (Chromium only): Renders the extension's main interface in the browser side panel.
- storage: Remembers the mode the user chose for each site (off, suggest, or redirect), in the browser's local extension storage on their own device. Nothing is sent anywhere. Declared for Chromium under `chromium:permissions` and for Firefox under `firefox:permissions` in src/manifest.json.
- Content script host permissions: The content script only runs on the ~15 specific sites GreenDirect offers a greener redirect for (google.com, amazon.com, zara.com, etc. -- see defaultRedirects in src/redirects.ts), each declared as its own match pattern in src/manifest.json, so it can detect a matching visit and show the suggestion banner or, on sites the user set to Redirect, the redirect countdown. It does not run on <all_urls>.

## Firefox Add-ons

### Reviewer notes

TODO steps a reviewer needs to exercise the extension, plus test
credentials if sign-in is required. The build is bundled, so AMO
requires a source zip; include build-from-source instructions:
npm install, then npm run build. The dist output matches the upload.

### Release notes

TODO user-facing notes for the version you are submitting.

## Edge Add-ons

### Certification notes

TODO anything the certification team needs to test the extension,
including test steps and credentials. Mirrors the Firefox reviewer
notes in most cases.

## Version history

- Unreleased: each site now has three modes -- Off, Suggest, Redirect --
  set with a three-stage flower toggle. Every site starts on Suggest, so
  nothing redirects until the user chooses it. The suggestion banner
  ("Go to ...", "Always redirect", "Stop suggesting") replaces the old
  "want to turn it on?" prompt. Existing settings carry over unchanged.
- 1.0.0 (unreleased): initial version from the react template.
  Not yet submitted to any store.
