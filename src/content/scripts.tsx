import {useCallback, useEffect, useRef, useState} from 'react'
import ReactDOM from 'react-dom/client'
import RedirectOverlay from './RedirectOverlay'
import './styles.css'
import {
  readStoredRedirects,
  resolveRedirectTarget,
  REDIRECT_OVERLAY_DISMISSAL_QUERY_MESSAGE,
  REDIRECT_OVERLAY_DISMISSAL_SET_MESSAGE,
} from '../redirects'

console.log('[From the page context] Hello from content_scripts!')

function addStorageChangeListener(listener: () => void) {
  if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
    chrome.storage.onChanged.addListener(listener)
  }

  if (typeof browser !== 'undefined' && browser.storage?.onChanged) {
    browser.storage.onChanged.addListener(listener)
  }
}

function removeStorageChangeListener(listener: () => void) {
  if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
    chrome.storage.onChanged.removeListener(listener)
  }

  if (typeof browser !== 'undefined' && browser.storage?.onChanged) {
    browser.storage.onChanged.removeListener(listener)
  }
}

// The overlay's "Stay on this site" choice needs to survive every ordinary
// navigation within the same domain in this tab (the content script
// re-injects fresh on each one) but reset the moment the tab leaves that
// domain -- even if the user comes back to it later in the same tab. A
// page's own storage can't tell those two cases apart (sessionStorage, for
// example, survives for as long as the tab does, regardless of what else it
// visited in between), so the background script tracks it instead, keyed by
// tab. These two calls are how the content script reads and updates that.
function queryOverlayDismissed(hostname: string): Promise<boolean> {
  return sendExtensionMessage({type: REDIRECT_OVERLAY_DISMISSAL_QUERY_MESSAGE, hostname})
    .then((response) => Boolean((response as {dismissed?: boolean} | undefined)?.dismissed))
    .catch(() => false)
}

function notifyOverlayDismissed(hostname: string) {
  sendExtensionMessage({type: REDIRECT_OVERLAY_DISMISSAL_SET_MESSAGE, hostname}).catch(() => {})
}

function sendExtensionMessage(message: unknown): Promise<unknown> {
  try {
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      return Promise.resolve(chrome.runtime.sendMessage(message))
    }

    if (typeof browser !== 'undefined' && browser.runtime?.sendMessage) {
      return Promise.resolve(browser.runtime.sendMessage(message))
    }
  } catch {
    // chrome.runtime.sendMessage throws synchronously (rather than
    // rejecting) when the extension context has been invalidated, e.g. the
    // extension was reloaded while this page was still open.
  }

  // No messaging channel to the background script -- fail open so the
  // overlay still shows rather than silently never showing again.
  return Promise.resolve(undefined)
}

/**
 * Root of the content script's React tree: renders the redirect overlay
 * whenever the current page matches an enabled redirect. When a redirect is
 * enabled the overlay -- not an instant `window.location.assign` -- is what
 * performs the redirect, giving the user a 5 second window to cancel ("Stay
 * on this site") or jump ahead ("Redirect now"). A page with no matching (or
 * no enabled) redirect never shows the overlay, so it behaves exactly as
 * before.
 *
 * "Stay on this site" is remembered for the rest of this tab's visit to this
 * domain: it survives further navigations within the domain (each of which
 * re-injects this content script fresh) and further storage changes (e.g.
 * toggling an unrelated redirect elsewhere), but resets -- so the overlay can
 * show again -- in a different tab or once the user leaves the domain, even
 * if they come back to it later in this same tab. See
 * queryOverlayDismissed/notifyOverlayDismissed above.
 */
function Root() {
  const [pendingTarget, setPendingTarget] = useState<string | null>(null)
  const dismissedRef = useRef(false)

  const checkRedirect = useCallback(async () => {
    if (!dismissedRef.current) {
      dismissedRef.current = await queryOverlayDismissed(window.location.hostname)
    }

    if (dismissedRef.current) return

    const redirects = await readStoredRedirects()
    const target = resolveRedirectTarget(window.location.href, redirects)

    setPendingTarget(target)
  }, [])

  useEffect(() => {
    void checkRedirect()

    const onStorageChange = () => {
      void checkRedirect()
    }

    addStorageChangeListener(onStorageChange)
    return () => removeStorageChangeListener(onStorageChange)
  }, [checkRedirect])

  const handleStay = useCallback(() => {
    dismissedRef.current = true
    notifyOverlayDismissed(window.location.hostname)
    setPendingTarget(null)
  }, [])

  const handleRedirectNow = useCallback(() => {
    if (!pendingTarget) return
    window.location.assign(pendingTarget)
  }, [pendingTarget])

  return (
    <>
      {pendingTarget && (
        <RedirectOverlay
          targetUrl={pendingTarget}
          onStay={handleStay}
          onRedirect={handleRedirectNow}
        />
      )}
    </>
  )
}

/**
 * Extension.js content_script entrypoint. The framework calls this on
 * injection and calls the returned function on HMR/teardown to clean up.
 * Do not invoke it yourself.
 */
export default function initial() {
  const mountWidget = () => {
    // Guard against a duplicate widget: a stale root can be left behind by
    // a previous injection that never got torn down (a dev-mode hot reload
    // racing with this one, or the extension having been reloaded without
    // the tab being refreshed, so the old content script is still alive).
    // Only one should ever be mounted on the page at a time.
    document.querySelectorAll('[data-extension-root]').forEach((el) => el.remove())

    const rootDiv = document.createElement('div')
    rootDiv.setAttribute('data-extension-root', 'true')
    // Isolate the host from page styles (e.g. example.com ships div{opacity:.8},
    // which would otherwise fade the whole widget): the shadow DOM only protects
    // descendants; the host element itself still takes page CSS.
    rootDiv.style.cssText = 'all: initial !important'
    document.body.appendChild(rootDiv)

    // Injecting content_scripts inside a shadow dom
    // prevents conflicts with the host page's styles.
    // This way, styles from the extension won't leak into the host page.
    const shadowRoot = rootDiv.attachShadow({mode: 'open'})

    const styleElement = document.createElement('style')
    shadowRoot.appendChild(styleElement)

    fetchCSS().then((response) => (styleElement.textContent = response))

    // Create a container for React to render into
    const mountingPoint = ReactDOM.createRoot(shadowRoot)
    mountingPoint.render(
      <div className="content_script">
        <Root />
      </div>
    )

    return () => {
      mountingPoint.unmount()
      rootDiv.remove()
    }
  }

  // At document_start (when this content script normally runs) most real
  // pages have not parsed <body> yet -- document.documentElement exists but
  // document.body is still null, and mountWidget() unconditionally does
  // document.body.appendChild(...). Falling back to documentElement here
  // used to mask that: it made this check pass even though body was still
  // missing, so mountWidget() ran anyway and threw. Wait for an actual body.
  if (!document.body) {
    document.addEventListener('DOMContentLoaded', mountWidget, {once: true})
    return () => {}
  }

  const cleanup = mountWidget()

  return () => {
    cleanup()
  }
}

async function fetchCSS() {
  const cssUrl = new URL('./styles.css', import.meta.url)
  const response = await fetch(cssUrl)
  const text = await response.text()

  return response.ok ? text : Promise.reject(text)
}
