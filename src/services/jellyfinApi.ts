import { Jellyfin } from "@jellyfin/sdk";
import type { Api } from "@jellyfin/sdk";
import type { JellyfinCredentials } from "../types";

const CLIENT_NAME = "Streamyfin Cast Receiver";
const CLIENT_VERSION = "1.0.0";

let currentApi: Api | null = null;
let currentCredentials: JellyfinCredentials | null = null;

export function initializeApi(credentials: JellyfinCredentials): Api {
  const jellyfin = new Jellyfin({
    clientInfo: { name: CLIENT_NAME, version: CLIENT_VERSION },
    deviceInfo: {
      name: credentials.deviceName || "Streamyfin Cast Receiver",
      id: credentials.deviceId,
    },
  });

  currentApi = jellyfin.createApi(
    credentials.serverUrl,
    credentials.accessToken
  );
  currentCredentials = credentials;

  console.log(
    "[JellyfinApi] Initialized for server:",
    credentials.serverUrl,
    "user:",
    credentials.userId
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
}
