export type RedirectEffort = 'easy' | 'medium' | 'hard'

export type Redirect = {
  id: number
  from: string
  to: string
  description?: string
  enabled: boolean
  effort: RedirectEffort
}

export const REDIRECT_STORAGE_KEY = 'greendirect.redirects'

export const EFFORT_LABELS: Record<RedirectEffort, string> = {
  easy: 'Easy switch',
  medium: 'Medium effort',
  hard: 'High effort',
}

export const defaultRedirects: Redirect[] = [
  { id: 1, from: 'google.com', to: 'ecosia.org', description: 'Search with a tree-planting search engine', enabled: true, effort: 'easy' },
  { id: 2, from: 'booking.com', to: 'bookdifferent.com', description: 'Book hotels with eco-certified stays ranked first and half of revenue donated to charity', enabled: true, effort: 'easy' },
  { id: 3, from: 'zara.com', to: 'vinted.com', description: 'Buy and sell secondhand fashion instead of fast fashion', enabled: true, effort: 'easy' },
  { id: 4, from: 'shein.com', to: 'thredup.com', description: 'Shop pre-loved clothing and keep it out of landfill', enabled: true, effort: 'easy' },
  { id: 5, from: 'bestbuy.com', to: 'backmarket.com', description: 'Refurbished phones, laptops and gadgets with less e-waste', enabled: true, effort: 'easy' },
  { id: 6, from: 'amazon.com', to: 'etsy.com', description: 'Support small makers and independent shops', enabled: false, effort: 'medium' },
  { id: 7, from: 'airbnb.com', to: 'ecobnb.com', description: 'Stay in eco-friendly accommodations, from organic farmhouses to green apartments', enabled: false, effort: 'medium' },
  { id: 8, from: 'doordash.com', to: 'toogoodtogo.com', description: 'Rescue surplus food from local shops instead of ordering new', enabled: false, effort: 'medium' },
  { id: 9, from: 'barnesandnoble.com', to: 'betterworldbooks.com', description: 'Used books that fund literacy and reduce waste', enabled: false, effort: 'medium' },
  { id: 10, from: 'bing.com', to: 'oceanhero.today', description: 'Search and help pull plastic out of the ocean', enabled: false, effort: 'medium' },
  { id: 11, from: 'mail.google.com', to: 'posteo.de', description: 'Private, renewable-powered email', enabled: false, effort: 'hard' },
  { id: 12, from: 'workspace.google.com', to: 'infomaniak.com', description: 'Swiss email, storage and office tools on renewable energy', enabled: false, effort: 'hard' },
  { id: 13, from: 'mailchimp.com', to: 'ecosend.io', description: 'Email marketing that offsets the emissions of every campaign', enabled: false, effort: 'hard' }, // TODO: confirm domain
  { id: 14, from: 'godaddy.com', to: 'greengeeks.com', description: 'Web hosting powered by renewable energy', enabled: false, effort: 'hard' },
  { id: 15, from: 'analytics.google.com', to: 'withcabin.com', description: 'Privacy-first, carbon-aware website analytics', enabled: false, effort: 'hard' },
]

const normalizeEffort = (value: unknown): RedirectEffort => {
  if (value === 'easy' || value === 'medium' || value === 'hard') return value
  return 'easy'
}


export function normalizeRedirects(redirects: Redirect[] = []): Redirect[] {
  return redirects
    .filter((redirect) => redirect && typeof redirect.from === 'string' && redirect.from.trim().length > 0)
    .map((redirect) => ({
      ...redirect,
      id: Number.isFinite(redirect.id) ? Number(redirect.id) : Date.now() + Math.random(),
      from: redirect.from.trim().replace(/^https?:\/\//i, '').replace(/\/$/, '').toLowerCase(),
      to: redirect.to.trim().replace(/^https?:\/\//i, '').replace(/\/$/, '').toLowerCase(),
      description: redirect.description?.trim() ?? '',
      enabled: Boolean(redirect.enabled),
      effort: normalizeEffort(redirect.effort),
    }))
    .filter((redirect, index, items) => items.findIndex((item) => item.from === redirect.from) === index)
}

export function mergeRedirects(currentDefaults: Redirect[], storedRedirects: Redirect[] = []): Redirect[] {
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
      description: storedRedirect?.description ?? defaultRedirect.description,
      enabled: storedRedirect ? Boolean(storedRedirect.enabled) : Boolean(defaultRedirect.enabled),
      effort: defaultRedirect.effort,
    }
  })
}

export function matchesHostname(hostname: string, redirectSource: string) {
  const lowerHost = hostname.toLowerCase()
  const normalizedSource = redirectSource.toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '')

  return lowerHost === normalizedSource || lowerHost.endsWith(`.${normalizedSource}`)
}

export function resolveRedirectTarget(currentUrl: string, redirects: Redirect[] = defaultRedirects): string | null {
  const parsedCurrentUrl = new URL(currentUrl)
  const enabledMatches = redirects
    .filter((redirect) => redirect.enabled)
    .filter((redirect) => matchesHostname(parsedCurrentUrl.hostname, redirect.from))
    .sort((a, b) => b.from.length - a.from.length)

  if (enabledMatches.length === 0) return null

  const selected = enabledMatches[0]
  const selectedTarget = /^https?:\/\//i.test(selected.to) ? new URL(selected.to) : new URL(`https://${selected.to}`)
  const targetUrl = new URL(parsedCurrentUrl.href)

  targetUrl.protocol = selectedTarget.protocol
  targetUrl.hostname = selectedTarget.hostname
  targetUrl.port = selectedTarget.port

  if (parsedCurrentUrl.hostname === selectedTarget.hostname && parsedCurrentUrl.pathname === targetUrl.pathname && parsedCurrentUrl.search === targetUrl.search) {
    return null
  }

  return targetUrl.toString()
}

function getStorage() {
  return (globalThis as typeof globalThis & {
    browser?: { storage?: { local?: { get: (key: string) => Promise<Record<string, unknown>>; set: (value: Record<string, unknown>) => Promise<void> } } }
    chrome?: { storage?: { local?: { get: (key: string, callback: (items: Record<string, unknown>) => void) => void; set: (items: Record<string, unknown>, callback?: () => void) => void } } }
  }).browser?.storage?.local ?? (globalThis as typeof globalThis & { chrome?: { storage?: { local?: { get: (key: string, callback: (items: Record<string, unknown>) => void) => void; set: (items: Record<string, unknown>, callback?: () => void) => void } } } }).chrome?.storage?.local
}

export async function readStoredRedirects(): Promise<Redirect[]> {
  const storage = getStorage()

  if (!storage) return defaultRedirects

  const value = await new Promise<Record<string, unknown>>((resolve, reject) => {
    try {
      storage.get(REDIRECT_STORAGE_KEY, (items: Record<string, unknown>) => resolve(items ?? {}))
    } catch (error) {
      reject(error)
    }
  }).catch(() => {
    // browser.storage.local.get is Promise-based in Firefox and extension polyfills.
    return (storage as typeof storage & { get: (key: string) => Promise<Record<string, unknown>> }).get(REDIRECT_STORAGE_KEY).catch(() => ({} as Record<string, unknown>))
  }) as Record<string, unknown>

  const redirects = value[REDIRECT_STORAGE_KEY] as unknown

  if (Array.isArray(redirects) && redirects.length > 0) {
    const merged = mergeRedirects(defaultRedirects, redirects as Redirect[])
    await saveRedirects(merged)
    return merged
  }

  const merged = mergeRedirects(defaultRedirects, defaultRedirects)
  await saveRedirects(merged)
  return merged
}

export async function saveRedirects(redirects: Redirect[]) {
  const storage = getStorage()

  if (!storage) return

  const payload = {[REDIRECT_STORAGE_KEY]: mergeRedirects(defaultRedirects, redirects)}

  try {
    await new Promise<void>((resolve, reject) => {
      try {
        storage.set(payload, () => resolve())
      } catch (error) {
        reject(error)
      }
    })
  } catch {
    await (storage as typeof storage & { set: (value: Record<string, unknown>) => Promise<void> }).set(payload)
  }
}
