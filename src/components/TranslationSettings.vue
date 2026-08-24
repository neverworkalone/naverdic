<script setup>
import {computed, onActivated, onBeforeUnmount, reactive, ref, watch} from 'vue'
import {getText} from '/src/text.js'
import {getTriggerLabels} from '/src/content-interaction.mjs'
import {CHROME_TRANSLATOR_PHASES, createChromeTranslatorRuntime} from '/src/chrome-translator.mjs'
import {CHROME_TRANSLATOR_PROVIDER_ID, DEFAULT_PROVIDER_ID, getProviderPreset, normalizeGeminiModelId, PROVIDER_AUTH_MODES} from '/src/translation-provider.mjs'
import {getProviderCredential} from '/src/translation-settings.mjs'
import {canActivateTranslationProvider, getTranslationSettingsPanel, TRANSLATION_SETTINGS_PANELS} from '/src/translation-settings-state.mjs'
import {testTranslationProvider} from '/src/translation-testing.mjs'
import {fetchGeminiModels} from '/src/translation-models.mjs'

const props = defineProps({
  draft: {type: Object, required: true},
  draftSecrets: {type: Object, required: true},
  draftRevision: {type: Number, default: 0},
  draftResetRevision: {type: Number, default: 0},
  isLoading: {type: Boolean, default: false},
  isSaving: {type: Boolean, default: false},
  onPendingChange: {type: Function, default: null},
  translatorRuntime: {type: Object, default: null}
})

const serviceDefinitions = Object.freeze([
  Object.freeze({id: CHROME_TRANSLATOR_PROVIDER_ID, providerIds: [CHROME_TRANSLATOR_PROVIDER_ID], nameKey: 'SETTINGS_TRANSLATION_CHROME_NAME', descriptionKey: 'SETTINGS_TRANSLATION_CHROME_DESCRIPTION'}),
  Object.freeze({id: 'deepl', providerIds: ['deepl-free', 'deepl-pro'], nameKey: 'SETTINGS_TRANSLATION_DEEPL_NAME', descriptionKey: 'SETTINGS_TRANSLATION_DEEPL_DESCRIPTION'}),
  Object.freeze({id: 'gemini', providerIds: ['gemini'], nameKey: 'SETTINGS_TRANSLATION_GEMINI_NAME', descriptionKey: 'SETTINGS_TRANSLATION_GEMINI_DESCRIPTION'})
])
const supportedProviderIds = new Set(['chrome-translator', 'deepl-free', 'deepl-pro', 'gemini'])
const CHROME_MODEL_MANAGEMENT_URL = 'chrome://on-device-translation-internals/'
const translation = computed(() => props.draft.translation || {})
const activeProviderId = computed(() => supportedProviderIds.has(translation.value.providerId)
  ? translation.value.providerId
  : DEFAULT_PROVIDER_ID)
const selectedProviderId = ref(activeProviderId.value)
const selectedPanel = computed(() => getTranslationSettingsPanel(selectedProviderId.value))
const selectedProvider = computed(() => getProviderPreset(selectedProviderId.value, {
  model: translation.value.geminiModel
}))
const selectedIsChrome = computed(() => selectedPanel.value === TRANSLATION_SETTINGS_PANELS.CHROME)
const selectedIsDeepL = computed(() => ['deepl-free', 'deepl-pro'].includes(selectedProviderId.value))
const controlsDisabled = computed(() => props.isLoading || props.isSaving)
const connectionStates = reactive({})
const anyConnectionTesting = computed(() => Object.values(connectionStates).some(state => state?.status === 'testing'))
const formControlsDisabled = computed(() => controlsDisabled.value || anyConnectionTesting.value)
const showApiKey = ref(false)
const geminiModels = ref([])
const geminiModelState = reactive({status: 'idle', errorKey: ''})
const triggerLabels = computed(() => getTriggerLabels())
let connectionRequestId = 0
let modelRequestId = 0
const chromeState = ref({
  supported: false,
  availability: null,
  phase: CHROME_TRANSLATOR_PHASES.CHECKING,
  progress: null,
  indeterminate: false,
  errorCode: null,
  errorName: '',
  errorMessage: ''
})
let chromeRuntime = null
let chromeRuntimeUnsubscribe = null

function text(key, placeholders = undefined) {
  const message = getText(key, placeholders)
  if (!Array.isArray(placeholders)) {
    return message
  }
  return message
    .replaceAll('$1$', String(placeholders[0] ?? ''))
    .replaceAll('$2$', String(placeholders[1] ?? ''))
    .replaceAll('$progress$', String(placeholders[0] ?? ''))
    .replaceAll('$modifier$', String(placeholders[0] ?? ''))
    .replaceAll('$primary$', String(placeholders[0] ?? ''))
    .replaceAll('$secondary$', String(placeholders[1] ?? ''))
}

function stateFor(id) {
  return connectionStates[id] || {status: 'idle', messageKey: '', signature: ''}
}

function selectedConnectionState() {
  return stateFor(selectedProviderId.value)
}

function providerForId(id) {
  return getProviderPreset(id, {model: translation.value.geminiModel})
}

function providerCredential(provider) {
  return getProviderCredential(provider, props.draftSecrets)
}

function providerSignature(provider, id = provider?.id || '') {
  return provider
    ? JSON.stringify({
      provider,
      credential: providerCredential(provider),
      targetLanguage: translation.value.targetLanguage || 'ko'
    })
    : id + ':empty'
}

function isConnectionSuccess(id) {
  const state = stateFor(id)
  return state.status === 'success' && state.signature === providerSignature(providerForId(id), id)
}

function setConnectionState(id, patch) {
  connectionStates[id] = {...stateFor(id), ...patch}
}

function invalidateConnectionState(id = selectedProviderId.value) {
  connectionRequestId += 1
  setConnectionState(id, {status: 'idle', messageKey: '', signature: ''})
}

function invalidateAllConnectionStates() {
  connectionRequestId += 1
  Object.keys(connectionStates).forEach(id => {
    setConnectionState(id, {status: 'idle', messageKey: '', signature: ''})
  })
}

function clearStaleConnectionState(id, signature) {
  const state = stateFor(id)
  if (state.status === 'testing' && state.signature === signature) {
    setConnectionState(id, {status: 'idle', messageKey: '', signature: ''})
  }
}

function ensureDraftSecrets() {
  if (!props.draftSecrets.providers || typeof props.draftSecrets.providers !== 'object') {
    props.draftSecrets.providers = {}
  }
  return props.draftSecrets.providers
}

function setProviderSecret(provider, value) {
  if (!provider?.id) {
    return
  }
  const providers = ensureDraftSecrets()
  const field = provider.auth?.secretRef?.split('.').pop() || 'apiKey'
  const current = providers[provider.id] || {}
  const normalized = String(value || '').trim()
  if (normalized) {
    providers[provider.id] = {...current, [field]: normalized}
    return
  }

  const next = {...current}
  delete next[field]
  if (Object.keys(next).length) {
    providers[provider.id] = next
  } else {
    delete providers[provider.id]
  }
}

function updateProviderCredential(event) {
  setProviderSecret(selectedProvider.value, event.target.value)
  invalidateConnectionState()
}

function deleteProviderCredential() {
  setProviderSecret(selectedProvider.value, '')
  invalidateConnectionState()
  showApiKey.value = false
}

function updateTranslationEnabled(event) {
  if (!controlsDisabled.value) {
    props.draft.translation.enabled = event.target.checked
  }
}

function updateTriggerKey(event) {
  if (!controlsDisabled.value) {
    props.draft.translation.triggerKey = event.target.value
  }
}

function updateGeminiModel(event) {
  if (controlsDisabled.value) {
    return
  }
  props.draft.translation.geminiModel = normalizeGeminiModelId(event.target.value)
  invalidateConnectionState('gemini')
}

function triggerOptions() {
  const labels = triggerLabels.value
  return [
    {value: 'none', label: text('SETTINGS_TRANSLATION_TRIGGER_NONE')},
    {value: 'ctrl', label: text('SETTINGS_TRANSLATION_TRIGGER_PRIMARY', [labels.ctrl])},
    {value: 'alt', label: text('SETTINGS_TRANSLATION_TRIGGER_ALT', [labels.alt])},
    {value: 'ctrlalt', label: text('SETTINGS_TRANSLATION_TRIGGER_PRIMARY_ALT', [labels.ctrl, labels.alt])}
  ]
}

function cardProviderId(card) {
  if (card.id === 'deepl') {
    if (selectedIsDeepL.value) {
      return selectedProviderId.value
    }
    if (['deepl-free', 'deepl-pro'].includes(activeProviderId.value)) {
      return activeProviderId.value
    }
  }
  return card.providerIds[0]
}

function cardIsSelected(card) {
  return card.providerIds.includes(selectedProviderId.value)
}

function cardIsActive(card) {
  return card.providerIds.includes(activeProviderId.value)
}

function cardStatusKind(card) {
  const id = cardProviderId(card)
  if (cardIsActive(card)) {
    return 'active'
  }
  if (id === CHROME_TRANSLATOR_PROVIDER_ID) {
    if (chromeState.value.phase === CHROME_TRANSLATOR_PHASES.DOWNLOADING) {
      return 'downloading'
    }
    if (chromeState.value.phase === CHROME_TRANSLATOR_PHASES.UNSUPPORTED || chromeState.value.phase === CHROME_TRANSLATOR_PHASES.UNAVAILABLE) {
      return 'unavailable'
    }
    if (chromeState.value.phase === CHROME_TRANSLATOR_PHASES.FAILED) {
      return 'error'
    }
    if (chromeState.value.phase === CHROME_TRANSLATOR_PHASES.AVAILABLE) {
      return 'configured'
    }
    return 'unconfigured'
  }

  const state = stateFor(id)
  if (state.status === 'testing') {
    return 'testing'
  }
  if (state.status === 'error') {
    return 'error'
  }
  return providerCredential(providerForId(id)) ? 'configured' : 'unconfigured'
}

function cardStatusKey(card) {
  const kind = cardStatusKind(card)
  if (kind === 'active') return 'SETTINGS_TRANSLATION_ACTIVE'
  if (kind === 'configured') {
    return cardIsSelected(card)
      ? 'SETTINGS_TRANSLATION_STATUS_CONFIGURED'
      : 'SETTINGS_TRANSLATION_STATUS_CONFIGURED_INACTIVE'
  }
  if (kind === 'testing') return 'SETTINGS_TRANSLATION_TESTING'
  if (kind === 'downloading') return 'SETTINGS_TRANSLATION_STATUS_DOWNLOADING'
  if (kind === 'unavailable') return 'SETTINGS_TRANSLATION_STATUS_UNAVAILABLE'
  if (kind === 'error') return 'SETTINGS_TRANSLATION_STATUS_ERROR'
  return 'SETTINGS_TRANSLATION_STATUS_UNCONFIGURED'
}

function cardStatusClass(card) {
  const kind = cardStatusKind(card)
  if (kind === 'configured' && cardIsSelected(card)) {
    return 'translation-service-row__status--configured-selected'
  }
  return 'translation-service-row__status--' + kind
}

function selectService(id) {
  if (formControlsDisabled.value || !providerForId(id)) {
    return
  }
  if (id !== selectedProviderId.value) {
    connectionRequestId += 1
  }
  selectedProviderId.value = id
}

function selectCard(card) {
  selectService(cardProviderId(card))
}

function applyChromeState(state) {
  if (state) {
    chromeState.value = state
  }
}

function attachChromeRuntime(runtime) {
  chromeRuntimeUnsubscribe?.()
  chromeRuntimeUnsubscribe = null
  chromeRuntime = runtime
  if (!runtime) {
    return
  }
  if (typeof runtime.getState === 'function') {
    applyChromeState(runtime.getState())
  }
  if (typeof runtime.subscribe === 'function') {
    chromeRuntimeUnsubscribe = runtime.subscribe(applyChromeState)
  }
}

function ensureChromeRuntime() {
  if (!chromeRuntime) {
    attachChromeRuntime(props.translatorRuntime || createChromeTranslatorRuntime({scope: globalThis, onStateChange: applyChromeState}))
  }
  return chromeRuntime
}

function destroyChromeRuntime() {
  chromeRuntimeUnsubscribe?.()
  chromeRuntimeUnsubscribe = null
  const runtime = chromeRuntime
  chromeRuntime = null
  if (typeof runtime?.destroy === 'function') {
    void runtime.destroy()
  }
}

function refreshChromeAvailability() {
  const runtime = ensureChromeRuntime()
  if (typeof runtime?.refreshAvailability === 'function') {
    void runtime.refreshAvailability().catch(() => {})
  }
}

function downloadChromeModel() {
  if (formControlsDisabled.value) {
    return
  }
  const runtime = ensureChromeRuntime()
  if (typeof runtime?.download === 'function') {
    void Promise.resolve(runtime.download()).catch(() => {})
  }
}

function openChromeModelManagement() {
  const tabs = globalThis.chrome?.tabs
  if (typeof tabs?.create !== 'function') {
    return
  }

  try {
    const result = tabs.create({url: CHROME_MODEL_MANAGEMENT_URL})
    if (result && typeof result.catch === 'function') {
      void result.catch(() => {})
    }
  } catch (_error) {
    // The Chrome API may be unavailable while the settings page is being unloaded.
  }
}

function chromeModelStatusKey() {
  const phase = chromeState.value.phase
  if (phase === CHROME_TRANSLATOR_PHASES.AVAILABLE) return 'SETTINGS_TRANSLATION_CHROME_MODEL_READY'
  if (phase === CHROME_TRANSLATOR_PHASES.DOWNLOADING) return 'SETTINGS_TRANSLATION_CHROME_MODEL_DOWNLOADING'
  if (phase === CHROME_TRANSLATOR_PHASES.DOWNLOADABLE) return 'SETTINGS_TRANSLATION_CHROME_MODEL_NEEDED'
  if (phase === CHROME_TRANSLATOR_PHASES.UNSUPPORTED) return 'SETTINGS_TRANSLATION_CHROME_UNSUPPORTED'
  if (phase === CHROME_TRANSLATOR_PHASES.UNAVAILABLE) return 'SETTINGS_TRANSLATION_CHROME_MODEL_UNAVAILABLE'
  if (phase === CHROME_TRANSLATOR_PHASES.FAILED) return 'SETTINGS_TRANSLATION_CHROME_DOWNLOAD_FAILED'
  return 'SETTINGS_TRANSLATION_CHROME_MODEL_NEEDED'
}

function chromeModelStatusClass() {
  const phase = chromeState.value.phase
  if (phase === CHROME_TRANSLATOR_PHASES.AVAILABLE) return 'translation-detail-badge--connected'
  if ([CHROME_TRANSLATOR_PHASES.FAILED, CHROME_TRANSLATOR_PHASES.UNAVAILABLE, CHROME_TRANSLATOR_PHASES.UNSUPPORTED].includes(phase)) {
    return 'translation-detail-badge--error'
  }
  return ''
}

function chromeCanDownload() {
  return [CHROME_TRANSLATOR_PHASES.DOWNLOADABLE, CHROME_TRANSLATOR_PHASES.FAILED].includes(chromeState.value.phase)
}

function chromeProgressWidth() {
  const value = Number(chromeState.value.progress)
  return Number.isFinite(value) ? Math.round(Math.max(0, Math.min(1, value)) * 100) + '%' : '0%'
}

function chromeDownloadStatusText() {
  const value = Number(chromeState.value.progress)
  if (!Number.isFinite(value)) {
    return text('SETTINGS_TRANSLATION_CHROME_DOWNLOAD_PROGRESS_INDETERMINATE')
  }
  return text('SETTINGS_TRANSLATION_CHROME_DOWNLOAD_PROGRESS_STATUS', [Math.round(Math.max(0, Math.min(1, value)) * 100)])
}

function chromeUnavailableReasonKeys() {
  return [
    'SETTINGS_TRANSLATION_CHROME_UNAVAILABLE_REASON_VERSION',
    'SETTINGS_TRANSLATION_CHROME_UNAVAILABLE_REASON_ENVIRONMENT',
    'SETTINGS_TRANSLATION_CHROME_UNAVAILABLE_REASON_REQUIREMENTS'
  ]
}

function connectionControlsDisabled(id = selectedProviderId.value) {
  return controlsDisabled.value || stateFor(id).status === 'testing'
}

async function runConnectionTest(provider) {
  const id = provider?.id || selectedProviderId.value
  if (!provider || connectionControlsDisabled(id)) {
    return
  }
  if (provider.auth?.mode !== PROVIDER_AUTH_MODES.NONE && !providerCredential(provider)) {
    setConnectionState(id, {status: 'error', messageKey: 'SETTINGS_TRANSLATION_API_KEY_MISSING', signature: ''})
    return
  }

  const requestId = ++connectionRequestId
  const signature = providerSignature(provider, id)
  setConnectionState(id, {status: 'testing', messageKey: '', signature})
  try {
    await testTranslationProvider(provider, {
      secrets: props.draftSecrets,
      targetLanguage: translation.value.targetLanguage || 'ko'
    })
    if (requestId !== connectionRequestId || signature !== providerSignature(provider, id)) {
      clearStaleConnectionState(id, signature)
      return
    }
    setConnectionState(id, {status: 'success', messageKey: 'SETTINGS_TRANSLATION_TEST_SUCCESS', signature})
  } catch (_error) {
    if (requestId !== connectionRequestId || signature !== providerSignature(provider, id)) {
      clearStaleConnectionState(id, signature)
      return
    }
    setConnectionState(id, {status: 'error', messageKey: 'SETTINGS_TRANSLATION_TEST_FAILURE', signature: ''})
  }
}

function testPresetConnection() {
  void runConnectionTest(selectedProvider.value)
}

function canActivateSelected() {
  const provider = selectedProvider.value
  if (!provider) {
    return false
  }
  return canActivateTranslationProvider({
    panel: selectedPanel.value,
    chromeReady: selectedIsChrome.value && chromeState.value.phase === CHROME_TRANSLATOR_PHASES.AVAILABLE,
    connectionStatus: stateFor(provider.id).status,
    connectionMatches: isConnectionSuccess(provider.id),
    hasCredential: Boolean(providerCredential(provider))
  })
}

function activateSelectedProvider() {
  if (controlsDisabled.value || !canActivateSelected()) {
    return
  }
  props.draft.translation.providerId = selectedProviderId.value
}

function detailDescriptionKey() {
  return selectedIsChrome.value
    ? 'SETTINGS_TRANSLATION_CHROME_PAGE_DESCRIPTION'
    : 'SETTINGS_TRANSLATION_EXTERNAL_PAGE_DESCRIPTION'
}

function detailBadgeKey() {
  if (activeProviderId.value === selectedProviderId.value) return 'SETTINGS_TRANSLATION_ACTIVE'
  if (selectedIsChrome.value) {
    if ([CHROME_TRANSLATOR_PHASES.UNSUPPORTED, CHROME_TRANSLATOR_PHASES.UNAVAILABLE].includes(chromeState.value.phase)) return 'SETTINGS_TRANSLATION_STATUS_UNAVAILABLE'
    if (chromeState.value.phase === CHROME_TRANSLATOR_PHASES.FAILED) return 'SETTINGS_TRANSLATION_ERROR_BADGE'
    if (chromeState.value.phase === CHROME_TRANSLATOR_PHASES.AVAILABLE) return 'SETTINGS_TRANSLATION_CONNECTED_BADGE'
    return 'SETTINGS_TRANSLATION_REQUIRED_BADGE'
  }
  if (stateFor(selectedProviderId.value).status === 'error') return 'SETTINGS_TRANSLATION_ERROR_BADGE'
  if (isConnectionSuccess(selectedProviderId.value)) return 'SETTINGS_TRANSLATION_CONNECTED_BADGE'
  return 'SETTINGS_TRANSLATION_REQUIRED_BADGE'
}

function detailBadgeClass() {
  const key = detailBadgeKey()
  if (key === 'SETTINGS_TRANSLATION_ACTIVE') return 'translation-detail-badge--active'
  if (key === 'SETTINGS_TRANSLATION_CONNECTED_BADGE') return 'translation-detail-badge--connected'
  if (key === 'SETTINGS_TRANSLATION_ERROR_BADGE' || key === 'SETTINGS_TRANSLATION_STATUS_UNAVAILABLE') return 'translation-detail-badge--error'
  return 'translation-detail-badge--required'
}

function resetGeminiModelState() {
  const model = normalizeGeminiModelId(translation.value.geminiModel)
  geminiModels.value = [model]
  geminiModelState.status = 'idle'
  geminiModelState.errorKey = ''
}

function geminiModelOptions() {
  const current = normalizeGeminiModelId(translation.value.geminiModel)
  return [...new Set([current, ...geminiModels.value])]
}

function geminiModelLabel(model) {
  const normalized = normalizeGeminiModelId(model)
  const parts = normalized.split('-')
  if (parts[0] !== 'gemini' || parts.length < 2) {
    return normalized
  }

  const variant = parts.slice(2).map(part => part.charAt(0).toUpperCase() + part.slice(1)).join('-')
  return ['Gemini', parts[1], variant].filter(Boolean).join(' ')
}

function geminiModelsDisabled() {
  return formControlsDisabled.value || anyConnectionTesting.value || !providerCredential(providerForId('gemini'))
}

async function loadGeminiModels() {
  const provider = providerForId('gemini')
  const credential = providerCredential(provider)
  if (geminiModelsDisabled()) {
    if (!credential) {
      geminiModelState.status = 'error'
      geminiModelState.errorKey = 'SETTINGS_TRANSLATION_API_KEY_MISSING'
    }
    return
  }

  const requestId = ++modelRequestId
  geminiModelState.status = 'loading'
  geminiModelState.errorKey = ''
  try {
    const models = await fetchGeminiModels(credential)
    if (requestId !== modelRequestId) {
      return
    }
    geminiModels.value = [...new Set([
      normalizeGeminiModelId(translation.value.geminiModel),
      ...models
    ])]
    geminiModelState.status = 'success'
  } catch (_error) {
    if (requestId !== modelRequestId) {
      return
    }
    geminiModelState.status = 'error'
    geminiModelState.errorKey = 'SETTINGS_TRANSLATION_GEMINI_MODEL_LIST_FAILURE'
  }
}

watch(selectedProviderId, (next, previous) => {
  showApiKey.value = false
  if (previous === CHROME_TRANSLATOR_PROVIDER_ID && next !== CHROME_TRANSLATOR_PROVIDER_ID) {
    destroyChromeRuntime()
  }
  if (next === CHROME_TRANSLATOR_PROVIDER_ID) {
    refreshChromeAvailability()
  }
}, {immediate: true})

watch(() => translation.value.targetLanguage, invalidateAllConnectionStates)
watch(() => translation.value.geminiModel, () => {
  invalidateConnectionState('gemini')
  if (!geminiModels.value.includes(normalizeGeminiModelId(translation.value.geminiModel))) {
    geminiModels.value = [normalizeGeminiModelId(translation.value.geminiModel), ...geminiModels.value]
  }
})
watch(() => [props.draftRevision, props.draftResetRevision], () => {
  invalidateAllConnectionStates()
  modelRequestId += 1
  resetGeminiModelState()
  if (selectedProviderId.value !== activeProviderId.value) {
    selectedProviderId.value = activeProviderId.value
  }
})

onActivated(() => {
  if (selectedIsChrome.value) {
    refreshChromeAvailability()
  }
})

resetGeminiModelState()

onBeforeUnmount(() => {
  connectionRequestId += 1
  modelRequestId += 1
  destroyChromeRuntime()
})
</script>

<template>
  <section class="translation-settings" data-testid="settings-translation">
    <div class="translation-settings__layout" data-testid="settings-translation-form">
      <section class="translation-settings__column">
        <div class="translation-settings__heading">
          <h2 id="settings-page-title-translation-service">{{ text('SETTINGS_TRANSLATION_SELECTOR_TITLE') }}</h2>
          <p>{{ text('SETTINGS_TRANSLATION_SELECTOR_HINT') }}</p>
        </div>

        <section class="translation-feature-card" data-testid="settings-translation-feature-card">
          <div class="translation-feature-card__header">
            <h3>{{ text('SETTINGS_TRANSLATION_ENABLED') }}</h3>
            <label class="translation-switch" for="settings-translation-enabled">
              <input id="settings-translation-enabled" type="checkbox" :checked="translation.enabled" :disabled="controlsDisabled" data-testid="settings-translation-enabled" @change="updateTranslationEnabled">
              <span class="translation-switch__track" aria-hidden="true"><span class="translation-switch__thumb" /></span>
              <span class="translation-switch__label">{{ text('SETTINGS_TRANSLATION_ENABLED') }}</span>
            </label>
          </div>
          <label class="translation-feature-card__trigger" for="settings-translation-trigger">
            <span>{{ text('SETTINGS_TRANSLATION_TRIGGER_LABEL') }}</span>
            <select id="settings-translation-trigger" :value="translation.triggerKey" :disabled="controlsDisabled" data-testid="settings-translation-trigger" @change="updateTriggerKey">
              <option v-for="option in triggerOptions()" :key="option.value" :value="option.value">{{ option.label }}</option>
            </select>
          </label>
        </section>

        <section class="translation-service-selector translation-settings__selector-card" data-testid="settings-translation-service-card">
          <h3>{{ text('SETTINGS_TRANSLATION_AVAILABLE_SERVICES') }}</h3>
          <div class="translation-service-list">
            <button v-for="card in serviceDefinitions" :key="card.id" type="button" class="translation-service-row" :class="{ 'translation-service-row--selected': cardIsSelected(card), 'translation-service-row--active': cardIsActive(card) }" :data-provider-id="card.id" :aria-pressed="cardIsSelected(card)" :disabled="formControlsDisabled" @click="selectCard(card)">
              <span class="translation-service-row__copy"><strong>{{ text(card.nameKey) }}</strong><small>{{ text(card.descriptionKey) }}</small></span>
              <span class="translation-service-row__status" :class="cardStatusClass(card)">{{ text(cardStatusKey(card)) }}</span>
            </button>
          </div>
        </section>
      </section>

      <section class="translation-settings__column">
        <div class="translation-settings__heading">
          <h2>{{ text('SETTINGS_TRANSLATION_DETAIL_TITLE') }}</h2>
          <p>{{ text(detailDescriptionKey()) }}</p>
        </div>

        <section class="translation-detail-card translation-settings__detail-card" :class="{ 'translation-detail-card--chrome': selectedIsChrome }" data-testid="settings-translation-detail-card">
          <template v-if="selectedIsChrome">
            <div class="translation-provider-card__header">
              <div>
                <h3>{{ text('SETTINGS_TRANSLATION_CHROME_NAME') }}</h3>
                <p>{{ text('SETTINGS_TRANSLATION_CHROME_CARD_DESCRIPTION') }}</p>
              </div>
            </div>

            <div class="translation-provider-card__content">
              <div class="translation-model-heading">
                <span>{{ text('SETTINGS_TRANSLATION_CHROME_MODEL') }}</span>
                <span class="translation-detail-badge translation-detail-badge--model" :class="chromeModelStatusClass()">{{ text(chromeModelStatusKey()) }}</span>
              </div>
              <div class="translation-fixed-pair">
                <strong>{{ text('SETTINGS_TRANSLATION_CHROME_LANGUAGE_PAIR_VALUE') }}</strong>
                <code>{{ text('SETTINGS_TRANSLATION_CHROME_LANGUAGE_PAIR_CODE') }}</code>
              </div>

              <div v-if="chromeState.phase === CHROME_TRANSLATOR_PHASES.DOWNLOADING" class="translation-download-progress" data-testid="settings-translation-chrome-progress">
                <p class="translation-download-progress__status">{{ chromeDownloadStatusText() }}</p>
                <div class="translation-download-progress__track"><span class="translation-download-progress__bar" :class="{ 'translation-download-progress__bar--indeterminate': chromeState.indeterminate }" :style="{ width: chromeState.indeterminate ? undefined : chromeProgressWidth() }" /></div>
              </div>
              <div v-else-if="[CHROME_TRANSLATOR_PHASES.UNAVAILABLE, CHROME_TRANSLATOR_PHASES.UNSUPPORTED].includes(chromeState.phase)" class="translation-chrome-unavailable-panel" role="alert">
                <h4>{{ text('SETTINGS_TRANSLATION_CHROME_UNAVAILABLE_TITLE') }}</h4>
                <ul><li v-for="key in chromeUnavailableReasonKeys()" :key="key">{{ text(key) }}</li></ul>
                <p>{{ text('SETTINGS_TRANSLATION_CHROME_UNAVAILABLE_UPDATE') }}</p>
              </div>

              <div v-if="chromeCanDownload() || (chromeState.phase === CHROME_TRANSLATOR_PHASES.AVAILABLE && activeProviderId !== CHROME_TRANSLATOR_PROVIDER_ID)" class="translation-detail-actions">
                <button v-if="chromeCanDownload()" type="button" class="translation-primary-button" :disabled="formControlsDisabled" data-testid="settings-translation-chrome-download" @click="downloadChromeModel">{{ text(chromeState.phase === CHROME_TRANSLATOR_PHASES.FAILED ? 'SETTINGS_TRANSLATION_CHROME_RETRY' : 'SETTINGS_TRANSLATION_CHROME_DOWNLOAD_BUTTON') }}</button>
                <button v-if="chromeState.phase === CHROME_TRANSLATOR_PHASES.AVAILABLE && activeProviderId !== CHROME_TRANSLATOR_PROVIDER_ID" type="button" class="translation-primary-button" :disabled="formControlsDisabled" data-testid="settings-translation-activate" @click="activateSelectedProvider">{{ text('SETTINGS_TRANSLATION_ACTIVATE') }}</button>
              </div>
            </div>

            <div class="translation-provider-card__footer">
              <button type="button" class="translation-external-link translation-external-link--button" data-testid="settings-translation-chrome-model-link" @click="openChromeModelManagement"><span>{{ text('SETTINGS_TRANSLATION_CHROME_MODEL_MANAGEMENT') }}</span><span aria-hidden="true">↗</span></button>
              <p>{{ text('SETTINGS_TRANSLATION_CHROME_NOTE') }}</p>
            </div>
          </template>

          <template v-else-if="selectedProvider">
            <div class="translation-provider-card__header">
              <div>
                <h3>{{ text(selectedIsDeepL ? 'SETTINGS_TRANSLATION_DEEPL_NAME' : 'SETTINGS_TRANSLATION_GEMINI_NAME') }}</h3>
                <p>{{ text('SETTINGS_TRANSLATION_EXTERNAL_CARD_DESCRIPTION') }}</p>
              </div>
              <span class="translation-detail-badge" :class="detailBadgeClass()">{{ text(detailBadgeKey()) }}</span>
            </div>

            <div class="translation-provider-card__content">
              <fieldset v-if="selectedIsDeepL" class="translation-plan-switch">
                <legend>{{ text('SETTINGS_TRANSLATION_DEEPL_VARIANT') }}</legend>
                <div><button type="button" :class="{ 'is-selected': selectedProviderId === 'deepl-free' }" :disabled="formControlsDisabled" @click="selectService('deepl-free')">{{ text('SETTINGS_TRANSLATION_DEEPL_FREE') }}</button><button type="button" :class="{ 'is-selected': selectedProviderId === 'deepl-pro' }" :disabled="formControlsDisabled" @click="selectService('deepl-pro')">{{ text('SETTINGS_TRANSLATION_DEEPL_PRO') }}</button></div>
              </fieldset>

              <div v-else class="translation-gemini-model-row">
                <label for="settings-translation-gemini-model">{{ text('SETTINGS_TRANSLATION_GEMINI_MODEL') }}</label>
                <div>
                  <select id="settings-translation-gemini-model" :value="translation.geminiModel" :disabled="formControlsDisabled" data-testid="settings-translation-gemini-model" @change="updateGeminiModel">
                    <option v-for="model in geminiModelOptions()" :key="model" :value="model">{{ geminiModelLabel(model) }}</option>
                  </select>
                  <button type="button" class="translation-secondary-button" :disabled="geminiModelsDisabled()" data-testid="settings-translation-gemini-model-fetch" @click="loadGeminiModels">{{ text(geminiModelState.status === 'loading' ? 'SETTINGS_TRANSLATION_GEMINI_MODEL_LOADING' : 'SETTINGS_TRANSLATION_GEMINI_MODEL_FETCH') }}</button>
                </div>
                <p v-if="geminiModelState.errorKey" class="translation-detail-result translation-detail-result--error" role="alert" data-testid="settings-translation-gemini-model-error">{{ text(geminiModelState.errorKey) }}</p>
              </div>

              <label class="translation-detail-field" for="settings-translation-preset-api-key">
                <span>{{ text('SETTINGS_TRANSLATION_API_KEY') }}</span>
                <div class="translation-secret-field">
                  <input id="settings-translation-preset-api-key" :value="providerCredential(selectedProvider)" :type="showApiKey ? 'text' : 'password'" autocomplete="new-password" :placeholder="text('SETTINGS_TRANSLATION_API_KEY_PLACEHOLDER')" :disabled="connectionControlsDisabled(selectedProvider.id)" data-testid="settings-translation-preset-api-key" @input="updateProviderCredential">
                  <button type="button" :aria-label="text(showApiKey ? 'SETTINGS_TRANSLATION_HIDE_KEY' : 'SETTINGS_TRANSLATION_SHOW_KEY')" :disabled="connectionControlsDisabled(selectedProvider.id)" @click="showApiKey = !showApiKey">{{ text(showApiKey ? 'SETTINGS_TRANSLATION_HIDE_KEY' : 'SETTINGS_TRANSLATION_SHOW_KEY') }}</button>
                  <button v-if="providerCredential(selectedProvider)" type="button" class="translation-secret-field__delete" :disabled="connectionControlsDisabled(selectedProvider.id)" data-testid="settings-translation-delete-key" @click="deleteProviderCredential">{{ text('SETTINGS_TRANSLATION_DELETE_KEY') }}</button>
                </div>
              </label>

              <div class="translation-detail-divider" aria-hidden="true" />
              <div class="translation-detail-actions">
                <button type="button" class="translation-secondary-button" :disabled="connectionControlsDisabled(selectedProvider.id)" data-testid="settings-translation-test" @click="testPresetConnection">{{ text(selectedConnectionState().status === 'testing' ? 'SETTINGS_TRANSLATION_TESTING' : 'SETTINGS_TRANSLATION_TEST') }}</button>
                <button v-if="activeProviderId !== selectedProviderId" type="button" class="translation-primary-button" :disabled="formControlsDisabled || !canActivateSelected()" data-testid="settings-translation-activate" @click="activateSelectedProvider">{{ text('SETTINGS_TRANSLATION_ACTIVATE') }}</button>
                <span v-else class="translation-active-label">{{ text('SETTINGS_TRANSLATION_ACTIVE') }}</span>
              </div>
              <p v-if="selectedConnectionState().messageKey" class="translation-detail-result" :class="'translation-detail-result--' + selectedConnectionState().status" :role="selectedConnectionState().status === 'error' ? 'alert' : 'status'" data-testid="settings-translation-test-result">{{ text(selectedConnectionState().messageKey) }}</p>
            </div>

            <div class="translation-provider-card__footer">
              <a class="translation-external-link" :data-testid="selectedIsDeepL ? 'settings-translation-deepl-key-link' : 'settings-translation-gemini-key-link'" :href="selectedIsDeepL ? 'https://www.deepl.com/your-account/keys' : 'https://aistudio.google.com/apikey'" target="_blank" rel="noopener noreferrer"><span>{{ text(selectedIsDeepL ? 'SETTINGS_TRANSLATION_DEEPL_KEY_LINK' : 'SETTINGS_TRANSLATION_GEMINI_KEY_LINK') }}</span><span aria-hidden="true">↗</span></a>
              <p>{{ text('SETTINGS_TRANSLATION_API_KEY_HINT') }}</p>
            </div>
          </template>
        </section>
      </section>
    </div>
  </section>
</template>

<style scoped>
.translation-settings { min-width: 0; }
.translation-settings__layout { display: grid; grid-template-columns: minmax(0, 428px) minmax(0, 428px); gap: 28px; align-items: start; }
.translation-settings__column { min-width: 0; }
.translation-settings__heading { height: 72px; }
.translation-settings__heading h2 { margin: 0; color: var(--naverdic-settings-text); font-size: 24px; font-weight: 700; line-height: 32px; }
.translation-settings__heading p { margin: 2px 0 0; color: var(--naverdic-settings-text-muted); font-size: 12px; line-height: 20px; }
.translation-feature-card, .translation-service-selector, .translation-detail-card { min-width: 0; background: var(--naverdic-settings-surface); border: 1px solid var(--naverdic-settings-border); border-radius: var(--naverdic-radius-md); box-shadow: var(--naverdic-card-shadow-default); }
.translation-feature-card { height: 120px; padding: 20px 23px 0; }
.translation-feature-card__header { display: flex; height: 37px; align-items: flex-start; justify-content: space-between; border-bottom: 1px solid var(--naverdic-settings-divider); }
.translation-feature-card h3 { margin: 0; color: var(--naverdic-settings-text); font-size: 16px; line-height: 24px; }
.translation-switch { position: relative; display: inline-flex; width: 40px; height: 22px; flex: 0 0 40px; cursor: pointer; }
.translation-switch input { position: absolute; width: 1px; height: 1px; opacity: 0; }
.translation-switch__track { display: flex; width: 40px; height: 22px; align-items: center; padding: 3px; background: var(--naverdic-settings-divider); border-radius: 99px; transition: background 120ms ease; }
.translation-switch__thumb { display: block; width: 16px; height: 16px; background: var(--naverdic-settings-surface); border-radius: 50%; box-shadow: 0 1px 2px rgb(0 0 0 / 16%); transition: transform 120ms ease; }
.translation-switch input:checked + .translation-switch__track { background: var(--naverdic-settings-primary); }
.translation-switch input:checked + .translation-switch__track .translation-switch__thumb { transform: translateX(18px); }
.translation-switch input:focus-visible + .translation-switch__track { outline: 2px solid var(--naverdic-color-focus); outline-offset: 2px; }
.translation-switch__label { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.translation-feature-card__trigger { display: flex; height: 62px; align-items: center; justify-content: space-between; gap: 16px; color: var(--naverdic-settings-text); font-size: 13px; font-weight: 500; line-height: 20px; }
.translation-feature-card__trigger select { width: 200px; min-width: 0; height: 40px; padding: 0 10px; color: var(--naverdic-settings-text); background: var(--naverdic-input-background-default); border: 1px solid var(--naverdic-input-border-default); border-radius: var(--naverdic-radius-sm); font: inherit; font-size: 13px; font-weight: 400; }
.translation-service-selector { height: 374px; margin-top: 16px; padding: 20px 23px 23px; }
.translation-service-selector h3 { margin: 0; color: var(--naverdic-settings-text); font-size: 16px; line-height: 24px; }
.translation-service-list { display: flex; flex-direction: column; gap: 8px; margin-top: 20px; }
.translation-service-row { position: relative; display: flex; width: 100%; height: 90px; align-items: center; justify-content: space-between; gap: 12px; padding: 0 15px; color: var(--naverdic-settings-text); background: var(--naverdic-settings-surface); border: 1px solid var(--naverdic-settings-border); border-radius: 8px; text-align: left; cursor: pointer; }
.translation-service-row:hover { background: #f8fafd; }
.translation-service-row--selected { background: #f0f6ff; }
.translation-service-row--selected::before { position: absolute; top: 17px; left: -1px; width: 3px; height: 54px; background: var(--naverdic-settings-primary); content: ''; }
.translation-service-row--active { border-color: var(--naverdic-settings-border); }
.translation-service-row:focus-visible, .translation-settings button:focus-visible, .translation-settings input:focus-visible, .translation-settings select:focus-visible, .translation-settings a:focus-visible { outline: 2px solid var(--naverdic-color-focus); outline-offset: 2px; }
.translation-service-row__copy { display: flex; min-width: 0; flex-direction: column; gap: 0; }
.translation-service-row__copy strong { color: inherit; font-size: 13px; line-height: 22px; }
.translation-service-row__copy small { color: var(--naverdic-settings-text-muted); font-size: 12px; line-height: 32px; }
.translation-service-row__status, .translation-detail-badge { display: inline-flex; width: 66px; height: 24px; flex: 0 0 66px; align-items: center; justify-content: center; padding: 0; border-radius: 999px; font-size: 10px; font-weight: 700; line-height: 24px; white-space: nowrap; }
.translation-service-row__status--active, .translation-detail-badge--active { color: #fff; background: var(--naverdic-settings-primary); }
.translation-service-row__status--configured { color: var(--naverdic-settings-text-subtle); background: #f5f7fa; }
.translation-service-row__status--configured-selected { color: var(--naverdic-settings-success); background: #ebf8f2; }
.translation-service-row__status--testing, .translation-service-row__status--downloading, .translation-detail-badge--connected { color: var(--naverdic-settings-primary-text); background: var(--naverdic-settings-info); }
.translation-service-row__status--unconfigured, .translation-detail-badge--required { color: var(--naverdic-settings-text-muted); background: var(--naverdic-settings-page); }
.translation-service-row__status--unavailable, .translation-service-row__status--error, .translation-detail-badge--error { color: var(--naverdic-color-danger); background: var(--naverdic-settings-danger-hover); }
.translation-detail-card { position: relative; display: flex; height: 510px; min-height: 510px; flex-direction: column; padding: 15px 23px 14px; overflow: hidden; box-shadow: none; }
.translation-provider-card__header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.translation-provider-card__header h3 { margin: 0; color: var(--naverdic-settings-text); font-size: 17px; line-height: 26px; }
.translation-provider-card__header p { max-width: 300px; margin: 6px 0 0; color: var(--naverdic-settings-text-muted); font-size: 12px; line-height: 32px; }
.translation-provider-card__content { min-height: 0; flex: 1 1 auto; padding-top: 12px; }
.translation-model-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; color: var(--naverdic-settings-text); font-size: 11px; font-weight: 700; line-height: 18px; }
.translation-detail-badge--model { color: var(--naverdic-settings-primary-text); background: var(--naverdic-settings-info); }
.translation-detail-badge--model.translation-detail-badge--connected { color: var(--naverdic-settings-success); background: #EBF8F2; }
.translation-detail-badge--model.translation-detail-badge--error { color: var(--naverdic-color-danger); background: var(--naverdic-settings-danger-hover); }
.translation-fixed-pair { display: flex; height: 54px; align-items: center; justify-content: space-between; gap: 12px; margin-top: 8px; padding: 0 15px; background: #F8FAFD; border: 1px solid var(--naverdic-settings-border); border-radius: 8px; }
.translation-fixed-pair strong { color: var(--naverdic-settings-text); font-size: 13px; line-height: 20px; }
.translation-fixed-pair code { color: var(--naverdic-settings-primary-text); font-size: 12px; font-weight: 500; }
.translation-status-line { display: flex; align-items: center; justify-content: space-between; margin-top: 12px; color: var(--naverdic-settings-text-muted); font-size: 10px; line-height: 16px; }
.translation-status-line strong { color: var(--naverdic-settings-text); font-size: 11px; }
.translation-status-line strong.is-ready { color: var(--naverdic-settings-primary-text); }
.translation-status-line strong.is-error { color: var(--naverdic-color-danger); }
.translation-download-progress { margin-top: 18px; }
.translation-download-progress__labels { display: flex; justify-content: space-between; color: var(--naverdic-settings-text); font-size: 10px; line-height: 16px; }
.translation-download-progress__track { height: 8px; margin-top: 7px; overflow: hidden; background: var(--naverdic-settings-divider); border-radius: 99px; }
.translation-download-progress__bar { display: block; height: 100%; background: var(--naverdic-settings-primary); border-radius: inherit; }
.translation-download-progress__bar--indeterminate { width: 45%; animation: translation-progress 1.2s ease-in-out infinite; }
.translation-download-progress p { margin: 7px 0 0; color: var(--naverdic-settings-text-muted); font-size: 10px; line-height: 17px; }
@keyframes translation-progress { from { transform: translateX(-100%); } to { transform: translateX(230%); } }
.translation-detail-callout { margin-top: 16px; padding: 10px 12px; color: var(--naverdic-settings-primary-text); background: var(--naverdic-settings-info); border-radius: 8px; font-size: 10px; line-height: 17px; }
.translation-detail-callout--error { color: var(--naverdic-color-danger); background: var(--naverdic-settings-danger-hover); }
.translation-detail-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 18px; }
.translation-detail-actions > button { min-height: 38px; }
.translation-detail-actions > [data-testid="settings-translation-test"] { width: 110px; }
.translation-detail-actions > [data-testid="settings-translation-activate"] { width: 124px; }
.translation-primary-button, .translation-secondary-button, .translation-text-button { min-height: 36px; padding: 0 13px; border-radius: var(--naverdic-radius-sm); font-size: 11px; font-weight: 700; cursor: pointer; }
.translation-primary-button { color: #fff; background: var(--naverdic-settings-primary); border: 1px solid var(--naverdic-settings-primary); }
.translation-secondary-button { color: var(--naverdic-settings-primary-text); background: var(--naverdic-settings-surface); border: 1px solid var(--naverdic-settings-primary-light, #bfdbfe); }
.translation-text-button { min-height: 24px; align-self: flex-start; padding: 0 2px; color: var(--naverdic-settings-primary-text); background: transparent; border: 0; }
.translation-primary-button:disabled, .translation-secondary-button:disabled, .translation-text-button:disabled, .translation-service-row:disabled { opacity: .55; cursor: not-allowed; }
.translation-active-label { color: var(--naverdic-settings-primary-text); font-size: 11px; font-weight: 700; }
.translation-plan-switch { margin: 0; padding: 0; border: 0; }
.translation-plan-switch legend { margin-bottom: 8px; color: var(--naverdic-settings-text); font-size: 11px; font-weight: 700; line-height: 18px; }
.translation-plan-switch > div { display: flex; width: 100%; padding: 3px; background: var(--naverdic-settings-page); border-radius: 7px; }
.translation-plan-switch button { width: 50%; height: 38px; padding: 0 10px; color: var(--naverdic-settings-text-muted); background: transparent; border: 0; border-radius: 5px; font-size: 10px; font-weight: 700; cursor: pointer; }
.translation-plan-switch button.is-selected { color: var(--naverdic-settings-primary-text); background: var(--naverdic-settings-surface); box-shadow: var(--naverdic-card-shadow-default); }
.translation-gemini-model-row { display: flex; min-width: 0; flex-direction: column; }
.translation-gemini-model-row > label { margin-bottom: 6px; color: var(--naverdic-settings-text); font-size: 12px; font-weight: 500; line-height: 20px; }
.translation-gemini-model-row > div { display: grid; min-width: 0; grid-template-columns: minmax(0, 246px) minmax(0, 122px); gap: 12px; }
.translation-gemini-model-row select { width: 100%; min-width: 0; height: 44px; padding: 0 10px; color: var(--naverdic-settings-text); background: var(--naverdic-input-background-default); border: 1px solid var(--naverdic-input-border-default); border-radius: var(--naverdic-radius-sm); font: inherit; font-size: 12px; font-weight: 500; }
.translation-gemini-model-row .translation-secondary-button { width: 100%; min-width: 0; }
.translation-detail-field { display: flex; min-width: 0; flex-direction: column; gap: 6px; margin-top: 12px; color: var(--naverdic-settings-text); font-size: 12px; font-weight: 500; line-height: 20px; }
.translation-secret-field { display: flex; min-width: 0; height: 44px; align-items: center; gap: 6px; padding: 7px 15px 7px 7px; background: var(--naverdic-settings-surface); border: 1px solid var(--naverdic-input-border-default); border-radius: var(--naverdic-radius-sm); }
.translation-secret-field input { width: 100%; min-width: 0; height: 28px; padding: 0 6px; color: var(--naverdic-settings-text); background: transparent; border: 0; border-radius: 0; font: inherit; font-size: 13px; font-weight: 400; }
.translation-secret-field button { flex: 0 0 auto; min-width: 58px; height: 28px; padding: 0 8px; color: var(--naverdic-settings-primary-text); background: var(--naverdic-settings-surface); border: 1px solid var(--naverdic-input-border-default); border-radius: 7px; font-size: 11px; font-weight: 700; cursor: pointer; }
.translation-secret-field__delete { min-width: 66px !important; color: var(--naverdic-color-danger) !important; }
.translation-detail-divider { height: 1px; margin-top: 18px; background: var(--naverdic-settings-divider); }
.translation-detail-divider + .translation-detail-actions { margin-top: 15px; }
.translation-detail-result { margin: 12px 0 0; font-size: 11px; line-height: 24px; }
.translation-detail-result--success { color: var(--naverdic-settings-primary-text); }
.translation-detail-result--error { margin-top: 19px; padding: 10px 12px; color: var(--naverdic-color-danger); background: var(--naverdic-settings-danger-hover); border-radius: 8px; }
.translation-provider-card__footer { margin-top: auto; padding-top: 15px; border-top: 1px solid var(--naverdic-settings-divider); }
.translation-external-link { display: inline-flex; align-items: center; gap: 7px; color: var(--naverdic-settings-primary-text); font-size: 11px; font-weight: 700; line-height: 17px; text-decoration: none; }
.translation-external-link--button { padding: 0; background: transparent; border: 0; text-align: left; cursor: pointer; }
.translation-external-link > span:first-child { text-decoration: underline; text-underline-offset: 2px; }
.translation-external-link > span[aria-hidden="true"] { text-decoration: none; }

/* Provider-specific card geometry follows the current Figma provider states. */
.translation-detail-card--chrome { display: block; padding: 0; }
.translation-detail-card--chrome .translation-provider-card__header { position: absolute; inset: 16px 23px auto; display: block; }
.translation-detail-card--chrome .translation-provider-card__header p { max-width: none; margin-top: 6px; line-height: 17px; }
.translation-detail-card--chrome .translation-provider-card__content { position: static; height: 100%; padding: 0; }
.translation-detail-card--chrome .translation-model-heading { position: absolute; top: 115px; left: 23px; right: 23px; height: 24px; color: var(--naverdic-settings-nav-text); font-size: 12px; font-weight: 500; line-height: 20px; }
.translation-detail-card--chrome .translation-detail-badge--model { width: 108px; height: 24px; min-height: 24px; justify-content: center; padding: 0; font-size: 10px; line-height: 24px; }
.translation-detail-card--chrome .translation-fixed-pair { position: absolute; top: 147px; left: 23px; right: 23px; margin: 0; }
.translation-detail-card--chrome .translation-download-progress { position: absolute; top: 219px; left: 23px; right: 23px; margin: 0; }
.translation-detail-card--chrome .translation-download-progress__status { margin: 0; color: var(--naverdic-settings-text-muted); font-size: 11px; line-height: 20px; }
.translation-detail-card--chrome .translation-download-progress__track { margin-top: 8px; }
.translation-detail-card--chrome .translation-detail-actions { position: absolute; top: 221px; left: 23px; right: 23px; margin: 0; }
.translation-detail-card--chrome .translation-detail-actions > button { width: 124px; }
.translation-chrome-unavailable-panel { position: absolute; top: 219px; left: 23px; right: 23px; height: 140px; padding: 14px 16px; color: var(--naverdic-settings-text-muted); background: var(--naverdic-settings-danger-hover); border-radius: 8px; }
.translation-chrome-unavailable-panel h4 { margin: 0; color: var(--naverdic-color-danger); font-size: 12px; font-weight: 700; line-height: 22px; }
.translation-chrome-unavailable-panel ul { height: 58px; margin: 6px 0 0; padding: 0; list-style: none; font-size: 11px; line-height: 18px; }
.translation-chrome-unavailable-panel li::before { content: '• '; }
.translation-chrome-unavailable-panel p { margin: 8px 0 0; font-size: 11px; line-height: 20px; }
.translation-detail-card--chrome .translation-provider-card__footer { position: absolute; top: 434px; left: 23px; right: 23px; margin: 0; padding-top: 15px; }
.translation-detail-card--chrome .translation-external-link { font-size: 12px; font-weight: 500; line-height: 16px; }
.translation-provider-card__footer p { margin: 9px 0 0; color: var(--naverdic-settings-text-muted); font-size: 11px; line-height: 20px; }
.translation-detail-card--chrome .translation-provider-card__footer p { margin-top: 9px; font-size: 11px; line-height: 20px; }
.translation-detail-card:not(.translation-detail-card--chrome) .translation-external-link { font-size: 12px; font-weight: 500; line-height: 16px; }
@media (max-width: 1050px) {
  .translation-settings__layout { grid-template-columns: minmax(0, 1fr); }
}
@media (max-width: 600px) {
  .translation-feature-card__trigger { gap: 10px; }
  .translation-feature-card__trigger select { width: min(200px, 55%); }
  .translation-service-row { padding: 0 12px; }
  .translation-detail-card { height: auto; min-height: 510px; }
  .translation-gemini-model-row > div { grid-template-columns: minmax(0, 1fr); }
  .translation-gemini-model-row select { width: 100%; }
  .translation-gemini-model-row .translation-secondary-button { width: 100%; }
  .translation-detail-card--chrome .translation-provider-card__header { right: 23px; }
}
</style>
