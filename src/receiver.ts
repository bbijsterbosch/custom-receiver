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
import type { JellyfinCredentials, ReceiverCustomData } from "./types";

const CREDENTIALS_NAMESPACE = "urn:x-cast:streamyfin";

let postersLoaded = false;

export function initializeReceiver(): void {
  const context = cast.framework.CastReceiverContext.getInstance();
  const playerManager = context.getPlayerManager();

  // Receive Jellyfin credentials via custom channel as soon as the sender
  // connects — before any media is loaded.
  context.addCustomMessageListener(
    CREDENTIALS_NAMESPACE,
    (event: { data: unknown }) => {
      try {
        const raw = event.data;
        const creds: JellyfinCredentials =
          typeof raw === "string"
            ? JSON.parse(raw)
            : (raw as JellyfinCredentials);

        if (creds?.serverUrl && creds?.accessToken && creds?.userId) {
          console.log("[Receiver] Credentials received via channel");
          initializeApi(creds);

          if (!postersLoaded) {
            postersLoaded = true;
            loadBackdrops();
          }
        } else {
          console.warn(
            "[Receiver] Credentials message missing required fields",
            Object.keys(creds ?? {})
          );
        }
      } catch (err) {
        console.error("[Receiver] Failed to parse credentials message:", err);
      }
    }
  );

  playerManager.setMessageInterceptor(
    cast.framework.messages.MessageType.LOAD,
    (loadRequestData) => {
      const customData = loadRequestData.media
        ?.customData as ReceiverCustomData | undefined;

      if (customData?.Id) {
        startReporting(customData.Id, playerManager, {
          playMethod: customData.playMethod,
          sessionId: customData.sessionId,
          mediaSourceId: customData.mediaSourceId,
          audioStreamIndex: customData.audioStreamIndex,
          subtitleStreamIndex: customData.subtitleStreamIndex,
        });
      } else {
        console.warn("[Receiver] No item ID in customData — reporting disabled");
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

  context.addEventListener(
    cast.framework.system.EventType.SENDER_DISCONNECTED,
    () => {
      console.log("[Receiver] Sender disconnected — clearing credentials");
      stopReporting(playerManager);
      stopCycling();
      clearApi();
      postersLoaded = false;
      showIdleScreen();
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
