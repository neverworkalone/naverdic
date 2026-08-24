<script setup>
import { computed, ref, watch } from 'vue'
import { findAudioEntryIndex } from '/src/dictionary/result-model.mjs'
import { getText } from '/src/text.js'

const props = defineProps({
  entries: {
    type: Array,
    default: () => []
  }
})

const audioElement = ref(null)
const audioAvailable = ref(true)
const audioEntryIndex = computed(() => findAudioEntryIndex(props.entries))
const audioEntry = computed(() => (
  audioEntryIndex.value >= 0 ? props.entries[audioEntryIndex.value] : null
))

function entryMeta(entry) {
  return [
    entry?.partOfSpeech,
    entry?.phoneticSymbol ? `/${entry.phoneticSymbol}/` : ''
  ].filter(Boolean).join(' · ')
}

function resetAudio() {
  audioAvailable.value = true
}

function hideAudio() {
  audioAvailable.value = false
}

async function playAudio() {
  if (!audioElement.value || !audioAvailable.value) {
    return
  }

  try {
    await audioElement.value.play()
  } catch (_error) {
    // A blocked or unavailable pronunciation should leave no broken control
    // or explanatory text in the popup.
    hideAudio()
  }
}

watch(() => props.entries, resetAudio, {deep: true})
</script>

<template>
  <section
    class="dictionary-result"
    :aria-label="getText('INLINE_POPUP_DICTIONARY_TITLE')"
    role="list"
    data-testid="dictionary-result"
  >
    <article
      v-for="(entry, entryIndex) in entries"
      :key="`${entry.word}-${entryIndex}`"
      class="dictionary-result__entry"
      role="listitem"
    >
      <div class="dictionary-result__header">
        <a
          class="dictionary-result__word"
          :href="entry.dictionaryUrl || '#'"
          target="_blank"
          rel="noopener noreferrer"
        >{{ entry.word }}</a>
        <button
          v-if="entryIndex === audioEntryIndex && audioAvailable"
          type="button"
          class="dictionary-result__audio-button"
          :aria-label="getText('POPUP_AUDIO_LABEL')"
          :title="getText('POPUP_AUDIO_LABEL')"
          @click.stop="playAudio"
        >
          <img src="/audio-play.svg" alt="" aria-hidden="true">
        </button>
      </div>

      <p v-if="entryMeta(entry)" class="dictionary-result__meta">
        {{ entryMeta(entry) }}
      </p>

      <div class="dictionary-result__divider" aria-hidden="true" />

      <p
        v-for="(meaning, meaningIndex) in entry.meanings"
        :key="`${entryIndex}-${meaningIndex}`"
        class="dictionary-result__meaning"
        :class="{'dictionary-result__meaning--primary': meaningIndex === 0}"
      >
        {{ meaning.order }}. {{ meaning.value }}
      </p>
    </article>

    <audio
      v-if="audioEntry && audioAvailable"
      ref="audioElement"
      class="dictionary-result__audio"
      preload="none"
      :src="audioEntry.audioUrl"
      @error="hideAudio"
    />
  </section>
</template>

<style>
.dictionary-result {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  min-height: 216px;
  max-height: 216px;
  padding: 12px;
  overflow: auto;
  border-radius: 8px;
  background: var(--naverdic-color-surface-popup, #F5F6F8);
  color: #384252;
}

.dictionary-result__entry {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.dictionary-result__entry + .dictionary-result__entry {
  padding-top: 8px;
  border-top: 1px solid #E5EBF2;
}

.dictionary-result__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 28px;
  gap: 8px;
}

.dictionary-result__word {
  min-width: 0;
  overflow-wrap: anywhere;
  color: #1A4FAB;
  font-size: 17px;
  font-weight: 700;
  line-height: normal;
  text-decoration: none;
}

.dictionary-result__word:hover {
  text-decoration: underline;
}

.dictionary-result__audio-button {
  display: inline-flex;
  flex: 0 0 40px;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 28px;
  padding: 0 8px;
  border: 0;
  border-radius: 8px;
  background: #E8F2FF;
  cursor: pointer;
}

.dictionary-result__audio-button:hover {
  background: #DCEBFF;
}

.dictionary-result__audio-button:focus-visible {
  outline: 3px solid rgba(37, 99, 235, 0.3);
  outline-offset: 1px;
}

.dictionary-result__audio-button img {
  display: block;
  width: 14px;
  height: 14px;
}

.dictionary-result__meta {
  margin: 0;
  color: #6B788F;
  font-size: 12px;
  line-height: normal;
}

.dictionary-result__divider {
  flex: 0 0 1px;
  width: 100%;
  height: 1px;
  background: #E5EBF2;
}

.dictionary-result__meaning {
  margin: 0;
  overflow-wrap: anywhere;
  color: #384252;
  font-size: 13px;
  line-height: 1.4;
}

.dictionary-result__meaning--primary {
  color: #1F2633;
  font-size: 14px;
  font-weight: 700;
}

.dictionary-result__audio {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  opacity: 0;
  pointer-events: none;
}
</style>
