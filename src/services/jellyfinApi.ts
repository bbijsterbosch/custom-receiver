import type { Api } from "@jellyfin/sdk";
import { Jellyfin } from "@jellyfin/sdk";
import type { JellyfinCredentials } from "../types";

const CLIENT_NAME = "Streamyfin Cast Receiver";
const CLIENT_VERSION = "1.0.0";
const DEVICE_ID = "streamyfin-cast-receiver";

let currentApi: Api | null = null;
let currentCredentials: JellyfinCredentials | null = null;

export function initializeApi(credentials: JellyfinCredentials): Api {
  const jellyfin = new Jellyfin({
    clientInfo: { name: CLIENT_NAME, version: CLIENT_VERSION },
    deviceInfo: {
      name: CLIENT_NAME,
      id: DEVICE_ID,
    },
  });

  currentApi = jellyfin.createApi(
    credentials.serverUrl,
    credentials.accessToken,
  );
  currentCredentials = credentials;

  console.log("[JellyfinApi] Initialized for server:", credentials.serverUrl);

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
}
