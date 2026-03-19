import {
  hideIdleScreen,
  loadBackdrops,
  showIdleScreen,
  stopCycling,
} from "./idleScreen";
import { clearApi, initializeApi } from "./services/jellyfinApi";
import {
  startReporting,
  stopReporting,
  updateVolume,
} from "./services/playbackReporter";
import { initializeStream } from "./services/streamInitializer";
import type { JellyfinCredentials, ReceiverCustomData } from "./types";

const CREDENTIALS_NAMESPACE = "urn:x-cast:streamyfin";

let postersLoaded = false;

// Resolved once credentials have been received so the LOAD interceptor can
// wait for them rather than racing against the custom-channel message.
let credentialsReady = false;
let resolveCredentials!: () => void;
let credentialsPromise = new Promise<void>((resolve) => {
  resolveCredentials = resolve;
});

export function initializeReceiver(): void {
  const context = cast.framework.CastReceiverContext.getInstance();
  const playerManager = context.getPlayerManager();

  // ── Credentials ────────────────────────────────────────────────────────────
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

          if (!credentialsReady) {
            credentialsReady = true;
            resolveCredentials();
          }

          if (!postersLoaded) {
            loadBackdrops();
            postersLoaded = true;
          }
        } else {
          console.warn(
            "[Receiver] Credentials message missing required fields",
            Object.keys(creds ?? {}),
          );
        }
      } catch (err) {
        console.error("[Receiver] Failed to parse credentials message:", err);
      }
    },
  );

  // LOAD interceptor
  // The receiver calls getPlaybackInfo itself so that stream init and reporting
  // all happen under the same Jellyfin API identity — no session mismatch.
  // (Sending URL from streamyfin and reporting from receiver
  // caused inaccurate source/stream/transcoding reporting)
  playerManager.setMessageInterceptor(
    cast.framework.messages.MessageType.LOAD,
    async (loadRequestData) => {
      const customData = loadRequestData.media?.customData as
        | ReceiverCustomData
        | undefined;

      if (!customData?.Id) {
        console.warn(
          "[Receiver] No item ID in customData — skipping stream init",
        );
        return loadRequestData;
      }

      // Wait for credentials if they haven't arrived yet.
      if (!credentialsReady) {
        console.log("[Receiver] Waiting for credentials before stream init...");
        await credentialsPromise;
      }

      // Ask Jellyfin for the stream URL using the receiver's own API.
      const stream = await initializeStream(customData);

      if (!stream) {
        console.error("[Receiver] Stream initialization failed");
        return loadRequestData;
      }

      // Patch the media info with the resolved stream URL and content type.
      loadRequestData.media.contentUrl = stream.url;
      loadRequestData.media.contentType = stream.contentType;

      // Start reporting now that we have accurate session info.
      startReporting(customData.Id, playerManager, {
        sessionId: stream.sessionId,
        mediaSourceId: stream.mediaSourceId,
        playMethod: stream.transcodingUrl ? "Transcode" : "DirectStream",
        audioStreamIndex: customData.audioStreamIndex,
        subtitleStreamIndex: customData.subtitleStreamIndex,
      });

      hideIdleScreen();
      stopCycling();

      return loadRequestData;
    },
  );

  // Volume
  playerManager.setMessageInterceptor(
    cast.framework.messages.MessageType.SET_VOLUME,
    (volumeRequestData) => {
      const vol = volumeRequestData.volume;
      if (vol) {
        updateVolume(vol.level ?? 1, vol.muted ?? false);
      }
      return volumeRequestData;
    },
  );

  // Playback events
  playerManager.addEventListener(
    cast.framework.events.EventType.MEDIA_FINISHED,
    () => {
      console.log("[Receiver] Media finished");
      stopReporting(playerManager);
      showIdleScreen();
      if (!postersLoaded) loadBackdrops();
    },
  );

  playerManager.addEventListener(
    cast.framework.events.EventType.REQUEST_STOP,
    () => {
      console.log("[Receiver] Stop requested");
      stopReporting(playerManager);
      showIdleScreen();
      if (postersLoaded) loadBackdrops();
    },
  );

  playerManager.addEventListener(
    cast.framework.events.EventType.PLAYER_LOADING,
    () => {
      hideIdleScreen();
      stopCycling();
    },
  );

  // Session
  context.addEventListener(
    cast.framework.system.EventType.SENDER_DISCONNECTED,
    () => {
      const senderCount = context.getSenders().length;
      const playerState = playerManager.getPlayerState();
      const isPlaying =
        playerState !== cast.framework.messages.PlayerState.IDLE;

      console.log(
        `[Receiver] Sender disconnected — remaining senders: ${senderCount}, player: ${playerState}`,
      );

      if (isPlaying) {
        // Media is still playing — keep the API and reporting alive.
        // The Chromecast should continue playing regardless of whether
        // the sender app is open.
        console.log("[Receiver] Media still playing — keeping session alive");
        return;
      }

      // Nothing is playing and no senders remain — full reset.
      if (senderCount === 0) {
        stopReporting(playerManager);
        clearApi();
        credentialsReady = false;
        credentialsPromise = new Promise<void>((resolve) => {
          resolveCredentials = resolve;
        });
        showIdleScreen();
      }
    },
  );

  context.addEventListener(cast.framework.system.EventType.SHUTDOWN, () => {
    console.log("[Receiver] Session shutting down");
    stopReporting(playerManager);
    stopCycling();
    clearApi();
  });

  const options = new cast.framework.CastReceiverOptions();
  options.disableIdleTimeout = false;

  context.start(options);
  console.log("[Receiver] Streamyfin Cast Receiver started");
}
