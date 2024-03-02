<script setup>
import { ref, reactive, onMounted } from 'vue'
import { getText } from '/src/text.js'
import { DEFAULT_OPTIONS } from '/src/content.js'

const options = reactive({
  dClick: DEFAULT_OPTIONS.DCLICK,
  dClickTrigger: DEFAULT_OPTIONS.DCLICK_TRIGGER,
  dClickSpeed: DEFAULT_OPTIONS.DCLICK_SPEED,
  drag: DEFAULT_OPTIONS.DRAG,
  dragTrigger: DEFAULT_OPTIONS.DRAG_TRIGGER,
  translate: DEFAULT_OPTIONS.TRANSLATE,
  translateTrigger: DEFAULT_OPTIONS.TRANSLATE_TRIGGER,
  deeplAuthKey: DEFAULT_OPTIONS.DEEPL_AUTH_KEY,
  popupBGColor: DEFAULT_OPTIONS.POPUP_BG_COLOR,
  popupFontColor: DEFAULT_OPTIONS.POPUP_FONT_COLOR,
  popupFontSize: DEFAULT_OPTIONS.POPUP_FONT_SIZE,
  useDenyList: DEFAULT_OPTIONS.USE_DENY_LIST,
  safeURLs: DEFAULT_OPTIONS.SAFE_URLS
})
const version = chrome.runtime.getManifest().version
let statusText = ref('')

let ctrl = 'ctrl'
let alt = 'alt'

if (window.navigator.userAgentData.platform.includes('macOS')) {
  ctrl = 'cmd'
  alt = 'option'
}


function saveOptions() {
  if (options.useDenyList && options.safeURLs) {
    options.safeURLs = options.safeURLs.replace(/\s/g, '')
  }

  chrome.storage.sync.set({
    dclick: options.dClick,
    dclick_trigger_key: options.dClickTrigger,
    dclick_speed: options.dClickSpeed,
    drag: options.drag,
    drag_trigger_key: options.dragTrigger,
    translate: options.translate,
    translate_trigger_key: options.translateTrigger,
    deepl_auth_key: options.deeplAuthKey,
    popup_bgcolor: options.popupBGColor,
    popup_fontcolor: options.popupFontColor,
    popup_fontsize: options.popupFontSize,
    use_deny_list: options.useDenyList,
    safe_urls: options.safeURLs
  }, function() {
    statusText.value = getText('SAVE_STATUS');
    setTimeout(function() {
      statusText.value = ''
    }, 5000)
  })
}

function loadOptions() {
  chrome.storage.sync.get({
    dclick: DEFAULT_OPTIONS.DCLICK,
    dclick_trigger_key: DEFAULT_OPTIONS.DCLICK_TRIGGER,
    dclick_speed: DEFAULT_OPTIONS.DCLICK_SPEED,
    drag: DEFAULT_OPTIONS.DRAG,
    drag_trigger_key: DEFAULT_OPTIONS.DRAG_TRIGGER,
    translate: DEFAULT_OPTIONS.TRANSLATE,
    translate_trigger_key: DEFAULT_OPTIONS.TRANSLATE_TRIGGER,
    deepl_auth_key: DEFAULT_OPTIONS.DEEPL_AUTH_KEY,
    popup_bgcolor: DEFAULT_OPTIONS.POPUP_BG_COLOR,
    popup_fontcolor: DEFAULT_OPTIONS.POPUP_FONT_COLOR,
    popup_fontsize: DEFAULT_OPTIONS.POPUP_FONT_SIZE,
    use_deny_list: DEFAULT_OPTIONS.USE_DENY_LIST,
    safe_urls: DEFAULT_OPTIONS.SAFE_URLS
  }, function(items) {
    options.dClick = items.dclick
    options.dClickTrigger = items.dclick_trigger_key
    options.dClickSpeed = items.dclick_speed
    options.drag = items.drag
    options.dragTrigger = items.drag_trigger_key
    options.translate = items.translate
    options.translateTrigger = items.translate_trigger_key
    options.deeplAuthKey = items.deepl_auth_key
    options.popupBGColor = items.popup_bgcolor
    options.popupFontColor = items.popup_fontcolor
    options.popupFontSize = items.popup_fontsize
    options.useDenyList = items.use_deny_list
    options.safeURLs = items.safe_urls
  })
}

function resetOptions() {
  options.dClick = DEFAULT_OPTIONS.DCLICK
  options.dClickTrigger = DEFAULT_OPTIONS.DCLICK_TRIGGER
  options.dClickSpeed = DEFAULT_OPTIONS.DCLICK_SPEED
  options.drag = DEFAULT_OPTIONS.DRAG
  options.dragTrigger = DEFAULT_OPTIONS.DRAG_TRIGGER
  options.translate = DEFAULT_OPTIONS.TRANSLATE
  options.translateTrigger = DEFAULT_OPTIONS.TRANSLATE_TRIGGER
  options.deeplAuthKey = DEFAULT_OPTIONS.DEEPL_AUTH_KEY
  options.popupBGColor = DEFAULT_OPTIONS.POPUP_BG_COLOR
  options.popupFontColor = DEFAULT_OPTIONS.POPUP_FONT_COLOR
  options.popupFontSize = DEFAULT_OPTIONS.POPUP_FONT_SIZE
  options.useDenyList = DEFAULT_OPTIONS.USE_DENY_LIST
  options.safeURLs = DEFAULT_OPTIONS.SAFE_URLS

  chrome.storage.sync.set({
    dclick: options.dClick,
    dclick_trigger_key: options.dClickTrigger,
    dclick_speed: options.dClickSpeed,
    drag: options.drag,
    drag_trigger_key: options.dragTrigger,
    translate: options.translate,
    translate_trigger_key: options.translateTrigger,
    deepl_auth_key: options.deeplAuthKey,
    popup_bgcolor: options.popupBGColor,
    popup_fontcolor: options.popupFontColor,
    popup_fontsize: options.popupFontSize,
    use_deny_list: options.useDenyList,
    safe_urls: options.safeURLs
  }, function() {
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
                > <a href="https://gencode.me/blogs/post/89/" target="_blank">
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
                <a href="https://gencode.me/blogs/post/93/" target="_blank">
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
