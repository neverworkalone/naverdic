<script setup>
import { ref, onMounted } from 'vue'
import { searchWord } from '../scheme.js'

const word = ref('')

onMounted(() => {
  document.getElementById('naverdic-dic').focus()
})
</script>

<template>
  <div class="naverdic-word">
    <form
      @submit.prevent="searchWord($event, word)"
      name="dicform"
    >
      <input
        v-model="word"
        type="text"
        id="naverdic-dic"
        class="naverdic-dic"
        ref="inputRef"
      >
      <input
        type="button"
        @click="searchWord($event, word)"
        class="naverdic-search"
        value="검색"
      >
    </form>

    <div id="content" align="left">
    </div>
    <hr>

    <div align="right">
      Naver dic <a href="options.html" target="_blank">Setting</a>
    </div>
  </div>
</template>

<style>
body {
  font-size: 10pt;
  background-color: #f5f5f5;
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
}
input.naverdic-search:hover {
  opacity: 0.87;
}
div.naverdic-wordTitle {
  margin-top: 5px;
  padding-left: 1px;
}
div.naverdic-wordTitle a {
  text-decoration: none;
  font-weight: bold;
  color: #37d;
}
dd.naverdic-means {
  margin-inline-start: 8px !important;
}
</style>
