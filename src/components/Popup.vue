<script setup>
import { computed, nextTick, onMounted, ref } from 'vue'
import { buildNaverApiUrl, parseNaverDictionaryResponse } from '/src/dictionary/parser.mjs'
import DictionaryResult from '/src/components/DictionaryResult.vue'
import {
  POPUP_STATES,
  resolvePopupState
} from '/src/popup-state.mjs'
import {
  createDictionaryRequest,
  reportMessageFailure,
  sendRuntimeMessage
} from '/src/messaging.mjs'
import { getText } from '/src/text.js'

const word = ref('')
const entries = ref([])
const state = ref(POPUP_STATES.IDLE)
const inputElement = ref(null)
let requestRevision = 0
const hasVisibleResult = computed(() => entries.value.length > 0
  && (state.value === POPUP_STATES.RESULT || state.value === POPUP_STATES.LOADING))
const shellClasses = computed(() => ({
  [`naverdic-popup-shell--${state.value}`]: true,
  'naverdic-popup-shell--result': hasVisibleResult.value
}))

function setResolvedState(resolved) {
  state.value = resolved?.state || POPUP_STATES.IDLE
  entries.value = Array.isArray(resolved?.data) ? resolved.data : []
}

async function searchWord(searchTerm = word.value) {
  const query = String(searchTerm ?? '').trim()
  word.value = query

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

onMounted(() => {
  nextTick(() => inputElement.value?.focus())
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
        :class="{'naverdic-popup-divider--initial': !hasVisibleResult && (state === POPUP_STATES.IDLE || state === POPUP_STATES.LOADING)}"
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
