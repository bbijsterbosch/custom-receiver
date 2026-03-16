import { Jellyfin } from "@jellyfin/sdk";
import type { Api } from "@jellyfin/sdk";
import type { JellyfinCredentials } from "../types";

const CLIENT_NAME = "Streamyfin Cast Receiver";
const CLIENT_VERSION = "1.0.0";

// Stable device ID for this receiver instance, generated once per page load.
const RECEIVER_DEVICE_ID = crypto.randomUUID();

let currentApi: Api | null = null;
let currentServerUrl: string | null = null;
let currentUserId: string | null = null;
let locked = false;

function isValidHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

/**
 * Initialize the Jellyfin API client with credentials received from the sender.
 * Locked after the first successful initialization — credentials cannot be
 * replaced until the session ends and clearApi() is called.
 */
export function initializeApi(credentials: JellyfinCredentials): Api | null {
  if (locked) {
    console.warn("[JellyfinApi] Already initialized — ignoring duplicate credentials");
    return currentApi;
  }

  if (!isValidHttpsUrl(credentials.serverUrl)) {
    console.error("[JellyfinApi] Invalid serverUrl — refusing to initialize");
    return null;
  }

  if (!credentials.accessToken || !credentials.userId) {
    console.error("[JellyfinApi] Missing required credentials");
    return null;
  }

  const jellyfin = new Jellyfin({
    clientInfo: { name: CLIENT_NAME, version: CLIENT_VERSION },
    deviceInfo: {
      name: CLIENT_NAME,
      id: RECEIVER_DEVICE_ID,
    },
  });

  currentApi = jellyfin.createApi(credentials.serverUrl, credentials.accessToken);
  currentServerUrl = credentials.serverUrl;
  currentUserId = credentials.userId;
  locked = true;

  console.log("[JellyfinApi] Initialized for server:", currentServerUrl);

  return currentApi;
}

export function getApi(): Api | null {
  return currentApi;
}

export function getCredentials(): { serverUrl: string; userId: string } | null {
  if (!currentApi || !currentServerUrl || !currentUserId) return null;
  return { serverUrl: currentServerUrl, userId: currentUserId };
}

export function clearApi(): void {
  currentApi = null;
  currentServerUrl = null;
  currentUserId = null;
  locked = false;
}
