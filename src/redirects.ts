export type RedirectEffort = 'easy' | 'medium' | 'hard'

// What GreenDirect does when the user visits a pair's `from` site:
// - 'off': nothing at all.
// - 'suggest': shows the small bottom-right suggestion banner on every visit
//   (content/SuggestionBanner.tsx). It never navigates on its own; the user
//   can go to the alternative once, switch the pair to 'redirect', or switch
//   it to 'off' from the banner itself.
// - 'redirect': shows the 5-second RedirectOverlay countdown, then sends the
//   user to the alternative.
// The sidebar shows these as the three stops of the flower toggle: closed
// bud, half-open, full bloom.
export const REDIRECT_MODES = ['off', 'suggest', 'redirect'] as const
export type RedirectMode = (typeof REDIRECT_MODES)[number]

export const MODE_LABELS: Record<RedirectMode, string> = {
  off: 'Off',
  suggest: 'Suggest',
  redirect: 'Redirect',
}

// Describes one endpoint (source or target) of a search-query equivalence:
// either a classic "?param=term" search page, or a site that encodes the
// term directly in the path (e.g. SHEIN's /pdsearch/<term>/, no query
// param at all). For the 'path-segment' style, `path` is a template
// containing exactly one `{query}` placeholder, e.g. '/pdsearch/{query}/'.
export type SearchMappingLocation =
  | { style: 'query-param'; path: string; param: string; extraParams?: Record<string, string> }
  | { style: 'path-segment'; path: string }

// Lets a redirect carry over the actual search term instead of just
// swapping hostnames: visiting google.com/search?q=clothes with the
// google -> ecosia redirect on lands on ecosia.org/search?q=clothes,
// not just ecosia.org's homepage. Only defined for pairs where both sites
// were confirmed to expose a real search URL in this shape -- see the
// entries in defaultRedirects below for which pairs that covers. When a
// redirect has a searchMapping but the page the user is actually on isn't
// recognized as a search-results page on the source site (a product page,
// the homepage, an account page, ...), resolveRedirectTarget falls back to
// the target's homepage instead of carrying over a source-specific path
// that has no equivalent meaning on a differently-structured site.
export type SearchMapping = {
  source: SearchMappingLocation
  target: SearchMappingLocation
}

export type Redirect = {
  id: number
  from: string
  to: string
  description?: string
  mode: RedirectMode
  effort: RedirectEffort
  searchMapping?: SearchMapping
  // Whether the user has explicitly chosen this pair's `mode` -- with its
  // flower toggle (or a "Set all" button) in the sidebar, or with "Always
  // redirect"/"Stop suggesting" on the suggestion banner. false/undefined
  // means `mode` is still just whatever defaultRedirects shipped with.
  // Merely being present in storage doesn't count: every redirect gets
  // persisted on first load whether or not the user has ever looked at it.
  userConfigured?: boolean
}

// A redirect as it may come back from storage. Versions before modes
// existed saved an `enabled` boolean instead of `mode`; normalizeMode below
// converts those.
export type StoredRedirect = Omit<Redirect, 'mode'> & { mode?: unknown; enabled?: unknown }

export const REDIRECT_STORAGE_KEY = 'greendirect.redirects'

// Message types used between the content script and the background script
// to track, per browser tab, whether the user has dismissed the redirect
// overlay ("Stay on this site") for the domain currently open in that tab.
export const REDIRECT_OVERLAY_DISMISSAL_QUERY_MESSAGE = 'greendirect.redirectOverlay.queryDismissed'
export const REDIRECT_OVERLAY_DISMISSAL_SET_MESSAGE = 'greendirect.redirectOverlay.setDismissed'

// Same idea, for the suggestion banner (see resolveSuggestion below and
// content/SuggestionBanner.tsx): its × button hides it the same way "Stay on
// this site" dismisses the redirect overlay above -- for the rest of this
// tab's visit to the current domain, re-arming on a new tab or after
// navigating away and back. Tracked separately from the redirect-overlay
// dismissal so answering one doesn't affect the other.
export const SUGGESTION_DISMISSAL_QUERY_MESSAGE = 'greendirect.suggestionBanner.queryDismissed'
export const SUGGESTION_DISMISSAL_SET_MESSAGE = 'greendirect.suggestionBanner.setDismissed'

export const EFFORT_LABELS: Record<RedirectEffort, string> = {
  easy: 'Easy switch',
  medium: 'Medium effort',
  hard: 'High effort',
}

// Every pair ships on 'suggest': nothing ever navigates away from a site
// until the user explicitly picks 'redirect' for it.
export const defaultRedirects: Redirect[] = [
  {
    id: 1,
    from: 'www.google.com',
    to: 'ecosia.org',
    description: 'Search with an engine that puts its profits toward planting trees and renewable energy',
    mode: 'suggest',
    effort: 'easy',
    // Confirmed: both google.com and ecosia.org serve search results at
    // /search?q=<term>. Ecosia's own search box also adds method=index and
    // ar=1, so redirected searches carry the same two parameters.
    searchMapping: {
      source: { style: 'query-param', path: '/search', param: 'q' },
      target: { style: 'query-param', path: '/search', param: 'q', extraParams: { method: 'index', ar: '1' } },
    },
  },
  { id: 2, from: 'www.booking.com', to: 'ecohotels.com', description: 'Book hotels with visible sustainability certifications and a tree planted for every stay', mode: 'suggest', effort: 'easy' },
  {
    id: 3,
    from: 'zara.com',
    to: 'vinted.com',
    description: 'Buy and sell secondhand clothes instead of buying new fast fashion',
    mode: 'suggest',
    effort: 'easy',
    // Confirmed: Zara's search lives at /us/en/search?searchTerm=<term>;
    // Vinted's at /catalog?search_text=<term>.
    searchMapping: {
      source: { style: 'query-param', path: '/us/en/search', param: 'searchTerm' },
      target: { style: 'query-param', path: '/catalog', param: 'search_text' },
    },
  },
  {
    id: 4,
    from: 'shein.com',
    to: 'thredup.com',
    description: 'Thrift pre-loved clothing online instead of buying new fast fashion',
    mode: 'suggest',
    effort: 'easy',
    // Confirmed: SHEIN encodes the term in the path itself, e.g.
    // /pdsearch/jeans/ (no query param), while ThredUp uses /search?q=<term>.
    searchMapping: {
      source: { style: 'path-segment', path: '/pdsearch/{query}/' },
      target: { style: 'query-param', path: '/search', param: 'q' },
    },
  },
  {
    id: 5,
    from: 'bestbuy.com',
    to: 'backmarket.com',
    description: 'Buy refurbished phones, laptops and gadgets instead of new, cutting e-waste and manufacturing',
    mode: 'suggest',
    effort: 'easy',
    // Confirmed: Best Buy's search is /site/searchpage.jsp?st=<term>; Back
    // Market's is /en-us/search?q=<term>.
    searchMapping: {
      source: { style: 'query-param', path: '/site/searchpage.jsp', param: 'st' },
      target: { style: 'query-param', path: '/en-us/search', param: 'q' },
    },
  },
  {
    id: 6,
    from: 'www.amazon.com',
    to: 'earthhero.com',
    description: 'Shop a curated store of sustainable everyday goods, from home to personal care',
    mode: 'suggest',
    effort: 'medium',
    // Confirmed: Amazon's search is /s?k=<term>. EarthHero runs on Shopify,
    // whose storefront search is always /search?q=<term>.
    searchMapping: {
      source: { style: 'query-param', path: '/s', param: 'k' },
      target: { style: 'query-param', path: '/search', param: 'q' },
    },
  },
  { id: 7, from: 'airbnb.com', to: 'ecobnb.com', description: 'Book stays that meet eco-friendly criteria, from organic farmhouses to green apartments', mode: 'suggest', effort: 'medium' },
  { id: 8, from: 'www.doordash.com', to: 'toogoodtogo.com', description: 'Pick up discounted surplus food from local shops instead of ordering delivery', mode: 'suggest', effort: 'medium' },
  { id: 9, from: 'barnesandnoble.com', to: 'thriftbooks.com', description: 'Buy used books instead of new copies, usually at a lower price', mode: 'suggest', effort: 'medium' },
  {
    id: 10,
    from: 'www.bing.com',
    to: 'oceanhero.today',
    description: 'Search and fund ocean-bound plastic recovery, roughly one bottle per five searches by its own count',
    mode: 'suggest',
    effort: 'medium',
    // Bing's search is confirmed at /search?q=<term>. OceanHero's own
    // /search path is confirmed too (it's explicitly blocked in their
    // robots.txt, which only makes sense if the path is live), but its
    // exact param name isn't independently confirmed -- `q` is the
    // near-universal convention search UIs use, so it's the best-effort
    // guess here. Worst case if it's wrong: the user lands on OceanHero's
    // search page without a prefilled query, not a broken link.
    searchMapping: {
      source: { style: 'query-param', path: '/search', param: 'q' },
      target: { style: 'query-param', path: '/web', param: 'q' },
    },
  },
  { id: 11, from: 'mail.google.com', to: 'posteo.de', description: 'Ad-free, private email run on renewable electricity, for a small monthly fee', mode: 'suggest', effort: 'hard' },
  { id: 12, from: 'workspace.google.com', to: 'infomaniak.com', description: 'Swiss email, storage and office tools hosted in renewable-powered data centers', mode: 'suggest', effort: 'hard' },
  { id: 13, from: 'mailchimp.com', to: 'ecosend.io', description: 'Email marketing that keeps campaigns lightweight and plants trees to offset their emissions', mode: 'suggest', effort: 'hard' },
  { id: 14, from: 'www.godaddy.com', to: 'greengeeks.com', description: 'Web hosting that matches its energy use with renewable energy credits', mode: 'suggest', effort: 'hard' },
  { id: 15, from: 'analytics.google.com', to: 'withcabin.com', description: 'Privacy-first, carbon-aware website analytics', mode: 'suggest', effort: 'hard' },
]

const normalizeEffort = (value: unknown): RedirectEffort => {
  if (value === 'easy' || value === 'medium' || value === 'hard') return value
  return 'easy'
}


// Reads a stored pair's mode. Data saved before modes existed only has an
// `enabled` boolean, converted so that nobody's current experience changes:
// on -> 'redirect'; off and never touched -> 'suggest' (those pairs were
// already showing the old "want to turn it on?" banner on every visit);
// off because the user said so -> 'off'.
export function normalizeMode(redirect: { mode?: unknown; enabled?: unknown; userConfigured?: unknown }): RedirectMode {
  if (redirect.mode === 'off' || redirect.mode === 'suggest' || redirect.mode === 'redirect') return redirect.mode
  if (redirect.enabled) return 'redirect'
  return redirect.userConfigured ? 'off' : 'suggest'
}

export function normalizeRedirects(redirects: StoredRedirect[] = []): Redirect[] {
  return redirects
    .filter((redirect) => redirect && typeof redirect.from === 'string' && redirect.from.trim().length > 0)
    .map(({ enabled: _legacyEnabled, ...redirect }) => ({
      ...redirect,
      id: Number.isFinite(redirect.id) ? Number(redirect.id) : Date.now() + Math.random(),
      from: redirect.from.trim().replace(/^https?:\/\//i, '').replace(/\/$/, '').toLowerCase(),
      to: redirect.to.trim().replace(/^https?:\/\//i, '').replace(/\/$/, '').toLowerCase(),
      description: redirect.description?.trim() ?? '',
      mode: normalizeMode({ ...redirect, enabled: _legacyEnabled }),
      effort: normalizeEffort(redirect.effort),
      userConfigured: Boolean(redirect.userConfigured),
    }))
    .filter((redirect, index, items) => items.findIndex((item) => item.from === redirect.from) === index)
}

export function mergeRedirects(currentDefaults: Redirect[], storedRedirects: StoredRedirect[] = []): Redirect[] {
  const normalizedDefaults = normalizeRedirects(currentDefaults)
  const normalizedStored = normalizeRedirects(storedRedirects)
  const storedBySource = new Map(normalizedStored.map((redirect) => [redirect.from, redirect]))

  return normalizedDefaults.map((defaultRedirect) => {
    const storedRedirect = storedBySource.get(defaultRedirect.from)

    return {
      ...defaultRedirect,
      ...storedRedirect,
      id: defaultRedirect.id,
      from: defaultRedirect.from,
      to: defaultRedirect.to,
      description: defaultRedirect.description,
      mode: storedRedirect ? storedRedirect.mode : defaultRedirect.mode,
      effort: defaultRedirect.effort,
      // Whether the user has ever explicitly decided this one, not just
      // inherited whatever defaultRedirects shipped with -- see the field's
      // doc comment on the Redirect type above.
      userConfigured: storedRedirect ? Boolean(storedRedirect.userConfigured) : false,
      // Like `to`/`description`/`effort` above, the search-equivalence
      // mapping is part of the shipped redirect definition, not something
      // a user can set -- always take it from code, never from whatever a
      // (possibly older-shaped) stored record happens to carry.
      searchMapping: defaultRedirect.searchMapping,
    }
  })
}

// The `from` value on a redirect is what's actually matched against the
// page's hostname, and is sometimes more specific than the bare domain
// (e.g. 'www.google.com' rather than 'google.com') so that unrelated
// subdomains of the same site — mail, drive, docs, aws, dasher sign-up,
// and so on — don't get swept into a redirect meant for a different
// product. That precision shouldn't leak into the UI: this strips a
// leading 'www.' so every entry displays as a plain, consistent domain
// regardless of how precisely it's matched underneath.
export function displayHostname(from: string): string {
  return from.replace(/^www\./i, '')
}

export function matchesHostname(hostname: string, redirectSource: string) {
  const lowerHost = hostname.toLowerCase()
  const normalizedSource = redirectSource.toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '')

  return lowerHost === normalizedSource || lowerHost.endsWith(`.${normalizedSource}`)
}

function normalizePathname(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith('/')) return pathname.slice(0, -1)
  return pathname
}

// Pulls the literal search term out of a URL that matches a
// SearchMappingLocation's shape, or returns null if the URL isn't actually
// a search-results page in that shape (e.g. the user is on the site's
// homepage or a product page rather than a search page).
function extractSearchTerm(url: URL, location: SearchMappingLocation): string | null {
  if (location.style === 'query-param') {
    if (normalizePathname(url.pathname) !== normalizePathname(location.path)) return null

    const value = url.searchParams.get(location.param)
    return value && value.trim().length > 0 ? value : null
  }

  const [prefix, suffix = ''] = location.path.split('{query}')
  if (!url.pathname.startsWith(prefix) || !url.pathname.endsWith(suffix)) return null

  const encoded = url.pathname.slice(prefix.length, url.pathname.length - suffix.length)
  if (!encoded) return null

  try {
    // Some sites (SHEIN included) encode spaces in path segments as '+'
    // rather than '%20'.
    return decodeURIComponent(encoded.replace(/\+/g, ' ')) || null
  } catch {
    return null
  }
}

// Writes `term` onto `url` in the shape a SearchMappingLocation describes.
// Mutates pathname/search in place; hostname/protocol/port are left as
// resolveRedirectTarget already set them to the redirect's target.
function applySearchTerm(url: URL, location: SearchMappingLocation, term: string): void {
  if (location.style === 'query-param') {
    url.pathname = location.path
    url.search = ''
    for (const [key, value] of Object.entries(location.extraParams ?? {})) {
      url.searchParams.set(key, value)
    }
    url.searchParams.set(location.param, term)
    return
  }

  const [prefix, suffix = ''] = location.path.split('{query}')
  url.pathname = `${prefix}${encodeURIComponent(term)}${suffix}`
  url.search = ''
}

// The longest `from` that matches `hostname` among the redirects `include`
// accepts, found without allocating intermediate arrays or performing a full
// sort -- this runs on the page's main thread on every matching page load.
function findLongestMatch(hostname: string, redirects: Redirect[], include: (redirect: Redirect) => boolean): Redirect | null {
  let selected: Redirect | null = null
  for (let i = 0; i < redirects.length; i++) {
    const redirect = redirects[i]
    if (!include(redirect)) continue
    if (!matchesHostname(hostname, redirect.from)) continue

    if (selected === null || redirect.from.length > selected.from.length) {
      selected = redirect
    }
  }

  return selected
}

// Where visiting `currentUrl` should send the user for this particular pair,
// carrying over the search term when the pair has a matching searchMapping.
// Returns null when the page already is that target. Shared by the redirect
// overlay (resolveRedirectTarget) and the suggestion banner's "Go to ..."
// button (resolveSuggestion), so both land in exactly the same place.
export function resolveTargetUrl(currentUrl: string, selected: Redirect): string | null {
  const parsedCurrentUrl = new URL(currentUrl)
  const selectedTarget = /^https?:\/\//i.test(selected.to) ? new URL(selected.to) : new URL(`https://${selected.to}`)
  const targetUrl = new URL(parsedCurrentUrl.href)

  targetUrl.protocol = selectedTarget.protocol
  targetUrl.hostname = selectedTarget.hostname
  targetUrl.port = selectedTarget.port

  // Only a searchMapping guarantees the source and target sites share any
  // path structure at all. Everywhere else -- no searchMapping (workspace.google.com
  // -> infomaniak.com, mailchimp.com -> ecosend.io, ...), or a searchMapping
  // that didn't match this particular page -- copying the source's
  // path/query onto the target's hostname is a coin flip at best: it only
  // "works" when that exact path happens to exist on a completely
  // different site, and 404s the rest of the time (this is what was
  // sending workspace.google.com's deep links to a 404 on infomaniak.com).
  // So the only case that keeps the source's path is a confirmed search
  // page carrying over its search term; everything else lands on the
  // target's homepage.
  const term = selected.searchMapping ? extractSearchTerm(parsedCurrentUrl, selected.searchMapping.source) : null

  if (selected.searchMapping && term) {
    // Same search, same term, on the greener site: e.g. searching
    // "clothes" on google.com lands on the equivalent ecosia.org search
    // for "clothes", not just ecosia's homepage.
    applySearchTerm(targetUrl, selected.searchMapping.target, term)
  } else {
    targetUrl.pathname = '/'
    targetUrl.search = ''
  }

  targetUrl.hash = ''

  if (parsedCurrentUrl.hostname === selectedTarget.hostname && parsedCurrentUrl.pathname === targetUrl.pathname && parsedCurrentUrl.search === targetUrl.search) {
    return null
  }

  return targetUrl.toString()
}

// The URL the redirect overlay should count down to for the current page:
// the most specific pair in 'redirect' mode that matches its hostname, or
// null when none does.
export function resolveRedirectTarget(currentUrl: string, redirects: Redirect[] = defaultRedirects): string | null {
  const { hostname } = new URL(currentUrl)
  const selected = findLongestMatch(hostname, redirects, (redirect) => redirect.mode === 'redirect')

  return selected ? resolveTargetUrl(currentUrl, selected) : null
}

export type Suggestion = {
  redirect: Redirect
  targetUrl: string
}

// The pair the suggestion banner should offer on the current page, with the
// URL its "Go to ..." button leads to, or null if there's nothing to
// suggest. Picks the most specific match among *all* pairs, then only
// returns it when that pair is in 'suggest' mode -- so a more specific pair
// the user turned off (or set to redirect) is never shadowed by a broader
// one that happens to be suggesting.
export function resolveSuggestion(currentUrl: string, redirects: Redirect[] = defaultRedirects): Suggestion | null {
  let hostname: string
  try {
    hostname = new URL(currentUrl).hostname
  } catch {
    return null
  }

  const selected = findLongestMatch(hostname, redirects, () => true)
  if (selected === null || selected.mode !== 'suggest') return null

  const targetUrl = resolveTargetUrl(currentUrl, selected)
  return targetUrl ? { redirect: selected, targetUrl } : null
}

type StorageItems = Record<string, unknown>

type StorageChangeEvent = {
  addListener: (listener: () => void) => void
  removeListener: (listener: () => void) => void
}

// The parts of the two extension namespaces this module touches. Firefox
// exposes both `browser` (promise-based) and `chrome` (callback-based);
// Chromium exposes `chrome` only.
type ExtensionGlobals = {
  browser?: {
    runtime?: { sendMessage?: (message: unknown) => Promise<unknown> }
    storage?: {
      local?: {
        get: (key: string) => Promise<StorageItems>
        set: (items: StorageItems) => Promise<void>
      }
      onChanged?: StorageChangeEvent
    }
  }
  chrome?: {
    runtime?: { lastError?: { message?: string }; sendMessage?: (message: unknown) => Promise<unknown> | void }
    storage?: {
      local?: {
        get: (key: string, callback: (items: StorageItems) => void) => void
        set: (items: StorageItems, callback?: () => void) => void
      }
      onChanged?: StorageChangeEvent
    }
  }
}

type StorageBackend = {
  get: (key: string) => Promise<StorageItems>
  set: (items: StorageItems) => Promise<void>
}

function getExtensionGlobals(): ExtensionGlobals {
  return globalThis as unknown as ExtensionGlobals
}

// Picks ONE namespace and speaks its calling convention. `browser.*` is
// promise-only (its schema has no callback parameter), while `chrome.*` takes
// a callback and -- on Firefox especially -- never hands back a promise. An
// earlier version tried the callback form on whichever object existed and
// fell back to the promise form when that threw, which only held together by
// accident on Firefox.
//
// Returns undefined when neither namespace has storage, e.g. a Firefox build
// whose manifest doesn't declare the "storage" permission (see the
// `firefox:permissions` entry in manifest.json).
function getStorage(): StorageBackend | undefined {
  const { browser: browserApi, chrome: chromeApi } = getExtensionGlobals()

  const promiseArea = browserApi?.storage?.local
  if (promiseArea) {
    return {
      get: (key) => promiseArea.get(key),
      set: (items) => promiseArea.set(items),
    }
  }

  const callbackArea = chromeApi?.storage?.local
  if (callbackArea) {
    return {
      get: (key) =>
        new Promise<StorageItems>((resolve, reject) => {
          callbackArea.get(key, (items) => {
            const error = chromeApi?.runtime?.lastError
            if (error) reject(new Error(error.message))
            else resolve(items ?? {})
          })
        }),
      set: (items) =>
        new Promise<void>((resolve, reject) => {
          callbackArea.set(items, () => {
            const error = chromeApi?.runtime?.lastError
            if (error) reject(new Error(error.message))
            else resolve()
          })
        }),
    }
  }

  return undefined
}

// Sends a one-off message to the background script and resolves with its
// reply, or with undefined when there's no channel to it.
//
// `browser` is checked first on purpose. Firefox defines both namespaces, but
// its `chrome.runtime.sendMessage(message)` -- called without a callback --
// returns nothing rather than a promise, so the background script's reply
// (the "is this dismissed?" answer) would be dropped and "Stay on this site"
// would never be remembered. `browser.*` hands the reply back as a promise.
// Chromium has no `browser`, so it falls through to `chrome`, whose
// sendMessage returns a promise there.
export function sendExtensionMessage(message: unknown): Promise<unknown> {
  const { browser: browserApi, chrome: chromeApi } = getExtensionGlobals()

  try {
    if (browserApi?.runtime?.sendMessage) {
      return Promise.resolve(browserApi.runtime.sendMessage(message))
    }

    if (chromeApi?.runtime?.sendMessage) {
      return Promise.resolve(chromeApi.runtime.sendMessage(message))
    }
  } catch {
    // sendMessage throws synchronously (rather than rejecting) when the
    // extension context has been invalidated, e.g. the extension was
    // reloaded while this page was still open.
  }

  // No messaging channel to the background script -- fail open so the
  // overlay still shows rather than silently never showing again.
  return Promise.resolve(undefined)
}

// Subscribes `listener` to changes in the shared storage area and returns
// the matching unsubscribe function. It registers on ONE namespace only:
// Firefox exposes both `browser` and `chrome`, each with its own onChanged
// event, so listening on both risks running the listener twice per change
// and is never needed.
export function onStorageChanged(listener: () => void): () => void {
  const { browser: browserApi, chrome: chromeApi } = getExtensionGlobals()
  const changed = browserApi?.storage?.onChanged ?? chromeApi?.storage?.onChanged

  changed?.addListener(listener)

  return () => changed?.removeListener(listener)
}

// Order-insensitive JSON, so two lists that differ only in key order (which
// says nothing about the user's settings) still compare equal.
function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) return item

    return Object.fromEntries(
      Object.entries(item as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    )
  })
}

export async function readStoredRedirects(): Promise<Redirect[]> {
  const storage = getStorage()

  if (!storage) return defaultRedirects

  let stored: unknown
  try {
    stored = (await storage.get(REDIRECT_STORAGE_KEY))?.[REDIRECT_STORAGE_KEY]
  } catch {
    // Couldn't read. Serve the shipped defaults for this call, but write
    // nothing back: saving them now could overwrite the user's real settings
    // with defaults just because of a transient read failure.
    return defaultRedirects
  }

  const hasStored = Array.isArray(stored) && stored.length > 0
  const merged = mergeRedirects(defaultRedirects, hasStored ? (stored as StoredRedirect[]) : defaultRedirects)

  // Only write back when the merge actually changed something (first run, or
  // a shipped-defaults update reaching an existing user). This matters
  // because both the content script and the sidebar re-read on every
  // storage.onChanged, and Firefox fires onChanged for every write even when
  // the value is identical (Chromium drops no-op writes). Writing on every
  // read therefore made each read trigger another one, forever.
  if (!hasStored || canonicalJson(stored) !== canonicalJson(merged)) {
    try {
      await saveRedirects(merged)
    } catch {
      // Best effort: the merged list is still the right answer for this call.
    }
  }

  return merged
}

export async function saveRedirects(redirects: Redirect[]) {
  const storage = getStorage()

  if (!storage) return

  await storage.set({ [REDIRECT_STORAGE_KEY]: mergeRedirects(defaultRedirects, redirects) })
}
