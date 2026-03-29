import {
  hideIdleScreen,
  loadBackdrops,
  showIdleScreen,
  startCycling,
  stopCycling,
} from "./idleScreen";
import {
  clearApi,
  getCredentials,
  initializeApi,
} from "./services/jellyfinApi";
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
// Tracks the current item and last known playback position so quality/audio/subtitle
// changes can resume at the correct position. getCurrentTimeSec() returns 0 in the
// LOAD interceptor because the player has already transitioned by then.
let currentItemId: ReceiverCustomData["Id"] | null = null;
let lastKnownTimeSec = 0;

// Resolved once credentials have been received so the LOAD interceptor can
// wait for them rather than racing against the custom-channel message.
let credentialsReady = false;
let resolveCredentials!: () => void;
let credentialsPromise = new Promise<void>((resolve) => {
  resolveCredentials = resolve;
});


export function initializeReceiver(): void {
  // Subtitle style: white text with black outline, no background.
  const textTrackStyle = new cast.framework.messages.TextTrackStyle();
  textTrackStyle.foregroundColor = '#FFFFFFFF';
  textTrackStyle.backgroundColor = '#00000000';
  textTrackStyle.windowColor = '#00000000';
  textTrackStyle.windowType = cast.framework.messages.TextTrackWindowType.NONE;
  textTrackStyle.edgeType = cast.framework.messages.TextTrackEdgeType.OUTLINE;
  textTrackStyle.edgeColor = '#000000FF';
  textTrackStyle.fontScale = 1.0;

  // Init Receiver
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
            console.warn(
              "[Receiver] Invalid serverUrl in credentials — ignoring",
            );
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
      console.log("[Receiver] LOAD customData:", JSON.stringify({
        Id: customData.Id,
        audioStreamIndex: customData.audioStreamIndex,
        subtitleStreamIndex: customData.subtitleStreamIndex,
        maxStreamingBitrate: customData.maxStreamingBitrate,
      }));
      if (customData.Id === currentItemId) {
        loadRequestData.currentTime = lastKnownTimeSec;
        console.log("[Receiver] Settings change — resuming at:", lastKnownTimeSec);
      } else {
        lastKnownTimeSec = 0;
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

      // For quality / audio / subtitle changes on the same item, the sender's
      // startTimeTicks may be stale (original load position). Use the player's
      // current position instead — it's already movie-relative for all stream types.
    

      // Ask Jellyfin for the stream URL using the receiver's own API.
      currentItemId = customData.Id
      const stream = await initializeStream(customData);

      if (!stream) {
        console.error("[Receiver] Stream initialization failed");
        return loadRequestData;
      }

      // Patch the media info with the resolved stream URL and content type.
      loadRequestData.media.contentUrl = stream.url;
      loadRequestData.media.contentType = stream.contentType;

      // Attach external subtitle track if Jellyfin provided one.
      if (stream.subtitleTrack) {
        // Fetch the VTT and strip any embedded STYLE blocks so the Cast SDK's
        // TextTrackStyle (set via playerManager.setTextTrackStyle) takes over.
        let trackUrl = stream.subtitleTrack.url;
        try {
          const vttResponse = await fetch(stream.subtitleTrack.url);
          const vttText = await vttResponse.text();
          const stripped = vttText
            .split(/\n\n+/)
            .filter((block) => !block.trimStart().startsWith("STYLE"))
            .join("\n\n");
          trackUrl = URL.createObjectURL(
            new Blob([stripped], { type: "text/vtt" }),
          );
        } catch (err) {
          console.warn("[Receiver] Failed to strip VTT styles, using raw URL:", err);
        }

        const track = new cast.framework.messages.Track(
          1,
          cast.framework.messages.TrackType.TEXT,
        );
        track.trackContentId = trackUrl;
        track.trackContentType = "text/vtt";
        track.subtype = cast.framework.messages.TextTrackType.SUBTITLES;
        track.name = stream.subtitleTrack.name ?? "Subtitle";
        track.language = stream.subtitleTrack.language ?? "und";
        loadRequestData.media.tracks = [track];
        loadRequestData.media.textTrackStyle = textTrackStyle;
        loadRequestData.activeTrackIds = [1];
        console.log("[Receiver] Subtitle track attached:", track.name);
      } else {
        loadRequestData.media.tracks = [];
        loadRequestData.activeTrackIds = [];
      }

      // Set the player start position.
      console.log(loadRequestData.currentTime)

      // Set poster image so the CAF player shows it while buffering.
      const creds = getCredentials();
      if (creds) {
        const posterUrl = `${creds.serverUrl}/Items/${customData.SeasonId ?? customData.Id}/Images/Primary?maxWidth=400&quality=90`;
        loadRequestData.media.metadata = {
          ...((loadRequestData.media.metadata as object) ?? {}),
          images: [{ url: posterUrl }],
        };
      }

      // Store session info now, but delay the actual report until PLAYING fires.
      prepareReporting(customData.Id, playerManager, {
        sessionId: stream.sessionId,
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

  playerManager.addEventListener(
    cast.framework.events.EventType.TIME_UPDATE,
    () => {
      lastKnownTimeSec = playerManager.getCurrentTimeSec() ?? 0;
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
  options.useShakaForHls = true
  context.start(options);
  console.log("[Receiver] Streamyfin Cast Receiver started");
}
