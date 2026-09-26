import {useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react'
import type {CSSProperties} from 'react'

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

// The browser's own page zoom (cmd/ctrl +/-) scales everything on the page
// uniformly, the overlay included, so at 150% zoom the card would render
// 1.5x bigger even though nothing about it changed. window.devicePixelRatio
// moves in lockstep with that zoom level, so comparing it against whatever
// it was when the overlay first appeared gives the zoom change since then,
// and scaling the card by the inverse cancels it back out to its original
// on-screen size. The one case that should win over that: the card doesn't
// grow past whatever actually fits the current window, measured against the
// card's own natural (untransformed) size so a real window resize -- which
// doesn't touch devicePixelRatio at all -- still shrinks it the normal way.
const MIN_ZOOM_STABLE_SCALE = 0.5
const VIEWPORT_MARGIN_PX = 40

function useZoomStableScale(elementRef: React.RefObject<HTMLElement | null>) {
  const [scale, setScale] = useState(1)

  useLayoutEffect(() => {
    const baselineDpr = window.devicePixelRatio || 1

    const recompute = () => {
      const element = elementRef.current
      if (!element) return

      const dpr = window.devicePixelRatio || baselineDpr
      const zoomCompensation = baselineDpr / dpr

      const naturalWidth = element.offsetWidth
      const naturalHeight = element.offsetHeight
      const maxScaleForWidth =
        naturalWidth > 0 ? (window.innerWidth - VIEWPORT_MARGIN_PX) / naturalWidth : zoomCompensation
      const maxScaleForHeight =
        naturalHeight > 0 ? (window.innerHeight - VIEWPORT_MARGIN_PX) / naturalHeight : zoomCompensation

      setScale(
        Math.max(MIN_ZOOM_STABLE_SCALE, Math.min(zoomCompensation, maxScaleForWidth, maxScaleForHeight))
      )
    }

    recompute()

    // Zooming fires a `resize` event in every major browser (the effective
    // CSS viewport shrinks/grows along with it), which conveniently also
    // covers an actual window resize -- the "shrink to fit" half above.
    window.addEventListener('resize', recompute)

    // Belt-and-suspenders for the rare case a zoom change doesn't trigger
    // `resize`: watch devicePixelRatio itself. A `resolution` media query
    // only ever fires once, at the ratio it was created with, so each
    // firing re-subscribes itself at the new ratio.
    let dprQuery: MediaQueryList | undefined

    const watchDpr = () => {
      try {
        dprQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`)
        dprQuery.addEventListener('change', onDprChange)
      } catch {
        // matchMedia or this query form isn't available -- the resize
        // listener above still covers most real-world zoom changes.
      }
    }

    function onDprChange() {
      dprQuery?.removeEventListener('change', onDprChange)
      recompute()
      watchDpr()
    }

    watchDpr()

    return () => {
      window.removeEventListener('resize', recompute)
      dprQuery?.removeEventListener('change', onDprChange)
    }
  }, [elementRef])

  return scale
}

/**
 * Shown in place of an instant navigation whenever the matching pair is in
 * 'redirect' mode: gives the page 5 seconds on screen (with a countdown the user can
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
  const cardRef = useRef<HTMLDivElement | null>(null)
  const zoomStableScale = useZoomStableScale(cardRef)

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
      <div
        className="redirect_overlay_card_scale"
        style={{'--redirect-overlay-zoom-scale': zoomStableScale} as CSSProperties}
      >
        <div className="redirect_overlay_card" ref={cardRef}>
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
    </div>
  )
}
