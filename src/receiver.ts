import { initializeApi, clearApi } from "./services/jellyfinApi";
import {
  startReporting,
  stopReporting,
  updateVolume,
} from "./services/playbackReporter";
import type { ReceiverCustomData } from "./types";

export function initializeReceiver(): void {
  const context = cast.framework.CastReceiverContext.getInstance();
  const playerManager = context.getPlayerManager();

  // Intercept LOAD requests to extract Jellyfin credentials and start reporting
  playerManager.setMessageInterceptor(
    cast.framework.messages.MessageType.LOAD,
    (loadRequestData) => {
      const customData = loadRequestData.media
        ?.customData as ReceiverCustomData | undefined;

      if (
        customData?.serverUrl &&
        customData?.accessToken &&
        customData?.userId
      ) {
        console.log(
          "[Receiver] Jellyfin credentials received, initializing API"
        );
        initializeApi({
          serverUrl: customData.serverUrl,
          accessToken: customData.accessToken,
          userId: customData.userId,
          deviceId: customData.deviceId,
          deviceName: customData.deviceName || "Streamyfin Cast Receiver",
        });

        if (customData.Id) {
          startReporting(customData.Id, playerManager);
        }
      } else {
        console.warn(
          "[Receiver] No Jellyfin credentials in customData — playback reporting disabled"
        );
      }

      return loadRequestData;
    }
  );

  // Track volume changes for inclusion in playback reports
  playerManager.setMessageInterceptor(
    cast.framework.messages.MessageType.SET_VOLUME,
    (volumeRequestData) => {
      const vol = volumeRequestData.volume;
      if (vol) {
        updateVolume(vol.level ?? 1, vol.muted ?? false);
      }
      return volumeRequestData;
    }
  );

  // Stop reporting when media finishes
  playerManager.addEventListener(
    cast.framework.events.EventType.MEDIA_FINISHED,
    () => {
      console.log("[Receiver] Media finished");
      stopReporting(playerManager);
    }
  );

  // Stop reporting on explicit stop request
  playerManager.addEventListener(
    cast.framework.events.EventType.REQUEST_STOP,
    () => {
      console.log("[Receiver] Stop requested");
      stopReporting(playerManager);
    }
  );

  // Clean up when the cast session ends
  context.addEventListener(cast.framework.system.EventType.SHUTDOWN, () => {
    console.log("[Receiver] Session shutting down");
    stopReporting(playerManager);
    clearApi();
  });

  const options = new cast.framework.CastReceiverOptions();
  options.disableIdleTimeout = true;

  context.start(options);
  console.log("[Receiver] Streamyfin Cast Receiver started");
}
