import { getPlaystateApi } from "@jellyfin/sdk/lib/utils/api";
import type { framework } from "chromecast-caf-receiver";
import { getApi } from "./jellyfinApi";

let reportingInterval: number | null = null;
let currentItemId: string | null = null;
let currentPlayMethod: "Transcode" | "DirectStream" | "DirectPlay" =
  "DirectStream";
let currentSessionId: string | null = null;
let currentMediaSourceId: string | null = null;
let currentAudioStreamIndex: number | undefined;
let currentSubtitleStreamIndex: number | undefined;
let hasReportedStart = false;
let lastVolume = { level: 1, muted: false };

function getPositionTicks(playerManager: framework.PlayerManager): number {
  const currentTime = playerManager.getCurrentTimeSec() ?? 0;
  return Math.floor(currentTime * 10_000_000);
}

export function updateVolume(level: number, muted: boolean): void {
  lastVolume = { level, muted };
}

/**
 * Store session metadata after stream init but wait with reporting until playback actually starts.
 * Call this from the LOAD interceptor. Does NOT send any reports yet.
 *
 * Same item (bitrate / audio / subtitle change):
 *   - Fires a stop for the old Jellyfin transcoding session so the server kills
 *     the old transcode job, then swaps in the new parameters.
 *   - Does NOT reset hasReportedStart or clear the interval — the watch session
 *     continues uninterrupted from Jellyfin's perspective.
 *
 * Different item:
 *   - Full stop (PlaybackStopped sent, interval cleared) then fresh state.
 */
export function prepareReporting(
  itemId: string,
  playerManager: framework.PlayerManager,
  options?: {
    playMethod?: "Transcode" | "DirectStream" | "DirectPlay";
    sessionId?: string | null;
    mediaSourceId?: string | null;
    audioStreamIndex?: number;
    subtitleStreamIndex?: number;
  },
): void {
  const isSameItem = currentItemId === itemId;

  if (isSameItem) {
    // Quality / stream change on the same item.
    // Stop the old Jellyfin transcoding session so the server can clean it up,
    // but capture the old values first since we're about to overwrite them.
    const oldSessionId = currentSessionId;
    const oldMediaSourceId = currentMediaSourceId;

    currentPlayMethod = options?.playMethod ?? "DirectStream";
    currentSessionId = options?.sessionId ?? null;
    currentMediaSourceId = options?.mediaSourceId ?? null;
    currentAudioStreamIndex = options?.audioStreamIndex;
    currentSubtitleStreamIndex = options?.subtitleStreamIndex;
    // hasReportedStart stays true  → beginReporting will not send a new start
    // reportingInterval stays alive → progress reports continue uninterrupted

    // Fire-and-forget stop for the old transcoding session only.
    if (oldSessionId) {
      const api = getApi();
      if (api) {
        getPlaystateApi(api)
          .reportPlaybackStopped({
            playbackStopInfo: {
              ItemId: itemId,
              PositionTicks: getPositionTicks(playerManager),
              PlaySessionId: oldSessionId,
              MediaSourceId: oldMediaSourceId ?? undefined,
            },
          })
          .catch((err) =>
            console.error(
              "[PlaybackReporter] Failed to stop old transcode session:",
              err,
            ),
          );
      }
    }

    console.log(
      "[PlaybackReporter] Stream updated (same item):",
      itemId,
      options?.playMethod,
    );
  } else {
    // Different item — full teardown of the previous session then fresh state.
    stopReporting(playerManager);

    currentItemId = itemId;
    currentPlayMethod = options?.playMethod ?? "DirectStream";
    currentSessionId = options?.sessionId ?? null;
    currentMediaSourceId = options?.mediaSourceId ?? null;
    currentAudioStreamIndex = options?.audioStreamIndex;
    currentSubtitleStreamIndex = options?.subtitleStreamIndex;
    hasReportedStart = false;
  }
}

/**
 * Send PlaybackStart and begin the progress interval.
 * Call this from a PLAYING event so reports are sent only once the media
 * is actually rendering, not while it is still buffering.
 */
export function beginReporting(playerManager: framework.PlayerManager): void {
  if (!currentItemId || hasReportedStart) return;

  reportPlaybackStart(currentItemId, playerManager);

  if (reportingInterval === null) {
    reportingInterval = window.setInterval(() => {
      if (currentItemId) reportPlaybackProgress(currentItemId, playerManager);
    }, 10_000);
  }
}

export function stopReporting(playerManager?: framework.PlayerManager): void {
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
    console.log(
      "[PlaybackReporter] Reported playback start:",
      itemId,
      currentPlayMethod,
    );
  } catch (error) {
    console.error("[PlaybackReporter] Failed to report start:", error);
  }
}

async function reportPlaybackProgress(
  itemId: string,
  playerManager: framework.PlayerManager,
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
  playerManager: framework.PlayerManager,
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
