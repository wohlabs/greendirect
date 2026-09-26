import React, {useEffect, useState} from 'react'
import './styles.css'
import reactLogo from '../images/icon.png'
import {
  defaultRedirects,
  displayHostname,
  EFFORT_LABELS,
  MODE_LABELS,
  REDIRECT_MODES,
  onStorageChanged,
  readStoredRedirects,
  saveRedirects,
  type Redirect,
  type RedirectMode,
} from '../redirects'

const SUGGEST_FORM_URL = 'https://forms.gle/qDM3g7GtnYnhVAit7'

export default function SidebarApp() {
  const [redirects, setRedirects] = useState<Redirect[]>(defaultRedirects)

  useEffect(() => {
    const syncRedirects = () => {
      readStoredRedirects().then(setRedirects).catch(() => setRedirects(defaultRedirects))
    }

    syncRedirects()

    return onStorageChanged(syncRedirects)
  }, [])

  async function persist(nextRedirects: Redirect[]) {
    setRedirects(nextRedirects)
    await saveRedirects(nextRedirects)
  }

  // Any choice made here (one flower, or a "Set all" button) marks the pair
  // `userConfigured` -- see the field's doc comment on Redirect in
  // ../redirects.
  function setMode(id: number, mode: RedirectMode) {
    const nextRedirects = redirects.map(item => item.id === id ? {...item, mode, userConfigured: true} : item)
    void persist(nextRedirects)
  }

  function setAll(mode: RedirectMode) {
    const nextRedirects = redirects.map(item => ({...item, mode, userConfigured: true}))
    void persist(nextRedirects)
  }

  const allInMode = (mode: RedirectMode) => redirects.every(item => item.mode === mode)

  return (
    <div className="sidebar_app">
      <header className="sidebar_header">
        <img src={reactLogo} alt="logo" className="logo" />
        <div>
          <h1>GreenDirect</h1>
          <p className="subtitle">Redirect popular sites to greener alternatives</p>
        </div>
      </header>

      <section className="controls" aria-label="Set every pair at once">
        <span className="controls_label">Set all</span>
        <div className="segmented">
          {REDIRECT_MODES.map(mode => (
            <button
              key={mode}
              type="button"
              className="segmented_btn"
              aria-pressed={allInMode(mode)}
              onClick={() => setAll(mode)}
            >
              {MODE_LABELS[mode]}
            </button>
          ))}
        </div>
      </section>

      <p className="mode_legend">
        <strong>Suggest</strong> shows a small banner on the site. <strong>Redirect</strong> takes you to the
        alternative after a 5-second countdown.
      </p>

      <ul className="redirect_list">
        {redirects.map(r => (
          <li key={r.id} className={`redirect_card mode_${r.mode}`}>
            <div className="site">
              <div className="site_header">
                <div>
                  <span className="site_from">{displayHostname(r.from)}</span>
                  <span className="site_to"> → {r.to}</span>
                </div>
                <span className={`effort_badge effort_${r.effort}`}>{EFFORT_LABELS[r.effort]}</span>
              </div>
              <div className="site_desc">{r.description}</div>
            </div>

            <div className="mode_control">
              {/* Three radios laid over the track as invisible thirds: clicking
                  a spot on the track picks that stage, and arrow keys move
                  between stages like any radio group. */}
              <div className="flower3" role="radiogroup" aria-label={`What to do on ${displayHostname(r.from)}`}>
                {REDIRECT_MODES.map(mode => (
                  <input
                    key={mode}
                    type="radio"
                    name={`mode-${r.id}`}
                    value={mode}
                    checked={r.mode === mode}
                    onChange={() => setMode(r.id, mode)}
                    aria-label={MODE_LABELS[mode]}
                    title={MODE_LABELS[mode]}
                  />
                ))}
                <span className="slider" aria-hidden="true" />
              </div>
              <span className="mode_label">{MODE_LABELS[r.mode]}</span>
            </div>
          </li>
        ))}
      </ul>

      <footer className="sidebar_footer">Made with care for a greener web 🌿</footer>

      <a
        className="suggest_fab"
        href={SUGGEST_FORM_URL}
        target="_blank"
        rel="noopener noreferrer"
        title="Suggest a pair"
        aria-label="Suggest a redirect pair"
      >
        <span aria-hidden="true">🌱</span> Suggest a pair
      </a>
    </div>
  )
}
