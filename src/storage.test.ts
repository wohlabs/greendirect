import test from 'node:test'
import assert from 'node:assert/strict'

import {
  defaultRedirects,
  mergeRedirects,
  onStorageChanged,
  readStoredRedirects,
  REDIRECT_STORAGE_KEY,
  saveRedirects,
  sendExtensionMessage,
} from './redirects.ts'

// None of this runs in a real browser, so these tests stand in for the two
// storage behaviours that matter and that differ between browsers:
//
//   Firefox   `browser.storage.local` is promise-only (calling it with a
//             callback is an error), and storage.onChanged fires for EVERY
//             write, even one that stores an identical value.
//   Chromium  `chrome.storage.local` is callback-based, and no-op writes
//             don't fire onChanged.

type Listener = () => void
type Items = Record<string, unknown>

function createEvent() {
  const listeners = new Set<Listener>()

  return {
    listeners,
    addListener: (listener: Listener) => void listeners.add(listener),
    removeListener: (listener: Listener) => void listeners.delete(listener),
    fire: () => listeners.forEach((listener) => listener()),
  }
}

function createBackingStore(options: { firesOnIdenticalWrites: boolean }) {
  const data: Items = {}
  const onChanged = createEvent()
  const state = { writes: 0 }

  return {
    data,
    onChanged,
    state,
    read(key: string): Items {
      return key in data ? { [key]: structuredClone(data[key]) } : {}
    },
    write(items: Items) {
      state.writes++
      let changed = false

      for (const [key, value] of Object.entries(items)) {
        const next = structuredClone(value)
        if (options.firesOnIdenticalWrites || JSON.stringify(data[key]) !== JSON.stringify(next)) changed = true
        data[key] = next
      }

      // Real storage events are delivered asynchronously.
      if (changed) setTimeout(() => onChanged.fire(), 0)
    },
  }
}

type Store = ReturnType<typeof createBackingStore>

// Firefox: a strict promise-only `browser`, plus the callback-style `chrome`
// alias it also exposes.
function firefoxGlobals(store: Store, chromeOnChanged = createEvent()) {
  return {
    browser: {
      storage: {
        local: {
          // Deliberately not `async`: Firefox validates arguments up front and
          // throws synchronously, rather than returning a rejected promise.
          get: (...args: unknown[]) => {
            if (args.length !== 1) throw new TypeError('Incorrect argument types for storage.local.get')
            return Promise.resolve(store.read(args[0] as string))
          },
          set: (...args: unknown[]) => {
            if (args.length !== 1) throw new TypeError('Incorrect argument types for storage.local.set')
            store.write(args[0] as Items)
            return Promise.resolve()
          },
        },
        onChanged: store.onChanged,
      },
    },
    chrome: {
      runtime: {},
      storage: {
        local: {
          get: (key: string, callback: (items: Items) => void) => callback(store.read(key)),
          set: (items: Items, callback?: () => void) => {
            store.write(items)
            callback?.()
          },
        },
        onChanged: chromeOnChanged,
      },
    },
  }
}

// Chromium: `chrome` only, callback-based.
function chromiumGlobals(store: Store) {
  return {
    browser: undefined,
    chrome: {
      runtime: {},
      storage: {
        local: {
          get: (key: string, callback: (items: Items) => void) => callback(store.read(key)),
          set: (items: Items, callback?: () => void) => {
            store.write(items)
            callback?.()
          },
        },
        onChanged: store.onChanged,
      },
    },
  }
}

async function withGlobals(globals: { browser?: unknown; chrome?: unknown }, body: () => Promise<void>) {
  const scope = globalThis as unknown as Record<string, unknown>
  const previous = { browser: scope.browser, chrome: scope.chrome }

  scope.browser = globals.browser
  scope.chrome = globals.chrome

  try {
    await body()
  } finally {
    scope.browser = previous.browser
    scope.chrome = previous.chrome
  }
}

// Lets queued storage events and the async re-reads they trigger run to
// completion.
async function settle(turns = 12) {
  for (let i = 0; i < turns; i++) await new Promise((resolve) => setTimeout(resolve, 0))
}

test('firefox: first read seeds the defaults and a saved toggle persists', async () => {
  const store = createBackingStore({ firesOnIdenticalWrites: true })

  await withGlobals(firefoxGlobals(store), async () => {
    const first = await readStoredRedirects()
    assert.deepEqual(first, mergeRedirects(defaultRedirects, defaultRedirects))

    await saveRedirects(first.map((redirect) => (redirect.id === 1 ? { ...redirect, enabled: false, userConfigured: true } : redirect)))

    const reread = (await readStoredRedirects()).find((redirect) => redirect.id === 1)
    assert.equal(reread?.enabled, false)
    assert.equal(reread?.userConfigured, true)
  })
})

test('firefox: re-reading on every storage change settles instead of feeding itself', async () => {
  const store = createBackingStore({ firesOnIdenticalWrites: true })

  await withGlobals(firefoxGlobals(store), async () => {
    // What the content script and the sidebar both do: re-read on every change.
    const stop = onStorageChanged(() => void readStoredRedirects())

    try {
      await readStoredRedirects()
      await settle()

      // Exactly one write -- seeding the defaults on first run -- and then
      // nothing, no matter how many change events get delivered.
      assert.equal(store.state.writes, 1)

      await settle()
      assert.equal(store.state.writes, 1)
    } finally {
      stop()
    }
  })
})

test('firefox: data saved by an older version is migrated once, then left alone', async () => {
  const store = createBackingStore({ firesOnIdenticalWrites: true })

  // An older shape: no userConfigured flag, a stale target, and a host that has
  // since been removed from defaultRedirects.
  store.data[REDIRECT_STORAGE_KEY] = [
    { id: 1, from: 'www.google.com', to: 'old-target.example', enabled: false, effort: 'easy' },
    { id: 42, from: 'removed.example', to: 'gone.example', enabled: true, effort: 'easy' },
  ]

  await withGlobals(firefoxGlobals(store), async () => {
    const stop = onStorageChanged(() => void readStoredRedirects())

    try {
      const migrated = await readStoredRedirects()
      await settle()

      const google = migrated.find((redirect) => redirect.from === 'www.google.com')
      assert.equal(google?.enabled, false, "the user's toggle is kept")
      assert.equal(google?.to, 'ecosia.org', 'shipped target replaces the stale one')
      assert.ok(!migrated.some((redirect) => redirect.from === 'removed.example'), 'removed hosts are pruned')

      // One write to migrate; the follow-up reads triggered by that write find
      // nothing left to change.
      assert.equal(store.state.writes, 1)
    } finally {
      stop()
    }
  })
})

test('a failed read never overwrites saved settings with defaults', async () => {
  const store = createBackingStore({ firesOnIdenticalWrites: true })
  const saved = mergeRedirects(defaultRedirects, defaultRedirects).map((redirect) => ({ ...redirect, enabled: false, userConfigured: true }))
  store.data[REDIRECT_STORAGE_KEY] = saved

  const globals = firefoxGlobals(store)
  globals.browser.storage.local.get = async () => {
    throw new Error('transient storage failure')
  }

  await withGlobals(globals, async () => {
    const result = await readStoredRedirects()

    assert.deepEqual(result, defaultRedirects)
    assert.equal(store.state.writes, 0)
    assert.deepEqual(store.data[REDIRECT_STORAGE_KEY], saved)
  })
})

test('chromium: callback-based chrome.storage round-trips', async () => {
  const store = createBackingStore({ firesOnIdenticalWrites: false })

  await withGlobals(chromiumGlobals(store), async () => {
    const stop = onStorageChanged(() => void readStoredRedirects())

    try {
      const first = await readStoredRedirects()
      await saveRedirects(first.map((redirect) => (redirect.id === 2 ? { ...redirect, enabled: false, userConfigured: true } : redirect)))
      await settle()

      const reread = (await readStoredRedirects()).find((redirect) => redirect.id === 2)
      assert.equal(reread?.enabled, false)
      assert.equal(reread?.userConfigured, true)
    } finally {
      stop()
    }
  })
})

test('onStorageChanged listens on one namespace only when both exist', async () => {
  const store = createBackingStore({ firesOnIdenticalWrites: true })
  const chromeOnChanged = createEvent()

  await withGlobals(firefoxGlobals(store, chromeOnChanged), async () => {
    const stop = onStorageChanged(() => {})

    assert.equal(store.onChanged.listeners.size + chromeOnChanged.listeners.size, 1)

    stop()

    assert.equal(store.onChanged.listeners.size + chromeOnChanged.listeners.size, 0)
  })
})

test('without a storage permission the namespace is missing: reads fall back to defaults, saves are a no-op', async () => {
  // A Firefox build whose manifest lacks "storage" has no browser.storage at all.
  await withGlobals({ browser: {}, chrome: undefined }, async () => {
    assert.deepEqual(await readStoredRedirects(), defaultRedirects)
    await saveRedirects(defaultRedirects)
    assert.doesNotThrow(() => onStorageChanged(() => {})())
  })
})

test('firefox: the background reply comes back through browser.runtime, since chrome.runtime.sendMessage returns nothing there', async () => {
  const usedNamespaces: string[] = []

  await withGlobals(
    {
      browser: {
        runtime: {
          sendMessage: (_message: unknown) => {
            usedNamespaces.push('browser')
            return Promise.resolve({ dismissed: true })
          },
        },
      },
      // Firefox's callback-style alias: called without a callback it returns
      // no promise, so whatever the background script replied is lost.
      chrome: {
        runtime: {
          sendMessage: (_message: unknown) => {
            usedNamespaces.push('chrome')
            return undefined
          },
        },
      },
    },
    async () => {
      assert.deepEqual(await sendExtensionMessage({ type: 'queryDismissed' }), { dismissed: true })
      assert.deepEqual(usedNamespaces, ['browser'])
    }
  )
})

test('chromium: messages go through chrome.runtime and resolve with the reply', async () => {
  await withGlobals(
    { browser: undefined, chrome: { runtime: { sendMessage: (_message: unknown) => Promise.resolve({ dismissed: false }) } } },
    async () => {
      assert.deepEqual(await sendExtensionMessage({ type: 'queryDismissed' }), { dismissed: false })
    }
  )
})

test('messaging fails open, resolving undefined, when the extension context is gone or there is no channel', async () => {
  const invalidated = () => {
    throw new Error('Extension context invalidated.')
  }

  await withGlobals({ browser: undefined, chrome: { runtime: { sendMessage: invalidated } } }, async () => {
    assert.equal(await sendExtensionMessage({ type: 'queryDismissed' }), undefined)
  })

  await withGlobals({ browser: undefined, chrome: undefined }, async () => {
    assert.equal(await sendExtensionMessage({ type: 'queryDismissed' }), undefined)
  })
})
