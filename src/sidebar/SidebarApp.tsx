import React, {useState} from 'react'
import './styles.css'
import reactLogo from '../images/icon.png'

type Redirect = {
  id: number
  from: string
  to: string
  description?: string
  enabled: boolean
}

const defaultRedirects: Redirect[] = [
  { id: 1, from: 'google.com', to: 'ecosia.org', description: 'Search with a tree-planting search engine', enabled: true },
  { id: 2, from: 'youtube.com', to: 'peertube.social', description: 'Decentralised video hosting', enabled: true },
  { id: 3, from: 'facebook.com', to: 'mastodon.social', description: 'Community-first social networking', enabled: false },
  { id: 4, from: 'amazon.com', to: 'etsy.com', description: 'Support small makers and sustainable shops', enabled: false },
  { id: 5, from: 'twitter.com', to: 'micro.blog', description: 'Lightweight, independent microblogging', enabled: false },
  { id: 6, from: 'maps.google.com', to: 'openstreetmap.org', description: 'Open-source maps and community edits', enabled: true },
]

export default function SidebarApp() {
  const [redirects, setRedirects] = useState<Redirect[]>(defaultRedirects)

  function toggle(id: number) {
    setRedirects(r => r.map(item => item.id === id ? {...item, enabled: !item.enabled} : item))
  }

  function enableAll() {
    setRedirects(r => r.map(item => ({...item, enabled: true})))
  }

  function disableAll() {
    setRedirects(r => r.map(item => ({...item, enabled: false})))
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
              <div>
                <span className="site_from">{r.from}</span>
                <span className="site_to"> → {r.to}</span>
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
