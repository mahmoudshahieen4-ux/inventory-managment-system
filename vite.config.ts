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
    // Tauri apps ship as installers rather than over the network, so the
    // default chunk-size warning threshold is raised for vendor splits below.
    chunkSizeWarningLimit: 1500,
    // Rolldown is Vite 8's bundler: `build.rolldownOptions` is the canonical
    // key (`build.rollupOptions` is only a deprecated alias).
    rolldownOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        'quick-pane': resolve(import.meta.dirname, 'quick-pane.html'),
      },
      output: {
        // Split heavy vendor libraries into stable chunks so the WebView can
        // cache them independently of application code changes. Rolldown
        // requires manualChunks to be a *function* (object form is legacy).
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
  clearScreen: false,
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
      ignored: ['**/src-tauri/**'],
    },
  },
}))