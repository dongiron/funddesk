import {
  stagePdf,
  syncBosExtract,
  syncDeal,
  syncDecisionSummary,
  syncMessages,
  syncPdfExtract,
  syncRouteoneBatch,
  testConnection,
} from "../lib/api"
import type {
  BackgroundMessage,
  BosExtractResult,
  DecisionSummaryResult,
  MessagesSyncResult,
  PdfExtractResult,
  RouteoneSyncResult,
  StagePdfResult,
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
    sendResponse: (
      r:
        | SyncResult
        | RouteoneSyncResult
        | PdfExtractResult
        | BosExtractResult
        | DecisionSummaryResult
        | MessagesSyncResult
        | StagePdfResult
        | TestResult
    ) => void
  ) => {
    if (message?.type === "SYNC_DEAL") {
      syncDeal(message.payload).then(sendResponse)
      return true // async sendResponse
    }
    if (message?.type === "STAGE_PDF") {
      stagePdf(message.payload).then(sendResponse)
      return true
    }
    if (message?.type === "SYNC_ROUTEONE") {
      syncRouteoneBatch(message.payload).then(sendResponse)
      return true
    }
    if (message?.type === "SYNC_PDF_EXTRACT") {
      syncPdfExtract(message.payload).then(sendResponse)
      return true
    }
    if (message?.type === "SYNC_BOS_EXTRACT") {
      syncBosExtract(message.payload).then(sendResponse)
      return true
    }
    if (message?.type === "SYNC_DECISION_SUMMARY") {
      syncDecisionSummary(message.payload).then(sendResponse)
      return true
    }
    if (message?.type === "SYNC_MESSAGES") {
      syncMessages(message.payload).then(sendResponse)
      return true
    }
    if (message?.type === "TEST_CONNECTION") {
      testConnection().then(sendResponse)
      return true
    }
    return undefined
  }
)
