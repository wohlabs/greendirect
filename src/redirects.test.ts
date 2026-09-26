import test from 'node:test'
import assert from 'node:assert/strict'

import {
  defaultRedirects,
  displayHostname,
  mergeRedirects,
  normalizeMode,
  resolveRedirectTarget,
  resolveSuggestion,
  type Redirect,
  type StoredRedirect,
} from './redirects.ts'

// The shipped list, with every pair switched to 'redirect' -- for the tests
// below that exercise where a redirect lands rather than the defaults.
const allRedirecting: Redirect[] = defaultRedirects.map((redirect) => ({ ...redirect, mode: 'redirect' }))

test('display hostname strips a leading www. so the list reads consistently', () => {
  assert.equal(displayHostname('www.google.com'), 'google.com')
  assert.equal(displayHostname('zara.com'), 'zara.com')
  assert.equal(displayHostname('mail.google.com'), 'mail.google.com')
})

test('redirects prefer the most specific redirecting host match', () => {
  const redirects: Redirect[] = [
    ...defaultRedirects,
    { id: 99, from: 'google.com', to: 'ecosia.org', description: 'Search', mode: 'redirect', effort: 'easy' },
    { id: 100, from: 'maps.google.com', to: 'openstreetmap.org', description: 'Maps', mode: 'redirect', effort: 'easy' },
  ]

  // Neither fixture entry has a searchMapping, so the path/query aren't
  // carried over (see the homepage-fallback fix above) -- what this test
  // is actually checking is that the longer 'maps.google.com' host wins
  // over the shorter 'google.com' one, i.e. we land on openstreetmap.org
  // rather than ecosia.org.
  assert.equal(
    resolveRedirectTarget('https://maps.google.com/maps?q=green', redirects),
    'https://openstreetmap.org/'
  )
})

test('pairs that are off or only suggesting never trigger a redirect', () => {
  const redirects: Redirect[] = [
    { id: 1, from: 'google.com', to: 'ecosia.org', description: 'Search', mode: 'off', effort: 'easy' },
    { id: 2, from: 'zara.com', to: 'vinted.com', description: 'Clothes', mode: 'suggest', effort: 'easy' },
  ]

  assert.equal(resolveRedirectTarget('https://google.com/search?q=green', redirects), null)
  assert.equal(resolveRedirectTarget('https://zara.com/', redirects), null)
})

test('every pair ships on suggest, so nothing redirects until the user picks Redirect', () => {
  assert.ok(defaultRedirects.length > 0)
  assert.ok(defaultRedirects.every((redirect) => redirect.mode === 'suggest'))
  assert.equal(resolveRedirectTarget('https://www.google.com/search?q=clothes', defaultRedirects), null)
})

test('master effort data syncs to saved user settings without overriding user toggles', () => {
  const currentDefaults: Redirect[] = [
    { id: 1, from: 'google.com', to: 'ecosia.org', description: 'Search', mode: 'redirect', effort: 'hard' },
  ]
  const storedRedirects: Redirect[] = [
    { id: 1, from: 'google.com', to: 'ecosia.org', description: 'Search', mode: 'off', effort: 'easy' },
  ]

  const merged = mergeRedirects(currentDefaults, storedRedirects)

  assert.equal(merged[0].effort, 'hard')
  assert.equal(merged[0].mode, 'off')
})

test('updated default descriptions sync over stale saved descriptions', () => {
  const currentDefaults: Redirect[] = [
    { id: 1, from: 'google.com', to: 'ecosia.org', description: 'Updated description', mode: 'redirect', effort: 'easy' },
  ]
  const storedRedirects: Redirect[] = [
    { id: 1, from: 'google.com', to: 'ecosia.org', description: 'Stale description', mode: 'off', effort: 'easy' },
  ]

  const merged = mergeRedirects(currentDefaults, storedRedirects)

  assert.equal(merged[0].description, 'Updated description')
  assert.equal(merged[0].mode, 'off')
})

test('removed default hosts are pruned from persisted data', () => {
  const currentDefaults = defaultRedirects.filter((redirect) => redirect.from !== 'www.amazon.com')
  const storedRedirects: Redirect[] = [
    ...defaultRedirects,
    { id: 99, from: 'www.amazon.com', to: 'etsy.com', description: 'Shop small', mode: 'off', effort: 'medium' },
  ]

  const merged = mergeRedirects(currentDefaults, storedRedirects)

  assert.ok(!merged.some((redirect) => redirect.from === 'www.amazon.com'))
  assert.ok(merged.some((redirect) => redirect.from === 'www.google.com'))
})

test('searching a term on google redirects to the same term on ecosia', () => {
  assert.equal(
    resolveRedirectTarget('https://www.google.com/search?q=clothes', allRedirecting),
    'https://ecosia.org/search?q=clothes'
  )
})

test('a non-search google page (no searchMapping match) lands on ecosia\'s homepage, not a copied path', () => {
  assert.equal(
    resolveRedirectTarget('https://www.google.com/maps/place/somewhere', allRedirecting),
    'https://ecosia.org/'
  )
})

test('zara search term maps to the equivalent vinted search', () => {
  assert.equal(
    resolveRedirectTarget('https://zara.com/us/en/search?searchTerm=denim+jacket', allRedirecting),
    'https://vinted.com/catalog?search_text=denim+jacket'
  )
})

test('shein path-encoded search term maps to a thredup query-param search', () => {
  assert.equal(
    resolveRedirectTarget('https://us.shein.com/pdsearch/jeans/?ici=s1', allRedirecting),
    'https://thredup.com/search?q=jeans'
  )
})

test('a bestbuy product page (not a search page) lands on backmarket\'s homepage', () => {
  assert.equal(
    resolveRedirectTarget('https://www.bestbuy.com/site/some-laptop/6000000.p', allRedirecting),
    'https://backmarket.com/'
  )
})

test('bestbuy search term maps to the equivalent backmarket search', () => {
  assert.equal(
    resolveRedirectTarget('https://www.bestbuy.com/site/searchpage.jsp?st=refurbished+iphone', allRedirecting),
    'https://backmarket.com/en-us/search?q=refurbished+iphone'
  )
})

test('amazon product search maps to the equivalent earthhero search term', () => {
  assert.equal(
    resolveRedirectTarget('https://www.amazon.com/s?k=water+bottle', allRedirecting),
    'https://earthhero.com/search?q=water+bottle'
  )
})

test('a pair with no searchMapping lands on the target homepage, not a copied path (regression: this used to 404)', () => {
  const redirects: Redirect[] = [
    { id: 1, from: 'mailchimp.com', to: 'ecosend.io', description: '', mode: 'redirect', effort: 'hard' },
    { id: 2, from: 'workspace.google.com', to: 'infomaniak.com', description: '', mode: 'redirect', effort: 'hard' },
  ]

  assert.equal(
    resolveRedirectTarget('https://mailchimp.com/some/path?utm_source=x', redirects),
    'https://ecosend.io/'
  )
  assert.equal(
    resolveRedirectTarget('https://workspace.google.com/intl/en_us/gmail/', redirects),
    'https://infomaniak.com/'
  )
})

test('mergeRedirects preserves a stored userConfigured flag, and defaults it to false otherwise', () => {
  const currentDefaults: Redirect[] = [
    { id: 1, from: 'airbnb.com', to: 'ecobnb.com', description: '', mode: 'suggest', effort: 'medium' },
  ]

  const untouched = mergeRedirects(currentDefaults, [])
  assert.equal(untouched[0].userConfigured, false)

  const storedRedirects: Redirect[] = [
    { id: 1, from: 'airbnb.com', to: 'ecobnb.com', description: '', mode: 'off', effort: 'medium', userConfigured: true },
  ]
  const touched = mergeRedirects(currentDefaults, storedRedirects)
  assert.equal(touched[0].userConfigured, true)
  assert.equal(touched[0].mode, 'off', "the user's chosen mode wins over the shipped default")
})

// Versions before modes existed saved an `enabled` boolean. The conversion
// must not change what anyone currently sees on a site.
test('settings saved before modes existed convert without changing what the user sees', () => {
  assert.equal(normalizeMode({ enabled: true }), 'redirect', 'on keeps redirecting')
  assert.equal(normalizeMode({ enabled: true, userConfigured: true }), 'redirect')
  assert.equal(normalizeMode({ enabled: false, userConfigured: true }), 'off', 'turned off by the user stays off')
  assert.equal(
    normalizeMode({ enabled: false }),
    'suggest',
    'off and never touched was already showing the old banner on every visit'
  )
  assert.equal(normalizeMode({ mode: 'suggest', enabled: true }), 'suggest', 'a real mode always wins')
  assert.equal(normalizeMode({ mode: 'nonsense' }), 'suggest')
})

test('mergeRedirects drops the old enabled field once it has been converted', () => {
  const stored: StoredRedirect[] = [
    { id: 1, from: 'www.google.com', to: 'ecosia.org', description: '', enabled: true, effort: 'easy' },
  ]

  const [google] = mergeRedirects(defaultRedirects, stored).filter((redirect) => redirect.from === 'www.google.com')
  assert.equal(google.mode, 'redirect')
  assert.ok(!('enabled' in google))
})

test('resolveSuggestion offers a pair in suggest mode, with the same landing URL a redirect would use', () => {
  const suggestion = resolveSuggestion('https://www.google.com/search?q=clothes', defaultRedirects)

  assert.equal(suggestion?.redirect.from, 'www.google.com')
  assert.equal(suggestion?.targetUrl, 'https://ecosia.org/search?q=clothes')
  assert.equal(
    suggestion?.targetUrl,
    resolveRedirectTarget('https://www.google.com/search?q=clothes', allRedirecting),
    '"Go to ..." and the redirect land in the same place'
  )
})

test('resolveSuggestion stays quiet for pairs that are off or already redirecting', () => {
  const off: Redirect[] = [
    { id: 1, from: 'airbnb.com', to: 'ecobnb.com', description: '', mode: 'off', effort: 'medium' },
  ]
  const redirecting: Redirect[] = [
    { id: 1, from: 'airbnb.com', to: 'ecobnb.com', description: '', mode: 'redirect', effort: 'medium' },
  ]

  assert.equal(resolveSuggestion('https://airbnb.com/rooms/123', off), null)
  assert.equal(resolveSuggestion('https://airbnb.com/rooms/123', redirecting), null)
})

test('resolveSuggestion stays quiet when nothing matches the hostname, or the URL is unparseable', () => {
  assert.equal(resolveSuggestion('https://example.com/', defaultRedirects), null)
  assert.equal(resolveSuggestion('not a url', defaultRedirects), null)
})

test('resolveSuggestion prefers the most specific host match', () => {
  const redirects: Redirect[] = [
    { id: 1, from: 'google.com', to: 'ecosia.org', description: '', mode: 'suggest', effort: 'medium' },
    { id: 2, from: 'maps.google.com', to: 'openstreetmap.org', description: '', mode: 'suggest', effort: 'medium' },
  ]

  assert.equal(resolveSuggestion('https://maps.google.com/maps?q=green', redirects)?.redirect.id, 2)
})

test('a more specific pair the user turned off is not shadowed by a broader one that is suggesting', () => {
  const redirects: Redirect[] = [
    { id: 1, from: 'google.com', to: 'ecosia.org', description: '', mode: 'suggest', effort: 'medium' },
    { id: 2, from: 'maps.google.com', to: 'openstreetmap.org', description: '', mode: 'off', effort: 'medium' },
  ]

  assert.equal(resolveSuggestion('https://maps.google.com/maps?q=green', redirects), null)
})
