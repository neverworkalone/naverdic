<script setup>
import { computed, ref, watch } from 'vue'
import { getText } from '/src/text.js'
import { getTriggerLabels } from '/src/content-interaction.mjs'
import {
  formatDenyList,
  parseDenyListInput
} from '/src/settings-sites.mjs'
import {
  APPEARANCE_DEFAULTS,
  FONT_SIZE_MAX_PT,
  FONT_SIZE_MIN_PT,
  changeFontSize,
  colorInputValue,
  normalizeHexColor,
  stepperFontSize
} from '/src/settings-appearance.mjs'
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
  draftResetRevision: {
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
  },
  translationPendingChange: {
    type: Function,
    default: null
  }
})

const {ctrl, alt} = getTriggerLabels()
const siteInput = ref('')
const invalidSiteEntries = ref([])
const backgroundHex = ref('')
const fontHex = ref('')
const invalidBackgroundHex = ref(false)
const invalidFontHex = ref(false)
const controlsDisabled = computed(() => props.isLoading || props.isSaving)

const pageId = computed(() => props.activePage?.id || '')
const siteDomains = computed(() => props.draft.sites?.denyList || [])
const fontSizeValue = computed(() => stepperFontSize(props.draft.popup?.fontSizePt))
const canDecreaseFontSize = computed(() => fontSizeValue.value > FONT_SIZE_MIN_PT)
const canIncreaseFontSize = computed(() => fontSizeValue.value < FONT_SIZE_MAX_PT)

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

function syncAppearanceInputs() {
  const backgroundColor = props.draft.popup?.backgroundColor
  const fontColor = props.draft.popup?.fontColor
  backgroundHex.value = normalizeHexColor(backgroundColor) || String(backgroundColor ?? '')
  fontHex.value = normalizeHexColor(fontColor) || String(fontColor ?? '')
  invalidBackgroundHex.value = false
  invalidFontHex.value = false
}

function updateHexColor(field, event) {
  const value = event.target.value
  const normalized = normalizeHexColor(value)
  const isBackground = field === 'backgroundColor'

  if (isBackground) {
    backgroundHex.value = value
    invalidBackgroundHex.value = !normalized
  } else {
    fontHex.value = value
    invalidFontHex.value = !normalized
  }

  if (!normalized) {
    return
  }

  props.draft.popup[field] = normalized
  if (isBackground) {
    backgroundHex.value = normalized
  } else {
    fontHex.value = normalized
  }
}

function updateColorPicker(field, event) {
  updateHexColor(field, {target: {value: event.target.value}})
}

function updateFontSize(delta) {
  if (controlsDisabled.value) {
    return
  }

  props.draft.popup.fontSizePt = changeFontSize(props.draft.popup.fontSizePt, delta)
}

watch(() => props.draftRevision, syncSiteInput, {immediate: true})
watch(() => props.draftRevision, syncAppearanceInputs, {immediate: true})
</script>

<template>
  <div
    class="settings-page"
    :data-page-id="pageId"
    :data-testid="`settings-page-${pageId}`"
  >
    <section
      v-if="pageId === 'appearance'"
      class="settings-card settings-appearance-card"
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
          <div
            class="settings-color-control__picker-shell"
            :style="{backgroundColor: colorInputValue(draft.popup.backgroundColor, APPEARANCE_DEFAULTS.backgroundColor)}"
          >
            <input
              id="settings-popup-background-color-picker"
              class="settings-color-control__picker"
              :value="colorInputValue(draft.popup.backgroundColor, APPEARANCE_DEFAULTS.backgroundColor)"
              type="color"
              :aria-label="text('SETTINGS_FIELD_BACKGROUND_COLOR_PICKER')"
              :disabled="controlsDisabled"
              data-testid="settings-popup-background-color-picker"
              @input="updateColorPicker('backgroundColor', $event)"
            >
          </div>
          <div class="settings-color-control__hex">
            <input
              id="settings-popup-background-color"
              :value="backgroundHex"
              type="text"
              inputmode="text"
              maxlength="7"
              autocomplete="off"
              spellcheck="false"
              :aria-invalid="invalidBackgroundHex ? 'true' : 'false'"
              :aria-describedby="invalidBackgroundHex ? 'settings-popup-background-color-error' : undefined"
              :disabled="controlsDisabled"
              data-testid="settings-popup-background-color"
              @input="updateHexColor('backgroundColor', $event)"
            >
            <span
              v-if="invalidBackgroundHex"
              id="settings-popup-background-color-error"
              class="settings-field-error"
              role="alert"
            >{{ text('SETTINGS_FIELD_INVALID_HEX') }}</span>
          </div>
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
          <div
            class="settings-color-control__picker-shell"
            :style="{backgroundColor: colorInputValue(draft.popup.fontColor, APPEARANCE_DEFAULTS.fontColor)}"
          >
            <input
              id="settings-popup-font-color-picker"
              class="settings-color-control__picker"
              :value="colorInputValue(draft.popup.fontColor, APPEARANCE_DEFAULTS.fontColor)"
              type="color"
              :aria-label="text('SETTINGS_FIELD_FONT_COLOR_PICKER')"
              :disabled="controlsDisabled"
              data-testid="settings-popup-font-color-picker"
              @input="updateColorPicker('fontColor', $event)"
            >
          </div>
          <div class="settings-color-control__hex">
            <input
              id="settings-popup-font-color"
              :value="fontHex"
              type="text"
              inputmode="text"
              maxlength="7"
              autocomplete="off"
              spellcheck="false"
              :aria-invalid="invalidFontHex ? 'true' : 'false'"
              :aria-describedby="invalidFontHex ? 'settings-popup-font-color-error' : undefined"
              :disabled="controlsDisabled"
              data-testid="settings-popup-font-color"
              @input="updateHexColor('fontColor', $event)"
            >
            <span
              v-if="invalidFontHex"
              id="settings-popup-font-color-error"
              class="settings-field-error"
              role="alert"
            >{{ text('SETTINGS_FIELD_INVALID_HEX') }}</span>
          </div>
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
          <button
            type="button"
            class="settings-number-control__button"
            :aria-label="text('SETTINGS_FIELD_FONT_SIZE_DECREASE')"
            :aria-disabled="canDecreaseFontSize ? 'false' : 'true'"
            :disabled="controlsDisabled || !canDecreaseFontSize"
            data-testid="settings-popup-font-size-decrease"
            @click="updateFontSize(-1)"
          >−</button>
          <output
            id="settings-popup-font-size"
            class="settings-number-control__value"
            :aria-label="text('SETTINGS_FIELD_FONT_SIZE')"
            aria-live="polite"
            data-testid="settings-popup-font-size"
          >{{ fontSizeValue }} pt</output>
          <button
            type="button"
            class="settings-number-control__button"
            :aria-label="text('SETTINGS_FIELD_FONT_SIZE_INCREASE')"
            :aria-disabled="canIncreaseFontSize ? 'false' : 'true'"
            :disabled="controlsDisabled || !canIncreaseFontSize"
            data-testid="settings-popup-font-size-increase"
            @click="updateFontSize(1)"
          >+</button>
        </div>
      </div>

      <a
        class="settings-inline-link"
        href="https://neverworkalone.github.io/naverdic/themes.html"
        target="_blank"
        rel="noopener noreferrer"
      >
        <span class="settings-inline-link__label">{{ text('SETTINGS_POPUP_THEME_GUIDE') }}</span>
        <span class="settings-inline-link__icon" aria-hidden="true">↗</span>
      </a>
    </section>

    <aside
      v-if="pageId === 'appearance'"
      class="settings-appearance-guidance"
      data-testid="settings-appearance-scope"
    >
      <strong>{{ text('SETTINGS_APPEARANCE_SCOPE_TITLE') }}</strong>
      <p>{{ text('SETTINGS_APPEARANCE_SCOPE_DESCRIPTION') }}</p>
    </aside>

    <section
      v-if="pageId === 'double-click'"
      class="settings-card settings-double-click-card"
      data-testid="settings-double-click-form"
    >
      <div class="settings-card__heading">
        <h3>{{ text('SETTINGS_SECTION_DOUBLE_CLICK') }}</h3>
        <p>{{ text('SETTINGS_SECTION_DOUBLE_CLICK_DESCRIPTION') }}</p>
      </div>

      <div
        class="settings-double-click-divider settings-double-click-divider--heading"
        aria-hidden="true"
      />

      <label class="settings-switch settings-double-click-switch" for="settings-double-click-enabled">
        <span class="settings-switch__label">
          {{ text('SETTINGS_FIELD_DOUBLE_CLICK_ENABLED') }}
        </span>
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
      </label>

      <div
        class="settings-double-click-divider settings-double-click-divider--toggle"
        aria-hidden="true"
      />

      <div class="settings-field-row settings-double-click-row settings-double-click-row--trigger">
        <div class="settings-field-row__label">
          <label for="settings-double-click-trigger">
            {{ text('SETTINGS_FIELD_TRIGGER_KEY') }}
          </label>
          <span>{{ text('SETTINGS_FIELD_DOUBLE_CLICK_TRIGGER_HINT') }}</span>
        </div>
        <div class="settings-double-click-select">
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
      </div>

      <div
        class="settings-double-click-divider settings-double-click-divider--trigger"
        aria-hidden="true"
      />

      <div class="settings-field-row settings-double-click-row settings-double-click-row--speed">
        <div class="settings-field-row__label">
          <label for="settings-double-click-speed">
            {{ text('SETTINGS_FIELD_DOUBLE_CLICK_SPEED') }}
          </label>
          <span>{{ text('SETTINGS_FIELD_DOUBLE_CLICK_SPEED_HINT') }}</span>
        </div>
        <div class="settings-double-click-select">
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
      </div>

      <div
        class="settings-double-click-divider settings-double-click-divider--speed"
        aria-hidden="true"
      />
    </section>

    <section
      v-if="pageId === 'behavior'"
      class="settings-card settings-drag-card"
      data-testid="settings-drag-form"
    >
      <div class="settings-card__heading">
        <h3>{{ text('SETTINGS_SECTION_DRAG') }}</h3>
        <p>{{ text('SETTINGS_SECTION_DRAG_DESCRIPTION') }}</p>
      </div>

      <div
        class="settings-drag-divider settings-drag-divider--heading"
        aria-hidden="true"
      />

      <label class="settings-switch settings-drag-switch" for="settings-drag-enabled">
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

      <div
        class="settings-drag-divider settings-drag-divider--toggle"
        aria-hidden="true"
      />

      <div class="settings-field-row settings-drag-row">
        <div class="settings-field-row__label">
          <label for="settings-drag-trigger">
            {{ text('SETTINGS_FIELD_TRIGGER_KEY') }}
          </label>
          <span>{{ text('SETTINGS_FIELD_DRAG_TRIGGER_HINT') }}</span>
        </div>
        <div class="settings-drag-select">
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
      </div>

      <div
        class="settings-drag-divider settings-drag-divider--trigger"
        aria-hidden="true"
      />
    </section>

    <section
      v-if="pageId === 'blocked-sites'"
      class="settings-card settings-blocked-sites-card"
      data-testid="settings-blocked-sites-form"
    >
      <label class="settings-switch settings-blocked-sites-switch" for="settings-blocked-sites-enabled">
        <span class="settings-switch__label">
          {{ text('SETTINGS_FIELD_BLOCKED_SITES_ENABLED') }}
        </span>
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
      </label>

      <div
        class="settings-blocked-sites-divider settings-blocked-sites-divider--toggle"
        aria-hidden="true"
      />

      <div class="settings-textarea-field settings-blocked-sites-field">
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

      <div
        class="settings-blocked-sites-divider settings-blocked-sites-divider--editor"
        aria-hidden="true"
      />

      <div class="settings-normalized-sites settings-blocked-sites-list">
        <div class="settings-normalized-sites__heading">
          {{ text('SETTINGS_BLOCKED_SITES_REGISTERED') }}
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

    <KeepAlive>
      <TranslationSettings
        v-if="pageId === 'translation-service'"
        :draft="draft"
        :draft-secrets="draftSecrets"
        :draft-revision="draftRevision"
        :draft-reset-revision="draftResetRevision"
        :is-loading="isLoading"
        :is-saving="isSaving"
        :on-pending-change="translationPendingChange"
      />
    </KeepAlive>

    <section
      v-if="pageId === 'advanced'"
      class="settings-card settings-card--advanced"
      data-testid="settings-advanced-page"
    >
      <div class="settings-card__heading">
        <h3>{{ text('SETTINGS_PAGE_ADVANCED_TITLE') }}</h3>
        <p>{{ text('SETTINGS_PAGE_ADVANCED_DESCRIPTION') }}</p>
      </div>
      <div class="settings-page-notice">
        {{ text('SETTINGS_ADVANCED_NOTICE') }}
      </div>
      <div class="settings-placeholder-card__actions">
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

    <section
      v-if="!['appearance', 'double-click', 'behavior', 'blocked-sites', 'translation-service', 'advanced', 'help'].includes(pageId)"
      class="settings-card settings-card--placeholder"
    >
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

.settings-page[data-page-id='appearance'] {
  margin-top: 18px;
}

.settings-page[data-page-id='double-click'] {
  margin-top: 20px;
}

.settings-page[data-page-id='behavior'] {
  margin-top: 20px;
}

.settings-card {
  padding: 24px;
  background: var(--naverdic-settings-surface);
  border: 1px solid var(--naverdic-settings-border);
  border-radius: var(--naverdic-radius-md);
  box-shadow: var(--naverdic-card-shadow-default);
}

.settings-double-click-card {
  position: relative;
  height: 316px;
  padding: 0;
  overflow: hidden;
}

.settings-drag-card {
  position: relative;
  height: 244px;
  padding: 0;
  overflow: hidden;
}

.settings-blocked-sites-card {
  position: relative;
  height: 390px;
  padding: 0;
  overflow: hidden;
}

.settings-blocked-sites-divider {
  position: absolute;
  left: 23px;
  width: 508px;
  height: 1px;
  background: var(--naverdic-settings-divider);
}

.settings-blocked-sites-divider--toggle {
  top: 69px;
}

.settings-blocked-sites-divider--editor {
  top: 284px;
}

.settings-blocked-sites-switch {
  position: absolute;
  top: 0;
  left: 23px;
  display: flex;
  width: 508px;
  height: 70px;
  min-height: 70px;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border-bottom: 0;
}

.settings-blocked-sites-switch .settings-switch__label {
  position: absolute;
  top: 25px;
  left: 0;
  display: flex;
  height: 22px;
  align-items: center;
  color: #344054;
  font-weight: 500;
  line-height: 22px;
}

.settings-blocked-sites-switch .settings-switch__track {
  position: absolute;
  top: 25px;
  right: 0;
  width: 40px;
  height: 22px;
  padding: 2px;
}

.settings-blocked-sites-switch .settings-switch__thumb {
  width: 18px;
  height: 18px;
}

.settings-blocked-sites-switch input:checked + .settings-switch__track .settings-switch__thumb {
  transform: translateX(18px);
}

.settings-blocked-sites-switch input:disabled + .settings-switch__track {
  cursor: not-allowed;
  opacity: 0.55;
}

.settings-blocked-sites-field {
  position: absolute;
  top: 70px;
  left: 23px;
  display: block;
  width: 508px;
  height: 214px;
  padding-top: 0;
}

.settings-blocked-sites-field > label,
.settings-blocked-sites-field > .settings-textarea-field__hint,
.settings-blocked-sites-field > textarea,
.settings-blocked-sites-field > .settings-field-error {
  position: absolute;
  left: 0;
  width: 508px;
}

.settings-blocked-sites-field > label {
  top: 22px;
}

.settings-blocked-sites-field > .settings-textarea-field__hint {
  top: 45px;
}

.settings-blocked-sites-card .settings-blocked-sites-field > textarea {
  top: 70px;
  height: 120px;
  min-height: 120px;
  margin-top: 0;
  padding: 10px 12px;
  resize: vertical;
  vertical-align: top;
}

.settings-blocked-sites-field > .settings-field-error {
  top: 193px;
  margin: 0;
}

.settings-blocked-sites-card .settings-blocked-sites-list {
  position: absolute;
  top: 308px;
  left: 23px;
  width: 508px;
  margin: 0;
  padding: 0;
  border-top: 0;
}

.settings-blocked-sites-card .settings-blocked-sites-list .settings-domain-list {
  margin-top: 9px;
}

.settings-blocked-sites-card .settings-blocked-sites-list .settings-domain-chip {
  padding: 5px 10px;
  line-height: 18px;
}

.settings-double-click-card .settings-card__heading {
  position: absolute;
  top: 0;
  left: 23px;
  width: 508px;
  height: 90px;
  padding: 0;
  border-bottom: 0;
}

.settings-double-click-card .settings-card__heading h3 {
  position: absolute;
  top: 21px;
  left: 0;
  display: flex;
  width: 508px;
  height: 24px;
  align-items: center;
  font-size: 16px;
  line-height: 24px;
}

.settings-double-click-card .settings-card__heading p {
  position: absolute;
  top: 51px;
  left: 0;
  display: flex;
  width: 508px;
  height: 34px;
  align-items: center;
  margin: 0;
  line-height: 17px;
}

.settings-drag-card .settings-card__heading {
  position: absolute;
  top: 0;
  left: 23px;
  width: 508px;
  height: 90px;
  padding: 0;
  border-bottom: 0;
}

.settings-drag-card .settings-card__heading h3 {
  position: absolute;
  top: 21px;
  left: 0;
  display: flex;
  width: 508px;
  height: 24px;
  align-items: center;
  font-size: 16px;
  line-height: 24px;
}

.settings-drag-card .settings-card__heading p {
  position: absolute;
  top: 51px;
  left: 0;
  display: flex;
  width: 508px;
  height: 34px;
  align-items: center;
  margin: 0;
  line-height: 17px;
}

.settings-double-click-divider {
  position: absolute;
  left: 23px;
  width: 508px;
  height: 1px;
  background: var(--naverdic-settings-divider);
}

.settings-double-click-divider--heading {
  top: 89px;
}

.settings-double-click-divider--toggle {
  top: 149px;
}

.settings-double-click-divider--trigger {
  top: 221px;
}

.settings-double-click-divider--speed {
  top: 293px;
}

.settings-drag-divider {
  position: absolute;
  left: 23px;
  width: 508px;
  height: 1px;
  background: var(--naverdic-settings-divider);
}

.settings-drag-divider--heading {
  top: 89px;
}

.settings-drag-divider--toggle {
  top: 149px;
}

.settings-drag-divider--trigger {
  top: 221px;
}

.settings-double-click-switch {
  position: absolute;
  top: 90px;
  left: 23px;
  display: flex;
  width: 508px;
  height: 60px;
  min-height: 60px;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border-bottom: 0;
}

.settings-double-click-switch .settings-switch__label {
  position: absolute;
  top: 18px;
  left: 0;
  height: 22px;
  align-items: center;
  color: #344054;
  font-weight: 500;
  line-height: 22px;
}

.settings-double-click-switch .settings-switch__track {
  position: absolute;
  top: 18px;
  right: 0;
  width: 40px;
  height: 22px;
  padding: 2px;
}

.settings-double-click-switch .settings-switch__thumb {
  width: 18px;
  height: 18px;
}

.settings-double-click-switch input:checked + .settings-switch__track .settings-switch__thumb {
  transform: translateX(18px);
}

.settings-double-click-switch input:disabled + .settings-switch__track {
  cursor: not-allowed;
  opacity: 0.55;
}

.settings-drag-switch {
  position: absolute;
  top: 90px;
  left: 23px;
  display: flex;
  width: 508px;
  height: 60px;
  min-height: 60px;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border-bottom: 0;
}

.settings-drag-switch .settings-switch__label {
  position: absolute;
  top: 18px;
  left: 0;
  height: 22px;
  align-items: center;
  color: #344054;
  font-weight: 500;
  line-height: 22px;
}

.settings-drag-switch .settings-switch__track {
  position: absolute;
  top: 18px;
  right: 0;
  width: 40px;
  height: 22px;
  padding: 2px;
}

.settings-drag-switch .settings-switch__thumb {
  width: 18px;
  height: 18px;
}

.settings-drag-switch input:checked + .settings-switch__track .settings-switch__thumb {
  transform: translateX(18px);
}

.settings-drag-switch input:disabled + .settings-switch__track {
  cursor: not-allowed;
  opacity: 0.55;
}

.settings-double-click-row {
  position: absolute;
  left: 23px;
  display: block;
  width: 508px;
  height: 72px;
  min-height: 72px;
  border-bottom: 0;
}

.settings-double-click-row--trigger {
  top: 150px;
}

.settings-double-click-row--speed {
  top: 222px;
}

.settings-double-click-row .settings-field-row__label {
  position: absolute;
  top: 15px;
  left: 0;
  width: 250px;
  gap: 0;
}

.settings-double-click-row .settings-field-row__label label {
  display: flex;
  height: 20px;
  align-items: center;
  font-weight: 500;
  line-height: 20px;
}

.settings-double-click-row .settings-field-row__label span {
  display: flex;
  height: 18px;
  align-items: center;
  margin-top: 3px;
  line-height: 18px;
}

.settings-double-click-select {
  position: absolute;
  top: 15px;
  right: 0;
  width: 240px;
  height: 40px;
}

.settings-double-click-select::after {
  position: absolute;
  top: 0;
  right: 13px;
  display: grid;
  width: 16px;
  height: 40px;
  color: var(--naverdic-settings-text-muted);
  content: 'v';
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
  pointer-events: none;
  place-items: center;
}

.settings-double-click-select select {
  width: 100%;
  min-width: 0;
  height: 40px;
  min-height: 40px;
  padding: 0 36px 0 13px;
  background: #f8fafc;
  appearance: none;
}

.settings-drag-row {
  position: absolute;
  top: 150px;
  left: 23px;
  display: block;
  width: 508px;
  height: 72px;
  min-height: 72px;
  border-bottom: 0;
}

.settings-drag-row .settings-field-row__label {
  position: absolute;
  top: 15px;
  left: 0;
  width: 250px;
  gap: 0;
}

.settings-drag-row .settings-field-row__label label {
  display: flex;
  height: 20px;
  align-items: center;
  font-weight: 500;
  line-height: 20px;
}

.settings-drag-row .settings-field-row__label span {
  display: flex;
  height: 18px;
  align-items: center;
  margin-top: 3px;
  line-height: 18px;
}

.settings-drag-select {
  position: absolute;
  top: 15px;
  right: 0;
  width: 240px;
  height: 40px;
}

.settings-drag-select::after {
  position: absolute;
  top: 0;
  right: 13px;
  display: grid;
  width: 16px;
  height: 40px;
  color: var(--naverdic-settings-text-muted);
  content: 'v';
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
  pointer-events: none;
  place-items: center;
}

.settings-drag-select select {
  width: 100%;
  min-width: 0;
  height: 40px;
  min-height: 40px;
  padding: 0 36px 0 13px;
  background: #f8fafc;
  appearance: none;
}

.settings-appearance-card {
  min-height: 314px;
  padding: 18px 24px 12px;
}

.settings-appearance-card .settings-card__heading {
  padding-bottom: 12px;
}

.settings-appearance-card .settings-field-row {
  min-height: 60px;
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

.settings-color-control__picker-shell {
  position: relative;
  width: 28px;
  height: 28px;
  flex: 0 0 28px;
  border: 1px solid var(--naverdic-settings-chip-border);
  border-radius: 50%;
  overflow: hidden;
}

.settings-color-control__picker {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  padding: 0;
  border: 0;
  border-radius: 50%;
  opacity: 0;
  cursor: pointer;
  appearance: none;
}

.settings-color-control__picker-shell:focus-within {
  outline: 2px solid var(--naverdic-color-focus);
  outline-offset: 2px;
  box-shadow: var(--naverdic-input-focus-ring);
}

.settings-color-control__hex input,
.settings-number-control input,
.settings-field-row select,
.settings-textarea-field textarea {
  color: var(--naverdic-settings-text);
  background: var(--naverdic-input-background-default);
  border: 1px solid var(--naverdic-input-border-default);
  border-radius: var(--naverdic-radius-sm);
  font: inherit;
}

.settings-color-control__hex {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 4px;
}

.settings-color-control__hex input {
  width: 100px;
  min-height: 36px;
  padding: 0 10px;
  font-size: 12px;
}

.settings-color-control__hex input:focus-visible,
.settings-number-control__button:focus-visible,
.settings-field-row select:focus-visible,
.settings-textarea-field textarea:focus-visible,
.settings-switch input:focus-visible + .settings-switch__track {
  outline: 2px solid var(--naverdic-color-focus);
  outline-offset: 2px;
  box-shadow: var(--naverdic-input-focus-ring);
}

.settings-color-control__hex input[aria-invalid='true'] {
  border-color: var(--naverdic-color-danger);
}

.settings-field-row select {
  min-width: 172px;
  min-height: 36px;
  padding: 0 28px 0 10px;
  font-size: 12px;
}

.settings-color-control__picker-shell:hover,
.settings-color-control__hex input:hover,
.settings-field-row select:hover,
.settings-textarea-field textarea:hover {
  border-color: var(--naverdic-input-border-hover);
}

.settings-number-control {
  width: 140px;
  height: 36px;
  gap: 0;
  overflow: hidden;
  background: var(--naverdic-input-background-default);
  border: 1px solid var(--naverdic-input-border-default);
  border-radius: var(--naverdic-radius-sm);
}

.settings-number-control__button {
  display: grid;
  width: 36px;
  height: 34px;
  flex: 0 0 36px;
  padding: 0;
  color: var(--naverdic-settings-text);
  background: transparent;
  border: 0;
  place-items: center;
  font-size: 18px;
  font-weight: 400;
  line-height: 1;
  cursor: pointer;
}

.settings-number-control__button:disabled {
  color: var(--naverdic-color-text-disabled);
  cursor: not-allowed;
}

.settings-number-control__value {
  display: grid;
  width: 66px;
  height: 34px;
  flex: 0 0 66px;
  color: var(--naverdic-settings-text);
  border-right: 1px solid var(--naverdic-input-border-default);
  border-left: 1px solid var(--naverdic-input-border-default);
  place-items: center;
  font-size: 12px;
  line-height: 1;
  text-align: center;
}

.settings-inline-link {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  margin-top: 18px;
  color: var(--naverdic-settings-primary-text);
  font-size: 12px;
  font-weight: 600;
  line-height: 20px;
  text-decoration: none;
}

.settings-inline-link__icon {
  font-size: 14px;
  font-weight: 700;
  line-height: 1;
}

.settings-inline-link:hover .settings-inline-link__label {
  text-decoration: underline;
}

.settings-appearance-guidance {
  min-height: 72px;
  margin-top: 16px;
  padding: 12px 20px;
  color: var(--naverdic-settings-text);
  background: var(--naverdic-settings-info);
  border: 1px solid var(--naverdic-settings-border);
  border-radius: 10px;
}

.settings-appearance-guidance strong {
  display: block;
  font-size: 12px;
  font-weight: 700;
  line-height: 20px;
}

.settings-appearance-guidance p {
  margin: 2px 0 0;
  color: var(--naverdic-settings-text-muted);
  font-size: 11px;
  line-height: 17px;
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

.settings-page-notice {
  margin-top: 20px;
  padding: 14px 16px;
  color: var(--naverdic-settings-primary-text);
  background: var(--naverdic-settings-info);
  border-radius: var(--naverdic-radius-sm);
  font-size: 12px;
  line-height: 20px;
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

/* Keep the double-click rhythm independent from the shared settings rows. */
.settings-double-click-switch {
  min-height: 60px;
  border-bottom: 0;
}

.settings-double-click-row {
  display: block;
  align-items: initial;
  justify-content: initial;
  gap: 0;
  min-height: 72px;
  border-bottom: 0;
}

@media (max-width: 1050px) {
  .settings-double-click-card {
    height: auto;
    min-height: 0;
    padding: 0 18px 18px;
    overflow: visible;
  }

  .settings-drag-card {
    height: auto;
    min-height: 0;
    padding: 0 18px 18px;
    overflow: visible;
  }

  .settings-blocked-sites-card {
    height: auto;
    min-height: 0;
    padding: 0 18px 18px;
    overflow: visible;
  }

  .settings-double-click-card .settings-card__heading {
    position: relative;
    top: auto;
    left: auto;
    width: auto;
    height: 90px;
  }

  .settings-double-click-card .settings-card__heading h3,
  .settings-double-click-card .settings-card__heading p {
    position: static;
    display: block;
    width: auto;
    height: auto;
  }

  .settings-drag-card .settings-card__heading {
    position: relative;
    top: auto;
    left: auto;
    width: auto;
    height: 90px;
  }

  .settings-drag-card .settings-card__heading h3,
  .settings-drag-card .settings-card__heading p {
    position: static;
    display: block;
    width: auto;
    height: auto;
  }

  .settings-double-click-card .settings-card__heading h3 {
    padding-top: 20px;
  }

  .settings-double-click-card .settings-card__heading p {
    margin-top: 4px;
  }

  .settings-drag-card .settings-card__heading h3 {
    padding-top: 20px;
  }

  .settings-drag-card .settings-card__heading p {
    margin-top: 4px;
  }

  .settings-double-click-divider {
    position: relative;
    top: auto;
    left: auto;
    width: 100%;
  }

  .settings-drag-divider {
    position: relative;
    top: auto;
    left: auto;
    width: 100%;
  }

  .settings-blocked-sites-divider {
    position: relative;
    top: auto;
    left: auto;
    width: 100%;
  }

  .settings-double-click-switch,
  .settings-double-click-row {
    position: relative;
    top: auto;
    left: auto;
    width: auto;
  }

  .settings-drag-switch,
  .settings-drag-row {
    position: relative;
    top: auto;
    left: auto;
    width: auto;
  }

  .settings-blocked-sites-switch,
  .settings-blocked-sites-field,
  .settings-blocked-sites-card .settings-blocked-sites-list {
    position: relative;
    top: auto;
    left: auto;
    width: auto;
  }

  .settings-blocked-sites-switch {
    height: 70px;
    min-height: 70px;
  }

  .settings-blocked-sites-switch .settings-switch__label {
    position: static;
    width: auto;
    height: auto;
  }

  .settings-blocked-sites-switch .settings-switch__track {
    position: relative;
    top: auto;
    right: auto;
  }

  .settings-double-click-switch {
    height: 60px;
    min-height: 60px;
  }

  .settings-drag-switch {
    height: 60px;
    min-height: 60px;
  }

  .settings-double-click-row {
    display: flex;
    height: auto;
    min-height: 0;
    align-items: stretch;
    flex-direction: column;
    gap: 10px;
    padding: 14px 0;
  }

  .settings-drag-row {
    display: flex;
    height: auto;
    min-height: 0;
    align-items: stretch;
    flex-direction: column;
    gap: 10px;
    padding: 14px 0;
  }

  .settings-blocked-sites-field {
    display: flex;
    height: auto;
    min-height: 0;
    flex-direction: column;
    gap: 4px;
    padding: 20px 0;
  }

  .settings-blocked-sites-field > label,
  .settings-blocked-sites-field > .settings-textarea-field__hint,
  .settings-blocked-sites-field > textarea,
  .settings-blocked-sites-field > .settings-field-error {
    position: static;
    width: auto;
  }

  .settings-blocked-sites-card .settings-blocked-sites-field > textarea {
    height: 120px;
    min-height: 120px;
    margin-top: 2px;
  }

  .settings-blocked-sites-card .settings-blocked-sites-list {
    padding-top: 18px;
  }

  .settings-double-click-row .settings-field-row__label {
    position: static;
    width: auto;
    gap: 4px;
  }

  .settings-drag-row .settings-field-row__label {
    position: static;
    width: auto;
    gap: 4px;
  }

  .settings-double-click-row .settings-field-row__label label,
  .settings-double-click-row .settings-field-row__label span {
    display: block;
    height: auto;
    margin-top: 0;
  }

  .settings-drag-row .settings-field-row__label label,
  .settings-drag-row .settings-field-row__label span {
    display: block;
    height: auto;
    margin-top: 0;
  }

  .settings-double-click-select {
    position: relative;
    top: auto;
    right: auto;
    width: 100%;
    height: 40px;
  }

  .settings-drag-select {
    position: relative;
    top: auto;
    right: auto;
    width: 100%;
    height: 40px;
  }
}

@media (max-width: 600px) {
  .settings-card {
    padding: 18px;
  }

  .settings-double-click-card {
    padding: 0 18px 18px;
  }

  .settings-drag-card {
    padding: 0 18px 18px;
  }

  .settings-blocked-sites-card {
    padding: 0 18px 18px;
  }

  .settings-appearance-card {
    min-height: 0;
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

  .settings-appearance-card .settings-number-control {
    align-self: flex-start;
  }

  .settings-appearance-card .settings-color-control__hex {
    flex: 1;
  }

  .settings-field-row select {
    width: 100%;
  }

  .settings-color-control__hex input {
    width: 100%;
  }
}
</style>
