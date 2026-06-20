import { syncDeal, syncRouteoneBatch, testConnection } from "../lib/api"
import type {
  BackgroundMessage,
  RouteoneSyncResult,
  SyncResult,
  TestResult,
} from "../shared/types"

// The service worker owns all network calls to FundDesk. It holds host
// permission for the configured FundDesk origin (granted at connect time), so
// these cross-origin requests bypass the page's CORS restrictions.
chrome.runtime.onMessage.addListener(
  (
    message: BackgroundMessage,
    _sender,
    sendResponse: (r: SyncResult | RouteoneSyncResult | TestResult) => void
  ) => {
    if (message?.type === "SYNC_DEAL") {
      syncDeal(message.payload).then(sendResponse)
      return true // async sendResponse
    }
    if (message?.type === "SYNC_ROUTEONE") {
      syncRouteoneBatch(message.payload).then(sendResponse)
      return true
    }
    if (message?.type === "TEST_CONNECTION") {
      testConnection().then(sendResponse)
      return true
    }
    return undefined
  }
)
