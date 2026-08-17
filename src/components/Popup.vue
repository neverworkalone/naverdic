<script setup>
import { computed, ref, onMounted } from 'vue'
import { buildNaverApiUrl, parseNaverDictionaryResponse } from '/src/dictionary/parser.mjs'
import { getText } from '/src/text.js'

const word = ref('')
const entries = ref([])
const audioEntryIndex = computed(() => entries.value.findIndex(entry => entry.audioUrl))

async function searchWord(searchTerm) {
  const url = buildNaverApiUrl(searchTerm)

  chrome.runtime.sendMessage({
    method: 'GET',
    action: 'endic',
    url: url,
    }, function(data) {
      if (!data) {
        entries.value = []
        return
      }

      entries.value = parseNaverDictionaryResponse(data)
  })
}

onMounted(() => {
  document.getElementById('naverdic-dic').focus()
})
</script>

<template>
  <div class="naverdic-word">
    <form
      @submit.prevent="searchWord(word)"
    >
      <input
        v-model="word"
        type="text"
        id="naverdic-dic"
        class="naverdic-dic"
      >
      <input
        type="button"
        @click="searchWord(word)"
        class="naverdic-search"
        :value="getText('SEARCH')"
      >
    </form>

    <div id="content" align="left">
      <template
        v-for="(entry, entryIndex) in entries"
        :key="`${entry.word}-${entryIndex}`"
      >
        <div class="naverdic-wordTitle">
          <a
            :href="entry.dictionaryUrl"
            target="_blank"
            rel="noopener noreferrer"
          >{{ entry.word }}</a>
          <template v-if="entry.partOfSpeech"> [{{ entry.partOfSpeech }}]</template>
          <template v-if="entryIndex === audioEntryIndex">
            <span v-if="entry.phoneticSymbol"> [{{ entry.phoneticSymbol }}]</span>
            <span>
              <audio
                id="proaudio1"
                class="naverdic-audio"
                controls
                :src="entry.audioUrl"
                controlslist="nodownload nooption"
              />
            </span>
          </template>
        </div>
        <div
          v-for="(meaning, meaningIndex) in entry.meanings"
          :key="`${entryIndex}-${meaningIndex}`"
          :class="meaningIndex === entry.meanings.length - 1 ? 'naverdic-wordMeans-last' : 'naverdic-wordMeans'"
        >
          {{ meaning.order }}. {{ meaning.value }}
        </div>
      </template>
    </div>
    <hr>

    <div align="right">
      {{ getText('APP_NAME') }} <a href="options.html" target="_blank">{{ getText('SETTING') }}</a>
    </div>
  </div>
</template>

<style>
body {
  font-size: 10pt;
  background-color: #f5f5f5;
}
a {
  text-decoration:none;
  color: #37d;
}
div.naverdic-word {
  width: 280px;
  margin-top: 5px;
  text-align: center;
  vertical-align: top;
}
input.naverdic-dic {
  width: 216px;
  height: 20px;
}
input.naverdic-search {
  width: 48px;
  height: 26px;
  background-color: #1867c0;
  color:white;
  margin-left: 3px;
  vertical-align: top;
  border-radius: 4px;
  border-style: none;
  cursor:pointer;
}
input.naverdic-search:hover {
  opacity: 0.87;
}
div.naverdic-wordTitle {
  margin-top: 5px;
  padding-left: 1px;
}
div.naverdic-wordTitle a {
  font-weight: bold;
}
dd.naverdic-means {
  margin-inline-start: 8px !important;
}
</style>
