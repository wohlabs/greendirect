import {displayHostname, type Redirect} from '../redirects'

type NudgeBannerProps = {
  redirect: Redirect
  onYes: () => void
  onNo: () => void
  onRemindLater: () => void
}

/**
 * A small, non-blocking banner shown bottom-right when the current site has
 * a greener alternative whose redirect is off by default and the user has
 * never explicitly decided on it -- see resolveNudgeCandidate and the
 * `userConfigured` field on Redirect in ../redirects. Unlike RedirectOverlay
 * this never navigates anywhere on its own; it only offers to turn the
 * redirect on.
 *
 * "Yes" enables the redirect (which, on the very next storage-change check
 * in scripts.tsx, hands off to the normal RedirectOverlay countdown -- no
 * separate redirect logic lives here). "No" leaves it off. Both permanently
 * record the user's choice (`userConfigured: true`) so this pair is never
 * nudged again. "Remind me later" (including the × close button) doesn't
 * record anything -- it just hides the banner for the rest of this tab's
 * visit to this domain, the same way the redirect overlay's "Stay on this
 * site" does; see queryNudgeDismissed/notifyNudgeDismissed in scripts.tsx.
 */
export default function NudgeBanner({redirect, onYes, onNo, onRemindLater}: NudgeBannerProps) {
  const fromHostname = displayHostname(redirect.from)

  return (
    <div
      className="nudge_banner"
      role="dialog"
      aria-live="polite"
      aria-label="Greener alternative available"
    >
      <span className="nudge_banner_icon" aria-hidden="true">
        🌱
      </span>
      <div className="nudge_banner_body">
        <p className="nudge_banner_text">
          There&rsquo;s a greener alternative to <strong>{fromHostname}</strong>: <strong>{redirect.to}</strong>.
        </p>
        {redirect.description && <p className="nudge_banner_desc">{redirect.description}</p>}
        <p className="nudge_banner_text">Want to turn it on?</p>
        <div className="nudge_banner_actions">
          <button type="button" className="nudge_banner_btn nudge_banner_btn_primary" onClick={onYes}>
            Yes
          </button>
          <button type="button" className="nudge_banner_btn nudge_banner_btn_ghost" onClick={onNo}>
            No
          </button>
          <button type="button" className="nudge_banner_btn nudge_banner_btn_text" onClick={onRemindLater}>
            Remind me later
          </button>
        </div>
      </div>
      <button
        type="button"
        className="nudge_banner_close"
        onClick={onRemindLater}
        aria-label="Dismiss, remind me later"
      >
        ×
      </button>
    </div>
  )
}
