<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { buildNaverApiUrl, parseNaverDictionaryResponse } from '/src/dictionary/parser.mjs'
import DictionaryResult from '/src/components/DictionaryResult.vue'
import {
  POPUP_STATES,
  resolvePopupState
} from '/src/popup-state.mjs'
import {
  createDictionaryRequest,
  createClearRecentSearchRequest,
  createRecentSearchRequest,
  reportMessageFailure,
  sendRuntimeMessage
} from '/src/messaging.mjs'
import {
  addRecentSearch,
  loadRecentSearchState,
  normalizeRecentSearchTerm
} from '/src/recent-search.mjs'
import { normalizeSettingsV2, SETTINGS_STORAGE } from '/src/settings-v2.mjs'
import { getText } from '/src/text.js'

const word = ref('')
const entries = ref([])
const state = ref(POPUP_STATES.IDLE)
const inputElement = ref(null)
const recentSearches = ref([])
const recentSearchEnabled = ref(false)
const recentSearchReady = ref(false)
const pendingRecentSearches = []
let storageChangeListener = null
let recentSearchStateRevision = 0
const popupBodyElement = ref(null)
let requestRevision = 0
const hasVisibleResult = computed(() => entries.value.length > 0
  && (state.value === POPUP_STATES.RESULT || state.value === POPUP_STATES.LOADING))
const showRecentSearchPanel = computed(() => recentSearchEnabled.value
  && recentSearchReady.value
  && state.value === POPUP_STATES.IDLE
  && recentSearches.value.length > 0)
const shellClasses = computed(() => ({
  [`naverdic-popup-shell--${state.value}`]: true,
  'naverdic-popup-shell--result': hasVisibleResult.value,
  'naverdic-popup-shell--recent': showRecentSearchPanel.value
}))

function setResolvedState(resolved) {
  state.value = resolved?.state || POPUP_STATES.IDLE
  entries.value = Array.isArray(resolved?.data) ? resolved.data : []
}

function queueRecentSearchRecord(term) {
  void sendRuntimeMessage(
    globalThis.chrome?.runtime,
    createRecentSearchRequest({term})
  )
}

function queueRecentSearchClear() {
  void sendRuntimeMessage(
    globalThis.chrome?.runtime,
    createClearRecentSearchRequest()
  )
}

function commitRecentSearch(term) {
  if (!recentSearchEnabled.value) {
    return
  }

  const nextSearches = addRecentSearch(recentSearches.value, term)
  const changed = nextSearches.length !== recentSearches.value.length ||
    nextSearches.some((entry, index) => entry !== recentSearches.value[index])
  if (!changed) {
    return
  }

  recentSearches.value = nextSearches
  queueRecentSearchRecord(term)
}

function flushPendingRecentSearches() {
  if (!recentSearchEnabled.value || pendingRecentSearches.length === 0) {
    pendingRecentSearches.length = 0
    return
  }

  let nextSearches = recentSearches.value
  for (const term of pendingRecentSearches) {
    const updatedSearches = addRecentSearch(nextSearches, term)
    const changed = updatedSearches.length !== nextSearches.length ||
      updatedSearches.some((entry, index) => entry !== nextSearches[index])
    if (changed) {
      queueRecentSearchRecord(term)
    }
    nextSearches = updatedSearches
  }
  pendingRecentSearches.length = 0

  const changed = nextSearches.length !== recentSearches.value.length ||
    nextSearches.some((entry, index) => entry !== recentSearches.value[index])
  if (!changed) {
    return
  }

  recentSearches.value = nextSearches
}

function trackRecentSearch(query) {
  const term = normalizeRecentSearchTerm(query)
  if (!term) {
    return
  }

  if (!recentSearchReady.value) {
    pendingRecentSearches.push(term)
    return
  }

  commitRecentSearch(term)
}

async function initializeRecentSearch() {
  const revision = recentSearchStateRevision
  try {
    const loaded = await loadRecentSearchState(globalThis.chrome?.storage)
    if (revision !== recentSearchStateRevision) {
      return
    }
    recentSearchEnabled.value = loaded.enabled
    recentSearches.value = loaded.searches
  } catch (_error) {
    if (revision !== recentSearchStateRevision) {
      return
    }
    recentSearchEnabled.value = false
    recentSearches.value = []
  } finally {
    if (revision !== recentSearchStateRevision) {
      return
    }
    recentSearchReady.value = true
    flushPendingRecentSearches()
  }
}

async function refreshRecentSearchFromStorage() {
  const revision = ++recentSearchStateRevision
  try {
    const loaded = await loadRecentSearchState(globalThis.chrome?.storage)
    if (revision !== recentSearchStateRevision) {
      return
    }
    recentSearchEnabled.value = loaded.enabled
    recentSearches.value = loaded.searches
    recentSearchReady.value = true
    flushPendingRecentSearches()
  } catch (_error) {
    if (revision !== recentSearchStateRevision) {
      return
    }
    recentSearchEnabled.value = false
    recentSearches.value = []
    recentSearchReady.value = true
    pendingRecentSearches.length = 0
  }
}

function handleStorageChanged(changes, areaName) {
  if (areaName !== 'sync') {
    return
  }

  const settingChange = changes?.[SETTINGS_STORAGE.settings.key]
  if (!settingChange) {
    return
  }

  const previousEnabled = normalizeSettingsV2(settingChange.oldValue).recentSearch.enabled
  const enabled = normalizeSettingsV2(settingChange.newValue).recentSearch.enabled
  if (previousEnabled === enabled) {
    return
  }

  if (!enabled) {
    recentSearchStateRevision += 1
    recentSearchEnabled.value = false
    recentSearches.value = []
    recentSearchReady.value = true
    pendingRecentSearches.length = 0
    queueRecentSearchClear()
    return
  }

  void refreshRecentSearchFromStorage()
}

function clearPopupRecentSearches() {
  recentSearches.value = []
  pendingRecentSearches.length = 0
  queueRecentSearchClear()
}

function searchRecentWord(recentWord) {
  void searchWord(recentWord)
}

function resetPopupScroll() {
  if (popupBodyElement.value) {
    popupBodyElement.value.scrollTop = 0
  }
}

async function searchWord(searchTerm = word.value) {
  const query = String(searchTerm ?? '').trim()
  word.value = query
  resetPopupScroll()

  if (!query) {
    requestRevision += 1
    state.value = POPUP_STATES.IDLE
    entries.value = []
    return
  }

  const revision = ++requestRevision
  state.value = POPUP_STATES.LOADING

  try {
    const response = await sendRuntimeMessage(
      globalThis.chrome?.runtime,
      createDictionaryRequest({
        method: 'GET',
        url: buildNaverApiUrl(query)
      })
    )

    if (revision !== requestRevision) {
      return
    }

    if (!response.ok) {
      reportMessageFailure('dictionary lookup', response)
      setResolvedState(resolvePopupState('dictionary', {
        status: 'error',
        error: response.error
      }))
      return
    }

    const resolved = resolvePopupState('dictionary', {
      status: 'success',
      data: parseNaverDictionaryResponse(response.data)
    })
    setResolvedState(resolved)
    if (resolved.state === POPUP_STATES.RESULT) {
      trackRecentSearch(query)
    }
  } catch (error) {
    if (revision !== requestRevision) {
      return
    }

    reportMessageFailure('dictionary lookup', {
      ok: false,
      error: {
        code: error?.code || 'RUNTIME_ERROR',
        message: error?.message || 'The dictionary lookup failed.'
      }
    })
    setResolvedState(resolvePopupState('dictionary', {
      status: 'error',
      error
    }))
  }
}

void initializeRecentSearch()

onMounted(() => {
  nextTick(() => inputElement.value?.focus())

  const onChanged = globalThis.chrome?.storage?.onChanged
  if (typeof onChanged?.addListener === 'function') {
    storageChangeListener = handleStorageChanged
    onChanged.addListener(storageChangeListener)
  }
})

onBeforeUnmount(() => {
  const onChanged = globalThis.chrome?.storage?.onChanged
  if (storageChangeListener && typeof onChanged?.removeListener === 'function') {
    onChanged.removeListener(storageChangeListener)
  }
  storageChangeListener = null
})
</script>

<template>
  <main
    class="naverdic-popup-shell"
    :class="shellClasses"
    :data-state="state"
    role="dialog"
    :aria-label="getText('APP_NAME')"
    :aria-busy="state === POPUP_STATES.LOADING"
  >
    <form class="naverdic-popup-search" @submit.prevent="searchWord()">
      <label class="naverdic-sr-only" for="naverdic-dic">
        {{ getText('POPUP_SEARCH_LABEL') }}
      </label>
      <input
        id="naverdic-dic"
        ref="inputElement"
        v-model="word"
        class="naverdic-popup-search__input"
        type="search"
        autocomplete="off"
        :placeholder="getText('POPUP_SEARCH_PLACEHOLDER')"
      >
      <button
        type="submit"
        class="naverdic-popup-search__button"
      >
        {{ getText('SEARCH') }}
      </button>
    </form>

    <div
      ref="popupBodyElement"
      class="naverdic-popup-body"
      :class="{'naverdic-popup-body--result': hasVisibleResult}"
    >
      <DictionaryResult
        v-if="hasVisibleResult"
        :entries="entries"
      />
      <p
        v-else-if="state === POPUP_STATES.EMPTY"
        class="naverdic-popup-status"
        role="status"
      >{{ getText('INLINE_POPUP_NO_RESULT') }}</p>
      <p
        v-else-if="state === POPUP_STATES.ERROR"
        class="naverdic-popup-status naverdic-popup-status--error"
        role="alert"
      >{{ getText('INLINE_POPUP_NETWORK_ERROR') }}</p>

      <div
        class="naverdic-popup-divider"
        :class="{
          'naverdic-popup-divider--initial': !showRecentSearchPanel && !hasVisibleResult && (state === POPUP_STATES.IDLE || state === POPUP_STATES.LOADING),
          'naverdic-popup-divider--recent-top': showRecentSearchPanel
        }"
        aria-hidden="true"
      />
      <section
        v-if="showRecentSearchPanel"
        class="naverdic-popup-recent"
        data-testid="popup-recent-search"
        aria-labelledby="naverdic-recent-search-title"
      >
        <header class="naverdic-popup-recent__header">
          <h2
            id="naverdic-recent-search-title"
            class="naverdic-popup-recent__title"
          >{{ getText('POPUP_RECENT_SEARCH_TITLE') }}</h2>
          <button
            type="button"
            class="naverdic-popup-recent__clear"
            :aria-label="getText('POPUP_RECENT_SEARCH_CLEAR_LABEL')"
            :disabled="recentSearches.length === 0"
            data-testid="popup-recent-search-clear"
            @click="clearPopupRecentSearches"
          >{{ getText('POPUP_RECENT_SEARCH_CLEAR') }}</button>
        </header>
        <div class="naverdic-popup-recent__grid">
          <button
            v-for="recentWord in recentSearches"
            :key="recentWord"
            type="button"
            class="naverdic-popup-recent__item"
            data-testid="popup-recent-search-item"
            @click="searchRecentWord(recentWord)"
          >{{ recentWord }}</button>
        </div>
      </section>
      <div
        v-if="showRecentSearchPanel"
        class="naverdic-popup-divider naverdic-popup-divider--recent-bottom"
        aria-hidden="true"
      />
      <footer class="naverdic-popup-footer">
        <span>{{ getText('POPUP_PRODUCT_LABEL') }}</span>
        <a href="options.html" target="_blank" rel="noopener noreferrer">
          {{ getText('SETTING') }}
        </a>
      </footer>
    </div>
  </main>
</template>

<style>
* {
  box-sizing: border-box;
}

html,
body,
#app {
  width: 360px;
  min-width: 360px;
  margin: 0;
  background: transparent;
}

body {
  min-height: 92px;
  color: var(--naverdic-color-text, #1F2937);
  font-family: var(--naverdic-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
  font-size: 14px;
}

.naverdic-popup-shell {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 360px;
  min-height: 92px;
  padding: 10px 10px 8px;
  overflow: hidden;
  border: 1px solid #E2E6EC;
  background: var(--naverdic-color-surface-popup, #F5F6F8);
}

.naverdic-popup-shell--result {
  min-height: 308px;
}

.naverdic-popup-shell--idle,
.naverdic-popup-shell--loading {
  height: 92px;
}

.naverdic-popup-shell--recent {
  height: auto;
  min-height: 0;
  padding-bottom: 14px;
}

.naverdic-popup-shell--loading.naverdic-popup-shell--result {
  height: auto;
}

.naverdic-popup-search {
  display: flex;
  flex: 0 0 36px;
  gap: 8px;
  width: 340px;
  height: 36px;
}

.naverdic-popup-search__input {
  width: 272px;
  height: 36px;
  padding: 0 12px;
  border: 1px solid #D1D9E5;
  border-radius: 8px;
  outline: 0;
  background: #FFFFFF;
  color: #1F2937;
  font: inherit;
  font-size: 14px;
}

.naverdic-popup-search__input::placeholder {
  color: #7A879E;
  opacity: 1;
}

.naverdic-popup-search__input:hover {
  border-color: #AEBACB;
}

.naverdic-popup-search__input:focus-visible {
  border-color: #3F81F5;
  box-shadow: 0 0 0 2px rgba(63, 129, 245, 0.15);
}

.naverdic-popup-search__button {
  width: 60px;
  height: 36px;
  padding: 0;
  border: 0;
  border-radius: 8px;
  background: #3F81F5;
  color: #FFFFFF;
  cursor: pointer;
  font: inherit;
  font-size: 14px;
  font-weight: 700;
}

.naverdic-popup-search__button:hover:not(:disabled) {
  background: #2F70E4;
}

.naverdic-popup-search__button:focus-visible {
  outline: 3px solid rgba(63, 129, 245, 0.3);
  outline-offset: 1px;
}

.naverdic-popup-search__button:disabled,
.naverdic-popup-search__input:disabled {
  cursor: wait;
  opacity: 0.7;
}

.naverdic-popup-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 340px;
  min-width: 0;
}

.naverdic-popup-body--result {
  max-height: 336px;
  overflow-x: hidden;
  overflow-y: auto;
}

.naverdic-popup-shell .dictionary-result {
  flex: 0 0 auto;
  width: 340px;
  height: auto;
  min-height: 216px;
  max-height: none;
  overflow: visible;
}

.naverdic-popup-body--result::-webkit-scrollbar {
  width: 4px;
  height: 4px;
}

.naverdic-popup-body--result::-webkit-scrollbar-track {
  background: rgba(229, 233, 240, 0.9);
  border-radius: 2px;
}

.naverdic-popup-body--result::-webkit-scrollbar-thumb {
  background: rgba(185, 193, 204, 0.9);
  border-radius: 2px;
}

.naverdic-popup-status {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 64px;
  margin: 0;
  padding: 12px;
  border-radius: 8px;
  color: #6B788F;
  font-size: 13px;
  line-height: 1.45;
  text-align: center;
}

.naverdic-popup-status--error {
  color: #B42318;
}

.naverdic-popup-divider {
  flex: 0 0 1px;
  width: 340px;
  height: 1px;
  margin-top: -5px;
  background: #D6DBE5;
}

.naverdic-popup-divider--initial {
  margin-top: 4px;
}

.naverdic-popup-divider--recent-top {
  margin-top: 3px;
}

.naverdic-popup-divider--recent-bottom {
  margin-top: 0;
}

.naverdic-popup-recent {
  display: flex;
  flex-direction: column;
  width: 340px;
}

.naverdic-popup-recent__header {
  position: relative;
  display: flex;
  width: 340px;
  height: 18px;
  align-items: center;
  justify-content: center;
}

.naverdic-popup-recent__title {
  margin: 0;
  color: #3F81F5;
  font-size: 12px;
  font-weight: 700;
  line-height: 18px;
}

.naverdic-popup-recent__clear {
  position: absolute;
  top: 0;
  right: 0;
  height: 18px;
  padding: 0;
  border: 0;
  background: transparent;
  color: #94A3B8;
  cursor: pointer;
  font: inherit;
  font-size: 11px;
  font-weight: 600;
  line-height: 18px;
}

.naverdic-popup-recent__clear:hover:not(:disabled) {
  color: #64748B;
}

.naverdic-popup-recent__clear:focus-visible,
.naverdic-popup-recent__item:focus-visible {
  outline: 2px solid rgba(63, 129, 245, 0.3);
  outline-offset: 1px;
  border-radius: 3px;
}

.naverdic-popup-recent__clear:disabled {
  cursor: default;
}

.naverdic-popup-recent__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  grid-auto-rows: 23px;
  width: 340px;
  margin-top: 11px;
}

.naverdic-popup-recent__item {
  width: 170px;
  height: 23px;
  padding: 0 4px;
  overflow: hidden;
  border: 0;
  background: transparent;
  color: #7A879E;
  cursor: pointer;
  font: inherit;
  font-size: 14px;
  line-height: 23px;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.naverdic-popup-recent__item:hover {
  border-radius: 4px;
  background: rgba(63, 129, 245, 0.08);
  color: #3F81F5;
}

.naverdic-popup-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 9px;
  width: 340px;
  height: 16px;
  min-height: 16px;
  padding: 0 9px 0 0;
  color: #636E80;
  font-size: 13px;
  line-height: normal;
  white-space: nowrap;
}

.naverdic-popup-footer a {
  color: #3F81F5;
  font-weight: 600;
  text-decoration: none;
}

.naverdic-popup-footer a:hover {
  text-decoration: underline;
}

.naverdic-popup-footer a:focus-visible {
  outline: 3px solid rgba(63, 129, 245, 0.3);
  outline-offset: 2px;
  border-radius: 3px;
}

.naverdic-sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>
