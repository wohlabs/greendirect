import test from 'node:test'
import assert from 'node:assert/strict'

import { defaultRedirects, resolveRedirectTarget, type Redirect } from './redirects.ts'

test('redirects prefer the most specific enabled host match', () => {
  const redirects: Redirect[] = [
    ...defaultRedirects,
    { id: 99, from: 'google.com', to: 'ecosia.org', description: 'Search', enabled: true },
    { id: 100, from: 'maps.google.com', to: 'openstreetmap.org', description: 'Maps', enabled: true },
  ]

  assert.equal(
    resolveRedirectTarget('https://maps.google.com/maps?q=green', redirects),
    'https://openstreetmap.org/maps?q=green'
  )
})

test('disabled redirects do not trigger a redirect', () => {
  const redirects: Redirect[] = [
    { id: 1, from: 'google.com', to: 'ecosia.org', description: 'Search', enabled: false },
  ]

  assert.equal(resolveRedirectTarget('https://google.com/search?q=green', redirects), null)
})
