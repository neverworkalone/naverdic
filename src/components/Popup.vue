<script setup>
import { ref } from 'vue'

const count = ref(0)
</script>

<template>
  <div class="status">
    <form name="dicform">
      <input type="text" id="dic" class="dic"> <input type="button" id="search" value="OK" class="search">
    </form>

    <div id="content"></div>
    <hr>

    <div align="right">
      Naver dic <span id="version_text" class="version_text"></span> <a href="options.html" target="_blank">Setting</a>
    </div>
  </div>
</template>

<style scoped>
div.status {
  width: 280px;
  margin-top: 5px;
  text-align: center;
}
input.dic {
  width: 216px;
  height: 20px;
}
input.search {
  width: 48px;
  height: 26px;
  background-color: #48E;
  color:white;
}
</style>
