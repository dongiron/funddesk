import { defineConfig } from "vite"
import { crx } from "@crxjs/vite-plugin"
import manifest from "./manifest.config"

export default defineConfig({
  plugins: [crx({ manifest })],
  // @crxjs derives all inputs (popup html, service worker, content script) from
  // the manifest, so no manual rollup input wiring is needed.
  server: {
    port: 5173,
    strictPort: true,
  },
})
