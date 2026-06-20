import { DEFAULT_SERVER_URL, type Settings } from "../shared/types"

// Thin wrapper over chrome.storage.local. serverUrl always has a value
// (defaulting to localhost); token is undefined until the user connects.

export async function getSettings(): Promise<Settings> {
  const stored = await chrome.storage.local.get(["token", "serverUrl"])
  return {
    token: typeof stored.token === "string" ? stored.token : undefined,
    serverUrl:
      typeof stored.serverUrl === "string" && stored.serverUrl
        ? stored.serverUrl
        : DEFAULT_SERVER_URL,
  }
}

export async function setSettings(
  partial: { token?: string; serverUrl?: string }
): Promise<void> {
  await chrome.storage.local.set(partial)
}

export async function clearToken(): Promise<void> {
  await chrome.storage.local.remove("token")
}
