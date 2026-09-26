import {displayHostname, type Redirect} from '../redirects'

type SuggestionBannerProps = {
  redirect: Redirect
  onGo: () => void
  onAlwaysRedirect: () => void
  onStopSuggesting: () => void
  onDismiss: () => void
}

/**
 * The small, non-blocking bottom-right banner shown on every visit to a site
 * whose pair is in 'suggest' mode (see resolveSuggestion in ../redirects).
 * Unlike RedirectOverlay it never navigates on its own. Its buttons:
 *
 * - "Go to <alternative>": goes there once, carrying the search term over
 *   exactly like a redirect would. Changes no setting.
 * - "Always redirect": switches the pair to 'redirect'. The storage change
 *   is picked up by scripts.tsx, which hands off to the normal
 *   RedirectOverlay countdown -- no separate redirect logic lives here.
 * - "Stop suggesting": switches the pair to 'off'.
 * - "Not now" and ×: both hide the banner for the rest of this tab's visit
 *   to this domain, the same way the overlay's "Stay on this site" works;
 *   see querySuggestionDismissed/notifySuggestionDismissed in scripts.tsx.
 *   They share one handler (onDismiss); "Not now" is just the labelled,
 *   easier-to-find version of ×.
 *
 * Moving the pair up to 'redirect' and down to 'off' are deliberately given
 * the same visual weight, so saying no is exactly as easy as saying yes.
 */
export default function SuggestionBanner({
  redirect,
  onGo,
  onAlwaysRedirect,
  onStopSuggesting,
  onDismiss,
}: SuggestionBannerProps) {
  const fromHostname = displayHostname(redirect.from)

  return (
    <div
      className="suggestion_banner"
      role="dialog"
      aria-live="polite"
      aria-label="Greener alternative available"
    >
      <span className="suggestion_banner_icon" aria-hidden="true">
        🌱
      </span>
      <div className="suggestion_banner_body">
        <p className="suggestion_banner_text">
          Greener alternative to <strong>{fromHostname}</strong>: <strong>{redirect.to}</strong>
        </p>
        {redirect.description && <p className="suggestion_banner_desc">{redirect.description}</p>}
        <div className="suggestion_banner_primary_row">
          <button
            type="button"
            className="suggestion_banner_btn suggestion_banner_btn_primary suggestion_banner_go"
            onClick={onGo}
          >
            Go to {redirect.to}
          </button>
          <button type="button" className="suggestion_banner_btn suggestion_banner_btn_ghost" onClick={onDismiss}>
            Not now
          </button>
        </div>
        <div className="suggestion_banner_actions">
          <button type="button" className="suggestion_banner_btn suggestion_banner_btn_ghost" onClick={onAlwaysRedirect}>
            Always redirect
          </button>
          <button type="button" className="suggestion_banner_btn suggestion_banner_btn_ghost" onClick={onStopSuggesting}>
            Stop suggesting
          </button>
        </div>
      </div>
      <button
        type="button"
        className="suggestion_banner_close"
        onClick={onDismiss}
        aria-label="Hide for now"
        title="Hide for now"
      >
        ×
      </button>
    </div>
  )
}
