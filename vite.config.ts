import { defineConfig } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'
import path, { resolve } from 'path'
import packageJson from './package.json' with { type: 'json' }

const host = process.env.TAURI_DEV_HOST

// https://vitejs.dev/config/
export default defineConfig(async () => ({
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
  },
  plugins: [
    react(),
    babel({
      presets: [reactCompilerPreset()],
    }),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  build: {
    // Raise the warning threshold — Tauri apps are distributed as installers,
    // not served over the network, so chunk size matters less than in web apps.
    chunkSizeWarningLimit: 1500,
    rolldownOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        'quick-pane': resolve(import.meta.dirname, 'quick-pane.html'),
      },
      output: {
        // Split heavy vendor libraries into separate chunks so the browser
        // (WebView2) can cache them independently of app code changes.
        // NOTE: Vite 8 / Rolldown requires manualChunks to be a *function*,
        // not the legacy object form. The trailing slash in the match prevents
        // false positives (e.g. "react" matching "react-dom").
        manualChunks(id: string): string | undefined {
          const vendorMap: Record<string, string[]> = {
            'vendor-react': ['react', 'react-dom'],
            'vendor-ui': [
              '@radix-ui/react-dialog',
              '@radix-ui/react-alert-dialog',
              '@radix-ui/react-select',
              '@radix-ui/react-dropdown-menu',
              '@radix-ui/react-popover',
              '@radix-ui/react-tooltip',
            ],
            'vendor-icons': ['lucide-react'],
            'vendor-dates': ['date-fns'],
            'vendor-i18n': ['i18next', 'react-i18next'],
          }
          for (const [chunkName, packages] of Object.entries(vendorMap)) {
            if (packages.some(pkg => id.includes(`node_modules/${pkg}/`))) {
              return chunkName
            }
          }
        },
      },
    },
  },
  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: 'ws',
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell vite to ignore watching `src-tauri`
      ignored: ['**/src-tauri/**'],
    },
  },
}))
