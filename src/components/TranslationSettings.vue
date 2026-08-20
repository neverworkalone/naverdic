<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { getText } from '/src/text.js'
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
  requestTranslationProviderPermission,
  testTranslationProvider
} from '/src/translation-testing.mjs'

const props = defineProps({
  draft: {
    type: Object,
    required: true
  },
  draftSecrets: {
    type: Object,
    required: true
  },
  draftRevision: {
    type: Number,
    default: 0
  },
  isLoading: {
    type: Boolean,
    default: false
  },
  isSaving: {
    type: Boolean,
    default: false
  }
})

const presetCards = Object.freeze([
  Object.freeze({
    id: 'deepl',
    providerIds: Object.freeze(['deepl-free', 'deepl-pro']),
    nameKey: 'SETTINGS_TRANSLATION_DEEPL_NAME',
    descriptionKey: 'SETTINGS_TRANSLATION_DEEPL_DESCRIPTION'
  }),
  Object.freeze({
    id: 'gemini',
    providerIds: Object.freeze(['gemini']),
    nameKey: 'SETTINGS_TRANSLATION_GEMINI_NAME',
    descriptionKey: 'SETTINGS_TRANSLATION_GEMINI_DESCRIPTION'
  })
])

const editorMode = ref('')
const editorProviderId = ref('')
const editorForm = reactive(createCustomProviderForm())
const formErrors = ref([])
const showApiKey = ref(false)
const connectionState = ref('idle')
const connectionMessageKey = ref('')
const providerSelectionState = ref('idle')
const providerSelectionMessageKey = ref('')
let connectionRequestId = 0
let providerSelectionRequestId = 0

const controlsDisabled = computed(() => props.isLoading || props.isSaving)
const connectionTesting = computed(() => connectionState.value === 'testing')
const interactionDisabled = computed(() => (
  controlsDisabled.value ||
  connectionTesting.value ||
  providerSelectionState.value === 'requesting'
))
const editorControlsDisabled = computed(() => (
  controlsDisabled.value ||
  connectionTesting.value ||
  providerSelectionState.value === 'requesting'
))
const translation = computed(() => props.draft.translation || {})
const customProviders = computed(() => props.draft.customProviders || {})
const activeProviderId = computed(() => translation.value.providerId || 'deepl-free')
const editorProvider = computed(() => {
  if (!editorProviderId.value) {
    return null
  }

  return getProviderPreset(editorProviderId.value) ||
    customProviders.value[editorProviderId.value] ||
    null
})
const isEditingCustom = computed(() => editorMode.value === 'custom')
const editorHasCredential = computed(() => Boolean(
  editorProvider.value && getProviderCredential(editorProvider.value, props.draftSecrets)
))
const customProviderIds = computed(() => Object.keys(customProviders.value))
const providerCards = computed(() => [
  ...presetCards,
  ...customProviderIds.value.map(id => ({
    id,
    providerIds: [id],
    name: customProviders.value[id]?.name || id,
    descriptionKey: 'SETTINGS_TRANSLATION_CUSTOM_DESCRIPTION',
    custom: true
  }))
])

function text(key, placeholders = undefined) {
  return getText(key, placeholders)
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

function providerForId(providerId) {
  return getProviderPreset(providerId) || customProviders.value[providerId] || null
}

function isCardActive(card) {
  return card.providerIds.includes(activeProviderId.value)
}

function cardProviderId(card) {
  if (card.id === 'deepl' && card.providerIds.includes(activeProviderId.value)) {
    return activeProviderId.value
  }

  return card.providerIds[0]
}

function providerName(card) {
  return card.name || text(card.nameKey)
}

async function requestCustomProviderAccess(provider) {
  if (provider?.source !== PROVIDER_SOURCES.CUSTOM) {
    return true
  }

  const requestId = ++providerSelectionRequestId
  providerSelectionState.value = 'requesting'
  providerSelectionMessageKey.value = 'SETTINGS_TRANSLATION_PERMISSION_REQUESTING'
  const granted = await requestTranslationProviderPermission(provider)

  if (requestId !== providerSelectionRequestId) {
    return false
  }

  if (!granted) {
    providerSelectionState.value = 'error'
    providerSelectionMessageKey.value = 'SETTINGS_TRANSLATION_PERMISSION_REQUIRED'
    return false
  }

  providerSelectionState.value = 'idle'
  providerSelectionMessageKey.value = ''
  return true
}

async function selectProvider(providerId) {
  if (interactionDisabled.value || !providerForId(providerId)) {
    return false
  }

  const provider = providerForId(providerId)
  providerSelectionState.value = 'idle'
  providerSelectionMessageKey.value = ''

  if (!await requestCustomProviderAccess(provider)) {
    return false
  }

  props.draft.translation.providerId = providerId
  providerSelectionState.value = 'idle'
  providerSelectionMessageKey.value = ''
  invalidateConnectionState()
  return true
}

function selectProviderFromControl(event) {
  selectProvider(event.target.value)
}

function selectCard(card) {
  selectProvider(cardProviderId(card))
}

function toggleTranslation(event) {
  if (!interactionDisabled.value) {
    props.draft.translation.enabled = event.target.checked
  }
}

function openPresetEditor(providerId) {
  if (interactionDisabled.value) {
    return
  }

  editorMode.value = 'preset'
  editorProviderId.value = providerId
  formErrors.value = []
  showApiKey.value = false
  connectionState.value = 'idle'
  connectionMessageKey.value = ''
}

function openCustomEditor(providerId) {
  if (interactionDisabled.value) {
    return
  }

  const provider = customProviders.value[providerId]
  if (!provider) {
    return
  }

  Object.assign(editorForm, createCustomProviderForm(provider, props.draftSecrets))
  editorMode.value = 'custom'
  editorProviderId.value = providerId
  formErrors.value = []
  showApiKey.value = false
  connectionState.value = 'idle'
  connectionMessageKey.value = ''
}

function openProviderSettings(card) {
  if (card.custom) {
    openCustomEditor(card.id)
    return
  }

  openPresetEditor(cardProviderId(card))
}

function startCustomProvider() {
  if (interactionDisabled.value) {
    return
  }

  Object.assign(editorForm, createCustomProviderForm())
  editorMode.value = 'custom'
  editorProviderId.value = ''
  formErrors.value = []
  showApiKey.value = false
  connectionState.value = 'idle'
  connectionMessageKey.value = ''
}

function closeEditor() {
  connectionRequestId += 1
  providerSelectionRequestId += 1
  editorMode.value = ''
  editorProviderId.value = ''
  formErrors.value = []
  showApiKey.value = false
  connectionState.value = 'idle'
  connectionMessageKey.value = ''
}

function setProviderSecret(provider, value) {
  const providers = ensureDraftSecrets()
  const secretField = provider?.auth?.secretRef?.split('.').pop() || 'apiKey'
  const current = providers[provider.id] || {}

  if (value.trim()) {
    providers[provider.id] = {
      ...current,
      [secretField]: value.trim()
    }
    return
  }

  if (!current[secretField]) {
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

function presetCredentialValue(provider) {
  return provider ? getProviderCredential(provider, props.draftSecrets) : ''
}

function updatePresetCredential(event) {
  setProviderSecret(editorProvider.value, event.target.value)
  invalidateConnectionState()
}

function switchDeepLVariant(event) {
  const providerId = event.target.value
  selectProvider(providerId)
  editorProviderId.value = providerId
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
    'invalid-provider': 'SETTINGS_TRANSLATION_VALIDATION_INVALID'
  }
  return keys[error?.code] || 'SETTINGS_TRANSLATION_VALIDATION_INVALID'
}

function applyCustomCredential(provider, result, previousProvider = null) {
  const providers = ensureDraftSecrets()
  const previousValue = previousProvider
    ? getProviderCredential(previousProvider, props.draftSecrets)
    : ''
  const value = result.credentialValue || previousValue

  if (previousProvider && previousProvider.id !== result.provider.id) {
    delete providers[previousProvider.id]
  }

  if (result.provider.auth.mode === PROVIDER_AUTH_MODES.NONE || result.clearCredential) {
    delete providers[result.provider.id]
    return
  }

  if (value) {
    providers[result.provider.id] = {
      [result.credentialField]: value
    }
  }
}

async function saveCustomProvider() {
  if (editorControlsDisabled.value) {
    return
  }

  const existingIds = customProviderIds.value
  const result = validateCustomProviderForm(editorForm, {
    existingIds,
    editingId: editorProviderId.value
  })
  if (!result.valid) {
    formErrors.value = result.errors
    return
  }

  const providers = ensureDraftProviders()
  const previousProvider = editorProviderId.value
    ? providers[editorProviderId.value]
    : null
  const wasActive = activeProviderId.value === previousProvider?.id
  if (wasActive && !await requestCustomProviderAccess(result.provider)) {
    return
  }

  if (previousProvider && previousProvider.id !== result.provider.id) {
    delete providers[previousProvider.id]
  }
  providers[result.provider.id] = result.provider
  if (wasActive) {
    props.draft.translation.providerId = result.provider.id
  }
  applyCustomCredential(result.provider, result, previousProvider)
  closeEditor()
}

function deleteCustomProvider(providerId) {
  if (interactionDisabled.value) {
    return
  }

  const confirmFn = globalThis.confirm
  const confirmed = typeof confirmFn !== 'function' || confirmFn(
    text('SETTINGS_TRANSLATION_CUSTOM_DELETE_CONFIRM')
  )
  if (!confirmed) {
    return
  }

  const providers = ensureDraftProviders()
  delete providers[providerId]
  const secrets = ensureDraftSecrets()
  delete secrets[providerId]
  if (props.draft.translation.providerId === providerId) {
    props.draft.translation.providerId = 'deepl-free'
  }
  if (editorProviderId.value === providerId) {
    closeEditor()
  }
}

function customTestSecrets(result) {
  const secrets = cloneProvider(props.draftSecrets)
  if (!secrets.providers) {
    secrets.providers = {}
  }

  const previousProvider = editorProviderId.value
    ? customProviders.value[editorProviderId.value]
    : null
  const previousValue = previousProvider
    ? getProviderCredential(previousProvider, props.draftSecrets)
    : ''
  const value = result.credentialValue || previousValue
  if (previousProvider && previousProvider.id !== result.provider.id) {
    delete secrets.providers[previousProvider.id]
  }
  if (result.provider.auth.mode !== PROVIDER_AUTH_MODES.NONE && value && !result.clearCredential) {
    secrets.providers[result.provider.id] = {
      [result.credentialField]: value
    }
  } else if (result.clearCredential || result.provider.auth.mode === PROVIDER_AUTH_MODES.NONE) {
    delete secrets.providers[result.provider.id]
  }
  return secrets
}

async function runConnectionTest(provider, secrets = props.draftSecrets) {
  if (!provider || controlsDisabled.value || connectionState.value === 'testing') {
    return
  }

  if (provider.auth.mode !== PROVIDER_AUTH_MODES.NONE &&
      !getProviderCredential(provider, secrets)) {
    connectionState.value = 'error'
    connectionMessageKey.value = 'SETTINGS_TRANSLATION_API_KEY_MISSING'
    return
  }

  const requestId = ++connectionRequestId
  connectionState.value = 'testing'
  connectionMessageKey.value = ''
  try {
    await testTranslationProvider(provider, {
      secrets,
      targetLanguage: translation.value.targetLanguage
    })
    if (requestId !== connectionRequestId) {
      return
    }
    connectionState.value = 'success'
    connectionMessageKey.value = 'SETTINGS_TRANSLATION_TEST_SUCCESS'
  } catch (error) {
    if (requestId !== connectionRequestId) {
      return
    }
    connectionState.value = 'error'
    connectionMessageKey.value = error?.code === 'UNSUPPORTED_CONTEXT'
      ? 'SETTINGS_TRANSLATION_TEST_UNSUPPORTED'
      : 'SETTINGS_TRANSLATION_TEST_FAILURE'
  }
}

function testPresetConnection() {
  runConnectionTest(editorProvider.value)
}

function testCustomConnection() {
  if (editorControlsDisabled.value) {
    return
  }

  const result = validateCustomProviderForm(editorForm, {
    existingIds: customProviderIds.value,
    editingId: editorProviderId.value
  })
  if (!result.valid) {
    formErrors.value = result.errors
    return
  }

  formErrors.value = []
  runConnectionTest(result.provider, customTestSecrets(result))
}

function invalidateConnectionState() {
  if (connectionState.value === 'testing') {
    return
  }

  connectionRequestId += 1
  connectionState.value = 'idle'
  connectionMessageKey.value = ''
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

watch(() => props.draftRevision, () => {
  if (editorMode.value !== 'custom' || !editorProviderId.value) {
    return
  }

  const provider = customProviders.value[editorProviderId.value]
  if (!provider) {
    closeEditor()
    return
  }

  const persistedForm = createCustomProviderForm(provider, props.draftSecrets)
  if (JSON.stringify(editorForm) === JSON.stringify(persistedForm)) {
    Object.assign(editorForm, persistedForm)
  }
})

watch(editorForm, () => {
  invalidateConnectionState()
}, {deep: true})
</script>

<template>
  <section class="settings-card translation-settings" data-testid="settings-translation-form">
    <div class="settings-card__heading">
      <h3>{{ text('SETTINGS_TRANSLATION_CARD_TITLE') }}</h3>
      <p>{{ text('SETTINGS_TRANSLATION_CARD_DESCRIPTION') }}</p>
    </div>

    <label class="settings-switch" for="settings-translation-enabled">
      <input
        id="settings-translation-enabled"
        type="checkbox"
        :checked="translation.enabled"
        :disabled="interactionDisabled"
        data-testid="settings-translation-enabled"
        @change="toggleTranslation"
      >
      <span class="settings-switch__track" aria-hidden="true">
        <span class="settings-switch__thumb" />
      </span>
      <span class="settings-switch__label">
        {{ text('SETTINGS_TRANSLATION_ENABLED') }}
      </span>
    </label>

    <div class="translation-settings__general">
      <div class="translation-settings__field">
        <label for="settings-translation-target-language">
          {{ text('SETTINGS_TRANSLATION_TARGET_LANGUAGE') }}
        </label>
        <span>{{ text('SETTINGS_TRANSLATION_TARGET_LANGUAGE_HINT') }}</span>
        <input
          id="settings-translation-target-language"
          v-model="draft.translation.targetLanguage"
          type="text"
          inputmode="text"
          autocomplete="off"
          spellcheck="false"
          maxlength="12"
          :disabled="interactionDisabled"
          data-testid="settings-translation-target-language"
        >
      </div>
      <div class="translation-settings__field">
        <label for="settings-translation-provider">
          {{ text('SETTINGS_TRANSLATION_PROVIDER') }}
        </label>
        <span>{{ text('SETTINGS_TRANSLATION_PROVIDER_HINT') }}</span>
        <select
          id="settings-translation-provider"
          :value="activeProviderId"
          :disabled="interactionDisabled"
          @change="selectProviderFromControl"
          data-testid="settings-translation-provider"
        >
          <option value="deepl-free">DeepL Free</option>
          <option value="deepl-pro">DeepL Pro</option>
          <option value="gemini">Gemini</option>
          <option
            v-for="(provider, providerId) in customProviders"
            :key="providerId"
            :value="providerId"
          >
            {{ provider.name || providerId }}
          </option>
        </select>
      </div>
    </div>

    <p
      v-if="providerSelectionMessageKey"
      class="translation-settings__selection-status"
      :class="`translation-settings__selection-status--${providerSelectionState}`"
      role="status"
      data-testid="settings-translation-permission-status"
    >
      {{ text(providerSelectionMessageKey) }}
    </p>

    <div class="translation-settings__services">
      <div class="translation-settings__services-heading">
        <h4>{{ text('SETTINGS_TRANSLATION_AVAILABLE_SERVICES') }}</h4>
        <p>{{ text('SETTINGS_TRANSLATION_AVAILABLE_SERVICES_HINT') }}</p>
      </div>

      <article
        v-for="card in providerCards"
        :key="card.id"
        class="translation-provider-card"
        :class="{
          'translation-provider-card--active': isCardActive(card),
          'translation-provider-card--custom': card.custom
        }"
        :data-provider-id="card.id"
      >
        <div class="translation-provider-card__copy">
          <h5>{{ providerName(card) }}</h5>
          <p>{{ text(card.descriptionKey) }}</p>
        </div>
        <span v-if="card.badgeKey" class="translation-provider-card__badge">
          {{ text(card.badgeKey) }}
        </span>
        <div class="translation-provider-card__actions">
          <span
            v-if="isCardActive(card)"
            class="translation-provider-card__active"
          >
            {{ text('SETTINGS_TRANSLATION_ACTIVE') }}
          </span>
          <button
            type="button"
            class="translation-provider-card__action"
            :disabled="interactionDisabled"
            @click="openProviderSettings(card)"
          >
            {{ text('SETTINGS_TRANSLATION_CONFIGURE') }}
          </button>
          <button
            v-if="!isCardActive(card)"
            type="button"
            class="translation-provider-card__use"
            :disabled="interactionDisabled"
            @click="selectCard(card)"
          >
            {{ text('SETTINGS_TRANSLATION_USE') }}
          </button>
          <button
            v-if="card.custom"
            type="button"
            class="translation-provider-card__delete"
            :disabled="interactionDisabled"
            :aria-label="text('SETTINGS_TRANSLATION_CUSTOM_DELETE')"
            @click="deleteCustomProvider(card.id)"
          >
            {{ text('SETTINGS_TRANSLATION_CUSTOM_DELETE') }}
          </button>
        </div>
      </article>

      <button
        type="button"
        class="translation-settings__add"
        :disabled="interactionDisabled"
        data-testid="settings-translation-add-custom"
        @click="startCustomProvider"
      >
        + {{ text('SETTINGS_TRANSLATION_CUSTOM_ADD') }}
      </button>

      <p class="translation-settings__note">
        {{ text('SETTINGS_TRANSLATION_EXTERNAL_NOTE') }}
      </p>
    </div>

    <section
      v-if="editorMode === 'preset' && editorProvider"
      class="translation-provider-editor"
      data-testid="settings-translation-preset-editor"
    >
      <div class="translation-provider-editor__heading">
        <div>
          <h4>{{ editorProvider.name }}</h4>
          <p>{{ text('SETTINGS_TRANSLATION_PRESET_DESCRIPTION') }}</p>
        </div>
        <button type="button" class="translation-provider-editor__close" :disabled="controlsDisabled" @click="closeEditor">
          ×
        </button>
      </div>

      <div v-if="editorProviderId === 'deepl-free' || editorProviderId === 'deepl-pro'" class="translation-provider-editor__field">
        <label for="settings-translation-deepl-variant">
          {{ text('SETTINGS_TRANSLATION_DEEPL_VARIANT') }}
        </label>
        <select
          id="settings-translation-deepl-variant"
          :value="editorProviderId"
          :disabled="editorControlsDisabled"
          data-testid="settings-translation-deepl-variant"
          @change="switchDeepLVariant"
        >
          <option value="deepl-free">{{ text('SETTINGS_TRANSLATION_DEEPL_FREE') }}</option>
          <option value="deepl-pro">{{ text('SETTINGS_TRANSLATION_DEEPL_PRO') }}</option>
        </select>
      </div>

      <div v-if="editorProvider.auth.mode !== PROVIDER_AUTH_MODES.NONE" class="translation-provider-editor__field">
        <label for="settings-translation-preset-api-key">
          {{ text('SETTINGS_TRANSLATION_API_KEY') }}
        </label>
        <div class="translation-provider-editor__secret">
          <input
            id="settings-translation-preset-api-key"
            :type="showApiKey ? 'text' : 'password'"
            :value="presetCredentialValue(editorProvider)"
            autocomplete="new-password"
            :disabled="editorControlsDisabled"
            :placeholder="editorHasCredential ? '••••••••••••••••' : text('SETTINGS_TRANSLATION_API_KEY_PLACEHOLDER')"
            data-testid="settings-translation-preset-api-key"
            @input="updatePresetCredential"
          >
          <button
            type="button"
            class="translation-provider-editor__show-secret"
            :disabled="editorControlsDisabled"
            :aria-label="text(showApiKey ? 'SETTINGS_TRANSLATION_HIDE_KEY' : 'SETTINGS_TRANSLATION_SHOW_KEY')"
            @click="showApiKey = !showApiKey"
          >
            {{ text(showApiKey ? 'SETTINGS_TRANSLATION_HIDE_KEY' : 'SETTINGS_TRANSLATION_SHOW_KEY') }}
          </button>
        </div>
        <span>{{ text('SETTINGS_TRANSLATION_API_KEY_HINT') }}</span>
        <p v-if="!presetCredentialValue(editorProvider)" class="translation-provider-editor__warning" role="alert">
          {{ text('SETTINGS_TRANSLATION_API_KEY_MISSING') }}
        </p>
      </div>

      <div class="translation-provider-editor__actions">
        <button
          type="button"
          class="translation-provider-editor__test"
          :disabled="editorControlsDisabled"
          data-testid="settings-translation-test"
          @click="testPresetConnection"
        >
          {{ text(connectionState === 'testing' ? 'SETTINGS_TRANSLATION_TESTING' : 'SETTINGS_TRANSLATION_TEST') }}
        </button>
        <button type="button" class="translation-provider-editor__cancel" @click="closeEditor">
          {{ text('SETTINGS_TRANSLATION_CUSTOM_CANCEL') }}
        </button>
      </div>
      <p
        v-if="connectionMessageKey"
        class="translation-provider-editor__result"
        :class="`translation-provider-editor__result--${connectionState}`"
        role="status"
        data-testid="settings-translation-test-result"
      >
        {{ text(connectionMessageKey) }}
      </p>
    </section>

    <form
      v-if="isEditingCustom"
      class="translation-provider-editor translation-provider-editor--custom"
      data-testid="settings-translation-custom-editor"
      @submit.prevent="saveCustomProvider"
    >
      <div class="translation-provider-editor__heading">
        <div>
          <h4>{{ text(editorProviderId ? 'SETTINGS_TRANSLATION_CUSTOM_EDIT' : 'SETTINGS_TRANSLATION_CUSTOM_TITLE') }}</h4>
          <p>{{ text('SETTINGS_TRANSLATION_CUSTOM_DESCRIPTION') }}</p>
        </div>
        <button type="button" class="translation-provider-editor__close" :disabled="controlsDisabled" @click="closeEditor">
          ×
        </button>
      </div>

      <div class="translation-provider-editor__grid">
        <label class="translation-provider-editor__field">
          {{ text('SETTINGS_TRANSLATION_CUSTOM_NAME') }}
          <input v-model="editorForm.name" type="text" autocomplete="off" :disabled="editorControlsDisabled" data-testid="settings-custom-name">
          <span>{{ text('SETTINGS_TRANSLATION_CUSTOM_NAME_HINT') }}</span>
        </label>

        <label class="translation-provider-editor__field">
          {{ text('SETTINGS_TRANSLATION_CUSTOM_URL') }}
          <input v-model="editorForm.url" type="url" autocomplete="off" placeholder="https://api.example.com/translate" :disabled="editorControlsDisabled" data-testid="settings-custom-url">
          <span>{{ text('SETTINGS_TRANSLATION_CUSTOM_URL_HINT') }}</span>
        </label>

        <label class="translation-provider-editor__field">
          {{ text('SETTINGS_TRANSLATION_CUSTOM_METHOD') }}
          <select v-model="editorForm.method" :disabled="editorControlsDisabled" data-testid="settings-custom-method">
            <option value="POST">POST</option>
            <option value="PUT">PUT</option>
            <option value="PATCH">PATCH</option>
          </select>
        </label>

        <label class="translation-provider-editor__field">
          {{ text('SETTINGS_TRANSLATION_CUSTOM_AUTH_MODE') }}
          <select v-model="editorForm.authMode" :disabled="editorControlsDisabled" data-testid="settings-custom-auth-mode" @change="syncAuthDefaults">
            <option value="none">{{ text('SETTINGS_TRANSLATION_AUTH_NONE') }}</option>
            <option value="api-key">{{ text('SETTINGS_TRANSLATION_AUTH_API_KEY') }}</option>
            <option value="bearer">{{ text('SETTINGS_TRANSLATION_AUTH_BEARER') }}</option>
            <option value="custom">{{ text('SETTINGS_TRANSLATION_AUTH_CUSTOM') }}</option>
          </select>
        </label>
      </div>

      <div v-if="editorForm.authMode !== 'none'" class="translation-provider-editor__grid">
        <label class="translation-provider-editor__field">
          {{ text('SETTINGS_TRANSLATION_CUSTOM_AUTH_LOCATION') }}
          <select v-model="editorForm.authLocation" :disabled="editorControlsDisabled" data-testid="settings-custom-auth-location">
            <option value="header">{{ text('SETTINGS_TRANSLATION_AUTH_HEADER') }}</option>
            <option value="query">{{ text('SETTINGS_TRANSLATION_AUTH_QUERY') }}</option>
          </select>
        </label>

        <label class="translation-provider-editor__field">
          {{ text('SETTINGS_TRANSLATION_CUSTOM_AUTH_HEADER') }}
          <input v-model="editorForm.authHeaderName" type="text" autocomplete="off" :disabled="editorControlsDisabled" data-testid="settings-custom-auth-header">
        </label>

        <label class="translation-provider-editor__field">
          {{ text('SETTINGS_TRANSLATION_CUSTOM_AUTH_PREFIX') }}
          <input v-model="editorForm.authPrefix" type="text" autocomplete="off" :disabled="editorControlsDisabled" data-testid="settings-custom-auth-prefix">
        </label>

        <label class="translation-provider-editor__field">
          {{ text('SETTINGS_TRANSLATION_API_KEY') }}
          <div class="translation-provider-editor__secret">
            <input
              v-model="editorForm.apiKey"
              :type="showApiKey ? 'text' : 'password'"
              autocomplete="new-password"
              :disabled="editorControlsDisabled"
              :placeholder="editorForm.hasCredential ? '••••••••••••••••' : text('SETTINGS_TRANSLATION_API_KEY_PLACEHOLDER')"
              data-testid="settings-custom-api-key"
            >
            <button
              type="button"
              class="translation-provider-editor__show-secret"
              :disabled="editorControlsDisabled"
              @click="showApiKey = !showApiKey"
            >
              {{ text(showApiKey ? 'SETTINGS_TRANSLATION_HIDE_KEY' : 'SETTINGS_TRANSLATION_SHOW_KEY') }}
            </button>
          </div>
          <span>{{ text('SETTINGS_TRANSLATION_API_KEY_HINT') }}</span>
          <label v-if="editorForm.hasCredential" class="translation-provider-editor__clear-secret">
            <input v-model="editorForm.clearCredential" type="checkbox" :disabled="editorControlsDisabled">
            {{ text('SETTINGS_TRANSLATION_CUSTOM_CLEAR_KEY') }}
          </label>
        </label>
      </div>

      <label class="translation-provider-editor__field">
        {{ text('SETTINGS_TRANSLATION_CUSTOM_HEADERS') }}
        <textarea v-model="editorForm.headersText" rows="3" spellcheck="false" :disabled="editorControlsDisabled" data-testid="settings-custom-headers" />
        <span>{{ text('SETTINGS_TRANSLATION_CUSTOM_HEADERS_HINT') }}</span>
      </label>

      <label class="translation-provider-editor__field">
        {{ text('SETTINGS_TRANSLATION_CUSTOM_BODY') }}
        <textarea v-model="editorForm.bodyTemplateText" rows="6" spellcheck="false" :disabled="editorControlsDisabled" data-testid="settings-custom-body" />
        <span>{{ text('SETTINGS_TRANSLATION_CUSTOM_BODY_HINT') }}</span>
      </label>

      <label class="translation-provider-editor__field">
        {{ text('SETTINGS_TRANSLATION_CUSTOM_RESPONSE_PATH') }}
        <input v-model="editorForm.responsePath" type="text" autocomplete="off" :disabled="editorControlsDisabled" data-testid="settings-custom-response-path">
        <span>{{ text('SETTINGS_TRANSLATION_CUSTOM_RESPONSE_PATH_HINT') }}</span>
      </label>

      <ul v-if="formErrors.length" class="translation-provider-editor__errors" role="alert" data-testid="settings-custom-errors">
        <li v-for="(error, index) in formErrors" :key="`${error.code}-${index}`">
          {{ text(errorTextKey(error)) }}
        </li>
      </ul>

      <div class="translation-provider-editor__actions">
        <button type="submit" class="translation-provider-editor__save" :disabled="editorControlsDisabled" data-testid="settings-custom-save">
          {{ text('SETTINGS_TRANSLATION_CUSTOM_SAVE') }}
        </button>
        <button type="button" class="translation-provider-editor__test" :disabled="editorControlsDisabled" data-testid="settings-custom-test" @click="testCustomConnection">
          {{ text(connectionState === 'testing' ? 'SETTINGS_TRANSLATION_TESTING' : 'SETTINGS_TRANSLATION_TEST') }}
        </button>
        <button type="button" class="translation-provider-editor__cancel" @click="closeEditor">
          {{ text('SETTINGS_TRANSLATION_CUSTOM_CANCEL') }}
        </button>
      </div>
      <p
        v-if="connectionMessageKey"
        class="translation-provider-editor__result"
        :class="`translation-provider-editor__result--${connectionState}`"
        role="status"
        data-testid="settings-translation-test-result"
      >
        {{ text(connectionMessageKey) }}
      </p>
    </form>
  </section>
</template>

<style scoped>
.translation-settings {
  overflow: visible;
}

.translation-settings__general {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 16px;
  padding: 20px 0;
  border-bottom: 1px solid var(--naverdic-settings-divider);
}

.translation-settings__field,
.translation-provider-editor__field {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
  color: var(--naverdic-settings-text);
  font-size: 12px;
  font-weight: 600;
  line-height: 20px;
}

.translation-settings__field > span,
.translation-provider-editor__field > span {
  color: var(--naverdic-settings-text-muted);
  font-size: 11px;
  font-weight: 400;
  line-height: 17px;
}

.translation-settings__field input,
.translation-settings__field select,
.translation-provider-editor__field input,
.translation-provider-editor__field select,
.translation-provider-editor__field textarea {
  width: 100%;
  min-height: 36px;
  padding: 7px 10px;
  color: var(--naverdic-settings-text);
  background: var(--naverdic-input-background-default);
  border: 1px solid var(--naverdic-input-border-default);
  border-radius: var(--naverdic-radius-sm);
  font: inherit;
  font-size: 12px;
  font-weight: 400;
  line-height: 20px;
}

.translation-provider-editor__field textarea {
  min-height: 90px;
  resize: vertical;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 11px;
  line-height: 18px;
}

.translation-settings__field input:focus-visible,
.translation-settings__field select:focus-visible,
.translation-provider-editor__field input:focus-visible,
.translation-provider-editor__field select:focus-visible,
.translation-provider-editor__field textarea:focus-visible,
.translation-provider-editor__show-secret:focus-visible,
.translation-provider-editor__close:focus-visible,
.translation-provider-editor__actions button:focus-visible,
.translation-settings__add:focus-visible,
.translation-provider-card button:focus-visible {
  outline: 2px solid var(--naverdic-color-focus);
  outline-offset: 2px;
  box-shadow: var(--naverdic-input-focus-ring);
}

.translation-settings__services {
  padding-top: 20px;
}

.translation-settings__selection-status {
  margin: 12px 0 0;
  color: var(--naverdic-settings-text-muted);
  font-size: 11px;
  line-height: 17px;
}

.translation-settings__selection-status--error {
  color: var(--naverdic-color-danger);
}

.translation-settings__services-heading h4 {
  margin: 0;
  color: var(--naverdic-settings-text);
  font-size: 15px;
  font-weight: 700;
  line-height: 24px;
}

.translation-settings__services-heading p {
  margin: 4px 0 16px;
  color: var(--naverdic-settings-text-muted);
  font-size: 11px;
  line-height: 17px;
}

.translation-provider-card {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 92px;
  margin-bottom: 14px;
  padding: 12px 15px;
  background: var(--naverdic-settings-surface);
  border: 1px solid var(--naverdic-settings-border);
  border-radius: 8px;
}

.translation-provider-card--active {
  background: var(--naverdic-settings-info);
}

.translation-provider-card__copy {
  min-width: 0;
  flex: 1 1 auto;
}

.translation-provider-card__copy h5 {
  margin: 0;
  color: var(--naverdic-settings-text);
  font-size: 14px;
  font-weight: 700;
  line-height: 20px;
}

.translation-provider-card__copy p {
  margin: 5px 0 0;
  color: var(--naverdic-settings-text-muted);
  font-size: 11px;
  line-height: 17px;
}

.translation-provider-card__badge,
.translation-provider-card__active {
  flex: 0 0 auto;
  padding: 3px 9px;
  color: var(--naverdic-settings-primary-text);
  background: var(--naverdic-settings-nav-active);
  border-radius: 999px;
  font-size: 10px;
  font-weight: 700;
  line-height: 18px;
}

.translation-provider-card__actions {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 6px;
}

.translation-provider-card button,
.translation-settings__add,
.translation-provider-editor__actions button {
  min-height: 28px;
  padding: 0 10px;
  border-radius: 7px;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
}

.translation-provider-card button:disabled,
.translation-settings__add:disabled,
.translation-provider-editor__actions button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.translation-provider-card__action,
.translation-provider-card__use,
.translation-provider-card__delete {
  color: var(--naverdic-settings-primary-text);
  background: var(--naverdic-settings-surface);
  border: 1px solid var(--naverdic-settings-border);
}

.translation-provider-card__use {
  background: var(--naverdic-settings-nav-active);
  border-color: transparent;
}

.translation-provider-card__delete {
  color: var(--naverdic-color-danger);
}

.translation-settings__add {
  color: var(--naverdic-settings-primary-text);
  background: var(--naverdic-settings-surface);
  border: 1px dashed var(--naverdic-settings-primary);
}

.translation-settings__note {
  margin: 14px 0 0;
  color: var(--naverdic-settings-text-muted);
  font-size: 11px;
  line-height: 17px;
}

.translation-provider-editor {
  margin-top: 20px;
  padding: 20px;
  background: var(--naverdic-settings-info);
  border: 1px solid var(--naverdic-settings-border);
  border-radius: 10px;
}

.translation-provider-editor__heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}

.translation-provider-editor__heading h4 {
  margin: 0;
  color: var(--naverdic-settings-text);
  font-size: 15px;
  font-weight: 700;
  line-height: 24px;
}

.translation-provider-editor__heading p {
  margin: 4px 0 0;
  color: var(--naverdic-settings-text-muted);
  font-size: 11px;
  line-height: 17px;
}

.translation-provider-editor__close {
  width: 28px;
  height: 28px;
  padding: 0;
  color: var(--naverdic-settings-text-muted);
  background: transparent;
  border: 0;
  font-size: 20px;
  line-height: 28px;
  cursor: pointer;
}

.translation-provider-editor__field {
  margin-bottom: 14px;
}

.translation-provider-editor__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 14px;
}

.translation-provider-editor__secret {
  display: flex;
  gap: 6px;
}

.translation-provider-editor__secret input {
  min-width: 0;
  flex: 1 1 auto;
}

.translation-provider-editor__show-secret {
  flex: 0 0 auto;
  min-height: 36px;
  padding: 0 8px;
  color: var(--naverdic-settings-primary-text);
  background: var(--naverdic-settings-surface);
  border: 1px solid var(--naverdic-settings-border);
  border-radius: var(--naverdic-radius-sm);
  font-size: 10px;
  cursor: pointer;
}

.translation-provider-editor__clear-secret {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--naverdic-color-danger);
  font-size: 11px;
  font-weight: 400;
}

.translation-provider-editor__clear-secret input {
  width: auto;
  min-height: auto;
}

.translation-provider-editor__warning,
.translation-provider-editor__errors {
  margin: 5px 0 0;
  color: var(--naverdic-color-danger);
  font-size: 11px;
  font-weight: 400;
  line-height: 17px;
}

.translation-provider-editor__errors {
  padding: 10px 12px 10px 28px;
  background: #fff5f5;
  border-radius: var(--naverdic-radius-sm);
}

.translation-provider-editor__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-top: 16px;
}

.translation-provider-editor__test,
.translation-provider-editor__save {
  color: var(--naverdic-button-text-default);
  background: var(--naverdic-button-background-default);
  border: 0;
}

.translation-provider-editor__cancel {
  color: var(--naverdic-settings-primary-text);
  background: var(--naverdic-settings-surface);
  border: 1px solid var(--naverdic-settings-border);
}

.translation-provider-editor__result {
  margin: 12px 0 0;
  font-size: 11px;
  font-weight: 600;
  line-height: 18px;
}

.translation-provider-editor__result--success {
  color: var(--naverdic-settings-success);
}

.translation-provider-editor__result--error {
  color: var(--naverdic-color-danger);
}

@media (max-width: 600px) {
  .translation-settings__general,
  .translation-provider-editor__grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .translation-provider-card {
    align-items: flex-start;
    flex-wrap: wrap;
  }

  .translation-provider-card__actions {
    width: 100%;
    justify-content: flex-end;
  }
}
</style>
