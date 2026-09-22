import test from 'node:test'
import assert from 'node:assert/strict'

import { defaultRedirects, displayHostname, mergeRedirects, resolveNudgeCandidate, resolveRedirectTarget, type Redirect } from './redirects.ts'

test('display hostname strips a leading www. so the list reads consistently', () => {
  assert.equal(displayHostname('www.google.com'), 'google.com')
  assert.equal(displayHostname('zara.com'), 'zara.com')
  assert.equal(displayHostname('mail.google.com'), 'mail.google.com')
})

test('redirects prefer the most specific enabled host match', () => {
  const redirects: Redirect[] = [
    ...defaultRedirects,
    { id: 99, from: 'google.com', to: 'ecosia.org', description: 'Search', enabled: true, effort: 'easy' },
    { id: 100, from: 'maps.google.com', to: 'openstreetmap.org', description: 'Maps', enabled: true, effort: 'easy' },
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

test('disabled redirects do not trigger a redirect', () => {
  const redirects: Redirect[] = [
    { id: 1, from: 'google.com', to: 'ecosia.org', description: 'Search', enabled: false, effort: 'easy' },
  ]

  assert.equal(resolveRedirectTarget('https://google.com/search?q=green', redirects), null)
})

test('easy switches are enabled by default and higher effort swaps stay off', () => {
  const easy = defaultRedirects.filter((redirect) => redirect.effort === 'easy')
  const harder = defaultRedirects.filter((redirect) => redirect.effort !== 'easy')

  assert.ok(easy.length > 0)
  assert.ok(easy.every((redirect) => redirect.enabled))
  assert.ok(harder.every((redirect) => !redirect.enabled))
})

test('master effort data syncs to saved user settings without overriding user toggles', () => {
  const currentDefaults: Redirect[] = [
    { id: 1, from: 'google.com', to: 'ecosia.org', description: 'Search', enabled: true, effort: 'hard' },
  ]
  const storedRedirects: Redirect[] = [
    { id: 1, from: 'google.com', to: 'ecosia.org', description: 'Search', enabled: false, effort: 'easy' },
  ]

  const merged = mergeRedirects(currentDefaults, storedRedirects)

  assert.equal(merged[0].effort, 'hard')
  assert.equal(merged[0].enabled, false)
})

test('updated default descriptions sync over stale saved descriptions', () => {
  const currentDefaults: Redirect[] = [
    { id: 1, from: 'google.com', to: 'ecosia.org', description: 'Updated description', enabled: true, effort: 'easy' },
  ]
  const storedRedirects: Redirect[] = [
    { id: 1, from: 'google.com', to: 'ecosia.org', description: 'Stale description', enabled: false, effort: 'easy' },
  ]

  const merged = mergeRedirects(currentDefaults, storedRedirects)

  assert.equal(merged[0].description, 'Updated description')
  assert.equal(merged[0].enabled, false)
})

test('removed default hosts are pruned from persisted data', () => {
  const currentDefaults = defaultRedirects.filter((redirect) => redirect.from !== 'www.amazon.com')
  const storedRedirects: Redirect[] = [
    ...defaultRedirects,
    { id: 99, from: 'www.amazon.com', to: 'etsy.com', description: 'Shop small', enabled: false, effort: 'medium' },
  ]

  const merged = mergeRedirects(currentDefaults, storedRedirects)

  assert.ok(!merged.some((redirect) => redirect.from === 'www.amazon.com'))
  assert.ok(merged.some((redirect) => redirect.from === 'www.google.com'))
})

test('searching a term on google redirects to the same term on ecosia', () => {
  assert.equal(
    resolveRedirectTarget('https://www.google.com/search?q=clothes', defaultRedirects),
    'https://ecosia.org/search?q=clothes'
  )
})

test('a non-search google page (no searchMapping match) lands on ecosia\'s homepage, not a copied path', () => {
  assert.equal(
    resolveRedirectTarget('https://www.google.com/maps/place/somewhere', defaultRedirects),
    'https://ecosia.org/'
  )
})

test('zara search term maps to the equivalent vinted search', () => {
  assert.equal(
    resolveRedirectTarget('https://zara.com/us/en/search?searchTerm=denim+jacket', defaultRedirects),
    'https://vinted.com/catalog?search_text=denim+jacket'
  )
})

test('shein path-encoded search term maps to a thredup query-param search', () => {
  assert.equal(
    resolveRedirectTarget('https://us.shein.com/pdsearch/jeans/?ici=s1', defaultRedirects),
    'https://thredup.com/search?q=jeans'
  )
})

test('a bestbuy product page (not a search page) lands on backmarket\'s homepage', () => {
  assert.equal(
    resolveRedirectTarget('https://www.bestbuy.com/site/some-laptop/6000000.p', defaultRedirects),
    'https://backmarket.com/'
  )
})

test('bestbuy search term maps to the equivalent backmarket search', () => {
  assert.equal(
    resolveRedirectTarget('https://www.bestbuy.com/site/searchpage.jsp?st=refurbished+iphone', defaultRedirects),
    'https://backmarket.com/en-us/search?q=refurbished+iphone'
  )
})

test('amazon product search maps to the equivalent earthhero search term (redirect enabled)', () => {
  const redirects: Redirect[] = defaultRedirects.map((redirect) =>
    redirect.from === 'www.amazon.com' ? { ...redirect, enabled: true } : redirect
  )

  assert.equal(
    resolveRedirectTarget('https://www.amazon.com/s?k=water+bottle', redirects),
    'https://earthhero.com/search?q=water+bottle'
  )
})

test('a pair with no searchMapping lands on the target homepage, not a copied path (regression: this used to 404)', () => {
  const redirects: Redirect[] = [
    { id: 1, from: 'mailchimp.com', to: 'ecosend.io', description: '', enabled: true, effort: 'hard' },
    { id: 2, from: 'workspace.google.com', to: 'infomaniak.com', description: '', enabled: true, effort: 'hard' },
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
    { id: 1, from: 'airbnb.com', to: 'ecobnb.com', description: '', enabled: false, effort: 'medium' },
  ]

  const untouched = mergeRedirects(currentDefaults, [])
  assert.equal(untouched[0].userConfigured, false)

  const storedRedirects: Redirect[] = [
    { id: 1, from: 'airbnb.com', to: 'ecobnb.com', description: '', enabled: false, effort: 'medium', userConfigured: true },
  ]
  const touched = mergeRedirects(currentDefaults, storedRedirects)
  assert.equal(touched[0].userConfigured, true)
})

test('resolveNudgeCandidate offers an off-by-default, never-configured pair', () => {
  const redirects: Redirect[] = [
    { id: 1, from: 'airbnb.com', to: 'ecobnb.com', description: '', enabled: false, effort: 'medium' },
  ]

  const candidate = resolveNudgeCandidate('https://airbnb.com/rooms/123', redirects)
  assert.equal(candidate?.id, 1)
})

test('resolveNudgeCandidate stays quiet once the user has explicitly decided (userConfigured)', () => {
  const redirects: Redirect[] = [
    { id: 1, from: 'airbnb.com', to: 'ecobnb.com', description: '', enabled: false, effort: 'medium', userConfigured: true },
  ]

  assert.equal(resolveNudgeCandidate('https://airbnb.com/rooms/123', redirects), null)
})

test('resolveNudgeCandidate stays quiet for a pair that is already enabled', () => {
  const redirects: Redirect[] = [
    { id: 1, from: 'www.google.com', to: 'ecosia.org', description: '', enabled: true, effort: 'easy' },
  ]

  assert.equal(resolveNudgeCandidate('https://www.google.com/search?q=clothes', redirects), null)
})

test('resolveNudgeCandidate stays quiet when nothing matches the hostname', () => {
  const redirects: Redirect[] = [
    { id: 1, from: 'airbnb.com', to: 'ecobnb.com', description: '', enabled: false, effort: 'medium' },
  ]

  assert.equal(resolveNudgeCandidate('https://example.com/', redirects), null)
})

test('resolveNudgeCandidate prefers the most specific unconfigured host match', () => {
  const redirects: Redirect[] = [
    { id: 1, from: 'google.com', to: 'ecosia.org', description: '', enabled: false, effort: 'medium' },
    { id: 2, from: 'maps.google.com', to: 'openstreetmap.org', description: '', enabled: false, effort: 'medium' },
  ]

  const candidate = resolveNudgeCandidate('https://maps.google.com/maps?q=green', redirects)
  assert.equal(candidate?.id, 2)
})
