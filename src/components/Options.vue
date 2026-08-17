<script setup>
import { ref, reactive, onMounted } from 'vue'
import { getText } from '/src/text.js'
import {
  createOptionForm,
  optionFormFromSettings,
  settingsFromOptionForm
} from '/src/settings.mjs'
import { loadSettings, saveSettings } from '/src/settings-storage.mjs'
import { getTriggerLabels } from '/src/content-interaction.mjs'

const options = reactive(createOptionForm())
const version = chrome.runtime.getManifest().version
let statusText = ref('')
const {ctrl, alt} = getTriggerLabels()

function saveOptions() {
  saveSettings(chrome.storage, settingsFromOptionForm(options), function() {
    statusText.value = getText('SAVE_STATUS');
    setTimeout(function() {
      statusText.value = ''
    }, 5000)
  })
}

function loadOptions() {
  loadSettings(chrome.storage, function(items) {
    Object.assign(options, optionFormFromSettings(items))
  })
}

function resetOptions() {
  Object.assign(options, createOptionForm())

  saveSettings(chrome.storage, settingsFromOptionForm(options), function() {
    statusText.value = getText('RESET_STATUS');
    setTimeout(function() {
      statusText.value = ''
    }, 5000)
  })
}

onMounted(() => {
  loadOptions()
})
</script>

<template>
  <div align="center">
    <table class="setting-box">
      <tr class="header">
        <td colspan="2" class="header">
          {{ getText('APP_NAME') }} <font color="#85736C">{{ getText('SETTING') }}</font>
        </td>
      </tr>

      <tr>
        <td colspan="2" class="version">
          {{ getText('VERSION') }} {{ version }}
        </td>
      </tr>

      <tr>
        <td class="title">
          {{ getText('POPUP_SETTING') }}
        </td>
        <td align="left">
          <table>
            <tr>
              <td width="88px">
                <label>{{ getText('POPUP_BGCOLOR') }}</label><br>
                <label>{{ getText('POPUP_FONTCOLOR') }}</label><br>
                <label>{{ getText('POPUP_FONTSIZE') }}</label>
              </td>
              <td>
                <input
                  v-model="options.popupBGColor"
                  type="text"
                  class="option-popup-input"
                > <a href="https://neverworkalone.github.io/naverdic/themes.html" target="_blank">
                  {{ getText('POPUP_THEME_GUIDE') }}
                </a>
                <br>
                <input
                  v-model="options.popupFontColor"
                  type="text"
                  class="option-popup-input"
                ><br>
                <input
                  v-model="options.popupFontSize"
                  type="text"
                  class="option-popup-input"
                >
              </td>
            </tr>
          </table>

            <input
              type="checkbox"
              v-model="options.dClick"
            >
            <span
              class="checkbox-label"
            >{{ getText('DCLICK_DESC') }}</span>
          <br>
          <span class="options-description">
            {{ getText('TRIGGER') }}
            <select
              v-model="options.dClickTrigger"
            >
              <option value="none">{{ getText('DCLICK') }}</option>
              <option value="ctrl">{{ getText('CTRL_DCLICK', [ctrl]) }}</option>
              <option value="alt">{{ getText('ALT_DCLICK', [alt]) }}</option>
              <option value="ctrlalt">{{ getText('CTRL_ALT_DCLICK', [ctrl, alt]) }}</option>
            </select>
          </span>
          <br>
          <span class="options-description">
            {{ getText('DCLICK_SPEED') }}
            <select
              v-model="options.dClickSpeed"
            >
              <option value="200">{{ getText('DCLICK_SPEED_FASTEST') }}</option>
              <option value="300">{{ getText('DCLICK_SPEED_FAST') }}</option>
              <option value="400">{{ getText('DCLICK_SPEED_SLOW') }}</option>
              <option value="500">{{ getText('DCLICK_SPEED_SLOWEST') }}</option>
            </select>
          </span>

          <br>
          <label>
            <input
              type="checkbox"
              v-model="options.drag"
            > {{ getText('DRAG_DESC') }}
          </label>
          <br>
          <span class="options-description">
            {{ getText('TRIGGER') }}
            <select
              v-model="options.dragTrigger"
            >
              <option value="none">{{ getText('DRAG') }}</option>
              <option value="ctrl">{{ getText('CTRL_DRAG', [ctrl]) }}</option>
              <option value="alt">{{ getText('ALT_DRAG', [alt]) }}</option>
              <option value="ctrlalt">{{ getText('CTRL_ALT_DRAG', [ctrl, alt]) }}</option>
            </select>
          </span>
          <br>
          <label>
            <input
              type="checkbox"
              v-model="options.useDenyList"
            > {{ getText('URL_SETTING') }}
          </label>
          <textarea
            class="options-url"
            v-model="options.safeURLs"
            :placeholder="getText('URL_DESC')"
            rows=2
          ></textarea>
        </td>
      </tr>

      <tr class="translation">
        <td class="title">
          {{ getText('DEEPL') }}
        </td>
        <td align="left">
          <table>
            <tr>
              <td colspan="2">
                <input
                  type="checkbox"
                  v-model="options.translate"
                > {{ getText('DEEPL_TRANSLATION') }}
              </td>
            </tr>
            <tr>
              <td width="60px">
                <label
                  style="padding-bottom:5px;"
                >{{ getText('TRIGGER') }}</label><br>
              </td>
              <td>
                <select
                  v-model="options.translateTrigger"
                >
                  <option value="none">{{ getText('DRAG') }}</option>
                  <option value="ctrl">{{ getText('CTRL_DRAG', [ctrl]) }}</option>
                  <option value="alt">{{ getText('ALT_DRAG', [alt]) }}</option>
                  <option value="ctrlalt">{{ getText('CTRL_ALT_DRAG', [ctrl, alt]) }}</option>
                </select>
              </td>
            </tr>
            <tr>
              <td width="60px">
                <label
                  style="padding-bottom:5px;"
                >{{ getText('DEEPL_AUTH_KEY') }}</label><br>
              </td>
              <td>
                <input
                  v-model="options.deeplAuthKey"
                  type="text"
                  class="option-authkey-input"
                ><br>
              </td>
            </tr>

            <tr>
              <td colspan="2" align="right">
                <font color="#E54F44">{{ getText('DEEPL_DESC') }}</font><br>
                <a href="https://neverworkalone.github.io/naverdic/deepl.html" target="_blank">
                  {{ getText('DEEPL_INSTRUCTION') }}
                </a><br>
                <a href="https://www.deepl.com/ko/pro-api?cta=header-pro-api" target="_blank">
                  {{ getText('DEEPL_API') }}
                </a>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <tr>
        <td align="left" valign="top" height="60px" colspan="2">
          <div class="options-savearea">
            <input
              type="button"
              @click="resetOptions()"
              class="options-button button-reset"
              :value="getText('RESET')"
            >
            <input
              type="button"
              @click="saveOptions()"
              class="options-button button-save"
              :value="getText('SAVE')"
            >
            <span class="options-status">{{ statusText }}</span>
          </div>
        </td>
      </tr>
    </table>
  </div>
</template>

<style scoped>
table.setting-box {
  width: 640px;
  background-color: #EEEEEE;
  box-shadow:0 0 30px 4px #888;
  border-collapse: collapse;
}
tr.header {
  text-align: center;
  height: 30px;
  padding: 10px; padding-left: 1px; padding-right: 1px;
  font-size: 20px;
  color: #37C113;
  background-image: linear-gradient(
    to right,
    rgba(0, 0, 0, 0.5),
    rgba(0, 0, 0, 0.9),
    rgba(0, 0, 0, 0.5)
  );
}
tr.translation {
  border-top: 1pt solid;
}
td {
  padding: 5px; padding-left: 1px; padding-right: 1px;
}
td.version {
  text-align: right;
  padding-right: 20px;
}
td.title {
  width: 200px;
  text-align: center;
  font-size: 14px;
  font-weight:bold;
}
span.checkbox-label {
  margin-left: 3px;
}
span.options-description {
  margin-top: 5px;
  margin-bottom: 5px;
  margin-left: 10px;
  display:inline-block;
}
select {
  height: 25px;
  line-height: 25px;
  margin-left: 10px;
}
label {
  margin-top: 5px;
  display:inline-block;
}
div.options-savearea {
  margin-left: 40px;
}
input.option-popup-input {
  width: 110px;
  margin-bottom:2px;
}
input.option-authkey-input {
  width: 280px;
}
input.options-button {
  width: 60px;
  height: 30px;
  margin-left: 10px;
  font-size: 11pt;
  vertical-align: top;
  border-radius: 4px;
  border-style: none;
  box-shadow:
    0 3px 1px -2px rgba(0,0,0,.2),
    0 2px 2px 0 rgba(0,0,0,.2),
    0 1px 5px 0 rgba(0,0,0,.2);
  cursor:pointer;
}
input.button-save {
  background-color: #1867c0;
  color:white;
}
input.button-save:hover {
  opacity: 0.87;
}
input.button-reset:hover {
  background-color: #ff5252;
  color: white;
  opacity: 0.77;
}
span.options-status {
  margin-left: 15px;
}
textarea.options-url {
  width: 90%;
  padding: 5px;
}
a:link {color:#1867c0; text-decoration:none;}
a:visited {color:#1867c0; text-decoration:none;}
a:hover {color:#1E88E5; text-decoration:none;}
</style>
