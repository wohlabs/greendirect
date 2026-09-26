import {useCallback, useEffect, useRef, useState} from 'react'
import ReactDOM from 'react-dom/client'
import RedirectOverlay from './RedirectOverlay'
import SuggestionBanner from './SuggestionBanner'
import './styles.css'
import {
  readStoredRedirects,
  saveRedirects,
  onStorageChanged,
  sendExtensionMessage,
  resolveRedirectTarget,
  resolveSuggestion,
  resolveTargetUrl,
  REDIRECT_OVERLAY_DISMISSAL_QUERY_MESSAGE,
  REDIRECT_OVERLAY_DISMISSAL_SET_MESSAGE,
  SUGGESTION_DISMISSAL_QUERY_MESSAGE,
  SUGGESTION_DISMISSAL_SET_MESSAGE,
  type RedirectMode,
  type Suggestion,
} from '../redirects'

console.log('[From the page context] Hello from content_scripts!')

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

// Same "dismissed for the rest of this tab's visit to this domain" tracking
// as queryOverlayDismissed/notifyOverlayDismissed above, but for the
// suggestion banner's × button -- kept as a separate message pair (and a
// separate per-tab record in background.ts) so answering one doesn't affect
// the other.
function querySuggestionDismissed(hostname: string): Promise<boolean> {
  return sendExtensionMessage({type: SUGGESTION_DISMISSAL_QUERY_MESSAGE, hostname})
    .then((response) => Boolean((response as {dismissed?: boolean} | undefined)?.dismissed))
    .catch(() => false)
}

function notifySuggestionDismissed(hostname: string) {
  sendExtensionMessage({type: SUGGESTION_DISMISSAL_SET_MESSAGE, hostname}).catch(() => {})
}

/**
 * Root of the content script's React tree. Renders, depending on the mode of
 * the pair matching the current page:
 * - 'redirect': the redirect overlay. The overlay -- not an instant
 *   `window.location.assign` -- is what performs the redirect, giving the
 *   user a 5 second window to cancel ("Stay on this site") or jump ahead
 *   ("Redirect now").
 * - 'suggest': the suggestion banner, which never navigates on its own.
 * - 'off', or no matching pair: nothing, so the page behaves exactly as if
 *   the extension weren't there.
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
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null)
  const dismissedRef = useRef(false)
  const suggestionDismissedRef = useRef(false)

  const checkRedirect = useCallback(async () => {
    if (!dismissedRef.current) {
      dismissedRef.current = await queryOverlayDismissed(window.location.hostname)
    }

    if (!suggestionDismissedRef.current) {
      suggestionDismissedRef.current = await querySuggestionDismissed(window.location.hostname)
    }

    const redirects = await readStoredRedirects()

    const target = dismissedRef.current ? null : resolveRedirectTarget(window.location.href, redirects)
    setPendingTarget(target)

    // The banner only ever shows when the redirect overlay above isn't
    // already handling this page. resolveSuggestion only returns a pair in
    // 'suggest' mode, so the two shouldn't overlap anyway; checking `target`
    // here too keeps that explicit rather than relying on the two resolvers
    // never disagreeing.
    const next =
      target || suggestionDismissedRef.current ? null : resolveSuggestion(window.location.href, redirects)
    setSuggestion(next)
  }, [])

  useEffect(() => {
    void checkRedirect()

    return onStorageChanged(() => {
      void checkRedirect()
    })
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

  // Saves a mode chosen on the suggestion banner (it counts as an explicit
  // choice -- see the userConfigured doc comment on Redirect in
  // ../redirects) and clears the banner immediately rather than waiting on
  // the storage round-trip. Re-reads storage right before writing so this
  // can't clobber a change made elsewhere (the sidebar, or another tab) in
  // between.
  const chooseMode = useCallback((id: number, mode: RedirectMode) => {
    setSuggestion(null)
    void readStoredRedirects()
      .then((redirects) => {
        const next = redirects.map((redirect) =>
          redirect.id === id ? {...redirect, mode, userConfigured: true} : redirect
        )
        return saveRedirects(next)
      })
      .catch(() => {})
  }, [])

  // One-off trip to the alternative; no setting changes. Re-resolved from
  // the live URL at click time in case the page changed it since the banner
  // appeared (e.g. a new search on a single-page app).
  const handleSuggestionGo = useCallback(() => {
    if (!suggestion) return
    const target = resolveTargetUrl(window.location.href, suggestion.redirect) ?? suggestion.targetUrl
    window.location.assign(target)
  }, [suggestion])

  const handleAlwaysRedirect = useCallback(() => {
    if (!suggestion) return
    // Switching to 'redirect' doesn't navigate by itself -- the storage
    // write triggers this same component's onStorageChanged listener, which
    // re-resolves the page and hands off to the normal RedirectOverlay
    // countdown, same as picking Redirect in the sidebar.
    chooseMode(suggestion.redirect.id, 'redirect')
  }, [suggestion, chooseMode])

  const handleStopSuggesting = useCallback(() => {
    if (!suggestion) return
    chooseMode(suggestion.redirect.id, 'off')
  }, [suggestion, chooseMode])

  const handleSuggestionDismiss = useCallback(() => {
    suggestionDismissedRef.current = true
    notifySuggestionDismissed(window.location.hostname)
    setSuggestion(null)
  }, [])

  return (
    <>
      {pendingTarget && (
        <RedirectOverlay
          targetUrl={pendingTarget}
          onStay={handleStay}
          onRedirect={handleRedirectNow}
        />
      )}
      {!pendingTarget && suggestion && (
        <SuggestionBanner
          redirect={suggestion.redirect}
          onGo={handleSuggestionGo}
          onAlwaysRedirect={handleAlwaysRedirect}
          onStopSuggesting={handleStopSuggesting}
          onDismiss={handleSuggestionDismiss}
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
