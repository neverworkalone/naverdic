<script setup>
import { computed } from 'vue'
import { getText } from '/src/text.js'
import { resolveCssColor } from '/src/settings-colors.mjs'
import { getProviderPreset } from '/src/translation-provider.mjs'
import { getProviderCredential } from '/src/translation-settings.mjs'

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
    default: () => ({providers: {}})
  }
})

function text(key, placeholders = undefined) {
  return getText(key, placeholders)
}

const popupStyle = computed(() => ({
  backgroundColor: resolveCssColor(props.draft.popup?.backgroundColor, '#FFF59D'),
  color: resolveCssColor(props.draft.popup?.fontColor, '#000000'),
  fontSize: `${Number(props.draft.popup?.fontSizePt) > 0 ? Number(props.draft.popup.fontSizePt) : 11}pt`
}))

const translationProvider = computed(() => {
  const providerId = props.draft.translation?.providerId || 'deepl-free'
  return getProviderPreset(providerId) || props.draft.customProviders?.[providerId] || null
})

const translationProviderName = computed(() => {
  const provider = translationProvider.value
  if (!provider) {
    return text('SETTINGS_TRANSLATION_PROVIDER_UNKNOWN')
  }

  if (provider.id === 'chrome-translator') {
    return text('SETTINGS_TRANSLATION_CHROME_NAME')
  }
  if (provider.id === 'deepl-free' || provider.id === 'deepl-pro') {
    return provider.id === 'deepl-pro' ? 'DeepL Pro' : 'DeepL Free'
  }
  if (provider.id === 'gemini') {
    return text('SETTINGS_TRANSLATION_GEMINI_NAME')
  }
  return provider.name || provider.id
})

const translationProviderDescription = computed(() => {
  const provider = translationProvider.value
  if (!provider) {
    return text('SETTINGS_TRANSLATION_PROVIDER_UNKNOWN_DESCRIPTION')
  }
  if (provider.id === 'chrome-translator') {
    return text('SETTINGS_TRANSLATION_CHROME_PREVIEW_DESCRIPTION')
  }
  if (provider.id === 'deepl-free' || provider.id === 'deepl-pro') {
    return text('SETTINGS_TRANSLATION_DEEPL_DESCRIPTION')
  }
  if (provider.id === 'gemini') {
    return text('SETTINGS_TRANSLATION_GEMINI_DESCRIPTION')
  }
  return text('SETTINGS_TRANSLATION_CUSTOM_DESCRIPTION')
})

const translationHasCredential = computed(() => {
  return Boolean(getProviderCredential(
    translationProvider.value,
    props.draftSecrets
  ))
})
</script>

<template>
  <div
    class="settings-live-preview"
    :data-preview-page="activePage.id"
    data-testid="settings-live-preview"
  >
    <div v-if="activePage.id === 'translation-service'" class="settings-translation-preview">
      <span class="settings-translation-preview__badge">
        {{ translationProvider?.id === 'chrome-translator'
          ? text('SETTINGS_TRANSLATION_DEFAULT_BADGE')
          : text('SETTINGS_TRANSLATION_EXTERNAL_BADGE') }}
      </span>
      <strong class="settings-translation-preview__name">{{ translationProviderName }}</strong>
      <p class="settings-translation-preview__description">{{ translationProviderDescription }}</p>
      <span class="settings-translation-preview__service-button">
        {{ text('SETTINGS_TRANSLATION_SERVICE_SETTINGS') }}
      </span>
      <label class="settings-translation-preview__label">
        {{ text('SETTINGS_TRANSLATION_API_KEY') }}
      </label>
      <div class="settings-translation-preview__secret">
        {{ translationHasCredential ? '••••••••••••••••' : text('SETTINGS_TRANSLATION_API_KEY_EMPTY') }}
      </div>
      <p class="settings-translation-preview__hint">
        {{ translationProvider?.id === 'chrome-translator'
          ? text('SETTINGS_TRANSLATION_CHROME_PREVIEW_HINT')
          : text('SETTINGS_TRANSLATION_EXTERNAL_PREVIEW_HINT') }}
      </p>
    </div>
    <div v-else>
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

.settings-translation-preview {
  min-height: 520px;
  padding: 28px 23px;
  background: var(--naverdic-settings-preview-surface);
}

.settings-translation-preview__badge {
  display: inline-flex;
  min-height: 26px;
  align-items: center;
  padding: 0 10px;
  color: var(--naverdic-settings-primary-text);
  background: var(--naverdic-settings-nav-active);
  border-radius: 999px;
  font-size: 10px;
  font-weight: 700;
}

.settings-translation-preview__name {
  display: block;
  margin-top: 22px;
  color: var(--naverdic-settings-text);
  font-size: 16px;
  line-height: 26px;
}

.settings-translation-preview__description,
.settings-translation-preview__hint {
  margin: 10px 0 0;
  color: var(--naverdic-settings-text-muted);
  font-size: 12px;
  line-height: 20px;
}

.settings-translation-preview__service-button {
  display: inline-flex;
  min-height: 34px;
  align-items: center;
  margin-top: 20px;
  padding: 0 10px;
  color: var(--naverdic-settings-primary-text);
  background: var(--naverdic-settings-surface);
  border: 1px solid var(--naverdic-settings-border);
  border-radius: 7px;
  font-size: 12px;
  font-weight: 700;
}

.settings-translation-preview__label {
  display: block;
  margin-top: 28px;
  color: var(--naverdic-settings-nav-text);
  font-size: 12px;
  font-weight: 500;
  line-height: 20px;
}

.settings-translation-preview__secret {
  min-height: 40px;
  margin-top: 4px;
  padding: 9px 13px;
  color: var(--naverdic-settings-text-subtle);
  background: var(--naverdic-settings-surface);
  border: 1px solid var(--naverdic-settings-border);
  border-radius: 8px;
  font-size: 13px;
  line-height: 20px;
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
