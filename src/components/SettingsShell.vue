<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { getText } from '/src/text.js'
import SettingsPreview from '/src/components/SettingsPreview.vue'
import {
  createDefaultSecretsV2,
  createDefaultSettingsV2,
  SETTINGS_NAVIGATION
} from '/src/settings-v2.mjs'
import {
  hasPendingSettingsChanges,
  loadSettingsV2,
  saveSettingsV2,
  shouldWarnBeforeUnload
} from '/src/settings-v2-storage.mjs'
import {hasPendingTranslationChanges} from '/src/translation-settings-state.mjs'

const navigation = SETTINGS_NAVIGATION
const activeNavigationId = ref(navigation[0].id)
const storage = globalThis.chrome?.storage || null

const defaultSettings = createDefaultSettingsV2()
const defaultSecrets = createDefaultSecretsV2()
const persistedSettings = reactive(createDefaultSettingsV2())
const persistedSecrets = reactive(createDefaultSecretsV2())
const draftSettings = reactive(createDefaultSettingsV2())
const draftSecrets = reactive(createDefaultSecretsV2())
const navButtonRefs = ref([])
const isLoading = ref(true)
const isSaving = ref(false)
const migrationPending = ref(false)
const draftRevision = ref(0)
const hasLoadError = ref(false)
const saveState = ref('idle')
const translationEditorDirty = ref(false)

const currentNavigation = computed(() => navigation.find(item => (
  item.id === activeNavigationId.value
)) || navigation[0])

function cloneValue(value) {
  return JSON.parse(JSON.stringify(value))
}

function replaceReactive(target, source) {
  Object.keys(target).forEach(key => {
    if (!Object.prototype.hasOwnProperty.call(source, key)) {
      delete target[key]
    }
  })
  Object.assign(target, cloneValue(source))
}

const hasPendingChanges = computed(() => hasPendingTranslationChanges(
  hasPendingSettingsChanges(
    {settings: persistedSettings, secrets: persistedSecrets},
    {settings: draftSettings, secrets: draftSecrets}
  ),
  translationEditorDirty.value
))

const canSave = computed(() => (
  !isLoading.value &&
  !isSaving.value &&
  (hasPendingChanges.value || migrationPending.value)
))

const statusMessageKey = computed(() => {
  if (isLoading.value) {
    return 'SETTINGS_SHELL_STATUS_LOADING'
  }
  if (isSaving.value) {
    return 'SETTINGS_SHELL_STATUS_SAVING'
  }
  if (hasLoadError.value) {
    return 'SETTINGS_SHELL_STATUS_LOAD_ERROR'
  }
  if (saveState.value === 'error' || migrationPending.value) {
    return 'SETTINGS_SHELL_STATUS_SAVE_ERROR'
  }
  if (saveState.value === 'reset') {
    return 'SETTINGS_SHELL_STATUS_RESET'
  }
  if (hasPendingChanges.value) {
    return 'SETTINGS_SHELL_STATUS_UNSAVED'
  }
  return 'SETTINGS_SHELL_STATUS_SAVED'
})

const statusClass = computed(() => ({
  'settings-header__status--unsaved': hasPendingChanges.value || migrationPending.value,
  'settings-header__status--error': hasLoadError.value ||
    saveState.value === 'error' || migrationPending.value,
  'settings-header__status--saving': isLoading.value || isSaving.value
}))

function text(key, placeholders = undefined) {
  return getText(key, placeholders)
}

function setTranslationEditorDirty(value) {
  translationEditorDirty.value = Boolean(value)
}

function resetDraft() {
  const confirmMessage = text('SETTINGS_SHELL_RESET_CONFIRM')
  const confirmFn = globalThis.confirm
  if (typeof confirmFn === 'function' && !confirmFn(confirmMessage)) {
    return
  }

  replaceReactive(draftSettings, defaultSettings)
  replaceReactive(draftSecrets, defaultSecrets)
  draftRevision.value += 1
  setTranslationEditorDirty(false)
  saveState.value = 'reset'
}

async function initializeSettings() {
  isLoading.value = true
  hasLoadError.value = false
  saveState.value = 'idle'

  try {
    const loaded = await loadSettingsV2(storage)
    replaceReactive(persistedSettings, loaded.settings)
    replaceReactive(persistedSecrets, loaded.secrets)
    replaceReactive(draftSettings, loaded.settings)
    replaceReactive(draftSecrets, loaded.secrets)
    draftRevision.value += 1
    migrationPending.value = loaded.migrationNeeded

    if (loaded.migrationNeeded) {
      try {
        await saveSettingsV2(storage, loaded)
        migrationPending.value = false
      } catch (_error) {
        saveState.value = 'error'
      }
    }
  } catch (_error) {
    hasLoadError.value = true
  } finally {
    isLoading.value = false
  }
}

async function saveDraft() {
  if (!canSave.value) {
    return
  }

  isSaving.value = true
  saveState.value = 'saving'

  try {
    const saved = await saveSettingsV2(storage, {
      settings: draftSettings,
      secrets: draftSecrets
    })
    replaceReactive(persistedSettings, saved.settings)
    replaceReactive(persistedSecrets, saved.secrets)
    replaceReactive(draftSettings, saved.settings)
    replaceReactive(draftSecrets, saved.secrets)
    draftRevision.value += 1
    // A Custom provider editor only reports dirty until its own validated
    // form save commits the provider into draftSettings/draftSecrets. Keep
    // this flag intact here so a top-level save cannot silently discard an
    // editor that has not been committed yet.
    migrationPending.value = false
    hasLoadError.value = false
    saveState.value = 'success'
  } catch (_error) {
    saveState.value = 'error'
  } finally {
    isSaving.value = false
  }
}

function handleBeforeUnload(event) {
  if (!shouldWarnBeforeUnload(hasPendingChanges.value)) {
    return
  }

  event.preventDefault()
  event.returnValue = ''
}

function selectNavigation(item) {
  if (item.kind !== 'page') {
    return
  }

  activeNavigationId.value = item.id
}

function setNavigationRef(element, index) {
  if (element) {
    navButtonRefs.value[index] = element
  }
}

function focusNavigation(index) {
  const item = navigation[index]
  if (!item) {
    return
  }

  navButtonRefs.value[index]?.focus()
  selectNavigation(item)
}

function handleNavigationKeydown(event, index) {
  const lastIndex = navigation.length - 1
  let nextIndex = index

  if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
    nextIndex = index === lastIndex ? 0 : index + 1
  } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
    nextIndex = index === 0 ? lastIndex : index - 1
  } else if (event.key === 'Home') {
    nextIndex = 0
  } else if (event.key === 'End') {
    nextIndex = lastIndex
  } else {
    return
  }

  event.preventDefault()
  focusNavigation(nextIndex)
}

defineExpose({
  activeNavigationId,
  canSave,
  currentNavigation,
  draftSettings,
  draftSecrets,
  draftRevision,
  hasPendingChanges,
  initializeSettings,
  isLoading,
  isSaving,
  migrationPending,
  navigation,
  persistedSettings,
  persistedSecrets,
  resetDraft,
  saveDraft,
  selectNavigation,
  setTranslationEditorDirty,
  translationEditorDirty
})

onMounted(() => {
  globalThis.window?.addEventListener('beforeunload', handleBeforeUnload)
  initializeSettings()
})

onBeforeUnmount(() => {
  globalThis.window?.removeEventListener('beforeunload', handleBeforeUnload)
})
</script>

<template>
  <main class="settings-shell" data-testid="settings-shell">
    <header class="settings-header">
      <h1 class="settings-header__title">
        {{ text('SETTINGS_PRODUCT_TITLE') }}
      </h1>

      <div class="settings-header__actions" aria-live="polite">
        <span
          class="settings-header__status"
          :class="statusClass"
          data-testid="settings-save-status"
          :data-status="statusMessageKey"
        >
          {{ text(statusMessageKey) }}
        </span>
        <button
          type="button"
          class="settings-header__save"
          data-testid="settings-save-button"
          :disabled="!canSave"
          :aria-label="text('SETTINGS_SHELL_SAVE')"
          @click="saveDraft"
        >
          {{ text('SETTINGS_SHELL_SAVE') }}
        </button>
      </div>
    </header>

    <div class="settings-body">
      <aside class="settings-sidebar">
        <div class="settings-sidebar__heading">
          {{ text('SETTINGS_SIDEBAR_HEADING') }}
        </div>

        <nav
          class="settings-navigation"
          :aria-label="text('SETTINGS_SIDEBAR_HEADING')"
        >
          <template
            v-for="(item, index) in navigation"
            :key="item.id"
          >
            <button
              v-if="item.kind === 'page'"
              :ref="element => setNavigationRef(element, index)"
              type="button"
              class="settings-navigation__item"
              :class="{ 'settings-navigation__item--active': activeNavigationId === item.id }"
              :data-navigation-id="item.id"
              :aria-current="activeNavigationId === item.id ? 'page' : undefined"
              @click="selectNavigation(item)"
              @keydown="handleNavigationKeydown($event, index)"
            >
              <span class="settings-navigation__label">
                {{ text(item.labelKey) }}
              </span>
              <span
                v-if="activeNavigationId === item.id"
                class="settings-navigation__indicator"
                aria-hidden="true"
              />
            </button>

            <a
              v-else
              :ref="element => setNavigationRef(element, index)"
              class="settings-navigation__item settings-navigation__item--external"
              :href="item.url"
              target="_blank"
              rel="noopener noreferrer"
              :data-navigation-id="item.id"
              @keydown="handleNavigationKeydown($event, index)"
            >
              <span class="settings-navigation__label">
                {{ text(item.labelKey) }}
              </span>
            </a>
          </template>
        </nav>

        <div class="settings-sidebar__version">
          {{ text('SETTINGS_SHELL_VERSION') }}
        </div>
      </aside>

      <section
        class="settings-content"
        :class="{'settings-content--translation': currentNavigation.id === 'translation-service'}"
        :aria-labelledby="`settings-page-title-${currentNavigation.id}`"
      >
        <div class="settings-form-column">
          <div v-if="currentNavigation.id !== 'translation-service'" class="settings-page-heading">
            <h2 :id="`settings-page-title-${currentNavigation.id}`">
              {{ text(currentNavigation.titleKey) }}
            </h2>
            <p>{{ text(currentNavigation.descriptionKey) }}</p>
          </div>

          <slot
            name="page"
            :active-page="currentNavigation"
            :draft="draftSettings"
            :draft-secrets="draftSecrets"
            :draft-revision="draftRevision"
            :is-loading="isLoading"
            :is-saving="isSaving"
            :reset-draft="resetDraft"
            :translation-pending-change="setTranslationEditorDirty"
          >
            <div class="settings-placeholder-card" data-testid="settings-page-placeholder">
              <h3>{{ text('SETTINGS_SHELL_PLACEHOLDER_TITLE') }}</h3>
              <p>{{ text('SETTINGS_SHELL_PLACEHOLDER_DESCRIPTION') }}</p>
              <div class="settings-placeholder-card__note">
                {{ text('SETTINGS_SHELL_DRAFT_NOTE') }}
              </div>
              <div
                v-if="currentNavigation.id === 'advanced'"
                class="settings-placeholder-card__actions"
              >
                <button
                  type="button"
                  class="settings-placeholder-card__reset"
                  data-testid="settings-reset-button"
                  :disabled="isLoading || isSaving"
                  @click="resetDraft"
                >
                  {{ text('RESET') }}
                </button>
              </div>
            </div>
          </slot>
        </div>

        <aside
          v-if="currentNavigation.id !== 'translation-service'"
          class="settings-preview-column"
          :aria-label="text('SETTINGS_SHELL_PREVIEW_TITLE')"
        >
          <div class="settings-preview-heading">
            <h2>{{ text('SETTINGS_SHELL_PREVIEW_TITLE') }}</h2>
            <p>{{ text('SETTINGS_SHELL_PREVIEW_DESCRIPTION') }}</p>
          </div>
          <SettingsPreview
            :active-page="currentNavigation"
            :draft="draftSettings"
            :draft-secrets="draftSecrets"
          />
        </aside>
      </section>
    </div>
  </main>
</template>

<style scoped>
:global(*) {
  box-sizing: border-box;
}

:global(html),
:global(body),
:global(#app) {
  min-width: 0;
  min-height: 100%;
  margin: 0;
}

:global(body) {
  background: var(--naverdic-settings-canvas);
  color: var(--naverdic-settings-text);
  font-family: var(--naverdic-font-family);
  font-size: var(--naverdic-font-size-md);
}

button,
a {
  font: inherit;
}

.settings-shell {
  width: min(1200px, calc(100% - 32px));
  min-height: min(860px, calc(100vh - 32px));
  margin: 16px auto;
  overflow: hidden;
  background: var(--naverdic-settings-page);
  border: 1px solid var(--naverdic-settings-border);
  border-radius: var(--naverdic-settings-radius);
  box-shadow: var(--naverdic-settings-shadow);
}

.settings-header {
  display: flex;
  align-items: center;
  min-height: var(--naverdic-settings-header-height);
  padding: 16px 20px 16px 32px;
  background: var(--naverdic-settings-surface);
  border-bottom: 1px solid var(--naverdic-settings-divider);
}

.settings-header__title {
  margin: 0;
  color: var(--naverdic-settings-text);
  font-size: var(--naverdic-font-size-lg);
  font-weight: var(--naverdic-font-weight-medium);
  line-height: 40px;
}

.settings-header__actions {
  display: flex;
  align-items: center;
  gap: 24px;
  margin-left: auto;
}

.settings-header__status {
  min-width: 84px;
  color: var(--naverdic-settings-success);
  font-size: var(--naverdic-font-size-sm);
  font-weight: var(--naverdic-font-weight-medium);
  line-height: 40px;
  text-align: right;
}

.settings-header__status--unsaved {
  color: var(--naverdic-color-warning);
}

.settings-header__status--error {
  color: var(--naverdic-color-danger);
}

.settings-header__status--saving {
  color: var(--naverdic-settings-text-muted);
}

.settings-header__save {
  width: 68px;
  min-height: 40px;
  padding: 0 8px;
  color: var(--naverdic-button-text-default);
  background: var(--naverdic-button-background-default);
  border: 0;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 700;
  line-height: 40px;
}

.settings-header__save:disabled {
  cursor: not-allowed;
  opacity: 0.65;
}

.settings-body {
  display: grid;
  grid-template-columns: var(--naverdic-settings-sidebar-width) minmax(0, 1fr);
  min-height: calc(min(860px, 100vh - 32px) - var(--naverdic-settings-header-height));
}

.settings-sidebar {
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding: 24px 0;
  background: var(--naverdic-settings-surface);
}

.settings-sidebar__heading {
  min-height: 24px;
  margin: 0 24px 16px;
  color: var(--naverdic-settings-text-subtle);
  font-size: var(--naverdic-font-size-sm);
  font-weight: 700;
  line-height: 24px;
}

.settings-navigation {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 0 16px;
}

.settings-navigation__item {
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;
  min-height: 40px;
  padding: 0 16px;
  overflow: hidden;
  color: var(--naverdic-settings-nav-text);
  background: transparent;
  border: 0;
  border-radius: 8px;
  font-size: 13px;
  font-weight: var(--naverdic-font-weight-medium);
  line-height: 40px;
  text-align: left;
  text-decoration: none;
  cursor: pointer;
}

.settings-navigation__item:hover {
  background: var(--naverdic-settings-nav-hover);
}

.settings-navigation__item--active {
  color: var(--naverdic-settings-primary-text);
  background: var(--naverdic-settings-nav-active);
  font-weight: 700;
}

.settings-navigation__item--active:hover {
  background: var(--naverdic-settings-nav-active);
}

.settings-navigation__item:focus-visible,
.settings-header__save:focus-visible,
.settings-navigation__item--external:focus-visible {
  outline: 2px solid var(--naverdic-color-focus);
  outline-offset: 2px;
  box-shadow: var(--naverdic-button-focus-ring);
}

.settings-navigation__indicator {
  position: absolute;
  top: 10px;
  left: 0;
  width: 3px;
  height: 20px;
  background: var(--naverdic-settings-primary);
  border-radius: 2px;
}

.settings-sidebar__version {
  margin: auto 24px 0;
  color: var(--naverdic-settings-text-subtle);
  font-size: var(--naverdic-font-size-xs);
  line-height: 20px;
}

.settings-content {
  display: grid;
  grid-template-columns: minmax(0, 556px) minmax(220px, 300px);
  gap: 68px;
  min-width: 0;
  padding: 30px 40px;
  background: var(--naverdic-settings-page);
}

.settings-content--translation {
  grid-template-columns: minmax(0, 300px) minmax(0, 556px);
  gap: 28px;
}

.settings-content--translation .settings-form-column {
  grid-column: 1 / -1;
}

.settings-form-column,
.settings-preview-column {
  min-width: 0;
}

.settings-page-heading,
.settings-preview-heading {
  min-height: 42px;
}

.settings-page-heading h2,
.settings-preview-heading h2 {
  margin: 0;
  color: var(--naverdic-settings-text);
  font-size: 22px;
  font-weight: 700;
  line-height: 32px;
}

.settings-page-heading p,
.settings-preview-heading p {
  margin: 0;
  color: var(--naverdic-settings-text-muted);
  font-size: 13px;
  line-height: 20px;
}

.settings-placeholder-card {
  min-height: 220px;
  margin-top: 12px;
  padding: 24px;
  background: var(--naverdic-settings-surface);
  border: 1px solid var(--naverdic-settings-border);
  border-radius: 10px;
}

.settings-placeholder-card h3 {
  margin: 0 0 8px;
  color: var(--naverdic-settings-text);
  font-size: 15px;
  font-weight: 700;
  line-height: 24px;
}

.settings-placeholder-card p {
  margin: 0;
  color: var(--naverdic-settings-text-muted);
  font-size: 12px;
  line-height: 20px;
}

.settings-placeholder-card__note {
  margin-top: 24px;
  padding: 12px 14px;
  color: var(--naverdic-settings-primary-text);
  background: var(--naverdic-settings-info);
  border-radius: 8px;
  font-size: 11px;
  line-height: 18px;
}

.settings-placeholder-card__actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 20px;
}

.settings-placeholder-card__reset {
  min-height: 34px;
  padding: 0 16px;
  color: var(--naverdic-color-text-disabled);
  background: var(--naverdic-input-background-disabled);
  border: 1px solid var(--naverdic-settings-border);
  border-radius: var(--naverdic-radius-sm);
  font-size: var(--naverdic-font-size-sm);
  font-weight: var(--naverdic-font-weight-medium);
  cursor: not-allowed;
}

.settings-placeholder-card__reset:not(:disabled) {
  color: var(--naverdic-color-danger);
  background: var(--naverdic-settings-surface);
  border-color: var(--naverdic-color-danger);
  cursor: pointer;
}

.settings-placeholder-card__reset:not(:disabled):hover {
  background: var(--naverdic-settings-danger-hover);
}

@media (max-width: 1050px) {
  .settings-content {
    grid-template-columns: minmax(0, 556px);
  }

  .settings-content--translation {
    grid-template-columns: minmax(0, 1fr);
  }

  .settings-preview-column {
    display: none;
  }
}

@media (max-width: 760px) {
  .settings-shell {
    width: 100%;
    min-height: 100vh;
    margin: 0;
    border-radius: 0;
  }

  .settings-body {
    min-height: calc(100vh - var(--naverdic-settings-header-height));
  }

  .settings-content {
    padding: 24px;
  }
}

@media (max-width: 600px) {
  .settings-header {
    padding: 12px 16px;
  }

  .settings-header__title {
    max-width: 60%;
    overflow: hidden;
    font-size: 14px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .settings-header__actions {
    gap: 12px;
  }

  .settings-header__status {
    display: none;
  }

  .settings-body {
    display: block;
  }

  .settings-sidebar {
    display: block;
    padding: 12px 0;
    border-bottom: 1px solid var(--naverdic-settings-divider);
  }

  .settings-sidebar__heading,
  .settings-sidebar__version {
    display: none;
  }

  .settings-navigation {
    flex-direction: row;
    gap: 4px;
    padding: 0 12px;
    overflow-x: auto;
  }

  .settings-navigation__item {
    flex: 0 0 auto;
    width: auto;
    min-width: max-content;
    padding: 0 14px;
  }

  .settings-navigation__indicator {
    top: auto;
    right: 16px;
    bottom: 0;
    left: 16px;
    width: auto;
    height: 3px;
  }

  .settings-content {
    display: block;
    padding: 24px 16px 32px;
  }
}
</style>
