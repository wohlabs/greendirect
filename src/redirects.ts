export type Redirect = {
  id: number
  from: string
  to: string
  description?: string
  enabled: boolean
}

export const REDIRECT_STORAGE_KEY = 'greendirect.redirects'

export const defaultRedirects: Redirect[] = [
  { id: 1, from: 'google.com', to: 'ecosia.org', description: 'Search with a tree-planting search engine', enabled: true },
  { id: 2, from: 'facebook.com', to: 'mastodon.social', description: 'Community-first social networking', enabled: false },
  { id: 3, from: 'amazon.com', to: 'etsy.com', description: 'Support small makers and sustainable shops', enabled: false },
  { id: 4, from: 'twitter.com', to: 'micro.blog', description: 'Lightweight, independent microblogging', enabled: false },
  { id: 5, from: 'maps.google.com', to: 'openstreetmap.org', description: 'Open-source maps and community edits', enabled: true },
]

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
    return (storage as typeof storage & { get: (key: string) => Promise<Record<string, unknown>> }).get(REDIRECT_STORAGE_KEY).catch(() => ({}))
  })

  const redirects = value[REDIRECT_STORAGE_KEY]

  if (Array.isArray(redirects) && redirects.length > 0) return redirects as Redirect[]

  return defaultRedirects
}

export async function saveRedirects(redirects: Redirect[]) {
  const storage = getStorage()

  if (!storage) return

  const payload = {[REDIRECT_STORAGE_KEY]: redirects}

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
