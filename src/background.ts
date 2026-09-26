import {
  REDIRECT_OVERLAY_DISMISSAL_QUERY_MESSAGE,
  REDIRECT_OVERLAY_DISMISSAL_SET_MESSAGE,
  SUGGESTION_DISMISSAL_QUERY_MESSAGE,
  SUGGESTION_DISMISSAL_SET_MESSAGE,
} from './redirects'

console.log(
  '[From the background context] Hello from the background worker/script!'
)

const isFirefoxLike =
  import.meta.env.EXTENSION_PUBLIC_BROWSER === 'firefox' ||
  import.meta.env.EXTENSION_PUBLIC_BROWSER === 'gecko-based'

const isSafariLike =
  import.meta.env.EXTENSION_PUBLIC_BROWSER === 'safari' ||
  import.meta.env.EXTENSION_PUBLIC_BROWSER === 'webkit-based'

// ---- Redirect-overlay "stay on this site" dismissal, tracked per tab ----
//
// The overlay (content/RedirectOverlay.tsx, wired up from content/scripts.tsx)
// remembers "Stay on this site" for the rest of the tab's visit to that
// domain. Neither the page's own storage nor the content script alone can
// express that: the content script re-injects fresh on every navigation, and
// the one per-origin storage a page could use itself (sessionStorage)
// survives for as long as the tab does regardless of what else the tab
// visited in between -- so leaving the domain and coming back in the same
// tab would never re-show the overlay. Tracking it here instead, keyed by
// tabId, and re-arming it the moment the content script reports a different
// hostname for that tab, is what makes "leaving the domain" actually clear
// the dismissal.
type TabDismissal = {hostname: string; dismissed: boolean}

// Chromium (and Safari) service workers are evicted after roughly 30s idle
// and restart with a blank module scope, which would otherwise wipe an
// in-memory dismissal map and make a dismissed overlay/banner reappear on a
// domain the tab never left. chrome.storage.session is an in-memory store,
// never written to disk, that survives exactly that restart and is cleared
// only when the browser itself closes -- the lifetime a dismissal needs.
// It's skipped on Firefox: that build's background page is persistent
// (manifest v2, see src/manifest.json), so the in-memory map alone already
// survives as long as the browser stays open, and chrome.storage.session
// may not exist there.
function getSessionArea() {
  if (isFirefoxLike) return undefined
  return typeof chrome !== 'undefined' ? chrome.storage?.session : undefined
}

// Tracks, per browser tab, whether the user has dismissed some
// once-per-domain-visit UI (the redirect overlay's "Stay on this site", or
// the suggestion banner's × button) for the domain currently open in
// that tab. Each caller gets its own tracker (a different `storageKeyPrefix`)
// so the two dismissals never bleed into each other, but they share the
// same re-arming rule: a hostname that doesn't match what's on file for
// that tab means the tab has navigated to a different domain since the
// last dismissal (or query), which starts a fresh, un-dismissed record --
// the actual mechanism that re-arms the UI once the user leaves a domain
// (or opens a brand new tab, which has no record at all yet).
function createTabDismissalTracker(storageKeyPrefix: string) {
  const dismissalByTab = new Map<number, TabDismissal>()

  function storageKey(tabId: number) {
    return `${storageKeyPrefix}.${tabId}`
  }

  async function load(tabId: number): Promise<TabDismissal | undefined> {
    const cached = dismissalByTab.get(tabId)
    if (cached) return cached

    const area = getSessionArea()
    if (!area) return undefined

    try {
      const key = storageKey(tabId)
      const stored = await area.get(key)
      const value = stored[key] as TabDismissal | undefined
      if (value) dismissalByTab.set(tabId, value)
      return value
    } catch {
      return undefined
    }
  }

  function save(tabId: number, state: TabDismissal) {
    dismissalByTab.set(tabId, state)

    const area = getSessionArea()
    if (!area) return

    area.set({[storageKey(tabId)]: state}).catch(() => {})
  }

  function clear(tabId: number) {
    dismissalByTab.delete(tabId)

    const area = getSessionArea()
    if (!area) return

    area.remove(storageKey(tabId)).catch(() => {})
  }

  /**
   * Answers "is this dismissed for this tab on this hostname", and keeps
   * dismissalByTab in sync with whatever hostname the content script
   * reports: a hostname that doesn't match what's on file means the tab has
   * navigated to a different domain since the last dismissal (or query), so
   * this starts a fresh, un-dismissed record for it -- the actual mechanism
   * that re-arms the UI once the user leaves a domain.
   */
  async function resolveDismissed(tabId: number, hostname: string): Promise<boolean> {
    const current = await load(tabId)

    if (current && current.hostname === hostname) return current.dismissed

    save(tabId, {hostname, dismissed: false})
    return false
  }

  return {save, clear, resolveDismissed}
}

const redirectOverlayDismissal = createTabDismissalTracker('greendirect.tabDismissal')
const suggestionBannerDismissal = createTabDismissalTracker('greendirect.suggestionDismissal')

// Safari has no side panel surface, so the sidebar page opens in a tab.
let sidebarTabId: number | undefined

function openSidebarTab() {
  const url = chrome.runtime.getURL('sidebar/index.html')

  const openNewTab = () => {
    chrome.tabs.create({url}, (tab) => {
      sidebarTabId = tab?.id
    })
  }

  // A repeat click focuses the tab already opened instead of a new copy.
  const knownTabId = sidebarTabId

  if (knownTabId === undefined) {
    openNewTab()

    return
  }

  chrome.tabs.update(knownTabId, {active: true}, () => {
    if (chrome.runtime.lastError) openNewTab()
  })
}

if (isFirefoxLike) {
  // Firefox refuses sidebarAction.open() outside a user input handler, and a
  // message listener is not one, so the toolbar click is the only route.
  browser.browserAction.onClicked.addListener(() => {
    browser.sidebarAction.open()
  })
}

if (isSafariLike) {
  // Safari never had setPanelBehavior, so the toolbar click needs a listener.
  chrome.action?.onClicked.addListener(() => {
    openSidebarTab()
  })

  chrome.runtime.onMessage.addListener((message) => {
    if (!message || message.type !== 'openSidebar') return

    openSidebarTab()
  })
}

if (!isFirefoxLike && !isSafariLike) {
  // setPanelBehavior only affects FUTURE action clicks, registering it
  // inside onClicked would swallow the first toolbar click.
  chrome.sidePanel?.setPanelBehavior({openPanelOnActionClick: true})

  // The side panel API only exists in Chromium. Firefox opens the sidebar in
  // the listener above, so this listener is compiled out of gecko builds.
  chrome.runtime.onMessage.addListener((message, sender) => {
    if (!message || message.type !== 'openSidebar') return

    // Every line here runs synchronously on purpose. sidePanel.open() is only
    // allowed inside the user gesture that the content-script click carries, and
    // a tabs.query callback outlives it: the panel then silently refuses to open.
    // sender.tab is the tab the click came from, so no lookup is needed at all.
    chrome.sidePanel?.setPanelBehavior({openPanelOnActionClick: true})

    const tabId = sender.tab?.id
    if (!chrome.sidePanel?.open || tabId === undefined) return

    try {
      chrome.sidePanel?.open({tabId})
    } catch (error) {
      console.error(error)
    }
  })
}

// Wired up for every build: unlike the sidebar quirks above, tracking the
// overlay's dismissal behaves the same way regardless of target browser.
if (isFirefoxLike) {
  if (typeof browser !== 'undefined') {
    browser.runtime.onMessage.addListener((rawMessage: unknown, sender: {tab?: {id?: number}}) => {
      const message = rawMessage as {type?: string; hostname?: string} | null | undefined
      if (!message) return undefined

      const tabId = sender.tab?.id
      if (tabId === undefined) return undefined

      if (message.type === REDIRECT_OVERLAY_DISMISSAL_QUERY_MESSAGE && message.hostname) {
        return redirectOverlayDismissal.resolveDismissed(tabId, message.hostname).then((dismissed) => ({dismissed}))
      }

      if (message.type === REDIRECT_OVERLAY_DISMISSAL_SET_MESSAGE && message.hostname) {
        redirectOverlayDismissal.save(tabId, {hostname: message.hostname, dismissed: true})
      }

      if (message.type === SUGGESTION_DISMISSAL_QUERY_MESSAGE && message.hostname) {
        return suggestionBannerDismissal.resolveDismissed(tabId, message.hostname).then((dismissed) => ({dismissed}))
      }

      if (message.type === SUGGESTION_DISMISSAL_SET_MESSAGE && message.hostname) {
        suggestionBannerDismissal.save(tabId, {hostname: message.hostname, dismissed: true})
      }

      return undefined
    })

    browser.tabs.onRemoved.addListener((tabId) => {
      redirectOverlayDismissal.clear(tabId)
      suggestionBannerDismissal.clear(tabId)
    })
  }
} else if (typeof chrome !== 'undefined') {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message) return

    const tabId = sender.tab?.id
    if (tabId === undefined) return

    if (message.type === REDIRECT_OVERLAY_DISMISSAL_QUERY_MESSAGE && message.hostname) {
      void redirectOverlayDismissal.resolveDismissed(tabId, message.hostname).then((dismissed) => sendResponse({dismissed}))
      return true // keep the message channel open for the async sendResponse above
    }

    if (message.type === REDIRECT_OVERLAY_DISMISSAL_SET_MESSAGE && message.hostname) {
      redirectOverlayDismissal.save(tabId, {hostname: message.hostname, dismissed: true})
    }

    if (message.type === SUGGESTION_DISMISSAL_QUERY_MESSAGE && message.hostname) {
      void suggestionBannerDismissal.resolveDismissed(tabId, message.hostname).then((dismissed) => sendResponse({dismissed}))
      return true // keep the message channel open for the async sendResponse above
    }

    if (message.type === SUGGESTION_DISMISSAL_SET_MESSAGE && message.hostname) {
      suggestionBannerDismissal.save(tabId, {hostname: message.hostname, dismissed: true})
    }
  })

  chrome.tabs.onRemoved.addListener((tabId) => {
    redirectOverlayDismissal.clear(tabId)
    suggestionBannerDismissal.clear(tabId)
  })
}
