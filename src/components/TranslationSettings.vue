<script setup>
import {computed, onBeforeUnmount, reactive, ref, watch} from 'vue'
import {getText} from '/src/text.js'
import {CHROME_TRANSLATOR_ERROR_CODES, CHROME_TRANSLATOR_PHASES, createChromeTranslatorRuntime} from '/src/chrome-translator.mjs'
import {getProviderPreset, PROVIDER_AUTH_MODES} from '/src/translation-provider.mjs'
import {getProviderCredential} from '/src/translation-settings.mjs'
import {canActivateTranslationProvider, getTranslationSettingsPanel, isTranslationConnectionLocked, TRANSLATION_SETTINGS_PANELS} from '/src/translation-settings-state.mjs'
import {testTranslationProvider} from '/src/translation-testing.mjs'

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

const CHROME_ID = 'chrome-translator'
const DEFAULT_PROVIDER_ID = 'deepl-free'
const GEMINI_MODEL_ID = 'gemini-3.5-flash'
const PRESET_IDS = new Set(['deepl-free', 'deepl-pro', 'gemini'])
const serviceDefinitions = Object.freeze([
  Object.freeze({id: CHROME_ID, providerIds: [CHROME_ID], nameKey: 'SETTINGS_TRANSLATION_CHROME_NAME', descriptionKey: 'SETTINGS_TRANSLATION_CHROME_DESCRIPTION'}),
  Object.freeze({id: 'deepl', providerIds: ['deepl-free', 'deepl-pro'], nameKey: 'SETTINGS_TRANSLATION_DEEPL_NAME', descriptionKey: 'SETTINGS_TRANSLATION_DEEPL_DESCRIPTION'}),
  Object.freeze({id: 'gemini', providerIds: ['gemini'], nameKey: 'SETTINGS_TRANSLATION_GEMINI_NAME', descriptionKey: 'SETTINGS_TRANSLATION_GEMINI_DESCRIPTION'})
])
const translation = computed(() => props.draft.translation || {})
const activeProviderId = computed(() => PRESET_IDS.has(translation.value.providerId) || translation.value.providerId === CHROME_ID ? translation.value.providerId : DEFAULT_PROVIDER_ID)
const selectedProviderId = ref(activeProviderId.value)
const selectedPanel = computed(() => getTranslationSettingsPanel(selectedProviderId.value))
const selectedProvider = computed(() => getProviderPreset(selectedProviderId.value))
const selectedIsChrome = computed(() => selectedPanel.value === TRANSLATION_SETTINGS_PANELS.CHROME)
const isDeepL = computed(() => ['deepl-free', 'deepl-pro'].includes(selectedProviderId.value))
const controlsDisabled = computed(() => props.isLoading || props.isSaving)
const connectionStates = reactive({})
const anyConnectionTesting = computed(() => Object.values(connectionStates).some(state => state?.status === 'testing'))
const formControlsDisabled = computed(() => controlsDisabled.value || anyConnectionTesting.value)
const showApiKey = ref(false)
const geminiModel = ref(GEMINI_MODEL_ID)
let connectionRequestId = 0
const chromeState = ref({supported: false, availability: null, phase: CHROME_TRANSLATOR_PHASES.CHECKING, progress: null, indeterminate: false, errorCode: null, errorName: '', errorMessage: ''})
let chromeRuntime = null
let chromeRuntimeUnsubscribe = null

function text(key, placeholders = undefined) { return getText(key, placeholders) }
function stateFor(id) { return connectionStates[id] || {status: 'idle', messageKey: '', signature: ''} }
function providerCredential(provider) { return getProviderCredential(provider, props.draftSecrets) }
function providerSignature(provider, id = provider?.id || '') {
  return provider
    ? JSON.stringify({
      provider,
      credential: providerCredential(provider),
      targetLanguage: translation.value.targetLanguage || '',
      model: provider.id === 'gemini' ? geminiModel.value : ''
    })
    : id + ':empty'
}
function isConnectionSuccess(id) { const state = stateFor(id); return state.status === 'success' && state.signature === providerSignature(getProviderPreset(id), id) }
function setConnectionState(id, patch) { connectionStates[id] = {...stateFor(id), ...patch} }
function invalidateConnectionState(id = selectedProviderId.value) { connectionRequestId += 1; setConnectionState(id, {status: 'idle', messageKey: '', signature: ''}) }
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
  if (!props.draftSecrets.providers || typeof props.draftSecrets.providers !== 'object') props.draftSecrets.providers = {}
  return props.draftSecrets.providers
}
function setProviderSecret(provider, value) {
  if (!provider?.id) return
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
  if (Object.keys(next).length) providers[provider.id] = next
  else delete providers[provider.id]
}
function updatePresetCredential(event) { setProviderSecret(selectedProvider.value, event.target.value); invalidateConnectionState() }
function deletePresetCredential() { setProviderSecret(selectedProvider.value, ''); invalidateConnectionState(); showApiKey.value = false }
function updateTargetLanguage(event) {
  translation.value.targetLanguage = event.target.value
  invalidateAllConnectionStates()
}
function cardProviderId(card) {
  if (card.id === 'deepl') {
    if (isDeepL.value) return selectedProviderId.value
    if (['deepl-free', 'deepl-pro'].includes(activeProviderId.value)) return activeProviderId.value
  }
  return card.providerIds[0]
}
function cardIsSelected(card) { return card.providerIds.includes(selectedProviderId.value) }
function cardIsActive(card) { return card.providerIds.includes(activeProviderId.value) }
function cardStatusKind(card) {
  const id = cardProviderId(card)
  if (cardIsActive(card)) return 'active'
  if (id === CHROME_ID) {
    if (chromeState.value.phase === CHROME_TRANSLATOR_PHASES.DOWNLOADING) return 'downloading'
    if ([CHROME_TRANSLATOR_PHASES.UNSUPPORTED, CHROME_TRANSLATOR_PHASES.UNAVAILABLE, CHROME_TRANSLATOR_PHASES.FAILED].includes(chromeState.value.phase)) return 'error'
    if (chromeState.value.phase === CHROME_TRANSLATOR_PHASES.AVAILABLE) return 'configured'
    return 'unconfigured'
  }
  const state = stateFor(id)
  if (state.status === 'testing') return 'testing'
  if (state.status === 'error') return 'error'
  return providerCredential(getProviderPreset(id)) ? 'configured' : 'unconfigured'
}
function cardStatusKey(card) {
  const kind = cardStatusKind(card)
  if (kind === 'active') return 'SETTINGS_TRANSLATION_ACTIVE'
  if (kind === 'configured') return 'SETTINGS_TRANSLATION_STATUS_CONFIGURED'
  if (kind === 'testing') return 'SETTINGS_TRANSLATION_TESTING'
  if (kind === 'downloading') return 'SETTINGS_TRANSLATION_STATUS_DOWNLOADING'
  if (kind === 'error') return 'SETTINGS_TRANSLATION_STATUS_ERROR'
  return 'SETTINGS_TRANSLATION_STATUS_UNCONFIGURED'
}
function cardStatusClass(card) { return 'translation-service-row__status--' + cardStatusKind(card) }
function selectService(id) {
  if (formControlsDisabled.value || !getProviderPreset(id)) return
  if (id !== selectedProviderId.value) connectionRequestId += 1
  selectedProviderId.value = id
}
function selectCard(card) { selectService(cardProviderId(card)) }
function toggleTranslation(event) { if (!controlsDisabled.value) props.draft.translation.enabled = event.target.checked }
function applyChromeState(state) { if (state) chromeState.value = state }
function attachChromeRuntime(runtime) {
  chromeRuntimeUnsubscribe?.()
  chromeRuntimeUnsubscribe = null
  chromeRuntime = runtime
  if (!runtime) return
  if (typeof runtime.getState === 'function') applyChromeState(runtime.getState())
  if (typeof runtime.subscribe === 'function') chromeRuntimeUnsubscribe = runtime.subscribe(applyChromeState)
}
function ensureChromeRuntime() {
  if (!chromeRuntime) attachChromeRuntime(props.translatorRuntime || createChromeTranslatorRuntime({scope: globalThis, onStateChange: applyChromeState}))
  return chromeRuntime
}
function destroyChromeRuntime() {
  chromeRuntimeUnsubscribe?.()
  chromeRuntimeUnsubscribe = null
  const runtime = chromeRuntime
  chromeRuntime = null
  if (typeof runtime?.destroy === 'function') void runtime.destroy()
}
function refreshChromeAvailability() {
  const runtime = ensureChromeRuntime()
  if (typeof runtime?.refreshAvailability === 'function') void runtime.refreshAvailability().catch(() => {})
}
function downloadChromeModel() {
  if (formControlsDisabled.value) return
  const runtime = ensureChromeRuntime()
  if (typeof runtime?.download === 'function') void Promise.resolve(runtime.download()).catch(() => {})
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
function chromeGuidanceKey() {
  const state = chromeState.value
  if (state.phase === CHROME_TRANSLATOR_PHASES.UNSUPPORTED) return 'SETTINGS_TRANSLATION_CHROME_UNSUPPORTED_GUIDANCE'
  if (state.phase === CHROME_TRANSLATOR_PHASES.UNAVAILABLE) return 'SETTINGS_TRANSLATION_CHROME_UNAVAILABLE_GUIDANCE'
  if (state.phase === CHROME_TRANSLATOR_PHASES.FAILED) return 'SETTINGS_TRANSLATION_CHROME_DOWNLOAD_FAILED_HINT'
  if (state.errorCode === CHROME_TRANSLATOR_ERROR_CODES.NETWORK) return 'SETTINGS_TRANSLATION_CHROME_NETWORK_ERROR'
  if (state.errorCode === CHROME_TRANSLATOR_ERROR_CODES.NOT_ALLOWED) return 'SETTINGS_TRANSLATION_CHROME_PERMISSION_ERROR'
  return 'SETTINGS_TRANSLATION_CHROME_DOWNLOAD_PROGRESS_HINT'
}
function chromeCanDownload() { return [CHROME_TRANSLATOR_PHASES.DOWNLOADABLE, CHROME_TRANSLATOR_PHASES.FAILED].includes(chromeState.value.phase) }
function chromeProgressWidth() {
  const value = Number(chromeState.value.progress)
  return Number.isFinite(value) ? Math.round(Math.max(0, Math.min(1, value)) * 100) + '%' : '0%'
}
function selectedConnectionState() { return stateFor(selectedProviderId.value) }
function connectionControlsDisabled(id = selectedProviderId.value) {
  return isTranslationConnectionLocked({globallyDisabled: formControlsDisabled.value, connectionStatus: stateFor(id).status})
}
async function runConnectionTest(provider) {
  const id = provider?.id || selectedProviderId.value
  if (!provider || connectionControlsDisabled(id)) return
  if (provider.auth?.mode !== PROVIDER_AUTH_MODES.NONE && !providerCredential(provider)) {
    setConnectionState(id, {status: 'error', messageKey: 'SETTINGS_TRANSLATION_API_KEY_MISSING', signature: ''})
    return
  }
  const requestId = ++connectionRequestId
  const signature = providerSignature(provider, id)
  setConnectionState(id, {status: 'testing', messageKey: '', signature})
  try {
    await testTranslationProvider(provider, {secrets: props.draftSecrets, targetLanguage: translation.value.targetLanguage})
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
function testPresetConnection() { void runConnectionTest(selectedProvider.value) }
function canActivateSelected() {
  const provider = selectedProvider.value
  if (!provider) return false
  return canActivateTranslationProvider({
    panel: selectedPanel.value,
    chromeReady: selectedIsChrome.value && chromeState.value.phase === CHROME_TRANSLATOR_PHASES.AVAILABLE,
    connectionStatus: stateFor(provider.id).status,
    connectionMatches: isConnectionSuccess(provider.id),
    hasCredential: Boolean(providerCredential(provider))
  })
}
function activateSelectedProvider() {
  if (formControlsDisabled.value || !canActivateSelected()) return
  props.draft.translation.providerId = selectedProviderId.value
  if (selectedIsChrome.value) props.draft.translation.targetLanguage = 'ko'
}
function detailBadgeKey() {
  if (activeProviderId.value === selectedProviderId.value) return 'SETTINGS_TRANSLATION_ACTIVE'
  if (selectedIsChrome.value) return chromeState.value.phase === CHROME_TRANSLATOR_PHASES.AVAILABLE ? 'SETTINGS_TRANSLATION_STATUS_CONFIGURED' : 'SETTINGS_TRANSLATION_STATUS_UNCONFIGURED'
  return providerCredential(selectedProvider.value) ? 'SETTINGS_TRANSLATION_STATUS_CONFIGURED' : 'SETTINGS_TRANSLATION_STATUS_UNCONFIGURED'
}
function detailBadgeClass() {
  if (activeProviderId.value === selectedProviderId.value) return 'translation-detail-badge--active'
  return detailBadgeKey().endsWith('CONFIGURED') ? 'translation-detail-badge--connected' : 'translation-detail-badge--required'
}
watch(selectedProviderId, (next, previous) => {
  showApiKey.value = false
  if (previous === CHROME_ID && next !== CHROME_ID) destroyChromeRuntime()
  if (next === CHROME_ID) refreshChromeAvailability()
})
watch(() => translation.value.targetLanguage, () => invalidateAllConnectionStates())
watch(geminiModel, () => invalidateAllConnectionStates())
watch(() => [props.draftRevision, props.draftResetRevision], () => {
  invalidateAllConnectionStates()
  if (selectedProviderId.value !== activeProviderId.value) selectedProviderId.value = activeProviderId.value
})
onBeforeUnmount(() => { connectionRequestId += 1; destroyChromeRuntime() })
</script>

<template>
  <section class="translation-settings" data-testid="settings-translation">
    <div class="translation-settings__layout" data-testid="settings-translation-form">
      <section class="translation-settings__column">
        <div class="translation-settings__heading"><h2 id="settings-page-title-translation-service">{{ text('SETTINGS_TRANSLATION_SELECTOR_TITLE') }}</h2><p>{{ text('SETTINGS_TRANSLATION_SELECTOR_HINT') }}</p></div>
        <div class="translation-settings__selector-card">
          <div class="translation-settings__selector-card-heading">
            <div><h3>{{ text('SETTINGS_TRANSLATION_AVAILABLE_SERVICES') }}</h3><p>{{ text('SETTINGS_TRANSLATION_AVAILABLE_SERVICES_HINT') }}</p></div>
            <label class="settings-switch settings-switch--compact" for="settings-translation-enabled"><input id="settings-translation-enabled" type="checkbox" :checked="translation.enabled" :disabled="controlsDisabled" data-testid="settings-translation-enabled" @change="toggleTranslation"><span class="settings-switch__track" aria-hidden="true"><span class="settings-switch__thumb" /></span><span class="settings-switch__label">{{ text('SETTINGS_TRANSLATION_ENABLED') }}</span></label>
          </div>
          <div class="translation-settings__service-list">
            <button v-for="card in serviceDefinitions" :key="card.id" type="button" class="translation-service-row" :class="{ 'translation-service-row--selected': cardIsSelected(card), 'translation-service-row--active': cardIsActive(card) }" :data-provider-id="card.id" :disabled="formControlsDisabled" @click="selectCard(card)">
              <span class="translation-service-row__copy"><strong>{{ text(card.nameKey) }}</strong><small>{{ text(card.descriptionKey) }}</small></span>
              <span class="translation-service-row__status" :class="cardStatusClass(card)">{{ text(cardStatusKey(card)) }}</span>
            </button>
          </div>
          <div v-if="!selectedIsChrome" class="translation-settings__general"><label class="translation-settings__field" for="settings-translation-target-language"><span>{{ text('SETTINGS_TRANSLATION_TARGET_LANGUAGE') }}</span><input id="settings-translation-target-language" :value="translation.targetLanguage" type="text" inputmode="text" autocomplete="off" :disabled="formControlsDisabled" data-testid="settings-translation-target-language" @input="updateTargetLanguage"><small>{{ text('SETTINGS_TRANSLATION_TARGET_LANGUAGE_HINT') }}</small></label></div>
        </div>
      </section>
      <section class="translation-settings__column">
        <div class="translation-settings__heading"><h2>{{ text('SETTINGS_TRANSLATION_DETAIL_TITLE') }}</h2><p>{{ text('SETTINGS_TRANSLATION_DETAIL_HINT') }}</p></div>
        <div class="translation-settings__detail-card">
          <template v-if="selectedIsChrome">
            <div class="translation-detail-header"><div><h3>{{ text('SETTINGS_TRANSLATION_CHROME_NAME') }}</h3><p>{{ text('SETTINGS_TRANSLATION_CHROME_DETAIL_DESCRIPTION') }}</p></div><span class="translation-detail-badge translation-detail-badge--local">{{ text('SETTINGS_TRANSLATION_CHROME_LOCAL_BADGE') }}</span></div>
            <div class="translation-fixed-pair"><span>{{ text('SETTINGS_TRANSLATION_CHROME_LANGUAGE_PAIR') }}</span><strong>영어 → 한국어 <code>en → ko</code></strong></div>
            <dl class="translation-status-list"><div><dt>{{ text('SETTINGS_TRANSLATION_CHROME_BROWSER') }}</dt><dd :class="{ 'is-ready': chromeState.supported, 'is-error': !chromeState.supported }">{{ text(chromeState.supported ? 'SETTINGS_TRANSLATION_CHROME_SUPPORTED' : 'SETTINGS_TRANSLATION_CHROME_UNSUPPORTED') }}</dd></div><div><dt>{{ text('SETTINGS_TRANSLATION_CHROME_MODEL') }}</dt><dd :class="{ 'is-ready': chromeState.phase === 'available', 'is-error': ['failed', 'unavailable'].includes(chromeState.phase) }">{{ text(chromeModelStatusKey()) }}</dd></div></dl>
            <div v-if="chromeState.phase === 'downloading'" class="translation-download-progress" data-testid="settings-translation-chrome-progress"><div class="translation-download-progress__labels"><span>{{ text('SETTINGS_TRANSLATION_CHROME_DOWNLOAD_PROGRESS') }}</span><span v-if="!chromeState.indeterminate && chromeState.progress !== null">{{ Math.round(chromeState.progress * 100) }}%</span></div><div class="translation-download-progress__track"><span class="translation-download-progress__bar" :class="{ 'translation-download-progress__bar--indeterminate': chromeState.indeterminate }" :style="{ width: chromeState.indeterminate ? undefined : chromeProgressWidth() }" /></div><p>{{ text(chromeGuidanceKey()) }}</p></div>
            <div v-else-if="chromeState.phase !== 'available'" class="translation-detail-callout" :class="{ 'translation-detail-callout--error': ['failed', 'unavailable', 'unsupported'].includes(chromeState.phase) }">{{ text(chromeGuidanceKey()) }}<span v-if="chromeState.errorMessage"> {{ chromeState.errorMessage }}</span></div>
            <p class="translation-detail-note">{{ text('SETTINGS_TRANSLATION_CHROME_NOTE') }}</p>
            <div class="translation-detail-actions"><button v-if="chromeCanDownload()" type="button" class="translation-primary-button" :disabled="formControlsDisabled" data-testid="settings-translation-chrome-download" @click="downloadChromeModel">{{ text(chromeState.phase === 'failed' ? 'SETTINGS_TRANSLATION_CHROME_RETRY' : 'SETTINGS_TRANSLATION_CHROME_DOWNLOAD_BUTTON') }}</button><button v-if="chromeState.phase === 'available' && activeProviderId !== CHROME_ID" type="button" class="translation-primary-button" :disabled="formControlsDisabled" data-testid="settings-translation-activate" @click="activateSelectedProvider">{{ text('SETTINGS_TRANSLATION_ACTIVATE') }}</button><span v-if="activeProviderId === CHROME_ID" class="translation-active-label">{{ text('SETTINGS_TRANSLATION_ACTIVE') }}</span></div>
          </template>
          <template v-else-if="selectedProvider">
            <div class="translation-detail-header"><div><h3>{{ selectedProvider.name }}</h3><p>{{ text('SETTINGS_TRANSLATION_PRESET_DESCRIPTION') }}</p></div><span class="translation-detail-badge" :class="detailBadgeClass()">{{ text(detailBadgeKey()) }}</span></div>
            <div v-if="isDeepL" class="translation-plan-switch" :aria-label="text('SETTINGS_TRANSLATION_DEEPL_VARIANT')"><button type="button" :class="{ 'is-selected': selectedProviderId === 'deepl-free' }" :disabled="formControlsDisabled" @click="selectService('deepl-free')">{{ text('SETTINGS_TRANSLATION_DEEPL_FREE') }}</button><button type="button" :class="{ 'is-selected': selectedProviderId === 'deepl-pro' }" :disabled="formControlsDisabled" @click="selectService('deepl-pro')">{{ text('SETTINGS_TRANSLATION_DEEPL_PRO') }}</button></div>
            <label v-else class="translation-detail-field"><span>{{ text('SETTINGS_TRANSLATION_GEMINI_MODEL') }}</span><select v-model="geminiModel" disabled data-testid="settings-translation-gemini-model"><option :value="GEMINI_MODEL_ID">{{ GEMINI_MODEL_ID }}</option></select><small>{{ text('SETTINGS_TRANSLATION_GEMINI_MODEL_HINT') }}</small></label>
            <label class="translation-detail-field" for="settings-translation-preset-api-key"><span>{{ text('SETTINGS_TRANSLATION_API_KEY') }}</span><div class="translation-secret-field"><input id="settings-translation-preset-api-key" :value="providerCredential(selectedProvider)" :type="showApiKey ? 'text' : 'password'" autocomplete="new-password" :placeholder="text('SETTINGS_TRANSLATION_API_KEY_PLACEHOLDER')" :disabled="connectionControlsDisabled(selectedProvider.id)" data-testid="settings-translation-preset-api-key" @input="updatePresetCredential"><button type="button" :disabled="connectionControlsDisabled(selectedProvider.id)" @click="showApiKey = !showApiKey">{{ text(showApiKey ? 'SETTINGS_TRANSLATION_HIDE_KEY' : 'SETTINGS_TRANSLATION_SHOW_KEY') }}</button></div><small>{{ text('SETTINGS_TRANSLATION_API_KEY_HINT') }}</small><button v-if="providerCredential(selectedProvider)" type="button" class="translation-text-button" :disabled="connectionControlsDisabled(selectedProvider.id)" data-testid="settings-translation-delete-key" @click="deletePresetCredential">{{ text('SETTINGS_TRANSLATION_DELETE_KEY') }}</button></label>
            <p v-if="selectedConnectionState().messageKey" class="translation-detail-result" :class="'translation-detail-result--' + selectedConnectionState().status" role="status" data-testid="settings-translation-test-result">{{ text(selectedConnectionState().messageKey) }}</p>
            <div class="translation-detail-actions"><button type="button" class="translation-secondary-button" :disabled="connectionControlsDisabled(selectedProvider.id)" data-testid="settings-translation-test" @click="testPresetConnection">{{ text(selectedConnectionState().status === 'testing' ? 'SETTINGS_TRANSLATION_TESTING' : 'SETTINGS_TRANSLATION_TEST') }}</button><button v-if="activeProviderId !== selectedProviderId" type="button" class="translation-primary-button" :disabled="formControlsDisabled || !canActivateSelected()" data-testid="settings-translation-activate" @click="activateSelectedProvider">{{ text('SETTINGS_TRANSLATION_ACTIVATE') }}</button><span v-else class="translation-active-label">{{ text('SETTINGS_TRANSLATION_ACTIVE') }}</span></div>
          </template>
          <div v-else class="translation-detail-callout translation-detail-callout--error">{{ text('SETTINGS_TRANSLATION_PROVIDER_UNKNOWN_DESCRIPTION') }}</div>
        </div>
      </section>
    </div>
  </section>
</template>

<style scoped>
.translation-settings { min-width: 0; }
.translation-settings__layout { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 28px; align-items: start; }
.translation-settings__column { min-width: 0; }
.translation-settings__heading { min-height: 66px; }
.translation-settings__heading h2 { margin: 0; color: var(--naverdic-settings-text); font-size: 24px; font-weight: 700; line-height: 32px; }
.translation-settings__heading p { margin: 2px 0 0; color: var(--naverdic-settings-text-muted); font-size: 12px; line-height: 20px; }
.translation-settings__selector-card, .translation-settings__detail-card { min-height: 630px; padding: 22px; background: var(--naverdic-settings-surface); border: 1px solid var(--naverdic-settings-border); border-radius: var(--naverdic-radius-md); box-shadow: var(--naverdic-card-shadow-default); }
.translation-settings__selector-card-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding-bottom: 14px; border-bottom: 1px solid var(--naverdic-settings-divider); }
.translation-settings__selector-card-heading h3 { margin: 0; color: var(--naverdic-settings-text); font-size: 14px; line-height: 22px; }
.translation-settings__selector-card-heading p { margin: 2px 0 0; color: var(--naverdic-settings-text-muted); font-size: 10px; line-height: 16px; }
.settings-switch--compact { display: inline-flex; align-items: center; gap: 6px; cursor: pointer; }
.settings-switch--compact input { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
.settings-switch--compact .settings-switch__track { position: relative; display: inline-flex; align-items: center; width: 28px; height: 16px; padding: 2px; background: var(--naverdic-settings-divider); border-radius: 99px; }
.settings-switch--compact .settings-switch__thumb { display: block; width: 12px; height: 12px; background: var(--naverdic-settings-surface); border-radius: 50%; box-shadow: 0 1px 2px rgb(0 0 0 / 16%); transition: transform 120ms ease; }
.settings-switch--compact input:checked + .settings-switch__track { background: var(--naverdic-settings-primary); }
.settings-switch--compact input:checked + .settings-switch__track .settings-switch__thumb { transform: translateX(12px); }
.settings-switch--compact .settings-switch__label { font-size: 10px; line-height: 16px; }
.translation-settings__service-list { display: flex; flex-direction: column; gap: 16px; padding: 16px 0 12px; }
.translation-service-row { display: flex; min-height: 90px; align-items: center; justify-content: space-between; gap: 14px; padding: 16px; color: var(--naverdic-settings-text); background: var(--naverdic-settings-surface); border: 1px solid var(--naverdic-settings-border); border-radius: var(--naverdic-radius-sm); text-align: left; cursor: pointer; }
.translation-service-row:hover { border-color: var(--naverdic-settings-primary); background: var(--naverdic-settings-nav-active); }
.translation-service-row--active { border-color: var(--naverdic-settings-border); }
.translation-service-row--selected { border-color: var(--naverdic-settings-primary); background: var(--naverdic-settings-nav-active); }
.translation-service-row--selected { box-shadow: inset 3px 0 0 var(--naverdic-settings-primary); }
.translation-service-row:focus-visible, .translation-settings button:focus-visible, .translation-settings input:focus-visible, .translation-settings select:focus-visible { outline: 2px solid var(--naverdic-color-focus); outline-offset: 2px; }
.translation-service-row__copy { display: flex; min-width: 0; flex-direction: column; gap: 4px; }
.translation-service-row__copy strong { color: inherit; font-size: 13px; line-height: 20px; }
.translation-service-row__copy small { color: var(--naverdic-settings-text-muted); font-size: 10px; line-height: 16px; }
.translation-service-row__status, .translation-detail-badge { display: inline-flex; flex: 0 0 auto; align-items: center; min-height: 24px; padding: 0 9px; border-radius: 999px; font-size: 9px; font-weight: 700; line-height: 16px; white-space: nowrap; }
.translation-service-row__status--active { color: #fff; background: var(--naverdic-settings-primary); }
.translation-service-row__status--configured { color: var(--naverdic-settings-primary-text); background: var(--naverdic-settings-info); }
.translation-service-row__status--unconfigured { color: var(--naverdic-settings-text-muted); background: var(--naverdic-settings-page); }
.translation-service-row__status--testing, .translation-service-row__status--downloading { color: var(--naverdic-settings-primary-text); background: var(--naverdic-settings-info); }
.translation-service-row__status--error { color: var(--naverdic-color-danger); background: var(--naverdic-settings-danger-hover); }
.translation-settings__general { margin-top: 6px; padding: 16px 0 0; border-top: 1px solid var(--naverdic-settings-divider); }
.translation-settings__field, .translation-detail-field { display: flex; min-width: 0; flex-direction: column; gap: 5px; color: var(--naverdic-settings-text); font-size: 11px; font-weight: 700; line-height: 18px; }
.translation-settings__field small, .translation-detail-field small { color: var(--naverdic-settings-text-muted); font-size: 10px; font-weight: 400; line-height: 16px; }
.translation-settings__field input, .translation-detail-field input, .translation-detail-field select { width: 100%; min-height: 38px; padding: 8px 10px; color: var(--naverdic-settings-text); background: var(--naverdic-input-background-default); border: 1px solid var(--naverdic-input-border-default); border-radius: var(--naverdic-radius-sm); font: inherit; font-size: 11px; }
.translation-detail-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; padding-bottom: 18px; border-bottom: 1px solid var(--naverdic-settings-divider); }
.translation-detail-header h3 { margin: 0; color: var(--naverdic-settings-text); font-size: 16px; line-height: 24px; }
.translation-detail-header p { margin: 4px 0 0; color: var(--naverdic-settings-text-muted); font-size: 11px; line-height: 17px; }
.translation-detail-badge--local, .translation-detail-badge--connected { color: var(--naverdic-settings-primary-text); background: var(--naverdic-settings-info); }
.translation-detail-badge--active { color: #fff; background: var(--naverdic-settings-primary); }
.translation-detail-badge--required { color: var(--naverdic-settings-text-muted); background: var(--naverdic-settings-page); }
.translation-fixed-pair { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 18px; padding: 14px; color: var(--naverdic-settings-text-muted); background: var(--naverdic-settings-page); border-radius: 8px; font-size: 11px; }
.translation-fixed-pair strong { color: var(--naverdic-settings-text); font-size: 13px; }
.translation-fixed-pair code { display: block; margin-top: 3px; padding: 2px 5px; color: var(--naverdic-settings-primary-text); background: var(--naverdic-settings-info); border-radius: 4px; font-size: 10px; }
.translation-status-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin: 18px 0 0; }
.translation-status-list > div { padding: 12px 13px; background: var(--naverdic-settings-page); border-radius: 8px; }
.translation-status-list dt { color: var(--naverdic-settings-text-muted); font-size: 10px; line-height: 16px; }
.translation-status-list dd { margin: 4px 0 0; color: var(--naverdic-settings-text); font-size: 12px; font-weight: 700; line-height: 18px; }
.translation-status-list dd.is-ready { color: var(--naverdic-settings-primary-text); }
.translation-status-list dd.is-error { color: var(--naverdic-color-danger); }
.translation-download-progress { margin-top: 18px; }
.translation-download-progress__labels { display: flex; justify-content: space-between; font-size: 11px; }
.translation-download-progress__track { height: 8px; margin-top: 7px; overflow: hidden; background: var(--naverdic-settings-divider); border-radius: 99px; }
.translation-download-progress__bar { display: block; height: 100%; background: var(--naverdic-settings-primary); border-radius: inherit; }
.translation-download-progress__bar--indeterminate { width: 45%; animation: translation-progress 1.2s ease-in-out infinite; }
.translation-download-progress p, .translation-detail-note { color: var(--naverdic-settings-text-muted); font-size: 10px; line-height: 17px; }
.translation-detail-note { margin: 18px 0 0; }
@keyframes translation-progress { from { transform: translateX(-100%); } to { transform: translateX(230%); } }
.translation-detail-callout { margin: 18px 0 0; padding: 12px 14px; color: var(--naverdic-settings-primary-text); background: var(--naverdic-settings-info); border-radius: 8px; font-size: 10px; line-height: 17px; }
.translation-detail-callout--error { color: var(--naverdic-color-danger); background: var(--naverdic-settings-danger-hover); }
.translation-primary-button, .translation-secondary-button, .translation-text-button { min-height: 34px; padding: 0 13px; border-radius: var(--naverdic-radius-sm); font-size: 11px; font-weight: 700; cursor: pointer; }
.translation-primary-button { color: #fff; background: var(--naverdic-settings-primary); border: 1px solid var(--naverdic-settings-primary); }
.translation-secondary-button { color: var(--naverdic-settings-primary-text); background: var(--naverdic-settings-surface); border: 1px solid var(--naverdic-settings-primary-light, #bfdbfe); }
.translation-text-button { align-self: flex-start; padding: 0 5px; color: var(--naverdic-settings-primary-text); background: transparent; border: 0; }
.translation-primary-button:disabled, .translation-secondary-button:disabled, .translation-text-button:disabled, .translation-service-row:disabled { opacity: .55; cursor: not-allowed; }
.translation-detail-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 20px; }
.translation-active-label { color: var(--naverdic-settings-primary-text); font-size: 11px; font-weight: 700; }
.translation-plan-switch { display: inline-flex; margin-top: 18px; padding: 3px; background: var(--naverdic-settings-page); border-radius: 7px; }
.translation-plan-switch button { min-height: 28px; padding: 0 10px; color: var(--naverdic-settings-text-muted); background: transparent; border: 0; border-radius: 5px; font-size: 10px; font-weight: 700; cursor: pointer; }
.translation-plan-switch button.is-selected { color: var(--naverdic-settings-primary-text); background: var(--naverdic-settings-surface); }
.translation-detail-field { margin-top: 18px; }
.translation-secret-field { display: flex; gap: 7px; }
.translation-secret-field input { flex: 1 1 auto; min-width: 0; }
.translation-secret-field button { flex: 0 0 auto; min-width: 48px; padding: 0 8px; color: var(--naverdic-settings-primary-text); background: var(--naverdic-settings-surface); border: 1px solid var(--naverdic-input-border-default); border-radius: var(--naverdic-radius-sm); font-size: 10px; cursor: pointer; }
.translation-detail-result { margin: 14px 0 0; font-size: 10px; }
.translation-detail-result--success { color: var(--naverdic-settings-primary-text); }
.translation-detail-result--error { color: var(--naverdic-color-danger); }
@media (max-width: 1050px) { .translation-settings__layout { grid-template-columns: minmax(0, 1fr); } }
@media (max-width: 600px) { .translation-detail-header, .translation-settings__selector-card-heading, .translation-fixed-pair { flex-direction: column; align-items: stretch; } .translation-status-list { grid-template-columns: minmax(0, 1fr); } .translation-service-row { align-items: flex-start; flex-direction: column; } }
</style>
