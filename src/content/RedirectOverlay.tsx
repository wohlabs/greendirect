import {useEffect, useMemo} from 'react'

const OVERLAY_DURATION_MS = 5000

type RedirectOverlayProps = {
  targetUrl: string
  onStay: () => void
  onRedirect: () => void
}

function getFriendlyHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/**
 * Shown in place of an instant navigation whenever a matching redirect is
 * enabled: gives the page 5 seconds on screen (with a countdown the user can
 * watch tick down) before sending them to the greener alternative, and lets
 * them cancel ("Stay on this site") or skip ahead ("Redirect now") at any
 * point during the countdown.
 */
export default function RedirectOverlay({
  targetUrl,
  onStay,
  onRedirect,
}: RedirectOverlayProps) {
  const targetHostname = useMemo(() => getFriendlyHostname(targetUrl), [targetUrl])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      onRedirect()
    }, OVERLAY_DURATION_MS)

    return () => window.clearTimeout(timer)
  }, [onRedirect])

  return (
    <div
      className="redirect_overlay"
      role="alertdialog"
      aria-live="assertive"
      aria-label="Redirecting to a greener alternative"
    >
      <div className="redirect_overlay_backdrop" />
      <div className="redirect_overlay_card">
        <div className="redirect_overlay_sprout" aria-hidden="true">
          <span className="redirect_overlay_leaf redirect_overlay_leaf_left">
            🌿
          </span>
          <span className="redirect_overlay_leaf redirect_overlay_leaf_main">
            🌱
          </span>
          <span className="redirect_overlay_leaf redirect_overlay_leaf_right">
            🍃
          </span>
        </div>
        <p className="redirect_overlay_text">
          Redirecting to <strong>{targetHostname}</strong>.
          <br />
          The earth loves you. 💚
        </p>
        <div className="redirect_overlay_progress_track" aria-hidden="true">
          <div className="redirect_overlay_progress_fill" />
        </div>
        <div className="redirect_overlay_actions">
          <button
            type="button"
            className="redirect_overlay_btn redirect_overlay_btn_ghost"
            onClick={onStay}
          >
            Stay on this site
          </button>
          <button
            type="button"
            className="redirect_overlay_btn redirect_overlay_btn_primary"
            onClick={onRedirect}
          >
            Redirect now
          </button>
        </div>
      </div>
    </div>
  )
}
