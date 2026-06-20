import { defineManifest } from "@crxjs/vite-plugin"

export default defineManifest({
  manifest_version: 3,
  name: "FundDesk Sync",
  version: "0.1.0",
  description: "Sync deals from TaptoSign and RouteOne to FundDesk",
  // activeTab + the popup click (a user gesture) authorizes executeScript on the
  // active tab, so no declared host permission for taptosign.com is needed. The
  // FundDesk origin is requested at runtime against the broad optional patterns.
  permissions: ["activeTab", "storage", "scripting"],
  optional_host_permissions: ["http://*/*", "https://*/*"],
  action: {
    default_popup: "src/popup/popup.html",
  },
  background: {
    service_worker: "src/background/service-worker.ts",
    type: "module",
  },
})
