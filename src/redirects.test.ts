import test from 'node:test'
import assert from 'node:assert/strict'

import { defaultRedirects, displayHostname, mergeRedirects, resolveRedirectTarget, type Redirect } from './redirects.ts'

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

  assert.equal(
    resolveRedirectTarget('https://maps.google.com/maps?q=green', redirects),
    'https://openstreetmap.org/maps?q=green'
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

test('a pair with no searchMapping still falls back to the previous path/query passthrough', () => {
  const redirects: Redirect[] = [
    { id: 1, from: 'mailchimp.com', to: 'ecosend.io', description: '', enabled: true, effort: 'hard' },
  ]

  assert.equal(
    resolveRedirectTarget('https://mailchimp.com/some/path?utm_source=x', redirects),
    'https://ecosend.io/some/path?utm_source=x'
  )
})
