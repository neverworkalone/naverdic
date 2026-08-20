<script setup>
import { computed } from 'vue'
import { getText } from '/src/text.js'

const props = defineProps({
  activePage: {
    type: Object,
    required: true
  },
  draft: {
    type: Object,
    required: true
  }
})

function text(key, placeholders = undefined) {
  return getText(key, placeholders)
}

function previewColor(value, fallback) {
  const candidate = String(value ?? '').trim()
  if (/^#[\da-f]{3,8}$/i.test(candidate) ||
      /^(?:rgb|hsl)a?\([^)]*\)$/i.test(candidate) ||
      /^[a-z]+$/i.test(candidate)) {
    return candidate
  }

  return fallback
}

const popupStyle = computed(() => ({
  backgroundColor: previewColor(props.draft.popup?.backgroundColor, '#FFF59D'),
  color: previewColor(props.draft.popup?.fontColor, '#000000'),
  fontSize: `${Number(props.draft.popup?.fontSizePt) > 0 ? Number(props.draft.popup.fontSizePt) : 11}pt`
}))
</script>

<template>
  <div
    class="settings-live-preview"
    :data-preview-page="activePage.id"
    data-testid="settings-live-preview"
  >
    <div class="settings-live-preview__browser-bar">
      <span class="settings-live-preview__dot" />
      <span class="settings-live-preview__dot" />
      <span class="settings-live-preview__dot" />
    </div>
    <div class="settings-live-preview__content">
      <div class="settings-live-preview__line settings-live-preview__line--long" />
      <div class="settings-live-preview__line settings-live-preview__line--medium" />
      <div class="settings-live-preview__line settings-live-preview__line--short" />
      <article class="settings-live-preview__popup" :style="popupStyle">
        <strong>{{ text('SETTINGS_PREVIEW_WORD') }}</strong>
        <span>{{ text('SETTINGS_PREVIEW_MEANING') }}</span>
        <small>{{ text('SETTINGS_PREVIEW_HINT') }}</small>
      </article>
    </div>
  </div>
</template>

<style scoped>
.settings-live-preview {
  min-height: 360px;
  overflow: hidden;
  background: var(--naverdic-settings-preview-surface);
  border: 1px solid var(--naverdic-settings-border);
  border-radius: var(--naverdic-radius-md);
  box-shadow: var(--naverdic-card-shadow-default);
}

.settings-live-preview__browser-bar {
  display: flex;
  align-items: center;
  gap: 5px;
  height: 32px;
  padding: 0 12px;
  background: var(--naverdic-settings-preview-bar);
  border-bottom: 1px solid var(--naverdic-settings-border);
}

.settings-live-preview__dot {
  width: 7px;
  height: 7px;
  background: var(--naverdic-settings-text-subtle);
  border-radius: 50%;
}

.settings-live-preview__content {
  position: relative;
  min-height: 328px;
  padding: 36px 18px 20px;
  background: var(--naverdic-settings-preview-window);
}

.settings-live-preview__line {
  height: 8px;
  margin-bottom: 12px;
  background: var(--naverdic-settings-divider);
  border-radius: 4px;
}

.settings-live-preview__line--long {
  width: 76%;
}

.settings-live-preview__line--medium {
  width: 91%;
}

.settings-live-preview__line--short {
  width: 53%;
}

.settings-live-preview__popup {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: min(100%, 220px);
  margin: 26px auto 0;
  padding: 16px;
  border: 1px solid rgba(26, 36, 51, 0.16);
  border-radius: var(--naverdic-radius-sm);
  box-shadow: var(--naverdic-shadow-popup);
}

.settings-live-preview__popup strong {
  font-size: 1.15em;
  line-height: 1.3;
}

.settings-live-preview__popup span {
  font-size: 0.92em;
  line-height: 1.4;
}

.settings-live-preview__popup small {
  color: currentColor;
  opacity: 0.62;
  font-size: 0.78em;
  line-height: 1.4;
}
</style>
