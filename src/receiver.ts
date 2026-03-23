import {
  hideIdleScreen,
  loadBackdrops,
  showIdleScreen,
  stopCycling,
  startCycling,
} from "./idleScreen";
import { clearApi, getCredentials, initializeApi } from "./services/jellyfinApi";
import {
  beginReporting,
  prepareReporting,
  stopReporting,
  updateVolume,
} from "./services/playbackReporter";
import { initializeStream } from "./services/streamInitializer";
import type { JellyfinCredentials, ReceiverCustomData } from "./types";

const CREDENTIALS_NAMESPACE = "urn:x-cast:streamyfin";
const CREDENTIALS_TIMEOUT_MS = 10_000;

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
          try {
            new URL(creds.serverUrl);
          } catch {
            console.warn("[Receiver] Invalid serverUrl in credentials — ignoring");
            return;
          }

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
        try {
          await Promise.race([
            credentialsPromise,
            new Promise<never>((_, reject) =>
              setTimeout(
                () => reject(new Error("Timed out waiting for credentials")),
                CREDENTIALS_TIMEOUT_MS,
              ),
            ),
          ]);
        } catch (err) {
          console.error("[Receiver] Stream init aborted:", err);
          return loadRequestData;
        }
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

      // Set poster image so the CAF player shows it while buffering.
      const creds = getCredentials();
      const posterTag = customData.ImageTags?.Primary;
      if (creds && posterTag) {
        const posterUrl = `${creds.serverUrl}/Items/${customData.Id}/Images/Primary?maxWidth=400&quality=90&tag=${posterTag}`;
        loadRequestData.media.metadata = {
          metadataType: 0, // MetadataType.GENERIC
          title: customData.Name ?? "",
          images: [{ url: posterUrl }],
        };
      }

      // Store session info now, but delay the actual report until PLAYING fires.
      prepareReporting(customData.Id, playerManager, {
        sessionId: stream.sessionId,
        mediaSourceId: stream.mediaSourceId,
        playMethod: stream.playMethod,
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
    cast.framework.events.EventType.PLAYING,
    () => {
      beginReporting(playerManager);
    },
  );

  // When playback stops, stop reporting and show the idle screen.
  playerManager.addEventListener(
    cast.framework.events.EventType.MEDIA_FINISHED,
    (event: { endedReason?: string }) => {
      // "INTERRUPTED" means a new LOAD replaced this media (e.g. quality change).
      // The LOAD interceptor already called prepareReporting — don't wipe that state.
      if (event.endedReason === "INTERRUPTED") return;

      console.log("[Receiver] Media finished:", event.endedReason);
      stopReporting(playerManager);
      startCycling();
      showIdleScreen();
      if (!postersLoaded) loadBackdrops();
    },
  );

  // Not sure if this is needed.
  playerManager.addEventListener(
    cast.framework.events.EventType.REQUEST_STOP,
    () => {
      stopReporting(playerManager);
      console.log("[Receiver] Stop requested");
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
        postersLoaded = false;
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
