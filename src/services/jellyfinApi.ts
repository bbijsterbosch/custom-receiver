import type { Api } from "@jellyfin/sdk";
import { Jellyfin } from "@jellyfin/sdk";
import type { JellyfinCredentials } from "../types";

const CLIENT_NAME = "Streamyfin Cast Receiver";
const CLIENT_VERSION = "0.1.0";
const CLIENT_DEVICE_NAME = "Chromecast";
let currentApi: Api | null = null;
let currentCredentials: JellyfinCredentials | null = null;
let currentDeviceId: string | null = null;

export function initializeApi(credentials: JellyfinCredentials): Api {
  // Generate a fresh UUID for each session so Jellyfin tracks this cast
  // session independently from any previous one.
  currentDeviceId = crypto.randomUUID();

  const jellyfin = new Jellyfin({
    clientInfo: { name: CLIENT_NAME, version: CLIENT_VERSION },
    deviceInfo: {
      name: CLIENT_DEVICE_NAME,
      id: currentDeviceId,
    },
  });

  currentApi = jellyfin.createApi(
    credentials.serverUrl,
    credentials.accessToken,
  );
  currentCredentials = credentials;

  console.log(
    "[JellyfinApi] Initialized for server:",
    credentials.serverUrl,
    "device:",
    currentDeviceId,
  );

  return currentApi;
}

export function getApi(): Api | null {
  return currentApi;
}

export function getCredentials(): JellyfinCredentials | null {
  return currentCredentials;
}

export function clearApi(): void {
  currentApi = null;
  currentCredentials = null;
  currentDeviceId = null;
}
