import React, {useEffect, useState} from 'react'
import './styles.css'
import reactLogo from '../images/icon.png'
import { defaultRedirects, EFFORT_LABELS, readStoredRedirects, saveRedirects, type Redirect } from '../redirects'

export default function SidebarApp() {
  const [redirects, setRedirects] = useState<Redirect[]>(defaultRedirects)

  useEffect(() => {
    const syncRedirects = () => {
      readStoredRedirects().then(setRedirects).catch(() => setRedirects(defaultRedirects))
    }

    syncRedirects()

    const onStorageChange = () => {
      syncRedirects()
    }

    if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
      chrome.storage.onChanged.addListener(onStorageChange)
    }

    if (typeof browser !== 'undefined' && browser.storage?.onChanged) {
      browser.storage.onChanged.addListener(onStorageChange)
    }

    return () => {
      if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
        chrome.storage.onChanged.removeListener(onStorageChange)
      }

      if (typeof browser !== 'undefined' && browser.storage?.onChanged) {
        browser.storage.onChanged.removeListener(onStorageChange)
      }
    }
  }, [])

  async function persist(nextRedirects: Redirect[]) {
    setRedirects(nextRedirects)
    await saveRedirects(nextRedirects)
  }

  function toggle(id: number) {
    const nextRedirects = redirects.map(item => item.id === id ? {...item, enabled: !item.enabled} : item)
    void persist(nextRedirects)
  }

  function enableAll() {
    const nextRedirects = redirects.map(item => ({...item, enabled: true}))
    void persist(nextRedirects)
  }

  function disableAll() {
    const nextRedirects = redirects.map(item => ({...item, enabled: false}))
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
                  <span className="site_from">{r.from}</span>
                  <span className="site_to"> → {r.to}</span>
                </div>
                <span className={`effort_badge effort_${r.effort}`}>{EFFORT_LABELS[r.effort]}</span>
              </div>
              <div className="site_desc">{r.description}</div>
            </div>

            <label className="switch">
              <input type="checkbox" checked={r.enabled} onChange={() => toggle(r.id)} />
              <span className="slider" />
            </label>
          </li>
        ))}
      </ul>

      <footer className="sidebar_footer">Made with care for a greener web 🌿</footer>
    </div>
  )
}
