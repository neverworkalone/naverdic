<script setup>
import { computed, ref, watch } from 'vue'
import { getText } from '/src/text.js'
import { getTriggerLabels } from '/src/content-interaction.mjs'
import { resolveCssColor } from '/src/settings-colors.mjs'
import {
  formatDenyList,
  parseDenyListInput
} from '/src/settings-sites.mjs'
import TranslationSettings from '/src/components/TranslationSettings.vue'

const props = defineProps({
  activePage: {
    type: Object,
    required: true
  },
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
  },
  resetDraft: {
    type: Function,
    default: null
  }
})

const {ctrl, alt} = getTriggerLabels()
const siteInput = ref('')
const invalidSiteEntries = ref([])
const controlsDisabled = computed(() => props.isLoading || props.isSaving)

const pageId = computed(() => props.activePage?.id || '')
const siteDomains = computed(() => props.draft.sites?.denyList || [])

function text(key, placeholders = undefined) {
  return getText(key, placeholders)
}

function syncSiteInput() {
  siteInput.value = formatDenyList(siteDomains.value)
  invalidSiteEntries.value = []
}

function updateSiteInput(event) {
  const value = event.target.value
  const parsed = parseDenyListInput(value)
  siteInput.value = value
  invalidSiteEntries.value = parsed.invalidEntries
  props.draft.sites.denyList = parsed.domains
}

watch(() => props.draftRevision, syncSiteInput, {immediate: true})
</script>

<template>
  <div
    class="settings-page"
    :data-page-id="pageId"
    :data-testid="`settings-page-${pageId}`"
  >
    <section
      v-if="pageId === 'appearance'"
      class="settings-card"
      data-testid="settings-appearance-form"
    >
      <div class="settings-card__heading">
        <h3>{{ text('SETTINGS_SECTION_POPUP_APPEARANCE') }}</h3>
        <p>{{ text('SETTINGS_SECTION_POPUP_APPEARANCE_DESCRIPTION') }}</p>
      </div>

      <div class="settings-field-row">
        <div class="settings-field-row__label">
          <label for="settings-popup-background-color">
            {{ text('SETTINGS_FIELD_BACKGROUND_COLOR') }}
          </label>
          <span>{{ text('SETTINGS_FIELD_BACKGROUND_COLOR_HINT') }}</span>
        </div>
        <div class="settings-color-control">
          <span
            class="settings-color-control__swatch"
            :style="{backgroundColor: resolveCssColor(draft.popup.backgroundColor, '#FFF59D')}"
            aria-hidden="true"
          />
          <input
            id="settings-popup-background-color"
            v-model="draft.popup.backgroundColor"
            type="text"
            autocomplete="off"
            spellcheck="false"
            :disabled="controlsDisabled"
            data-testid="settings-popup-background-color"
          >
        </div>
      </div>

      <div class="settings-field-row">
        <div class="settings-field-row__label">
          <label for="settings-popup-font-color">
            {{ text('SETTINGS_FIELD_FONT_COLOR') }}
          </label>
          <span>{{ text('SETTINGS_FIELD_FONT_COLOR_HINT') }}</span>
        </div>
        <div class="settings-color-control">
          <span
            class="settings-color-control__swatch"
            :style="{backgroundColor: resolveCssColor(draft.popup.fontColor, '#000000')}"
            aria-hidden="true"
          />
          <input
            id="settings-popup-font-color"
            v-model="draft.popup.fontColor"
            type="text"
            autocomplete="off"
            spellcheck="false"
            :disabled="controlsDisabled"
            data-testid="settings-popup-font-color"
          >
        </div>
      </div>

      <div class="settings-field-row">
        <div class="settings-field-row__label">
          <label for="settings-popup-font-size">
            {{ text('SETTINGS_FIELD_FONT_SIZE') }}
          </label>
          <span>{{ text('SETTINGS_FIELD_FONT_SIZE_HINT') }}</span>
        </div>
        <div class="settings-number-control">
          <input
            id="settings-popup-font-size"
            v-model.number="draft.popup.fontSizePt"
            type="number"
            min="1"
            step="1"
            :disabled="controlsDisabled"
            data-testid="settings-popup-font-size"
          >
          <span>pt</span>
        </div>
      </div>

      <a
        class="settings-inline-link"
        href="https://neverworkalone.github.io/naverdic/themes.html"
        target="_blank"
        rel="noopener noreferrer"
      >
        {{ text('SETTINGS_POPUP_THEME_GUIDE') }}
      </a>
    </section>

    <section
      v-else-if="pageId === 'double-click'"
      class="settings-card"
      data-testid="settings-double-click-form"
    >
      <div class="settings-card__heading">
        <h3>{{ text('SETTINGS_SECTION_DOUBLE_CLICK') }}</h3>
        <p>{{ text('SETTINGS_SECTION_DOUBLE_CLICK_DESCRIPTION') }}</p>
      </div>

      <label class="settings-switch" for="settings-double-click-enabled">
        <input
          id="settings-double-click-enabled"
          v-model="draft.dictionary.doubleClick.enabled"
          type="checkbox"
          :disabled="controlsDisabled"
          data-testid="settings-double-click-enabled"
        >
        <span class="settings-switch__track" aria-hidden="true">
          <span class="settings-switch__thumb" />
        </span>
        <span class="settings-switch__label">
          {{ text('SETTINGS_FIELD_DOUBLE_CLICK_ENABLED') }}
        </span>
      </label>

      <div class="settings-field-row">
        <div class="settings-field-row__label">
          <label for="settings-double-click-trigger">
            {{ text('SETTINGS_FIELD_TRIGGER_KEY') }}
          </label>
          <span>{{ text('SETTINGS_FIELD_DOUBLE_CLICK_TRIGGER_HINT') }}</span>
        </div>
        <select
          id="settings-double-click-trigger"
          v-model="draft.dictionary.doubleClick.triggerKey"
          :disabled="controlsDisabled"
          data-testid="settings-double-click-trigger"
        >
          <option value="none">{{ text('DCLICK') }}</option>
          <option value="ctrl">{{ text('CTRL_DCLICK', [ctrl]) }}</option>
          <option value="alt">{{ text('ALT_DCLICK', [alt]) }}</option>
          <option value="ctrlalt">{{ text('CTRL_ALT_DCLICK', [ctrl, alt]) }}</option>
        </select>
      </div>

      <div class="settings-field-row">
        <div class="settings-field-row__label">
          <label for="settings-double-click-speed">
            {{ text('SETTINGS_FIELD_DOUBLE_CLICK_SPEED') }}
          </label>
          <span>{{ text('SETTINGS_FIELD_DOUBLE_CLICK_SPEED_HINT') }}</span>
        </div>
        <select
          id="settings-double-click-speed"
          v-model.number="draft.dictionary.doubleClick.speedMs"
          :disabled="controlsDisabled"
          data-testid="settings-double-click-speed"
        >
          <option :value="200">{{ text('DCLICK_SPEED_FASTEST') }} · 200ms</option>
          <option :value="300">{{ text('DCLICK_SPEED_FAST') }} · 300ms</option>
          <option :value="400">{{ text('DCLICK_SPEED_SLOW') }} · 400ms</option>
          <option :value="500">{{ text('DCLICK_SPEED_SLOWEST') }} · 500ms</option>
        </select>
      </div>
    </section>

    <section
      v-else-if="pageId === 'behavior'"
      class="settings-card"
      data-testid="settings-behavior-form"
    >
      <div class="settings-card__heading">
        <h3>{{ text('SETTINGS_SECTION_DRAG') }}</h3>
        <p>{{ text('SETTINGS_SECTION_DRAG_DESCRIPTION') }}</p>
      </div>

      <label class="settings-switch" for="settings-drag-enabled">
        <input
          id="settings-drag-enabled"
          v-model="draft.dictionary.drag.enabled"
          type="checkbox"
          :disabled="controlsDisabled"
          data-testid="settings-drag-enabled"
        >
        <span class="settings-switch__track" aria-hidden="true">
          <span class="settings-switch__thumb" />
        </span>
        <span class="settings-switch__label">
          {{ text('SETTINGS_FIELD_DRAG_ENABLED') }}
        </span>
      </label>

      <div class="settings-field-row">
        <div class="settings-field-row__label">
          <label for="settings-drag-trigger">
            {{ text('SETTINGS_FIELD_TRIGGER_KEY') }}
          </label>
          <span>{{ text('SETTINGS_FIELD_DRAG_TRIGGER_HINT') }}</span>
        </div>
        <select
          id="settings-drag-trigger"
          v-model="draft.dictionary.drag.triggerKey"
          :disabled="controlsDisabled"
          data-testid="settings-drag-trigger"
        >
          <option value="none">{{ text('DRAG') }}</option>
          <option value="ctrl">{{ text('CTRL_DRAG', [ctrl]) }}</option>
          <option value="alt">{{ text('ALT_DRAG', [alt]) }}</option>
          <option value="ctrlalt">{{ text('CTRL_ALT_DRAG', [ctrl, alt]) }}</option>
        </select>
      </div>
    </section>

    <section
      v-else-if="pageId === 'blocked-sites'"
      class="settings-card"
      data-testid="settings-blocked-sites-form"
    >
      <div class="settings-card__heading">
        <h3>{{ text('SETTINGS_SECTION_BLOCKED_SITES') }}</h3>
        <p>{{ text('SETTINGS_SECTION_BLOCKED_SITES_DESCRIPTION') }}</p>
      </div>

      <label class="settings-switch" for="settings-blocked-sites-enabled">
        <input
          id="settings-blocked-sites-enabled"
          v-model="draft.sites.denyListEnabled"
          type="checkbox"
          :disabled="controlsDisabled"
          data-testid="settings-blocked-sites-enabled"
        >
        <span class="settings-switch__track" aria-hidden="true">
          <span class="settings-switch__thumb" />
        </span>
        <span class="settings-switch__label">
          {{ text('SETTINGS_FIELD_BLOCKED_SITES_ENABLED') }}
        </span>
      </label>

      <div class="settings-textarea-field">
        <label for="settings-blocked-sites-input">
          {{ text('SETTINGS_FIELD_BLOCKED_SITES') }}
        </label>
        <span class="settings-textarea-field__hint">
          {{ text('SETTINGS_BLOCKED_SITES_HINT') }}
        </span>
        <textarea
          id="settings-blocked-sites-input"
          :value="siteInput"
          rows="5"
          :placeholder="text('SETTINGS_BLOCKED_SITES_PLACEHOLDER')"
          :disabled="controlsDisabled"
          data-testid="settings-blocked-sites-input"
          @input="updateSiteInput"
        />
        <p
          v-if="invalidSiteEntries.length"
          class="settings-field-error"
          role="alert"
          data-testid="settings-blocked-sites-error"
        >
          {{ text('SETTINGS_BLOCKED_SITES_INVALID', [invalidSiteEntries.length]) }}
        </p>
      </div>

      <div class="settings-normalized-sites">
        <div class="settings-normalized-sites__heading">
          {{ text('SETTINGS_BLOCKED_SITES_NORMALIZED') }}
        </div>
        <div
          v-if="siteDomains.length"
          class="settings-domain-list"
          data-testid="settings-blocked-sites-normalized"
        >
          <span
            v-for="domain in siteDomains"
            :key="domain"
            class="settings-domain-chip"
          >
            {{ domain }}
          </span>
        </div>
        <p v-else class="settings-normalized-sites__empty">
          {{ text('SETTINGS_BLOCKED_SITES_EMPTY') }}
        </p>
      </div>
    </section>

    <TranslationSettings
      v-else-if="pageId === 'translation-service'"
      :draft="draft"
      :draft-secrets="draftSecrets"
      :draft-revision="draftRevision"
      :is-loading="isLoading"
      :is-saving="isSaving"
    />

    <section v-else class="settings-card settings-card--placeholder">
      <h3>{{ text('SETTINGS_SHELL_PLACEHOLDER_TITLE') }}</h3>
      <p>{{ text('SETTINGS_SHELL_PLACEHOLDER_DESCRIPTION') }}</p>
      <div class="settings-placeholder-card__note">
        {{ text('SETTINGS_SHELL_DRAFT_NOTE') }}
      </div>
      <div
        v-if="pageId === 'advanced' && resetDraft"
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
    </section>
  </div>
</template>

<style scoped>
.settings-page {
  min-width: 0;
  margin-top: 12px;
}

.settings-card {
  padding: 24px;
  background: var(--naverdic-settings-surface);
  border: 1px solid var(--naverdic-settings-border);
  border-radius: var(--naverdic-radius-md);
  box-shadow: var(--naverdic-card-shadow-default);
}

.settings-card__heading {
  padding-bottom: 18px;
  border-bottom: 1px solid var(--naverdic-settings-divider);
}

.settings-card__heading h3,
.settings-card--placeholder h3 {
  margin: 0;
  color: var(--naverdic-settings-text);
  font-size: 15px;
  font-weight: 700;
  line-height: 24px;
}

.settings-card__heading p,
.settings-card--placeholder p {
  margin: 4px 0 0;
  color: var(--naverdic-settings-text-muted);
  font-size: 12px;
  line-height: 20px;
}

.settings-field-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  min-height: 68px;
  border-bottom: 1px solid var(--naverdic-settings-divider);
}

.settings-field-row__label,
.settings-textarea-field {
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: 4px;
}

.settings-field-row__label label,
.settings-textarea-field label {
  color: var(--naverdic-settings-text);
  font-size: 13px;
  font-weight: 600;
  line-height: 20px;
}

.settings-field-row__label span,
.settings-textarea-field__hint {
  color: var(--naverdic-settings-text-muted);
  font-size: 11px;
  line-height: 17px;
}

.settings-color-control,
.settings-number-control {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 8px;
}

.settings-color-control__swatch {
  width: 20px;
  height: 20px;
  border: 1px solid var(--naverdic-settings-border);
  border-radius: 50%;
  box-shadow: inset 0 0 0 2px var(--naverdic-settings-surface);
}

.settings-color-control input,
.settings-number-control input,
.settings-field-row select,
.settings-textarea-field textarea {
  color: var(--naverdic-settings-text);
  background: var(--naverdic-input-background-default);
  border: 1px solid var(--naverdic-input-border-default);
  border-radius: var(--naverdic-radius-sm);
  font: inherit;
}

.settings-color-control input {
  width: 112px;
  min-height: 36px;
  padding: 0 10px;
  font-size: 12px;
}

.settings-number-control input {
  width: 76px;
  min-height: 36px;
  padding: 0 10px;
  font-size: 12px;
}

.settings-number-control span {
  color: var(--naverdic-settings-text-muted);
  font-size: 12px;
}

.settings-field-row select {
  min-width: 172px;
  min-height: 36px;
  padding: 0 28px 0 10px;
  font-size: 12px;
}

.settings-color-control input:hover,
.settings-number-control input:hover,
.settings-field-row select:hover,
.settings-textarea-field textarea:hover {
  border-color: var(--naverdic-input-border-hover);
}

.settings-color-control input:focus-visible,
.settings-number-control input:focus-visible,
.settings-field-row select:focus-visible,
.settings-textarea-field textarea:focus-visible,
.settings-switch input:focus-visible + .settings-switch__track {
  outline: 2px solid var(--naverdic-color-focus);
  outline-offset: 2px;
  box-shadow: var(--naverdic-input-focus-ring);
}

.settings-inline-link {
  display: inline-block;
  margin-top: 18px;
  color: var(--naverdic-settings-primary-text);
  font-size: 12px;
  font-weight: 600;
  text-decoration: none;
}

.settings-inline-link:hover {
  text-decoration: underline;
}

.settings-switch {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 64px;
  color: var(--naverdic-settings-text);
  cursor: pointer;
}

.settings-switch input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
}

.settings-switch__track {
  position: relative;
  display: inline-flex;
  align-items: center;
  width: 36px;
  height: 20px;
  padding: 2px;
  background: var(--naverdic-settings-text-subtle);
  border-radius: 999px;
  transition: background 120ms ease;
}

.settings-switch__thumb {
  width: 16px;
  height: 16px;
  background: var(--naverdic-settings-surface);
  border-radius: 50%;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.2);
  transition: transform 120ms ease;
}

.settings-switch input:checked + .settings-switch__track {
  background: var(--naverdic-settings-primary);
}

.settings-switch input:checked + .settings-switch__track .settings-switch__thumb {
  transform: translateX(16px);
}

.settings-switch__label {
  font-size: 13px;
  font-weight: 600;
  line-height: 20px;
}

.settings-textarea-field {
  padding-top: 20px;
}

.settings-textarea-field textarea {
  width: 100%;
  min-height: 116px;
  margin-top: 6px;
  padding: 10px 12px;
  resize: vertical;
  font-size: 12px;
  line-height: 20px;
}

.settings-field-error {
  margin: 4px 0 0;
  color: var(--naverdic-color-danger);
  font-size: 11px;
  line-height: 17px;
}

.settings-normalized-sites {
  margin-top: 20px;
  padding-top: 18px;
  border-top: 1px solid var(--naverdic-settings-divider);
}

.settings-normalized-sites__heading {
  color: var(--naverdic-settings-text);
  font-size: 12px;
  font-weight: 600;
  line-height: 20px;
}

.settings-domain-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}

.settings-domain-chip {
  padding: 5px 9px;
  color: var(--naverdic-settings-primary-text);
  background: var(--naverdic-settings-nav-active);
  border-radius: 999px;
  font-size: 11px;
  line-height: 16px;
}

.settings-normalized-sites__empty {
  margin: 8px 0 0;
  color: var(--naverdic-settings-text-subtle);
  font-size: 11px;
  line-height: 17px;
}

.settings-card--placeholder {
  min-height: 220px;
}

.settings-placeholder-card__note {
  margin-top: 24px;
  padding: 12px 14px;
  color: var(--naverdic-settings-primary-text);
  background: var(--naverdic-settings-info);
  border-radius: var(--naverdic-radius-sm);
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
  color: var(--naverdic-color-danger);
  background: var(--naverdic-settings-surface);
  border: 1px solid var(--naverdic-color-danger);
  border-radius: var(--naverdic-radius-sm);
  font-size: var(--naverdic-font-size-sm);
  font-weight: var(--naverdic-font-weight-medium);
  cursor: pointer;
}

.settings-placeholder-card__reset:hover {
  background: var(--naverdic-settings-danger-hover);
}

.settings-placeholder-card__reset:disabled {
  cursor: not-allowed;
  opacity: 0.65;
}

@media (max-width: 600px) {
  .settings-card {
    padding: 18px;
  }

  .settings-field-row {
    align-items: flex-start;
    flex-direction: column;
    gap: 10px;
    padding: 14px 0;
  }

  .settings-color-control,
  .settings-number-control,
  .settings-field-row select {
    align-self: stretch;
  }

  .settings-field-row select {
    width: 100%;
  }
}
</style>
