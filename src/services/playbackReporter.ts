import { getPlaystateApi } from "@jellyfin/sdk/lib/utils/api";
import type { framework } from "chromecast-caf-receiver";
import { getApi } from "./jellyfinApi";

let reportingInterval: number | null = null;
let currentItemId: string | null = null;
let currentSessionId: string | null = null;
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
 * Store session metadata after stream init but wait with reporting until
 * playback actually starts. Call this from the LOAD interceptor.
 *
 * Same item (bitrate / audio / subtitle change):
 *   - Fires a stop for the old Jellyfin transcoding session so the server kills
 *     the old transcode job, then swaps in the new session ID.
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
    sessionId?: string | null;
  },
): void {
  const isSameItem = currentItemId === itemId;

  if (isSameItem) {
    // Quality / stream change on the same item.
    // Stop the old Jellyfin transcoding session so the server can clean it up.
    const oldSessionId = currentSessionId;
    currentSessionId = options?.sessionId ?? null;
    // hasReportedStart stays true  → beginReporting will not send a new start
    // reportingInterval stays alive → progress reports continue uninterrupted

    if (oldSessionId) {
      const api = getApi();
      if (api) {
        getPlaystateApi(api)
          .reportPlaybackStopped({
            playbackStopInfo: {
              ItemId: itemId,
              PositionTicks: getPositionTicks(playerManager),
              PlaySessionId: oldSessionId,
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

    console.log("[PlaybackReporter] Stream updated (same item):", itemId);
  } else {
    // Different item — full teardown then fresh state.
    stopReporting(playerManager);

    currentItemId = itemId;
    currentSessionId = options?.sessionId ?? null;
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
  currentSessionId = null;
  hasReportedStart = false;
}

async function reportPlaybackStart(
  itemId: string,
  playerManager: framework.PlayerManager,
): Promise<void> {
  const api = getApi();
  if (!api || hasReportedStart) return;

  try {
    await getPlaystateApi(api).reportPlaybackStart({
      playbackStartInfo: {
        ItemId: itemId,
        PositionTicks: getPositionTicks(playerManager),
        PlaySessionId: currentSessionId ?? itemId,
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
  playerManager: framework.PlayerManager,
): Promise<void> {
  const api = getApi();
  if (!api) return;

  const state = playerManager.getPlayerState();
  if (state === "IDLE") return;

  try {
    await getPlaystateApi(api).reportPlaybackProgress({
      playbackProgressInfo: {
        ItemId: itemId,
        PositionTicks: getPositionTicks(playerManager),
        IsPaused: state === "PAUSED",
        PlaySessionId: currentSessionId ?? itemId,
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
    await getPlaystateApi(api).reportPlaybackStopped({
      playbackStopInfo: {
        ItemId: itemId,
        PositionTicks: getPositionTicks(playerManager),
        PlaySessionId: currentSessionId ?? itemId,
      },
    });

    console.log("[PlaybackReporter] Reported playback stopped:", itemId);
  } catch (error) {
    console.error("[PlaybackReporter] Failed to report stop:", error);
  }
}
