import type { framework } from "chromecast-caf-receiver";
import { getPlaystateApi } from "@jellyfin/sdk/lib/utils/api";
import { getApi } from "./jellyfinApi";

let reportingInterval: number | null = null;
let currentItemId: string | null = null;
let hasReportedStart = false;
let playSessionId: string | null = null;
let lastVolume = { level: 1, muted: false };

function generateSessionId(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  array[6] = (array[6] & 0x0f) | 0x40;
  array[8] = (array[8] & 0x3f) | 0x80;
  return Array.from(array, (b, i) => {
    const hex = b.toString(16).padStart(2, "0");
    return [4, 6, 8, 10].includes(i) ? `-${hex}` : hex;
  }).join("");
}

function getPositionTicks(
  playerManager: framework.PlayerManager
): number {
  const currentTime = playerManager.getCurrentTimeSec() ?? 0;
  return Math.floor(currentTime * 10_000_000);
}

function isTranscoding(
  playerManager: framework.PlayerManager
): boolean {
  const mediaInfo = playerManager.getMediaInformation();
  const url = mediaInfo?.contentUrl || mediaInfo?.contentId || "";
  return /m3u8/i.test(url);
}

export function updateVolume(level: number, muted: boolean): void {
  lastVolume = { level, muted };
}

export function startReporting(
  itemId: string,
  playerManager: framework.PlayerManager
): void {
  stopReporting(playerManager);

  currentItemId = itemId;
  hasReportedStart = false;
  playSessionId = generateSessionId();

  reportPlaybackStart(itemId, playerManager);

  reportingInterval = window.setInterval(() => {
    reportPlaybackProgress(itemId, playerManager);
  }, 10_000);
}

export function stopReporting(
  playerManager?: framework.PlayerManager
): void {
  if (reportingInterval !== null) {
    clearInterval(reportingInterval);
    reportingInterval = null;
  }

  if (currentItemId && playerManager) {
    reportPlaybackStopped(currentItemId, playerManager);
  }

  currentItemId = null;
  hasReportedStart = false;
  playSessionId = null;
}

async function reportPlaybackStart(
  itemId: string,
  playerManager: framework.PlayerManager
): Promise<void> {
  const api = getApi();
  if (!api || hasReportedStart) return;

  try {
    const playStateApi = getPlaystateApi(api);

    await playStateApi.reportPlaybackStart({
      playbackStartInfo: {
        ItemId: itemId,
        PositionTicks: getPositionTicks(playerManager),
        PlayMethod: isTranscoding(playerManager) ? "Transcode" : "DirectStream",
        PlaySessionId: playSessionId ?? itemId,
        VolumeLevel: Math.floor(lastVolume.level * 100),
        IsMuted: lastVolume.muted,
      },
    });

    hasReportedStart = true;
    console.log("[PlaybackReporter] Reported playback start:", itemId);
  } catch (error) {
    console.error("[PlaybackReporter] Failed to report start:", error);
  }
}

async function reportPlaybackProgress(
  itemId: string,
  playerManager: framework.PlayerManager
): Promise<void> {
  const api = getApi();
  if (!api) return;

  const state = playerManager.getPlayerState();
  if (state === "IDLE") return;

  try {
    const playStateApi = getPlaystateApi(api);

    await playStateApi.reportPlaybackProgress({
      playbackProgressInfo: {
        ItemId: itemId,
        PositionTicks: getPositionTicks(playerManager),
        IsPaused: state === "PAUSED",
        PlayMethod: isTranscoding(playerManager) ? "Transcode" : "DirectStream",
        PlaySessionId: playSessionId ?? itemId,
        VolumeLevel: Math.floor(lastVolume.level * 100),
        IsMuted: lastVolume.muted,
      },
    });
  } catch (error) {
    console.error("[PlaybackReporter] Failed to report progress:", error);
  }
}

async function reportPlaybackStopped(
  itemId: string,
  playerManager: framework.PlayerManager
): Promise<void> {
  const api = getApi();
  if (!api) return;

  try {
    const playStateApi = getPlaystateApi(api);

    await playStateApi.reportPlaybackStopped({
      playbackStopInfo: {
        ItemId: itemId,
        PositionTicks: getPositionTicks(playerManager),
        PlaySessionId: playSessionId ?? itemId,
      },
    });

    console.log("[PlaybackReporter] Reported playback stopped:", itemId);
  } catch (error) {
    console.error("[PlaybackReporter] Failed to report stop:", error);
  }
}
