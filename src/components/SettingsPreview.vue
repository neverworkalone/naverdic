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
      return ['SETTINGS_PREVIEW_DOUBLE_CLICK_STEP_1', 'SETTINGS_PREVIEW_DOUBLE_CLICK_STEP_2', 'SETTINGS_PREVIEW_DOUBLE_CLICK_STEP_3']
    case 'behavior':
      return ['SETTINGS_PREVIEW_BEHAVIOR_STEP_1', 'SETTINGS_PREVIEW_BEHAVIOR_STEP_2', 'SETTINGS_PREVIEW_BEHAVIOR_STEP_3']
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
    :class="{'settings-live-preview--appearance': activePage.id === 'appearance'}"
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
    <div v-else-if="previewSteps.length" class="settings-guide-preview">
      <div class="settings-guide-preview__eyebrow">{{ text('SETTINGS_PREVIEW_FLOW_LABEL') }}</div>
      <ol><li v-for="(step, index) in previewSteps" :key="step"><span>{{ index + 1 }}</span><p>{{ text(step) }}</p></li></ol>
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
.settings-live-preview__browser-bar { display: flex; align-items: center; gap: 5px; height: 32px; padding: 0 12px; background: var(--naverdic-settings-preview-bar); border-bottom: 1px solid var(--naverdic-settings-border); }
.settings-live-preview__dot { width: 7px; height: 7px; background: var(--naverdic-settings-text-subtle); border-radius: 50%; }
.settings-live-preview__content { position: relative; min-height: 328px; padding: 36px 18px 20px; background: var(--naverdic-settings-preview-window); }
.settings-live-preview__line { height: 8px; margin-bottom: 12px; background: var(--naverdic-settings-divider); border-radius: 4px; }
.settings-live-preview__line--long { width: 76%; }.settings-live-preview__line--medium { width: 91%; }.settings-live-preview__line--short { width: 53%; }
.settings-live-preview__popup { display: flex; width: min(100%, 220px); margin: 26px auto 0; padding: 16px; flex-direction: column; gap: 8px; border: 1px solid rgb(26 36 51 / 16%); border-radius: var(--naverdic-radius-sm); box-shadow: var(--naverdic-shadow-popup); }
.settings-live-preview__popup strong { font-size: 1.15em; line-height: 1.3; }.settings-live-preview__popup span { font-size: .92em; line-height: 1.4; }.settings-live-preview__popup small { color: currentColor; opacity: .62; font-size: .78em; line-height: 1.4; }
.settings-guide-preview, .settings-notice-preview, .settings-help-preview { min-height: 360px; padding: 28px 24px; color: var(--naverdic-settings-text); }
.settings-guide-preview__eyebrow { color: var(--naverdic-settings-text-muted); font-size: 11px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; }
.settings-guide-preview ol { display: flex; margin: 30px 0 0; padding: 0; flex-direction: column; gap: 22px; list-style: none; }.settings-guide-preview li { display: flex; align-items: flex-start; gap: 12px; }.settings-guide-preview li > span { display: grid; width: 24px; height: 24px; flex: 0 0 24px; place-items: center; color: var(--naverdic-settings-primary-text); background: var(--naverdic-settings-info); border-radius: 50%; font-size: 11px; font-weight: 700; }.settings-guide-preview p { margin: 2px 0 0; color: var(--naverdic-settings-text-muted); font-size: 12px; line-height: 20px; }
.settings-notice-preview strong, .settings-help-preview strong { display: block; font-size: 16px; line-height: 24px; }.settings-notice-preview p, .settings-help-preview p { margin: 12px 0 0; color: var(--naverdic-settings-text-muted); font-size: 12px; line-height: 20px; }.settings-notice-preview span { display: block; margin-top: 26px; padding: 12px; color: var(--naverdic-settings-primary-text); background: var(--naverdic-settings-info); border-radius: 8px; font-size: 11px; line-height: 18px; }.settings-help-preview a { display: inline-block; margin-top: 24px; color: var(--naverdic-settings-primary-text); font-size: 12px; font-weight: 700; }
</style>
