import type { framework } from "chromecast-caf-receiver";
import { getPlaystateApi } from "@jellyfin/sdk/lib/utils/api";
import { getApi } from "./jellyfinApi";

let reportingInterval: number | null = null;
let currentItemId: string | null = null;
let currentPlayMethod: "Transcode" | "DirectStream" | "DirectPlay" = "DirectStream";
let currentSessionId: string | null = null;
let currentMediaSourceId: string | null = null;
let currentAudioStreamIndex: number | undefined = undefined;
let currentSubtitleStreamIndex: number | undefined = undefined;
let hasReportedStart = false;
let lastVolume = { level: 1, muted: false };


function getPositionTicks(playerManager: framework.PlayerManager): number {
  const currentTime = playerManager.getCurrentTimeSec() ?? 0;
  return Math.floor(currentTime * 10_000_000);
}

export function updateVolume(level: number, muted: boolean): void {
  lastVolume = { level, muted };
}

export function startReporting(
  itemId: string,
  playerManager: framework.PlayerManager,
  options?: {
    playMethod?: "Transcode" | "DirectStream" | "DirectPlay";
    sessionId?: string | null;
    mediaSourceId?: string | null;
    audioStreamIndex?: number;
    subtitleStreamIndex?: number;
  }
): void {
  stopReporting(playerManager);

  currentItemId = itemId;
  currentPlayMethod = options?.playMethod ?? "DirectStream";
  // Use the session ID from the sender so Jellyfin can match this report to the
  // active transcoding/streaming session. Fall back to a generated ID only if
  // the sender didn't provide one (e.g. older builds).
  currentSessionId = options?.sessionId ?? null;
  currentMediaSourceId = options?.mediaSourceId ?? null;
  currentAudioStreamIndex = options?.audioStreamIndex;
  currentSubtitleStreamIndex = options?.subtitleStreamIndex;
  hasReportedStart = false;

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
  currentPlayMethod = "DirectStream";
  currentSessionId = null;
  currentMediaSourceId = null;
  currentAudioStreamIndex = undefined;
  currentSubtitleStreamIndex = undefined;
  hasReportedStart = false;
}

async function reportPlaybackStart(
  itemId: string,
  playerManager: framework.PlayerManager,
): Promise<void> {
  const api = getApi();
  if (!api || hasReportedStart) return;

  try {
    const playStateApi = getPlaystateApi(api);

    await playStateApi.reportPlaybackStart({
      playbackStartInfo: {
        ItemId: itemId,
        PositionTicks: getPositionTicks(playerManager),
        PlayMethod: currentPlayMethod,
        PlaySessionId: currentSessionId ?? itemId,
        MediaSourceId: currentMediaSourceId ?? undefined,
        AudioStreamIndex: currentAudioStreamIndex,
        SubtitleStreamIndex: currentSubtitleStreamIndex,
        VolumeLevel: Math.floor(lastVolume.level * 100),
        IsMuted: lastVolume.muted,
      },
    });

    hasReportedStart = true;
    console.log("[PlaybackReporter] Reported playback start:", itemId, currentPlayMethod);
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
        PlayMethod: currentPlayMethod,
        PlaySessionId: currentSessionId ?? itemId,
        MediaSourceId: currentMediaSourceId ?? undefined,
        AudioStreamIndex: currentAudioStreamIndex,
        SubtitleStreamIndex: currentSubtitleStreamIndex,
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
        PlaySessionId: currentSessionId ?? itemId,
        MediaSourceId: currentMediaSourceId ?? undefined,
      },
    });

    console.log("[PlaybackReporter] Reported playback stopped:", itemId);
  } catch (error) {
    console.error("[PlaybackReporter] Failed to report stop:", error);
  }
}
