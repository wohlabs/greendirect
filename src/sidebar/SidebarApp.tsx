import React, {useEffect, useState} from 'react'
import './styles.css'
import reactLogo from '../images/icon.png'
import { defaultRedirects, displayHostname, EFFORT_LABELS, onStorageChanged, readStoredRedirects, saveRedirects, type Redirect } from '../redirects'

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

  // Flipping a switch here (individually, or via Enable All/Disable All)
  // is what marks a pair `userConfigured`, so it also doubles as the "the
  // user answered" signal the content script's nudge banner checks (see
  // resolveNudgeCandidate in ../redirects and content/scripts.tsx) -- a
  // pair touched here should never get nudged on some other site later.
  function toggle(id: number) {
    const nextRedirects = redirects.map(item => item.id === id ? {...item, enabled: !item.enabled, userConfigured: true} : item)
    void persist(nextRedirects)
  }

  function enableAll() {
    const nextRedirects = redirects.map(item => ({...item, enabled: true, userConfigured: true}))
    void persist(nextRedirects)
  }

  function disableAll() {
    const nextRedirects = redirects.map(item => ({...item, enabled: false, userConfigured: true}))
    void persist(nextRedirects)
  }

  return (
    <div className="sidebar_app">
      <header className="sidebar_header">
        <img src={reactLogo} alt="logo" className="logo" />
        <div>
          <h1>GreenDirect</h1>
          <p className="subtitle">Redirect popular sites to greener alternatives</p>
        </div>
      </header>

      <section className="controls">
        <button className="btn" onClick={enableAll}>Enable All</button>
        <button className="btn btn--ghost" onClick={disableAll}>Disable All</button>
      </section>

      <ul className="redirect_list">
        {redirects.map(r => (
          <li key={r.id} className={`redirect_card ${r.enabled ? 'enabled' : 'disabled'}`}>
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

            <label className="switch flower">
              <input type="checkbox" checked={r.enabled} onChange={() => toggle(r.id)} />
              <span className="slider" />
            </label>
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