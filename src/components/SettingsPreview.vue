<script setup>
import {computed} from 'vue'
import {getText} from '/src/text.js'
import {resolveCssColor} from '/src/settings-colors.mjs'

const props = defineProps({
  activePage: {type: Object, required: true},
  draft: {type: Object, required: true},
  isLoading: {type: Boolean, default: false},
  isSaving: {type: Boolean, default: false},
  resetDraft: {type: Function, default: null}
})

function text(key, placeholders = undefined) {
  return getText(key, placeholders)
}

const resetDisabled = computed(() => props.isLoading || props.isSaving || !props.resetDraft)

function handleReset() {
  if (!resetDisabled.value) {
    props.resetDraft?.()
  }
}

const popupStyle = computed(() => ({
  backgroundColor: resolveCssColor(props.draft.popup?.backgroundColor, '#FFF59D'),
  color: resolveCssColor(props.draft.popup?.fontColor, '#000000'),
  fontSize: (Number(props.draft.popup?.fontSizePt) > 0 ? Number(props.draft.popup.fontSizePt) : 11) + 'pt'
}))

const previewSteps = computed(() => {
  switch (props.activePage.id) {
    case 'double-click':
      return [1, 2, 3, 4].map(step => ({
        title: `SETTINGS_PREVIEW_DOUBLE_CLICK_STEP_${step}`,
        description: `SETTINGS_PREVIEW_DOUBLE_CLICK_STEP_${step}_DESCRIPTION`
      }))
    case 'behavior':
      return [1, 2, 3, 4].map(step => ({
        title: `SETTINGS_PREVIEW_DRAG_STEP_${step}`,
        description: `SETTINGS_PREVIEW_DRAG_STEP_${step}_DESCRIPTION`
      }))
    case 'blocked-sites':
      return [1, 2, 3].map(step => ({
        title: `SETTINGS_PREVIEW_BLOCKED_SITES_STEP_${step}`,
        description: `SETTINGS_PREVIEW_BLOCKED_SITES_STEP_${step}_DESCRIPTION`
      }))
    default:
      return []
  }
})
</script>

<template>
  <div
    class="settings-live-preview"
    :class="{
      'settings-live-preview--appearance': activePage.id === 'appearance',
      'settings-live-preview--double-click': activePage.id === 'double-click',
      'settings-live-preview--drag': activePage.id === 'behavior',
      'settings-live-preview--blocked-sites': activePage.id === 'blocked-sites',
      'settings-live-preview--advanced': activePage.id === 'advanced'
    }"
    :data-preview-page="activePage.id"
    data-testid="settings-live-preview"
  >
    <div v-if="activePage.id === 'appearance'" class="settings-live-preview__appearance">
      <div class="settings-live-preview__browser-bar"><span class="settings-live-preview__dot" /><span class="settings-live-preview__dot" /><span class="settings-live-preview__dot" /></div>
      <div class="settings-live-preview__content">
        <div class="settings-live-preview__line settings-live-preview__line--long" /><div class="settings-live-preview__line settings-live-preview__line--medium" /><div class="settings-live-preview__line settings-live-preview__line--short" />
        <article class="settings-live-preview__popup" :style="popupStyle"><strong>{{ text('SETTINGS_PREVIEW_WORD') }}</strong><span>{{ text('SETTINGS_PREVIEW_MEANING') }}</span><small>{{ text('SETTINGS_PREVIEW_HINT') }}</small></article>
      </div>
    </div>
    <div
      v-else-if="previewSteps.length"
      class="settings-guide-preview"
      :class="{
        'settings-guide-preview--double-click': activePage.id === 'double-click',
        'settings-guide-preview--drag': activePage.id === 'behavior',
        'settings-guide-preview--blocked-sites': activePage.id === 'blocked-sites'
      }"
    >
      <ol>
        <li v-for="(step, index) in previewSteps" :key="step.title || step">
          <span>{{ index + 1 }}</span>
          <p v-if="step.title">
            <strong>{{ text(step.title) }}</strong>
            <span>{{ text(step.description) }}</span>
          </p>
          <p v-else>{{ text(step) }}</p>
        </li>
      </ol>
      <p
        v-if="activePage.id === 'blocked-sites'"
        class="settings-guide-preview__note"
      >{{ text('SETTINGS_PREVIEW_BLOCKED_SITES_NOTE') }}</p>
    </div>
    <div
      v-else-if="activePage.id === 'advanced'"
      class="settings-reset-danger-card"
      data-testid="settings-advanced-reset-card"
    >
      <span class="settings-reset-danger-card__badge">
        {{ text('SETTINGS_ADVANCED_DANGER_BADGE') }}
      </span>
      <strong class="settings-reset-danger-card__title">
        {{ text('SETTINGS_ADVANCED_RESET_TITLE') }}
      </strong>
      <p class="settings-reset-danger-card__description">
        {{ text('SETTINGS_ADVANCED_RESET_DESCRIPTION') }}
      </p>
      <button
        type="button"
        class="settings-reset-danger-card__button"
        :disabled="resetDisabled"
        :aria-label="text('SETTINGS_ADVANCED_RESET_BUTTON')"
        data-testid="settings-advanced-reset"
        @click="handleReset"
      >
        {{ text('SETTINGS_ADVANCED_RESET_BUTTON') }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.settings-live-preview { min-height: 360px; overflow: hidden; background: var(--naverdic-settings-preview-surface); border: 1px solid var(--naverdic-settings-border); border-radius: var(--naverdic-radius-md); box-shadow: var(--naverdic-card-shadow-default); }
.settings-live-preview--appearance { margin-top: 18px; }
.settings-live-preview--double-click, .settings-live-preview--drag { margin-top: 20px; box-shadow: none; }
.settings-live-preview--double-click { height: 260px; min-height: 260px; }
.settings-live-preview--drag { height: 260px; min-height: 260px; }
.settings-live-preview__browser-bar { display: flex; align-items: center; gap: 5px; height: 32px; padding: 0 12px; background: var(--naverdic-settings-preview-bar); border-bottom: 1px solid var(--naverdic-settings-border); }
.settings-live-preview__dot { width: 7px; height: 7px; background: var(--naverdic-settings-text-subtle); border-radius: 50%; }
.settings-live-preview__content { position: relative; min-height: 328px; padding: 36px 18px 20px; background: var(--naverdic-settings-preview-window); }
.settings-live-preview__line { height: 8px; margin-bottom: 12px; background: var(--naverdic-settings-divider); border-radius: 4px; }
.settings-live-preview__line--long { width: 76%; }.settings-live-preview__line--medium { width: 91%; }.settings-live-preview__line--short { width: 53%; }
.settings-live-preview__popup { display: flex; width: min(100%, 220px); margin: 26px auto 0; padding: 16px; flex-direction: column; gap: 8px; border: 1px solid rgb(26 36 51 / 16%); border-radius: var(--naverdic-radius-sm); box-shadow: var(--naverdic-shadow-popup); }
.settings-live-preview__popup strong { font-size: 1.15em; line-height: 1.3; }.settings-live-preview__popup span { font-size: .92em; line-height: 1.4; }.settings-live-preview__popup small { color: currentColor; opacity: .62; font-size: .78em; line-height: 1.4; }
.settings-guide-preview { min-height: 360px; padding: 28px 24px; color: var(--naverdic-settings-text); }
.settings-guide-preview ol { display: flex; margin: 30px 0 0; padding: 0; flex-direction: column; gap: 22px; list-style: none; }.settings-guide-preview li { display: flex; align-items: flex-start; gap: 12px; }.settings-guide-preview li > span { display: grid; width: 24px; height: 24px; flex: 0 0 24px; place-items: center; color: var(--naverdic-settings-primary-text); background: var(--naverdic-settings-info); border-radius: 50%; font-size: 11px; font-weight: 700; }.settings-guide-preview p { margin: 2px 0 0; color: var(--naverdic-settings-text-muted); font-size: 12px; line-height: 20px; }
.settings-guide-preview--double-click, .settings-guide-preview--drag { position: relative; padding: 0; }
.settings-guide-preview--double-click { height: 258px; min-height: 258px; }
.settings-guide-preview--drag { height: 258px; min-height: 258px; }
.settings-live-preview--blocked-sites { height: 264px; min-height: 264px; margin-top: 20px; box-shadow: none; }
.settings-live-preview--advanced { height: 282px; min-height: 282px; margin-top: 20px; overflow: visible; background: transparent; border: 0; border-radius: 0; box-shadow: none; }
.settings-guide-preview--blocked-sites { position: relative; height: 262px; min-height: 262px; padding: 0; }
.settings-guide-preview--double-click ol { position: relative; display: block; width: 100%; height: 100%; margin: 0; }
.settings-guide-preview--double-click li { position: absolute; left: 23px; display: flex; width: 252px; min-height: 24px; gap: 12px; }
.settings-guide-preview--double-click li:nth-child(1) { top: 19px; }
.settings-guide-preview--double-click li:nth-child(2) { top: 79px; }
.settings-guide-preview--double-click li:nth-child(3) { top: 139px; }
.settings-guide-preview--double-click li:nth-child(4) { top: 199px; }
.settings-guide-preview--double-click li > span { color: var(--naverdic-settings-primary-text); background: var(--naverdic-settings-info); }
.settings-guide-preview--double-click li p { display: flex; width: 216px; margin: -2px 0 0; flex-direction: column; gap: 2px; color: var(--naverdic-settings-text-muted); font-size: 11px; line-height: 18px; }
.settings-guide-preview--double-click li p strong { color: #344054; font-size: 13px; font-weight: 700; line-height: 20px; }
.settings-guide-preview--double-click li p span { color: var(--naverdic-settings-text-muted); font-size: 11px; line-height: 18px; }
.settings-guide-preview--drag ol { position: relative; display: block; width: 100%; height: 100%; margin: 0; }
.settings-guide-preview--drag li { position: absolute; left: 23px; display: flex; width: 252px; min-height: 24px; gap: 12px; }
.settings-guide-preview--drag li:nth-child(1) { top: 19px; }
.settings-guide-preview--drag li:nth-child(2) { top: 79px; }
.settings-guide-preview--drag li:nth-child(3) { top: 139px; }
.settings-guide-preview--drag li:nth-child(4) { top: 199px; }
.settings-guide-preview--drag li > span { color: var(--naverdic-settings-primary-text); background: var(--naverdic-settings-info); }
.settings-guide-preview--drag li p { display: flex; width: 216px; margin: -2px 0 0; flex-direction: column; gap: 2px; color: var(--naverdic-settings-text-muted); font-size: 11px; line-height: 18px; }
.settings-guide-preview--drag li p strong { color: #344054; font-size: 13px; font-weight: 700; line-height: 20px; }
.settings-guide-preview--drag li p span { color: var(--naverdic-settings-text-muted); font-size: 11px; line-height: 18px; }
.settings-guide-preview--blocked-sites ol { position: relative; display: block; width: 100%; height: 190px; margin: 0; }
.settings-guide-preview--blocked-sites li { position: absolute; left: 23px; display: flex; width: 252px; min-height: 24px; gap: 12px; }
.settings-guide-preview--blocked-sites li:nth-child(1) { top: 19px; }
.settings-guide-preview--blocked-sites li:nth-child(2) { top: 79px; }
.settings-guide-preview--blocked-sites li:nth-child(3) { top: 139px; }
.settings-guide-preview--blocked-sites li > span { color: var(--naverdic-settings-primary-text); background: var(--naverdic-settings-info); }
.settings-guide-preview--blocked-sites li p { display: flex; width: 216px; margin: -2px 0 0; flex-direction: column; gap: 2px; color: var(--naverdic-settings-text-muted); font-size: 11px; line-height: 18px; }
.settings-guide-preview--blocked-sites li p strong { color: #344054; font-size: 13px; font-weight: 700; line-height: 20px; }
.settings-guide-preview--blocked-sites li p span { color: var(--naverdic-settings-text-muted); font-size: 11px; line-height: 18px; }
.settings-guide-preview__note { position: absolute; top: 189px; left: 23px; width: 252px; margin: 0; padding-top: 19px; color: var(--naverdic-settings-text-muted); border-top: 1px solid var(--naverdic-settings-divider); font-size: 11px; line-height: 18px; }
.settings-reset-danger-card { position: relative; height: 282px; min-height: 282px; overflow: hidden; background: #fff4f4; border: 1px solid #f1caca; border-radius: 10px; color: var(--naverdic-settings-text); }
.settings-reset-danger-card__badge { position: absolute; top: 27px; left: 23px; display: inline-flex; width: 78px; height: 26px; align-items: center; justify-content: center; color: #d94c4c; background: #fff4f4; border: 1px solid #f1caca; border-radius: 13px; font-size: 10px; font-weight: 700; line-height: 18px; }
.settings-reset-danger-card__title { position: absolute; top: 75px; left: 23px; display: block; color: #344054; font-size: 16px; font-weight: 700; line-height: 26px; }
.settings-reset-danger-card__description { position: absolute; top: 111px; left: 23px; display: flex; width: 252px; height: 66px; align-items: center; margin: 0; color: #344054; font-size: 12px; font-weight: 400; line-height: 18px; }
.settings-reset-danger-card__button { position: absolute; top: 207px; left: 23px; display: inline-flex; width: 148px; height: 36px; align-items: center; justify-content: center; padding: 0 12px; color: #fff; background: #d94c4c; border: 1px solid #d94c4c; border-radius: 8px; font-size: 12px; font-weight: 700; line-height: 18px; cursor: pointer; }
.settings-reset-danger-card__button:hover { background: #bd3f3f; border-color: #bd3f3f; }
.settings-reset-danger-card__button:focus-visible { outline: 2px solid var(--naverdic-color-focus); outline-offset: 2px; box-shadow: var(--naverdic-button-focus-ring); }
.settings-reset-danger-card__button:disabled { background: #e9a5a5; border-color: #e9a5a5; cursor: not-allowed; }

@media (max-width: 600px) {
  .settings-guide-preview--double-click li,
  .settings-guide-preview--drag li,
  .settings-guide-preview--blocked-sites li {
    width: calc(100% - 46px);
  }

  .settings-guide-preview--double-click li p,
  .settings-guide-preview--drag li p,
  .settings-guide-preview--blocked-sites li p {
    width: calc(100% - 36px);
  }

  .settings-guide-preview--blocked-sites .settings-guide-preview__note {
    width: calc(100% - 46px);
  }
}
</style>
