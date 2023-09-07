import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'
import { defineConfig } from 'vite'
import { viteStaticCopy } from 'vite-plugin-static-copy'

export default defineConfig({
  server: {
    port: 3000,
  },
  build: {
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.html'),
        popup: resolve(__dirname, 'popup.html'),
        options: resolve(__dirname, 'options.html'),
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
          src: 'src/content.js',
          dest: '.'
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
