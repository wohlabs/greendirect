import {useCallback, useEffect, useRef, useState} from 'react'
import ReactDOM from 'react-dom/client'
import ContentApp from './ContentApp'
import RedirectOverlay from './RedirectOverlay'
import './styles.css'
import {readStoredRedirects, resolveRedirectTarget} from '../redirects'

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

/**
 * Root of the content script's React tree: renders the "Open sidebar" pill
 * and, when the current page matches an enabled redirect, the redirect
 * overlay on top of it. When a redirect is enabled the overlay -- not an
 * instant `window.location.assign` -- is what performs the redirect, giving
 * the user a 5 second window to cancel ("Stay on this site") or jump ahead
 * ("Redirect now"). A page with no matching (or no enabled) redirect never
 * shows the overlay, so it behaves exactly as before.
 */
function Root() {
  const [pendingTarget, setPendingTarget] = useState<string | null>(null)
  // Once the user dismisses the overlay for this page, further storage
  // changes (e.g. toggling an unrelated redirect elsewhere) must not bring
  // it back -- "stay as is" should stick until the next navigation, which
  // re-injects the content script and starts this state fresh.
  const dismissedRef = useRef(false)

  const checkRedirect = useCallback(async () => {
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
    setPendingTarget(null)
  }, [])

  const handleRedirectNow = useCallback(() => {
    if (!pendingTarget) return
    window.location.assign(pendingTarget)
  }, [pendingTarget])

  return (
    <>
      <ContentApp />
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
