import test from 'node:test'
import assert from 'node:assert/strict'

import manifest from './manifest.json' with { type: 'json' }
import { defaultRedirects } from './redirects.ts'

// The content script only needs to run on the sites GreenDirect actually
// redirects from (see defaultRedirects in redirects.ts) -- not <all_urls>.
// Chrome Web Store review flags <all_urls> as an overly broad host
// permission, and activeTab isn't an option here since the redirect has to
// fire on page load, before any user gesture. So manifest.json's
// content_scripts[0].matches is a hand-maintained list of match patterns,
// one per redirect source domain, in the form '*://*.<domain>/*' (the
// leading '*.' covers both the bare domain and its subdomains, mirroring
// matchesHostname's own exact-or-subdomain comparison in redirects.ts).
//
// This test is what keeps that hand-maintained list honest: it fails the
// moment someone adds/renames a `from` domain in defaultRedirects without
// updating the manifest to match, so the redirect silently stops working
// on the new site instead of quietly regressing back toward a broad match.
test('content script matches cover exactly the redirect source domains, and nothing broader', () => {
  const matches: string[] = manifest.content_scripts[0].matches

  assert.ok(!matches.includes('<all_urls>'), 'content script must not request <all_urls>')

  const expectedDomains = [...new Set(defaultRedirects.map((redirect) => redirect.from))].sort()
  const expectedPatterns = expectedDomains.map((domain) => `*://*.${domain}/*`).sort()

  assert.deepEqual([...matches].sort(), expectedPatterns)
})
