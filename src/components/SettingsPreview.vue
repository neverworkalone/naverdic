<script setup>
import {computed} from 'vue'
import {getText} from '/src/text.js'
import {resolveCssColor} from '/src/settings-colors.mjs'

const props = defineProps({
  activePage: {type: Object, required: true},
  draft: {type: Object, required: true}
})

function text(key, placeholders = undefined) {
  return getText(key, placeholders)
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
      return ['SETTINGS_PREVIEW_BLOCKED_SITES_STEP_1', 'SETTINGS_PREVIEW_BLOCKED_SITES_STEP_2', 'SETTINGS_PREVIEW_BLOCKED_SITES_STEP_3']
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
      'settings-live-preview--drag': activePage.id === 'behavior'
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
        'settings-guide-preview--drag': activePage.id === 'behavior'
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
    </div>
    <div v-else-if="activePage.id === 'advanced'" class="settings-notice-preview">
      <strong>{{ text('SETTINGS_PREVIEW_ADVANCED_TITLE') }}</strong><p>{{ text('SETTINGS_PREVIEW_ADVANCED_DESCRIPTION') }}</p><span>{{ text('SETTINGS_PREVIEW_ADVANCED_WARNING') }}</span>
    </div>
    <div v-else-if="activePage.id === 'help'" class="settings-help-preview">
      <strong>{{ text('SETTINGS_PREVIEW_HELP_TITLE') }}</strong><a href="https://neverworkalone.github.io/naverdic/" target="_blank" rel="noopener noreferrer">{{ text('SETTINGS_PREVIEW_HELP_LINK') }}</a><p>{{ text('SETTINGS_PREVIEW_HELP_QUICK_GUIDE') }}</p>
    </div>
  </div>
</template>

<style scoped>
.settings-live-preview { min-height: 360px; overflow: hidden; background: var(--naverdic-settings-preview-surface); border: 1px solid var(--naverdic-settings-border); border-radius: var(--naverdic-radius-md); box-shadow: var(--naverdic-card-shadow-default); }
.settings-live-preview--appearance { margin-top: 18px; }
.settings-live-preview--double-click, .settings-live-preview--drag { margin-top: 20px; box-shadow: none; }
.settings-live-preview--double-click { height: 260px; min-height: 260px; }
.settings-live-preview--drag { height: 308px; min-height: 308px; }
.settings-live-preview__browser-bar { display: flex; align-items: center; gap: 5px; height: 32px; padding: 0 12px; background: var(--naverdic-settings-preview-bar); border-bottom: 1px solid var(--naverdic-settings-border); }
.settings-live-preview__dot { width: 7px; height: 7px; background: var(--naverdic-settings-text-subtle); border-radius: 50%; }
.settings-live-preview__content { position: relative; min-height: 328px; padding: 36px 18px 20px; background: var(--naverdic-settings-preview-window); }
.settings-live-preview__line { height: 8px; margin-bottom: 12px; background: var(--naverdic-settings-divider); border-radius: 4px; }
.settings-live-preview__line--long { width: 76%; }.settings-live-preview__line--medium { width: 91%; }.settings-live-preview__line--short { width: 53%; }
.settings-live-preview__popup { display: flex; width: min(100%, 220px); margin: 26px auto 0; padding: 16px; flex-direction: column; gap: 8px; border: 1px solid rgb(26 36 51 / 16%); border-radius: var(--naverdic-radius-sm); box-shadow: var(--naverdic-shadow-popup); }
.settings-live-preview__popup strong { font-size: 1.15em; line-height: 1.3; }.settings-live-preview__popup span { font-size: .92em; line-height: 1.4; }.settings-live-preview__popup small { color: currentColor; opacity: .62; font-size: .78em; line-height: 1.4; }
.settings-guide-preview, .settings-notice-preview, .settings-help-preview { min-height: 360px; padding: 28px 24px; color: var(--naverdic-settings-text); }
.settings-guide-preview ol { display: flex; margin: 30px 0 0; padding: 0; flex-direction: column; gap: 22px; list-style: none; }.settings-guide-preview li { display: flex; align-items: flex-start; gap: 12px; }.settings-guide-preview li > span { display: grid; width: 24px; height: 24px; flex: 0 0 24px; place-items: center; color: var(--naverdic-settings-primary-text); background: var(--naverdic-settings-info); border-radius: 50%; font-size: 11px; font-weight: 700; }.settings-guide-preview p { margin: 2px 0 0; color: var(--naverdic-settings-text-muted); font-size: 12px; line-height: 20px; }
.settings-guide-preview--double-click, .settings-guide-preview--drag { position: relative; padding: 0; }
.settings-guide-preview--double-click { height: 258px; min-height: 258px; }
.settings-guide-preview--drag { height: 306px; min-height: 306px; }
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
.settings-guide-preview--drag li:nth-child(1) { top: 23px; }
.settings-guide-preview--drag li:nth-child(2) { top: 97px; }
.settings-guide-preview--drag li:nth-child(3) { top: 171px; }
.settings-guide-preview--drag li:nth-child(4) { top: 245px; }
.settings-guide-preview--drag li > span { color: var(--naverdic-settings-primary-text); background: var(--naverdic-settings-info); }
.settings-guide-preview--drag li p { display: flex; width: 216px; margin: -2px 0 0; flex-direction: column; gap: 2px; color: var(--naverdic-settings-text-muted); font-size: 11px; line-height: 18px; }
.settings-guide-preview--drag li p strong { color: #344054; font-size: 13px; font-weight: 700; line-height: 20px; }
.settings-guide-preview--drag li p span { color: var(--naverdic-settings-text-muted); font-size: 11px; line-height: 18px; }
.settings-notice-preview strong, .settings-help-preview strong { display: block; font-size: 16px; line-height: 24px; }.settings-notice-preview p, .settings-help-preview p { margin: 12px 0 0; color: var(--naverdic-settings-text-muted); font-size: 12px; line-height: 20px; }.settings-notice-preview span { display: block; margin-top: 26px; padding: 12px; color: var(--naverdic-settings-primary-text); background: var(--naverdic-settings-info); border-radius: 8px; font-size: 11px; line-height: 18px; }.settings-help-preview a { display: inline-block; margin-top: 24px; color: var(--naverdic-settings-primary-text); font-size: 12px; font-weight: 700; }

@media (max-width: 600px) {
  .settings-guide-preview--double-click li,
  .settings-guide-preview--drag li {
    width: calc(100% - 46px);
  }

  .settings-guide-preview--double-click li p,
  .settings-guide-preview--drag li p {
    width: calc(100% - 36px);
  }
}
</style>
