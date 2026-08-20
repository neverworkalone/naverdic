<script setup>
import {computed, onBeforeUnmount, reactive, ref, watch} from 'vue'
import {getText} from '/src/text.js'
import {
  CHROME_TRANSLATOR_ERROR_CODES,
  CHROME_TRANSLATOR_PHASES,
  createChromeTranslatorRuntime
} from '/src/chrome-translator.mjs'
import {
  PROVIDER_AUTH_MODES,
  PROVIDER_SOURCES,
  getProviderPreset
} from '/src/translation-provider.mjs'
import {
  cloneProvider,
  createCustomProviderForm,
  getProviderCredential,
  validateCustomProviderForm
} from '/src/translation-settings.mjs'
import {
  hasTranslationProviderPermission,
  requestTranslationProviderPermission,
  testTranslationProvider
} from '/src/translation-testing.mjs'
import {getProviderOriginPattern} from '/src/provider-permissions.mjs'

const props = defineProps({
  draft: {type: Object, required: true},
  draftSecrets: {type: Object, required: true},
  draftRevision: {type: Number, default: 0},
  isLoading: {type: Boolean, default: false},
  isSaving: {type: Boolean, default: false},
  // Tests can inject a fake runtime without changing the production
  // document-bound Translator lifecycle.
  translatorRuntime: {type: Object, default: null}
})

const CHROME_ID = 'chrome-translator'
const CUSTOM_NEW_ID = '__new-custom-api__'
const PRESET_IDS = new Set(['deepl-free', 'deepl-pro', 'gemini'])
const serviceDefinitions = Object.freeze([
  Object.freeze({
    id: CHROME_ID,
    providerIds: Object.freeze([CHROME_ID]),
    nameKey: 'SETTINGS_TRANSLATION_CHROME_NAME',
    descriptionKey: 'SETTINGS_TRANSLATION_CHROME_DESCRIPTION',
    icon: 'C'
  }),
  Object.freeze({
    id: 'deepl',
    providerIds: Object.freeze(['deepl-free', 'deepl-pro']),
    nameKey: 'SETTINGS_TRANSLATION_DEEPL_NAME',
    descriptionKey: 'SETTINGS_TRANSLATION_DEEPL_DESCRIPTION',
    icon: 'D'
  }),
  Object.freeze({
    id: 'gemini',
    providerIds: Object.freeze(['gemini']),
    nameKey: 'SETTINGS_TRANSLATION_GEMINI_NAME',
    descriptionKey: 'SETTINGS_TRANSLATION_GEMINI_DESCRIPTION',
    icon: 'G'
  })
])

const translation = computed(() => props.draft.translation || {})
const customProviders = computed(() => props.draft.customProviders || {})
const activeProviderId = computed(() => translation.value.providerId || 'deepl-free')
const selectedProviderId = ref(activeProviderId.value)
const selectedPresetId = computed(() => (
  PRESET_IDS.has(selectedProviderId.value) ? selectedProviderId.value : ''
))
const selectedProvider = computed(() => {
  if (selectedProviderId.value === CUSTOM_NEW_ID) {
    return null
  }
  return getProviderPreset(selectedProviderId.value) ||
    customProviders.value[selectedProviderId.value] ||
    null
})
const selectedIsChrome = computed(() => selectedProviderId.value === CHROME_ID)
const selectedIsCustom = computed(() => (
  selectedProviderId.value === CUSTOM_NEW_ID ||
  customProviders.value[selectedProviderId.value]?.source === PROVIDER_SOURCES.CUSTOM
))
const customPermissionPattern = computed(() => getProviderOriginPattern(editorForm.url))
const isDeepL = computed(() => selectedProviderId.value === 'deepl-free' || selectedProviderId.value === 'deepl-pro')
const controlsDisabled = computed(() => props.isLoading || props.isSaving)

const connectionStates = reactive({})
const permissionStates = reactive({})
const customDrafts = reactive({})
const editorForm = reactive(createCustomProviderForm())
const editorProviderId = ref('')
const editorBaseline = ref('')
const editorDirty = ref(false)
const formErrors = ref([])
const showApiKey = ref(false)
const permissionRequestState = ref('idle')
let connectionRequestId = 0
let permissionRequestId = 0

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
const chromeRuntime = props.translatorRuntime || createChromeTranslatorRuntime({
  scope: globalThis,
  onStateChange: state => {
    chromeState.value = state
  }
})
const ownsChromeRuntime = !props.translatorRuntime

function text(key, placeholders = undefined) {
  return getText(key, placeholders)
}

function providerForId(providerId) {
  return getProviderPreset(providerId) || customProviders.value[providerId] || null
}

function stateFor(providerId) {
  return connectionStates[providerId] || {status: 'idle', messageKey: '', signature: ''}
}

function providerCredential(provider) {
  return getProviderCredential(provider, props.draftSecrets)
}

function providerSignature(provider, providerId = provider?.id || '') {
  if (!provider) {
    return `${providerId}:empty`
  }
  return JSON.stringify({provider, credential: providerCredential(provider)})
}

function formSignature(provider, credential = '') {
  return JSON.stringify({provider, credential})
}

function isConnectionSuccess(providerId) {
  const state = stateFor(providerId)
  return state.status === 'success' && state.signature === providerSignature(providerForId(providerId), providerId)
}

function selectedConnectionState() {
  return stateFor(selectedProviderId.value)
}

function ensureDraftProviders() {
  if (!props.draft.customProviders || typeof props.draft.customProviders !== 'object') {
    props.draft.customProviders = {}
  }
  return props.draft.customProviders
}

function ensureDraftSecrets() {
  if (!props.draftSecrets.providers || typeof props.draftSecrets.providers !== 'object') {
    props.draftSecrets.providers = {}
  }
  return props.draftSecrets.providers
}

function setConnectionState(providerId, patch) {
  connectionStates[providerId] = {...stateFor(providerId), ...patch}
}

function invalidateConnectionState(providerId = selectedProviderId.value) {
  connectionRequestId += 1
  setConnectionState(providerId, {status: 'idle', messageKey: '', signature: ''})
}

function serviceCards() {
  return [
    ...serviceDefinitions,
    ...Object.keys(customProviders.value).map(id => ({
      id,
      providerIds: [id],
      name: customProviders.value[id]?.name || id,
      descriptionKey: 'SETTINGS_TRANSLATION_CUSTOM_DESCRIPTION',
      icon: 'A',
      custom: true
    }))
  ]
}

function cardProviderId(card) {
  if (card.id === 'deepl' && card.providerIds.includes(activeProviderId.value)) {
    return activeProviderId.value
  }
  return card.providerIds[0]
}

function cardName(card) {
  return card.name || text(card.nameKey)
}

function cardIsSelected(card) {
  return card.providerIds.includes(selectedProviderId.value)
}

function cardIsActive(card) {
  return card.providerIds.includes(activeProviderId.value)
}

function cardStatusKey(card) {
  const providerId = cardProviderId(card)
  if (providerId === CHROME_ID) {
    if (chromeState.value.phase === CHROME_TRANSLATOR_PHASES.AVAILABLE) {
      return 'SETTINGS_TRANSLATION_STATUS_READY'
    }
    if (chromeState.value.phase === CHROME_TRANSLATOR_PHASES.DOWNLOADING) {
      return 'SETTINGS_TRANSLATION_STATUS_DOWNLOADING'
    }
    if (chromeState.value.phase === CHROME_TRANSLATOR_PHASES.UNSUPPORTED ||
        chromeState.value.phase === CHROME_TRANSLATOR_PHASES.UNAVAILABLE) {
      return 'SETTINGS_TRANSLATION_STATUS_UNAVAILABLE'
    }
    if (chromeState.value.phase === CHROME_TRANSLATOR_PHASES.FAILED) {
      return 'SETTINGS_TRANSLATION_STATUS_ERROR'
    }
    return 'SETTINGS_TRANSLATION_STATUS_SETUP'
  }

  const state = stateFor(providerId)
  if (state.status === 'success' && isConnectionSuccess(providerId)) {
    return 'SETTINGS_TRANSLATION_STATUS_CONNECTED'
  }
  if (state.status === 'error') {
    return 'SETTINGS_TRANSLATION_STATUS_ERROR'
  }
  if (card.custom && permissionStates[providerId] !== 'allowed') {
    return 'SETTINGS_TRANSLATION_STATUS_PERMISSION'
  }
  if (providerCredential(providerForId(providerId))) {
    return 'SETTINGS_TRANSLATION_STATUS_SETUP'
  }
  return 'SETTINGS_TRANSLATION_STATUS_SETUP'
}

function cardStatusClass(card) {
  const key = cardStatusKey(card)
  return key.endsWith('CONNECTED') || key.endsWith('READY')
    ? 'connected'
    : key.endsWith('ERROR') || key.endsWith('UNAVAILABLE') ? 'error' : 'setup'
}

function selectService(providerId) {
  if (controlsDisabled.value) {
    return
  }
  if (providerId !== CUSTOM_NEW_ID && !providerForId(providerId)) {
    return
  }
  selectedProviderId.value = providerId
}

function selectCard(card) {
  selectService(cardProviderId(card))
}

function toggleTranslation(event) {
  if (!controlsDisabled.value) {
    props.draft.translation.enabled = event.target.checked
  }
}

function setProviderSecret(provider, value) {
  if (!provider?.id) {
    return
  }
  const providers = ensureDraftSecrets()
  const secretField = provider.auth?.secretRef?.split('.').pop() || 'apiKey'
  const current = providers[provider.id] || {}
  const normalized = String(value || '').trim()
  if (normalized) {
    providers[provider.id] = {...current, [secretField]: normalized}
    return
  }
  const next = {...current}
  delete next[secretField]
  if (Object.keys(next).length) {
    providers[provider.id] = next
  } else {
    delete providers[provider.id]
  }
}

function updatePresetCredential(event) {
  setProviderSecret(selectedProvider.value, event.target.value)
  invalidateConnectionState(selectedProviderId.value)
}

function deletePresetCredential() {
  setProviderSecret(selectedProvider.value, '')
  invalidateConnectionState(selectedProviderId.value)
  showApiKey.value = false
}

function switchDeepLVariant(providerId) {
  selectService(providerId)
}

function customDraftKey() {
  return editorProviderId.value || CUSTOM_NEW_ID
}

function cacheEditorDraft(providerId = selectedProviderId.value) {
  if (!editorDirty.value || (
    providerId !== CUSTOM_NEW_ID &&
    customProviders.value[providerId]?.source !== PROVIDER_SOURCES.CUSTOM
  )) {
    return
  }
  customDrafts[providerId] = cloneProvider(editorForm)
}

function loadEditorDraft(providerId) {
  const provider = providerId === CUSTOM_NEW_ID ? null : customProviders.value[providerId]
  const form = customDrafts[providerId] || createCustomProviderForm(provider, props.draftSecrets)
  Object.assign(editorForm, form)
  editorProviderId.value = providerId === CUSTOM_NEW_ID ? '' : providerId
  editorBaseline.value = JSON.stringify(editorForm)
  editorDirty.value = false
  formErrors.value = []
  showApiKey.value = false
}

function startCustomProvider() {
  cacheEditorDraft()
  selectService(CUSTOM_NEW_ID)
}

function cancelCustomDraft() {
  delete customDrafts[customDraftKey()]
  if (editorProviderId.value) {
    loadEditorDraft(editorProviderId.value)
    return
  }
  selectService(activeProviderId.value)
}

function syncAuthDefaults() {
  if (editorForm.authMode === PROVIDER_AUTH_MODES.BEARER &&
      (!editorForm.authHeaderName || editorForm.authHeaderName === 'X-API-Key')) {
    editorForm.authHeaderName = 'Authorization'
    editorForm.authPrefix = 'Bearer '
  } else if (editorForm.authMode === PROVIDER_AUTH_MODES.API_KEY &&
      editorForm.authHeaderName === 'Authorization') {
    editorForm.authHeaderName = 'X-API-Key'
    editorForm.authPrefix = ''
  }
}

function errorTextKey(error) {
  const keys = {
    'required-name': 'SETTINGS_TRANSLATION_VALIDATION_NAME',
    'invalid-id': 'SETTINGS_TRANSLATION_VALIDATION_NAME',
    'duplicate-id': 'SETTINGS_TRANSLATION_VALIDATION_DUPLICATE',
    'reserved-id': 'SETTINGS_TRANSLATION_VALIDATION_DUPLICATE',
    'invalid-url': 'SETTINGS_TRANSLATION_VALIDATION_URL',
    'invalid-method': 'SETTINGS_TRANSLATION_VALIDATION_METHOD',
    'invalid-headers': 'SETTINGS_TRANSLATION_VALIDATION_HEADERS',
    'invalid-body': 'SETTINGS_TRANSLATION_VALIDATION_BODY',
    'invalid-auth-mode': 'SETTINGS_TRANSLATION_VALIDATION_AUTH',
    'invalid-auth-location': 'SETTINGS_TRANSLATION_VALIDATION_AUTH',
    'invalid-auth-header': 'SETTINGS_TRANSLATION_VALIDATION_AUTH',
    'required-response-path': 'SETTINGS_TRANSLATION_VALIDATION_RESPONSE',
    'invalid-provider': 'SETTINGS_TRANSLATION_VALIDATION_INVALID',
    'permission-or-test-required': 'SETTINGS_TRANSLATION_CUSTOM_TEST_REQUIRED'
  }
  return keys[error?.code] || 'SETTINGS_TRANSLATION_VALIDATION_INVALID'
}

function currentCustomFormResult() {
  return validateCustomProviderForm(editorForm, {
    existingIds: Object.keys(customProviders.value),
    editingId: editorProviderId.value
  })
}

function customSecretsFor(result) {
  const secrets = cloneProvider(props.draftSecrets)
  if (!secrets.providers) {
    secrets.providers = {}
  }
  const previousProvider = editorProviderId.value ? customProviders.value[editorProviderId.value] : null
  const previousValue = previousProvider ? getProviderCredential(previousProvider, props.draftSecrets) : ''
  const value = result.credentialValue || previousValue
  if (previousProvider && previousProvider.id !== result.provider.id) {
    delete secrets.providers[previousProvider.id]
  }
  if (result.provider.auth.mode === PROVIDER_AUTH_MODES.NONE || result.clearCredential) {
    delete secrets.providers[result.provider.id]
  } else if (value) {
    secrets.providers[result.provider.id] = {[result.credentialField]: value}
  }
  return secrets
}

function applyCustomCredential(result, previousProvider = null) {
  const providers = ensureDraftSecrets()
  const previousValue = previousProvider ? getProviderCredential(previousProvider, props.draftSecrets) : ''
  const value = result.credentialValue || previousValue
  if (previousProvider && previousProvider.id !== result.provider.id) {
    delete providers[previousProvider.id]
  }
  if (result.provider.auth.mode === PROVIDER_AUTH_MODES.NONE || result.clearCredential) {
    delete providers[result.provider.id]
    return
  }
  if (value) {
    providers[result.provider.id] = {[result.credentialField]: value}
  }
}

function customProviderForTest(result) {
  const existing = editorProviderId.value ? customProviders.value[editorProviderId.value] : null
  return {
    provider: result.provider,
    credential: result.credentialValue || getProviderCredential(existing, props.draftSecrets)
  }
}

async function refreshCustomPermission(provider, providerId = selectedProviderId.value) {
  if (!provider || provider.source !== PROVIDER_SOURCES.CUSTOM) {
    return true
  }
  const allowed = await hasTranslationProviderPermission(provider)
  permissionStates[providerId] = allowed ? 'allowed' : 'required'
  return allowed
}

async function requestCustomAccess(provider, providerId = selectedProviderId.value) {
  if (!provider || provider.source !== PROVIDER_SOURCES.CUSTOM || controlsDisabled.value) {
    return false
  }
  const requestId = ++permissionRequestId
  permissionRequestState.value = 'requesting'
  permissionStates[providerId] = 'requesting'
  try {
    const granted = await requestTranslationProviderPermission(provider)
    if (requestId !== permissionRequestId) {
      return false
    }
    permissionStates[providerId] = granted ? 'allowed' : 'required'
    permissionRequestState.value = granted ? 'idle' : 'error'
    return granted
  } catch (_error) {
    if (requestId === permissionRequestId) {
      permissionStates[providerId] = 'required'
      permissionRequestState.value = 'error'
    }
    return false
  }
}

async function requestCustomPermissionFromForm() {
  const result = currentCustomFormResult()
  if (result.valid) {
    await requestCustomAccess(result.provider, selectedProviderId.value)
  } else {
    formErrors.value = result.errors
  }
}

async function runConnectionTest(provider, {
  providerId = provider?.id || selectedProviderId.value,
  secrets = props.draftSecrets,
  signature = providerSignature(provider, providerId)
} = {}) {
  if (!provider || controlsDisabled.value || stateFor(providerId).status === 'testing') {
    return
  }
  const credential = getProviderCredential(provider, secrets)
  if (provider.auth.mode !== PROVIDER_AUTH_MODES.NONE && !credential) {
    setConnectionState(providerId, {
      status: 'error',
      messageKey: 'SETTINGS_TRANSLATION_API_KEY_MISSING',
      signature: ''
    })
    return
  }
  const requestId = ++connectionRequestId
  setConnectionState(providerId, {status: 'testing', messageKey: '', signature})
  try {
    await testTranslationProvider(provider, {
      secrets,
      targetLanguage: translation.value.targetLanguage
    })
    if (requestId !== connectionRequestId || signature !== providerSignature(provider, providerId)) {
      return
    }
    setConnectionState(providerId, {
      status: 'success',
      messageKey: 'SETTINGS_TRANSLATION_TEST_SUCCESS',
      signature
    })
  } catch (error) {
    if (requestId !== connectionRequestId) {
      return
    }
    setConnectionState(providerId, {
      status: 'error',
      messageKey: error?.code === 'PERMISSION_REQUIRED'
        ? 'SETTINGS_TRANSLATION_PERMISSION_REQUIRED'
        : 'SETTINGS_TRANSLATION_TEST_FAILURE',
      signature: ''
    })
  }
}

function testPresetConnection() {
  runConnectionTest(selectedProvider.value, {
    providerId: selectedProviderId.value,
    signature: providerSignature(selectedProvider.value, selectedProviderId.value)
  })
}

async function testCustomConnection() {
  if (controlsDisabled.value || selectedConnectionState().status === 'testing') {
    return
  }
  const result = currentCustomFormResult()
  if (!result.valid) {
    formErrors.value = result.errors
    return
  }
  formErrors.value = []
  const testTarget = customProviderForTest(result)
  const providerId = selectedProviderId.value
  if (!await refreshCustomPermission(testTarget.provider, providerId)) {
    setConnectionState(providerId, {
      status: 'error',
      messageKey: 'SETTINGS_TRANSLATION_PERMISSION_REQUIRED',
      signature: ''
    })
    return
  }
  await runConnectionTest(testTarget.provider, {
    providerId,
    secrets: customSecretsFor(result),
    signature: formSignature(testTarget.provider, testTarget.credential)
  })
}

async function saveCustomProvider() {
  if (controlsDisabled.value || selectedConnectionState().status === 'testing') {
    return
  }
  const result = currentCustomFormResult()
  if (!result.valid) {
    formErrors.value = result.errors
    return
  }
  const existingProvider = editorProviderId.value ? customProviders.value[editorProviderId.value] : null
  const wasActive = activeProviderId.value === existingProvider?.id
  const currentState = stateFor(selectedProviderId.value)
  const testedSignature = formSignature(
    result.provider,
    result.credentialValue || getProviderCredential(existingProvider, props.draftSecrets)
  )
  if (wasActive && (currentState.status !== 'success' || currentState.signature !== testedSignature)) {
    formErrors.value = [{code: 'permission-or-test-required'}]
    return
  }

  const providers = ensureDraftProviders()
  if (existingProvider && existingProvider.id !== result.provider.id) {
    delete providers[existingProvider.id]
  }
  providers[result.provider.id] = result.provider
  applyCustomCredential(result, existingProvider)
  delete customDrafts[customDraftKey()]
  customDrafts[result.provider.id] = cloneProvider(editorForm)
  selectedProviderId.value = result.provider.id
  loadEditorDraft(result.provider.id)
  if (currentState.status === 'success' && currentState.signature === testedSignature) {
    connectionStates[result.provider.id] = {
      ...currentState,
      signature: providerSignature(result.provider, result.provider.id)
    }
  } else {
    invalidateConnectionState(result.provider.id)
  }
  await refreshCustomPermission(result.provider, result.provider.id)
}

function deleteCustomProvider(providerId) {
  if (controlsDisabled.value) {
    return
  }
  const confirmFn = globalThis.confirm
  const confirmed = typeof confirmFn !== 'function' || confirmFn(text('SETTINGS_TRANSLATION_CUSTOM_DELETE_CONFIRM'))
  if (!confirmed) {
    return
  }
  delete ensureDraftProviders()[providerId]
  delete ensureDraftSecrets()[providerId]
  delete customDrafts[providerId]
  delete connectionStates[providerId]
  delete permissionStates[providerId]
  if (activeProviderId.value === providerId) {
    props.draft.translation.providerId = 'deepl-free'
  }
  if (selectedProviderId.value === providerId) {
    selectedProviderId.value = activeProviderId.value === providerId ? 'deepl-free' : activeProviderId.value
  }
}

function canActivateSelected() {
  if (selectedIsChrome.value) {
    return chromeState.value.phase === CHROME_TRANSLATOR_PHASES.AVAILABLE
  }
  if (selectedIsCustom.value) {
    return Boolean(
      selectedProvider.value &&
      permissionStates[selectedProviderId.value] === 'allowed' &&
      stateFor(selectedProviderId.value).status === 'success' &&
      isConnectionSuccess(selectedProviderId.value)
    )
  }
  return Boolean(
    selectedProvider.value &&
    providerCredential(selectedProvider.value) &&
    stateFor(selectedProviderId.value).status === 'success' &&
    isConnectionSuccess(selectedProviderId.value)
  )
}

function activateSelectedProvider() {
  if (controlsDisabled.value || !canActivateSelected()) {
    return
  }
  props.draft.translation.providerId = selectedProviderId.value
  if (selectedIsChrome.value) {
    props.draft.translation.targetLanguage = 'ko'
  }
}

function chromeStatusTextKey() {
  switch (chromeState.value.phase) {
    case CHROME_TRANSLATOR_PHASES.UNSUPPORTED:
      return 'SETTINGS_TRANSLATION_CHROME_UNSUPPORTED'
    case CHROME_TRANSLATOR_PHASES.UNAVAILABLE:
      return 'SETTINGS_TRANSLATION_CHROME_MODEL_UNAVAILABLE'
    case CHROME_TRANSLATOR_PHASES.DOWNLOADING:
      return 'SETTINGS_TRANSLATION_CHROME_MODEL_DOWNLOADING'
    case CHROME_TRANSLATOR_PHASES.AVAILABLE:
      return 'SETTINGS_TRANSLATION_CHROME_MODEL_READY'
    case CHROME_TRANSLATOR_PHASES.FAILED:
      return 'SETTINGS_TRANSLATION_CHROME_DOWNLOAD_FAILED'
    default:
      return 'SETTINGS_TRANSLATION_CHROME_MODEL_NEEDED'
  }
}

function chromeErrorTextKey() {
  if (chromeState.value.errorCode === CHROME_TRANSLATOR_ERROR_CODES.NETWORK) {
    return 'SETTINGS_TRANSLATION_CHROME_NETWORK_ERROR'
  }
  if (chromeState.value.errorCode === CHROME_TRANSLATOR_ERROR_CODES.NOT_ALLOWED) {
    return 'SETTINGS_TRANSLATION_CHROME_PERMISSION_ERROR'
  }
  if (chromeState.value.errorCode === CHROME_TRANSLATOR_ERROR_CODES.NOT_SUPPORTED) {
    return 'SETTINGS_TRANSLATION_CHROME_UNSUPPORTED'
  }
  return 'SETTINGS_TRANSLATION_CHROME_DOWNLOAD_FAILED_HINT'
}

function refreshChromeAvailability() {
  if (!selectedIsChrome.value || typeof chromeRuntime.refreshAvailability !== 'function') {
    return
  }
  chromeRuntime.refreshAvailability().catch(() => {})
}

// Keep this click handler synchronous through runtime.download(): Chrome ties
// Translator.create() to the current user activation when downloading.
function downloadChromeModel() {
  if (controlsDisabled.value || chromeState.value.phase === CHROME_TRANSLATOR_PHASES.DOWNLOADING) {
    return
  }
  if (![CHROME_TRANSLATOR_PHASES.DOWNLOADABLE, CHROME_TRANSLATOR_PHASES.FAILED].includes(chromeState.value.phase)) {
    return
  }
  try {
    const promise = chromeRuntime.download()
    promise?.catch?.(() => {})
  } catch (_error) {
    // The runtime publishes a retryable failure state.
  }
}

function progressPercent() {
  return chromeState.value.progress === null ? 0 : Math.round(chromeState.value.progress * 100)
}

watch(selectedProviderId, (providerId, previousProviderId) => {
  if (previousProviderId !== undefined && (
    previousProviderId === CUSTOM_NEW_ID ||
    customProviders.value[previousProviderId]?.source === PROVIDER_SOURCES.CUSTOM
  )) {
    cacheEditorDraft(previousProviderId)
  }
  if (providerId === CUSTOM_NEW_ID || customProviders.value[providerId]) {
    loadEditorDraft(providerId)
    refreshCustomPermission(providerId === CUSTOM_NEW_ID ? null : customProviders.value[providerId], providerId)
  } else if (providerId === CHROME_ID) {
    refreshChromeAvailability()
  }
}, {immediate: true})

watch(editorForm, () => {
  const next = JSON.stringify(editorForm)
  editorDirty.value = next !== editorBaseline.value
  if (editorDirty.value) {
    invalidateConnectionState(selectedProviderId.value)
  }
}, {deep: true})

watch(() => props.draftRevision, () => {
  if (!selectedIsCustom.value || editorDirty.value) {
    return
  }
  loadEditorDraft(selectedProviderId.value)
})

if (ownsChromeRuntime && typeof chromeRuntime.subscribe === 'function') {
  chromeRuntime.subscribe(state => {
    chromeState.value = state
  })
}

onBeforeUnmount(() => {
  permissionRequestId += 1
  connectionRequestId += 1
  if (ownsChromeRuntime) {
    chromeRuntime.destroy?.()
  }
})
</script>

<template>
  <section class="translation-settings" data-testid="settings-translation-form">
    <div class="translation-settings__layout">
      <aside class="translation-settings__selector" aria-labelledby="translation-selector-title">
        <div class="translation-settings__heading">
          <h2 id="translation-selector-title">{{ text('SETTINGS_TRANSLATION_SELECTOR_TITLE') }}</h2>
          <p>{{ text('SETTINGS_TRANSLATION_SELECTOR_HINT') }}</p>
        </div>

        <div class="translation-settings__selector-card">
          <div class="translation-settings__selector-card-heading">
            <h3>{{ text('SETTINGS_TRANSLATION_AVAILABLE_SERVICES') }}</h3>
            <label class="settings-switch settings-switch--compact" for="settings-translation-enabled">
              <input
                id="settings-translation-enabled"
                type="checkbox"
                :checked="translation.enabled"
                :disabled="controlsDisabled"
                data-testid="settings-translation-enabled"
                @change="toggleTranslation"
              >
              <span class="settings-switch__track" aria-hidden="true"><span class="settings-switch__thumb" /></span>
              <span class="settings-switch__label">{{ text('SETTINGS_TRANSLATION_ENABLED') }}</span>
            </label>
          </div>
          <div class="translation-settings__service-list">
            <button
              v-for="card in serviceCards()"
              :key="card.id"
              type="button"
              class="translation-service-row"
              :class="{
                'translation-service-row--selected': cardIsSelected(card),
                'translation-service-row--active': cardIsActive(card)
              }"
              :disabled="controlsDisabled"
              :data-provider-id="card.id"
              @click="selectCard(card)"
            >
              <span class="translation-service-row__icon" aria-hidden="true">{{ card.icon }}</span>
              <span class="translation-service-row__copy">
                <strong>{{ cardName(card) }}</strong>
                <small>{{ text(card.descriptionKey) }}</small>
              </span>
              <span
                class="translation-service-row__status"
                :class="`translation-service-row__status--${cardStatusClass(card)}`"
              >{{ text(cardStatusKey(card)) }}</span>
              <span v-if="cardIsActive(card)" class="translation-service-row__active" aria-label="active">●</span>
            </button>
          </div>
          <button
            type="button"
            class="translation-settings__add"
            :disabled="controlsDisabled"
            data-testid="settings-translation-add-custom"
            @click="startCustomProvider"
          >+ {{ text('SETTINGS_TRANSLATION_CUSTOM_ADD') }}</button>
        </div>

        <div v-if="!selectedIsChrome" class="translation-settings__general">
          <label class="translation-settings__field" for="settings-translation-target-language">
            <span>{{ text('SETTINGS_TRANSLATION_TARGET_LANGUAGE') }}</span>
            <input
              id="settings-translation-target-language"
              v-model="draft.translation.targetLanguage"
              type="text"
              inputmode="text"
              autocomplete="off"
              spellcheck="false"
              maxlength="12"
              :disabled="controlsDisabled"
              data-testid="settings-translation-target-language"
            >
            <small>{{ text('SETTINGS_TRANSLATION_TARGET_LANGUAGE_HINT') }}</small>
          </label>
        </div>
      </aside>

      <section class="translation-settings__detail" aria-labelledby="translation-detail-title">
        <div class="translation-settings__heading translation-settings__heading--detail">
          <h2 id="translation-detail-title">{{ text('SETTINGS_TRANSLATION_DETAIL_TITLE') }}</h2>
          <p>{{ text('SETTINGS_TRANSLATION_DETAIL_HINT') }}</p>
        </div>

        <div class="translation-settings__detail-card">
          <template v-if="selectedIsChrome">
            <div class="translation-detail-header">
              <div>
                <h3>{{ text('SETTINGS_TRANSLATION_CHROME_NAME') }}</h3>
                <p>{{ text('SETTINGS_TRANSLATION_CHROME_DETAIL_DESCRIPTION') }}</p>
              </div>
              <span class="translation-detail-badge translation-detail-badge--local">{{ text('SETTINGS_TRANSLATION_CHROME_LOCAL_BADGE') }}</span>
            </div>
            <div class="translation-fixed-pair">
              <span>{{ text('SETTINGS_TRANSLATION_CHROME_LANGUAGE_PAIR') }}</span>
              <strong><code>en</code> → <code>ko</code></strong>
            </div>
            <dl class="translation-status-list">
              <div>
                <dt>{{ text('SETTINGS_TRANSLATION_CHROME_BROWSER') }}</dt>
                <dd :class="chromeState.supported ? 'is-ready' : 'is-error'">{{ chromeState.supported ? text('SETTINGS_TRANSLATION_CHROME_SUPPORTED') : text('SETTINGS_TRANSLATION_CHROME_UNSUPPORTED') }}</dd>
              </div>
              <div>
                <dt>{{ text('SETTINGS_TRANSLATION_CHROME_MODEL') }}</dt>
                <dd :class="chromeState.phase === 'available' ? 'is-ready' : 'is-error'">{{ text(chromeStatusTextKey()) }}</dd>
              </div>
            </dl>
            <div v-if="chromeState.phase === 'downloading'" class="translation-download-progress" role="status">
              <div class="translation-download-progress__labels">
                <span>{{ text('SETTINGS_TRANSLATION_CHROME_DOWNLOAD_PROGRESS') }}</span>
                <strong v-if="!chromeState.indeterminate">{{ progressPercent() }}%</strong><strong v-else>…</strong>
              </div>
              <div class="translation-download-progress__track">
                <span
                  class="translation-download-progress__bar"
                  :class="{'translation-download-progress__bar--indeterminate': chromeState.indeterminate}"
                  :style="chromeState.indeterminate ? undefined : {width: `${progressPercent()}%` }"
                />
              </div>
              <p>{{ text('SETTINGS_TRANSLATION_CHROME_DOWNLOAD_PROGRESS_HINT') }}</p>
            </div>
            <p v-if="chromeState.phase === 'unsupported' || chromeState.phase === 'unavailable'" class="translation-detail-callout translation-detail-callout--warning" role="status">{{ text(chromeState.phase === 'unsupported' ? 'SETTINGS_TRANSLATION_CHROME_UNSUPPORTED_GUIDANCE' : 'SETTINGS_TRANSLATION_CHROME_UNAVAILABLE_GUIDANCE') }}</p>
            <p v-if="chromeState.phase === 'failed'" class="translation-detail-callout translation-detail-callout--error" role="alert">{{ text(chromeErrorTextKey()) }}<span v-if="chromeState.errorMessage"> {{ chromeState.errorMessage }}</span></p>
            <button
              v-if="chromeState.phase === 'downloadable' || chromeState.phase === 'failed'"
              type="button"
              class="translation-primary-button"
              :disabled="controlsDisabled"
              data-testid="settings-translation-chrome-download"
              @click="downloadChromeModel"
            >{{ text(chromeState.phase === 'failed' ? 'SETTINGS_TRANSLATION_CHROME_RETRY' : 'SETTINGS_TRANSLATION_CHROME_DOWNLOAD_BUTTON') }}</button>
            <p class="translation-detail-note">{{ text('SETTINGS_TRANSLATION_CHROME_NOTE') }}</p>
            <button
              v-if="activeProviderId !== CHROME_ID"
              type="button"
              class="translation-secondary-button"
              :disabled="controlsDisabled || !canActivateSelected()"
              data-testid="settings-translation-activate"
              @click="activateSelectedProvider"
            >{{ text('SETTINGS_TRANSLATION_ACTIVATE') }}</button>
            <span v-else class="translation-active-label">{{ text('SETTINGS_TRANSLATION_ACTIVE') }}</span>
          </template>

          <template v-else-if="selectedPresetId">
            <div class="translation-detail-header">
              <div>
                <h3>{{ isDeepL ? text('SETTINGS_TRANSLATION_DEEPL_NAME') : text('SETTINGS_TRANSLATION_GEMINI_NAME') }}</h3>
                <p>{{ text(isDeepL ? 'SETTINGS_TRANSLATION_DEEPL_DESCRIPTION' : 'SETTINGS_TRANSLATION_GEMINI_DESCRIPTION') }}</p>
              </div>
              <span class="translation-detail-badge" :class="stateFor(selectedProviderId).status === 'success' ? 'translation-detail-badge--connected' : stateFor(selectedProviderId).status === 'error' ? 'translation-detail-badge--error' : 'translation-detail-badge--required'">{{ text(stateFor(selectedProviderId).status === 'success' ? 'SETTINGS_TRANSLATION_CONNECTED_BADGE' : stateFor(selectedProviderId).status === 'error' ? 'SETTINGS_TRANSLATION_ERROR_BADGE' : 'SETTINGS_TRANSLATION_REQUIRED_BADGE') }}</span>
            </div>
            <div v-if="isDeepL" class="translation-plan-switch" aria-label="DeepL plan">
              <button type="button" :class="{'is-selected': selectedProviderId === 'deepl-free'}" :disabled="controlsDisabled" @click="switchDeepLVariant('deepl-free')">{{ text('SETTINGS_TRANSLATION_DEEPL_FREE') }}</button>
              <button type="button" :class="{'is-selected': selectedProviderId === 'deepl-pro'}" :disabled="controlsDisabled" @click="switchDeepLVariant('deepl-pro')">{{ text('SETTINGS_TRANSLATION_DEEPL_PRO') }}</button>
            </div>
            <label class="translation-detail-field" for="settings-translation-preset-api-key">
              <span>{{ text('SETTINGS_TRANSLATION_API_KEY') }}</span>
              <div class="translation-secret-field">
                <input
                  id="settings-translation-preset-api-key"
                  :type="showApiKey ? 'text' : 'password'"
                  :value="providerCredential(selectedProvider)"
                  autocomplete="new-password"
                  :disabled="controlsDisabled || stateFor(selectedProviderId).status === 'testing'"
                  :placeholder="providerCredential(selectedProvider) ? '••••••••••••••••' : text('SETTINGS_TRANSLATION_API_KEY_PLACEHOLDER')"
                  data-testid="settings-translation-preset-api-key"
                  @input="updatePresetCredential"
                >
                <button type="button" :disabled="controlsDisabled || stateFor(selectedProviderId).status === 'testing'" @click="showApiKey = !showApiKey">{{ text(showApiKey ? 'SETTINGS_TRANSLATION_HIDE_KEY' : 'SETTINGS_TRANSLATION_SHOW_KEY') }}</button>
              </div>
              <small>{{ text('SETTINGS_TRANSLATION_API_KEY_HINT') }}</small>
              <button v-if="providerCredential(selectedProvider)" type="button" class="translation-text-button" :disabled="controlsDisabled || stateFor(selectedProviderId).status === 'testing'" @click="deletePresetCredential">{{ text('SETTINGS_TRANSLATION_DELETE_KEY') }}</button>
            </label>
            <p v-if="stateFor(selectedProviderId).messageKey" class="translation-detail-result" :class="`translation-detail-result--${stateFor(selectedProviderId).status}`" role="status">{{ text(stateFor(selectedProviderId).messageKey) }}</p>
            <div class="translation-detail-actions">
              <button type="button" class="translation-secondary-button" :disabled="controlsDisabled || stateFor(selectedProviderId).status === 'testing'" data-testid="settings-translation-test" @click="testPresetConnection">{{ text(stateFor(selectedProviderId).status === 'testing' ? 'SETTINGS_TRANSLATION_TESTING' : 'SETTINGS_TRANSLATION_TEST') }}</button>
              <button v-if="activeProviderId !== selectedProviderId" type="button" class="translation-primary-button" :disabled="controlsDisabled || !canActivateSelected()" data-testid="settings-translation-activate" @click="activateSelectedProvider">{{ text('SETTINGS_TRANSLATION_ACTIVATE') }}</button>
              <span v-else class="translation-active-label">{{ text('SETTINGS_TRANSLATION_ACTIVE') }}</span>
            </div>
          </template>

          <form v-else class="translation-custom-editor" data-testid="settings-translation-custom-editor" @submit.prevent="saveCustomProvider">
            <div class="translation-detail-header">
              <div>
                <h3>{{ text(editorProviderId ? 'SETTINGS_TRANSLATION_CUSTOM_EDIT' : 'SETTINGS_TRANSLATION_CUSTOM_TITLE') }}</h3>
                <p>{{ text('SETTINGS_TRANSLATION_CUSTOM_DESCRIPTION') }}</p>
              </div>
              <span class="translation-detail-badge" :class="permissionStates[selectedProviderId] === 'allowed' ? 'translation-detail-badge--connected' : 'translation-detail-badge--required'">{{ text(permissionStates[selectedProviderId] === 'allowed' ? 'SETTINGS_TRANSLATION_PERMISSION_ALLOWED_BADGE' : 'SETTINGS_TRANSLATION_PERMISSION_BADGE') }}</span>
            </div>
            <div class="translation-custom-grid">
              <label class="translation-detail-field"><span>{{ text('SETTINGS_TRANSLATION_CUSTOM_NAME') }}</span><input v-model="editorForm.name" type="text" autocomplete="off" :disabled="controlsDisabled || selectedConnectionState().status === 'testing'" data-testid="settings-custom-name"></label>
              <label class="translation-detail-field"><span>{{ text('SETTINGS_TRANSLATION_CUSTOM_URL') }}</span><input v-model="editorForm.url" type="url" autocomplete="off" placeholder="https://api.example.com/translate" :disabled="controlsDisabled || selectedConnectionState().status === 'testing'" data-testid="settings-custom-url"></label>
              <label class="translation-detail-field"><span>{{ text('SETTINGS_TRANSLATION_CUSTOM_METHOD') }}</span><select v-model="editorForm.method" :disabled="controlsDisabled || selectedConnectionState().status === 'testing'" data-testid="settings-custom-method"><option value="POST">POST</option><option value="PUT">PUT</option><option value="PATCH">PATCH</option></select></label>
              <label class="translation-detail-field"><span>{{ text('SETTINGS_TRANSLATION_CUSTOM_AUTH_MODE') }}</span><select v-model="editorForm.authMode" :disabled="controlsDisabled || selectedConnectionState().status === 'testing'" data-testid="settings-custom-auth-mode" @change="syncAuthDefaults"><option value="none">{{ text('SETTINGS_TRANSLATION_AUTH_NONE') }}</option><option value="api-key">{{ text('SETTINGS_TRANSLATION_AUTH_API_KEY') }}</option><option value="bearer">{{ text('SETTINGS_TRANSLATION_AUTH_BEARER') }}</option><option value="custom">{{ text('SETTINGS_TRANSLATION_AUTH_CUSTOM') }}</option></select></label>
            </div>
            <div v-if="editorForm.authMode !== 'none'" class="translation-custom-grid">
              <label class="translation-detail-field"><span>{{ text('SETTINGS_TRANSLATION_CUSTOM_AUTH_LOCATION') }}</span><select v-model="editorForm.authLocation" :disabled="controlsDisabled || selectedConnectionState().status === 'testing'" data-testid="settings-custom-auth-location"><option value="header">{{ text('SETTINGS_TRANSLATION_AUTH_HEADER') }}</option><option value="query">{{ text('SETTINGS_TRANSLATION_AUTH_QUERY') }}</option></select></label>
              <label class="translation-detail-field"><span>{{ text('SETTINGS_TRANSLATION_CUSTOM_AUTH_HEADER') }}</span><input v-model="editorForm.authHeaderName" type="text" autocomplete="off" :disabled="controlsDisabled || selectedConnectionState().status === 'testing'" data-testid="settings-custom-auth-header"></label>
              <label class="translation-detail-field"><span>{{ text('SETTINGS_TRANSLATION_CUSTOM_AUTH_PREFIX') }}</span><input v-model="editorForm.authPrefix" type="text" autocomplete="off" :disabled="controlsDisabled || selectedConnectionState().status === 'testing'" data-testid="settings-custom-auth-prefix"></label>
              <label class="translation-detail-field"><span>{{ text('SETTINGS_TRANSLATION_API_KEY') }}</span><div class="translation-secret-field"><input v-model="editorForm.apiKey" :type="showApiKey ? 'text' : 'password'" autocomplete="new-password" :disabled="controlsDisabled || selectedConnectionState().status === 'testing'" :placeholder="editorForm.hasCredential ? '••••••••••••••••' : text('SETTINGS_TRANSLATION_API_KEY_PLACEHOLDER')" data-testid="settings-custom-api-key"><button type="button" :disabled="controlsDisabled || selectedConnectionState().status === 'testing'" @click="showApiKey = !showApiKey">{{ text(showApiKey ? 'SETTINGS_TRANSLATION_HIDE_KEY' : 'SETTINGS_TRANSLATION_SHOW_KEY') }}</button></div></label>
            </div>
            <label class="translation-detail-field"><span>{{ text('SETTINGS_TRANSLATION_CUSTOM_HEADERS') }}</span><textarea v-model="editorForm.headersText" rows="3" spellcheck="false" :disabled="controlsDisabled || selectedConnectionState().status === 'testing'" data-testid="settings-custom-headers" /></label>
            <label class="translation-detail-field"><span>{{ text('SETTINGS_TRANSLATION_CUSTOM_BODY') }}</span><textarea v-model="editorForm.bodyTemplateText" rows="5" spellcheck="false" :disabled="controlsDisabled || selectedConnectionState().status === 'testing'" data-testid="settings-custom-body" /></label>
            <label class="translation-detail-field"><span>{{ text('SETTINGS_TRANSLATION_CUSTOM_RESPONSE_PATH') }}</span><input v-model="editorForm.responsePath" type="text" autocomplete="off" :disabled="controlsDisabled || selectedConnectionState().status === 'testing'" data-testid="settings-custom-response-path"></label>
            <div class="translation-permission-box" :class="{'translation-permission-box--allowed': permissionStates[selectedProviderId] === 'allowed'}">
              <strong>{{ text('SETTINGS_TRANSLATION_CUSTOM_PERMISSION_TITLE') }}</strong>
              <code v-if="customPermissionPattern">{{ customPermissionPattern }}</code>
              <p>{{ text(permissionStates[selectedProviderId] === 'allowed' ? 'SETTINGS_TRANSLATION_CUSTOM_PERMISSION_GRANTED' : 'SETTINGS_TRANSLATION_CUSTOM_PERMISSION_HINT') }}</p>
              <button type="button" class="translation-secondary-button" :disabled="controlsDisabled || permissionRequestState === 'requesting' || selectedConnectionState().status === 'testing'" data-testid="settings-custom-request-permission" @click="requestCustomPermissionFromForm">{{ text(permissionRequestState === 'requesting' ? 'SETTINGS_TRANSLATION_PERMISSION_REQUESTING' : 'SETTINGS_TRANSLATION_CUSTOM_PERMISSION_REQUEST') }}</button>
            </div>
            <ul v-if="formErrors.length" class="translation-form-errors" role="alert" data-testid="settings-custom-errors"><li v-for="(error, index) in formErrors" :key="`${error.code}-${index}`">{{ text(errorTextKey(error)) }}</li></ul>
            <p v-if="selectedConnectionState().messageKey" class="translation-detail-result" :class="`translation-detail-result--${selectedConnectionState().status}`" role="status" data-testid="settings-translation-test-result">{{ text(selectedConnectionState().messageKey) }}</p>
            <div class="translation-detail-actions">
              <button type="button" class="translation-secondary-button" :disabled="controlsDisabled || selectedConnectionState().status === 'testing'" data-testid="settings-custom-test" @click="testCustomConnection">{{ text(selectedConnectionState().status === 'testing' ? 'SETTINGS_TRANSLATION_TESTING' : 'SETTINGS_TRANSLATION_TEST') }}</button>
              <button type="submit" class="translation-primary-button" :disabled="controlsDisabled || selectedConnectionState().status === 'testing'" data-testid="settings-custom-save">{{ text('SETTINGS_TRANSLATION_CUSTOM_SAVE') }}</button>
              <button v-if="editorProviderId" type="button" class="translation-danger-button" :disabled="controlsDisabled" @click="deleteCustomProvider(editorProviderId)">{{ text('SETTINGS_TRANSLATION_CUSTOM_DELETE') }}</button>
              <button v-else type="button" class="translation-text-button" :disabled="controlsDisabled" @click="cancelCustomDraft">{{ text('SETTINGS_TRANSLATION_CUSTOM_CANCEL') }}</button>
              <button v-if="activeProviderId !== selectedProviderId" type="button" class="translation-secondary-button" :disabled="controlsDisabled || !canActivateSelected()" data-testid="settings-translation-activate" @click="activateSelectedProvider">{{ text('SETTINGS_TRANSLATION_ACTIVATE') }}</button>
              <span v-else class="translation-active-label">{{ text('SETTINGS_TRANSLATION_ACTIVE') }}</span>
            </div>
          </form>
        </div>
      </section>
    </div>
  </section>
</template>

<style scoped>
.translation-settings { min-width: 0; }
.translation-settings__layout { display: grid; grid-template-columns: minmax(0, 300px) minmax(0, 556px); gap: 28px; align-items: start; }
.translation-settings__heading { min-height: 66px; }
.translation-settings__heading h2 { margin: 0; color: var(--naverdic-settings-text); font-size: 22px; font-weight: 700; line-height: 32px; }
.translation-settings__heading p { margin: 2px 0 0; color: var(--naverdic-settings-text-muted); font-size: 12px; line-height: 20px; }
.translation-settings__selector-card, .translation-settings__detail-card { padding: 18px; background: var(--naverdic-settings-surface); border: 1px solid var(--naverdic-settings-border); border-radius: var(--naverdic-radius-md); box-shadow: var(--naverdic-card-shadow-default); }
.translation-settings__selector-card-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding-bottom: 12px; border-bottom: 1px solid var(--naverdic-settings-divider); }
.translation-settings__selector-card-heading h3 { margin: 0; color: var(--naverdic-settings-text); font-size: 14px; line-height: 22px; }
.settings-switch--compact { display: inline-flex; flex: 0 0 auto; align-items: center; gap: 6px; cursor: pointer; }
.settings-switch--compact input { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
.settings-switch--compact .settings-switch__track { position: relative; display: inline-flex; align-items: center; padding: 2px; background: var(--naverdic-settings-divider); border-radius: 99px; transition: background 120ms ease; }
.settings-switch--compact .settings-switch__thumb { display: block; background: var(--naverdic-settings-surface); border-radius: 50%; box-shadow: 0 1px 2px rgb(0 0 0 / 16%); transition: transform 120ms ease; }
.settings-switch--compact input:checked + .settings-switch__track { background: var(--naverdic-settings-primary); }
.settings-switch--compact .settings-switch__label { font-size: 10px; line-height: 16px; }
.settings-switch--compact .settings-switch__track { width: 28px; height: 16px; }
.settings-switch--compact .settings-switch__thumb { width: 12px; height: 12px; }
.settings-switch--compact input:checked + .settings-switch__track .settings-switch__thumb { transform: translateX(12px); }
.translation-settings__service-list { display: flex; flex-direction: column; gap: 4px; padding: 8px 0; }
.translation-service-row { position: relative; display: grid; grid-template-columns: 30px minmax(0, 1fr) auto 8px; gap: 9px; align-items: center; min-height: 58px; padding: 8px 9px; color: var(--naverdic-settings-text); background: transparent; border: 1px solid transparent; border-radius: 8px; text-align: left; cursor: pointer; }
.translation-service-row:hover { background: var(--naverdic-settings-nav-hover); }
.translation-service-row--selected { background: var(--naverdic-settings-nav-active); border-color: var(--naverdic-settings-primary-light, #dbeafe); }
.translation-service-row:focus-visible, .translation-settings button:focus-visible, .translation-settings input:focus-visible, .translation-settings select:focus-visible, .translation-settings textarea:focus-visible { outline: 2px solid var(--naverdic-color-focus); outline-offset: 2px; }
.translation-service-row__icon { display: grid; width: 30px; height: 30px; place-items: center; color: var(--naverdic-settings-primary-text); background: var(--naverdic-settings-info); border-radius: 8px; font-size: 12px; font-weight: 800; }
.translation-service-row__copy { display: flex; min-width: 0; flex-direction: column; gap: 2px; }
.translation-service-row__copy strong { overflow: hidden; color: var(--naverdic-settings-text); font-size: 12px; line-height: 18px; text-overflow: ellipsis; white-space: nowrap; }
.translation-service-row__copy small { overflow: hidden; color: var(--naverdic-settings-text-muted); font-size: 10px; line-height: 15px; text-overflow: ellipsis; white-space: nowrap; }
.translation-service-row__status, .translation-detail-badge { display: inline-flex; align-items: center; min-height: 22px; padding: 0 8px; border-radius: 999px; font-size: 9px; font-weight: 700; line-height: 16px; white-space: nowrap; }
.translation-service-row__status--connected, .translation-service-row__status--setup { color: var(--naverdic-settings-primary-text); background: var(--naverdic-settings-info); }
.translation-service-row__status--error { color: var(--naverdic-color-danger); background: var(--naverdic-settings-danger-hover); }
.translation-service-row__active { color: var(--naverdic-settings-primary); font-size: 10px; }
.translation-settings__add { width: 100%; min-height: 34px; color: var(--naverdic-settings-primary-text); background: transparent; border: 1px dashed var(--naverdic-settings-primary-light, #bfdbfe); border-radius: 7px; font-size: 11px; font-weight: 700; cursor: pointer; }
.translation-settings__add:hover { background: var(--naverdic-settings-info); }
.translation-settings__general { margin-top: 16px; padding: 14px 2px 0; border-top: 1px solid var(--naverdic-settings-divider); }
.translation-settings__field, .translation-detail-field { display: flex; min-width: 0; flex-direction: column; gap: 5px; color: var(--naverdic-settings-text); font-size: 11px; font-weight: 700; line-height: 18px; }
.translation-settings__field small, .translation-detail-field small { color: var(--naverdic-settings-text-muted); font-size: 10px; font-weight: 400; line-height: 16px; }
.translation-settings__field input, .translation-detail-field input, .translation-detail-field select, .translation-detail-field textarea { width: 100%; min-height: 36px; padding: 7px 10px; color: var(--naverdic-settings-text); background: var(--naverdic-input-background-default); border: 1px solid var(--naverdic-input-border-default); border-radius: var(--naverdic-radius-sm); font: inherit; font-size: 11px; font-weight: 400; line-height: 18px; }
.translation-detail-field textarea { min-height: 80px; resize: vertical; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 10px; line-height: 16px; }
.translation-settings__detail-card { min-height: 460px; }
.translation-detail-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; padding-bottom: 18px; border-bottom: 1px solid var(--naverdic-settings-divider); }
.translation-detail-header h3 { margin: 0; color: var(--naverdic-settings-text); font-size: 16px; line-height: 24px; }
.translation-detail-header p { margin: 4px 0 0; color: var(--naverdic-settings-text-muted); font-size: 11px; line-height: 17px; }
.translation-detail-badge--local, .translation-detail-badge--connected { color: var(--naverdic-settings-primary-text); background: var(--naverdic-settings-info); }
.translation-detail-badge--required { color: var(--naverdic-settings-text-muted); background: var(--naverdic-settings-divider); }
.translation-detail-badge--error { color: var(--naverdic-color-danger); background: var(--naverdic-settings-danger-hover); }
.translation-fixed-pair { display: flex; align-items: center; justify-content: space-between; margin-top: 18px; padding: 12px 14px; color: var(--naverdic-settings-text-muted); background: var(--naverdic-settings-page); border-radius: 8px; font-size: 11px; }
.translation-fixed-pair strong { color: var(--naverdic-settings-text); font-size: 13px; }
.translation-fixed-pair code { padding: 2px 5px; color: var(--naverdic-settings-primary-text); background: var(--naverdic-settings-info); border-radius: 4px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 11px; }
.translation-status-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin: 18px 0 0; }
.translation-status-list > div { padding: 12px 13px; background: var(--naverdic-settings-page); border-radius: 8px; }
.translation-status-list dt { color: var(--naverdic-settings-text-muted); font-size: 10px; line-height: 16px; }
.translation-status-list dd { margin: 4px 0 0; color: var(--naverdic-settings-text); font-size: 12px; font-weight: 700; line-height: 18px; }
.translation-status-list dd.is-ready { color: var(--naverdic-settings-primary-text); }
.translation-status-list dd.is-error { color: var(--naverdic-color-danger); }
.translation-download-progress { margin-top: 18px; }
.translation-download-progress__labels { display: flex; justify-content: space-between; color: var(--naverdic-settings-text); font-size: 11px; line-height: 18px; }
.translation-download-progress__track { height: 8px; margin-top: 7px; overflow: hidden; background: var(--naverdic-settings-divider); border-radius: 99px; }
.translation-download-progress__bar { display: block; height: 100%; background: var(--naverdic-settings-primary); border-radius: inherit; transition: width 160ms ease; }
.translation-download-progress__bar--indeterminate { width: 45%; animation: translation-progress 1.2s ease-in-out infinite; }
.translation-download-progress p { margin: 7px 0 0; color: var(--naverdic-settings-text-muted); font-size: 10px; line-height: 16px; }
@keyframes translation-progress { from { transform: translateX(-100%); } to { transform: translateX(230%); } }
.translation-detail-callout, .translation-permission-box { margin: 18px 0 0; padding: 12px 14px; border-radius: 8px; font-size: 10px; line-height: 17px; }
.translation-detail-callout--warning, .translation-permission-box { color: var(--naverdic-settings-primary-text); background: var(--naverdic-settings-info); }
.translation-detail-callout--error { color: var(--naverdic-color-danger); background: var(--naverdic-settings-danger-hover); }
.translation-detail-note { margin: 18px 0 0; color: var(--naverdic-settings-text-muted); font-size: 10px; line-height: 17px; }
.translation-primary-button, .translation-secondary-button, .translation-danger-button, .translation-text-button { min-height: 34px; padding: 0 13px; border-radius: var(--naverdic-radius-sm); font-size: 11px; font-weight: 700; cursor: pointer; }
.translation-primary-button { color: #fff; background: var(--naverdic-settings-primary); border: 1px solid var(--naverdic-settings-primary); }
.translation-secondary-button { color: var(--naverdic-settings-primary-text); background: var(--naverdic-settings-surface); border: 1px solid var(--naverdic-settings-primary-light, #bfdbfe); }
.translation-danger-button { color: var(--naverdic-color-danger); background: transparent; border: 1px solid currentColor; }
.translation-text-button { padding: 0 5px; color: var(--naverdic-settings-primary-text); background: transparent; border: 0; }
.translation-primary-button:disabled, .translation-secondary-button:disabled, .translation-danger-button:disabled, .translation-text-button:disabled, .translation-settings__add:disabled, .translation-service-row:disabled { opacity: .55; cursor: not-allowed; }
.translation-detail-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 20px; }
.translation-active-label { color: var(--naverdic-settings-primary-text); font-size: 11px; font-weight: 700; }
.translation-plan-switch { display: inline-flex; margin-top: 18px; padding: 3px; background: var(--naverdic-settings-page); border-radius: 7px; }
.translation-plan-switch button { min-height: 28px; padding: 0 10px; color: var(--naverdic-settings-text-muted); background: transparent; border: 0; border-radius: 5px; font-size: 10px; font-weight: 700; cursor: pointer; }
.translation-plan-switch button.is-selected { color: var(--naverdic-settings-primary-text); background: var(--naverdic-settings-surface); box-shadow: var(--naverdic-card-shadow-default); }
.translation-detail-field { margin-top: 18px; }
.translation-secret-field { display: flex; gap: 7px; }
.translation-secret-field input { flex: 1 1 auto; min-width: 0; }
.translation-secret-field button { flex: 0 0 auto; min-width: 48px; padding: 0 8px; color: var(--naverdic-settings-primary-text); background: var(--naverdic-settings-surface); border: 1px solid var(--naverdic-input-border-default); border-radius: var(--naverdic-radius-sm); font-size: 10px; cursor: pointer; }
.translation-detail-field .translation-text-button { align-self: flex-start; margin-top: 2px; }
.translation-detail-result { margin: 14px 0 0; font-size: 10px; line-height: 17px; }
.translation-detail-result--success { color: var(--naverdic-settings-primary-text); }
.translation-detail-result--error { color: var(--naverdic-color-danger); }
.translation-custom-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 12px; }
.translation-permission-box strong { display: block; color: var(--naverdic-settings-text); font-size: 11px; }
.translation-permission-box code { display: inline-block; margin-top: 5px; padding: 2px 5px; color: var(--naverdic-settings-primary-text); background: var(--naverdic-settings-surface); border-radius: 4px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 10px; }
.translation-permission-box p { margin: 4px 0 10px; color: var(--naverdic-settings-text-muted); }
.translation-form-errors { margin: 14px 0 0; padding: 10px 12px 10px 28px; color: var(--naverdic-color-danger); background: var(--naverdic-settings-danger-hover); border-radius: 7px; font-size: 10px; line-height: 17px; }
@media (max-width: 1050px) { .translation-settings__layout { grid-template-columns: minmax(0, 1fr); } }
@media (max-width: 600px) { .translation-detail-header, .translation-settings__selector-card-heading { flex-direction: column; } .translation-custom-grid, .translation-status-list { grid-template-columns: minmax(0, 1fr); } .translation-service-row { grid-template-columns: 30px minmax(0, 1fr) 8px; } .translation-service-row__status { display: none; } }
</style>
