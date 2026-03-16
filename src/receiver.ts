import { initializeApi, clearApi } from "./services/jellyfinApi";
import {
  startReporting,
  stopReporting,
  updateVolume,
} from "./services/playbackReporter";
import {
  hideIdleScreen,
  showIdleScreen,
  loadBackdrops,
  stopCycling,
} from "./idleScreen";
import type { ReceiverCustomData } from "./types";

let postersLoaded = false;

export function initializeReceiver(): void {
  const context = cast.framework.CastReceiverContext.getInstance();
  const playerManager = context.getPlayerManager();

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

        if (!postersLoaded) {
          postersLoaded = true;
          loadBackdrops();
        }

        if (customData.Id) {
          startReporting(customData.Id, playerManager);
        }
      } else {
        console.warn(
          "[Receiver] No Jellyfin credentials in customData — playback reporting disabled"
        );
      }

      hideIdleScreen();
      stopCycling();

      return loadRequestData;
    }
  );

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

  playerManager.addEventListener(
    cast.framework.events.EventType.MEDIA_FINISHED,
    () => {
      console.log("[Receiver] Media finished");
      stopReporting(playerManager);
      showIdleScreen();
      if (postersLoaded) loadBackdrops();
    }
  );

  playerManager.addEventListener(
    cast.framework.events.EventType.REQUEST_STOP,
    () => {
      console.log("[Receiver] Stop requested");
      stopReporting(playerManager);
      showIdleScreen();
      if (postersLoaded) loadBackdrops();
    }
  );

  playerManager.addEventListener(
    cast.framework.events.EventType.PLAYER_LOADING,
    () => {
      hideIdleScreen();
      stopCycling();
    }
  );

  context.addEventListener(cast.framework.system.EventType.SHUTDOWN, () => {
    console.log("[Receiver] Session shutting down");
    stopReporting(playerManager);
    stopCycling();
    clearApi();
  });

  const options = new cast.framework.CastReceiverOptions();
  options.disableIdleTimeout = true;

  context.start(options);
  console.log("[Receiver] Streamyfin Cast Receiver started");
}
