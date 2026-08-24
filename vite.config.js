import vue from '@vitejs/plugin-vue'
import { dirname, resolve } from 'path'
import { defineConfig } from 'vite'
import { viteStaticCopy } from 'vite-plugin-static-copy'
import { fileURLToPath } from 'url'

const projectRoot = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  server: {
    port: 3000,
  },
  build: {
    rollupOptions: {
      input: {
        index: resolve(projectRoot, 'index.html'),
        popup: resolve(projectRoot, 'popup.html'),
        options: resolve(projectRoot, 'options.html'),
      }
    }
  },
  plugins: [
    viteStaticCopy({
      targets: [
        {
          src: 'src/background.js',
          dest: '.'
        },
        {
          src: 'src/background-handler.mjs',
          dest: '.'
        },
        {
          src: 'src/messaging.mjs',
          dest: '.'
        },
        {
          src: 'src/translation-engine.mjs',
          dest: '.'
        },
        {
          src: 'src/translation-provider.mjs',
          dest: '.'
        },
        {
          src: 'src/content.js',
          dest: '.'
        },
        {
          src: 'src/content-data.mjs',
          dest: '.'
        },
        {
          src: 'src/content-position.mjs',
          dest: '.'
        },
        {
          src: 'src/content-popup.mjs',
          dest: '.'
        },
        {
          src: 'src/popup-state.mjs',
          dest: '.'
        },
        {
          src: 'src/content-request.mjs',
          dest: '.'
        },
        {
          src: 'src/content-interaction.mjs',
          dest: '.'
        },
        {
          src: 'src/content-storage.mjs',
          dest: '.'
        },
        {
          src: 'src/content-settings.mjs',
          dest: '.'
        },
        {
          src: 'src/chrome-translator.mjs',
          dest: '.'
        },
        {
          src: 'src/settings.mjs',
          dest: '.'
        },
        {
          src: 'src/settings-v2.mjs',
          dest: '.'
        },
        {
          src: 'src/settings-v2-storage.mjs',
          dest: '.'
        },
        {
          src: 'src/settings-migration-v2.mjs',
          dest: '.'
        },
        {
          src: 'src/translation-settings.mjs',
          dest: '.'
        },
        {
          src: 'src/translation-testing.mjs',
          dest: '.'
        },
        {
          src: 'src/dictionary/parser.mjs',
          dest: 'dictionary'
        },
        {
          src: 'src/dictionary/normalizer.mjs',
          dest: 'dictionary'
        },
        {
          src: 'src/dictionary/result-model.mjs',
          dest: 'dictionary'
        },
        {
          src: 'src/content.css',
          dest: '.'
        },
        {
          src: 'src/_locales',
          dest: '.'
        },
      ]
    }),
    {
      name: 'CustomHot',
      handleHotUpdate({ file, server }) {
        if (file.endsWith('.js')) {
          server.ws.send({
            type: 'full-reload',
            path: '*'
          })
        }
      }
    },
    vue()
  ]
})
