/**
 * Keep the content-script configuration in sync with chrome.storage.
 *
 * Reads are versioned so an older async callback cannot overwrite a newer
 * storage change. Every change re-reads the complete settings object instead
 * of merging a partial change into defaults while the initial read is still
 * pending.
 */
export function createStorageLifecycle({storage, defaults, onApply}) {
  let listener = null
  let started = false
  let revision = 0
  let currentItems = {...defaults}

  function readLatest() {
    const revisionAtRequest = revision

    storage.sync.get(defaults, items => {
      if (revisionAtRequest !== revision) {
        return
      }

      currentItems = {...defaults, ...(items || {})}
      onApply(currentItems)
    })
  }

  function applyChangedValues(changes) {
    const nextItems = {...currentItems}

    Object.keys(changes || {}).forEach(key => {
      if (!(key in defaults)) {
        return
      }

      const change = changes[key]
      nextItems[key] = change?.newValue === undefined
        ? defaults[key]
        : change.newValue
    })

    currentItems = nextItems
    onApply(currentItems)
  }

  function handleStorageChange(changes, areaName) {
    if (areaName && areaName !== 'sync') {
      return
    }

    const hasRelevantChange = Object.keys(changes || {}).some(key => key in defaults)
    if (!hasRelevantChange) {
      return
    }

    revision += 1

    if (storage.sync?.get) {
      readLatest()
      return
    }

    // This fallback is only for lightweight/test storage implementations.
    // Chrome's sync storage always exposes get(), so production changes use
    // the complete reread above.
    applyChangedValues(changes)
  }

  function start() {
    if (started) {
      return
    }

    started = true

    if (storage?.onChanged?.addListener) {
      listener = handleStorageChange
      storage.onChanged.addListener(listener)
    }

    if (storage?.sync?.get) {
      readLatest()
      return
    }

    currentItems = {...defaults}
    onApply(currentItems)
  }

  function stop() {
    revision += 1

    if (listener && storage?.onChanged?.removeListener) {
      storage.onChanged.removeListener(listener)
    }

    listener = null
    started = false
    currentItems = {...defaults}
  }

  return {start, stop}
}
