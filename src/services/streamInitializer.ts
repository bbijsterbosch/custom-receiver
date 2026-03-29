import { getMediaInfoApi } from "@jellyfin/sdk/lib/utils/api";
import { getDeviceProfile, getMaxFramerate } from "../deviceProfiles";
import type { ReceiverCustomData } from "../types";
import { getApi, getCredentials } from "./jellyfinApi";

// Parsed from the TranscodeReasons query parameter Jellyfin embeds in the transcoding URL.
const VIDEO_TRANSCODE_REASONS = new Set([
  "VideoCodecNotSupported",
  "VideoProfileNotSupported",
  "VideoLevelNotSupported",
  "VideoResolutionNotSupported",
  "VideoBitDepthNotSupported",
  "VideoFramerateNotSupported",
  "RefFramesNotSupported",
  "AnamorphicVideoNotSupported",
  "InterlacedVideoNotSupported",
  "VideoBitrateNotSupported",
  "UnknownVideoStreamInfo",
  "VideoRangeTypeNotSupported",
  "VideoCodecTagNotSupported",
]);

const AUDIO_TRANSCODE_REASONS = new Set([
  "AudioCodecNotSupported",
  "AudioChannelsNotSupported",
  "AudioProfileNotSupported",
  "AudioSampleRateNotSupported",
  "AudioBitDepthNotSupported",
  "AudioBitrateNotSupported",
  "UnknownAudioStreamInfo",
]);

function parseTranscodeReasons(relativeUrl: string | null): string[] {
  if (!relativeUrl) return [];
  const q = relativeUrl.indexOf("?");
  if (q === -1) return [];
  const raw = new URLSearchParams(relativeUrl.slice(q + 1)).get(
    "TranscodeReasons",
  );
  return raw ? raw.split(",") : [];
}

export interface SubtitleTrackInfo {
  url: string;
  language: string | null;
  name: string | null;
  index: number;
}

export interface StreamInfo {
  url: string;
  contentType: string;
  sessionId: string | null;
  mediaSourceId: string | null;
  transcodingUrl: string | null;
  playMethod: "Transcode" | "DirectPlay" | "DirectStream";
  videoTranscoded: boolean;
  audioTranscoded: boolean;
  subtitleTrack: SubtitleTrackInfo | null;
}

export async function initializeStream(
  customData: ReceiverCustomData,
): Promise<StreamInfo | null> {
  const api = getApi();
  const creds = getCredentials();

  if (!api || !creds?.userId) {
    console.error("[StreamInitializer] API or credentials not ready");
    return null;
  }

  try {
    const allowAudioCopy = customData.audioStreamIndex === undefined;
    console.log("[StreamInitializer] Requesting playback info:", {
      itemId: customData.Id,
      audioStreamIndex: customData.audioStreamIndex,
      subtitleStreamIndex: customData.subtitleStreamIndex,
      allowAudioStreamCopy: allowAudioCopy,
    });

    const res = await getMediaInfoApi(api).getPostedPlaybackInfo({
      itemId: customData.Id,
      playbackInfoDto: {
        UserId: creds.userId,
        DeviceProfile: getDeviceProfile(),
        AudioStreamIndex: customData.audioStreamIndex,
        SubtitleStreamIndex: customData.subtitleStreamIndex,
        MaxStreamingBitrate: customData.maxStreamingBitrate,
        StartTimeTicks: customData.startTimeTicks ?? 0,
        MediaSourceId: customData.mediaSourceId ?? undefined,
        AutoOpenLiveStream: true,
        AllowAudioStreamCopy: allowAudioCopy,
      },
    });

    const sessionId = res.data.PlaySessionId ?? null;
    const mediaSource = res.data.MediaSources?.[0];
    const transcodingUrl = mediaSource?.TranscodingUrl ?? null;

    // Parse key params from the transcoding URL for debugging.
    const urlDebugParams = (() => {
      if (!transcodingUrl) return null;
      const q = transcodingUrl.indexOf("?");
      if (q === -1) return null;
      const p = new URLSearchParams(transcodingUrl.slice(q + 1));
      return {
        AudioStreamIndex: p.get("AudioStreamIndex"),
        AudioCodec: p.get("AudioCodec"),
        VideoCodec: p.get("VideoCodec"),
      };
    })();

    console.log("[StreamInitializer] getPlaybackInfo result:", {
      directPlay: mediaSource?.SupportsDirectPlay,
      directStream: mediaSource?.SupportsDirectStream,
      transcoding: mediaSource?.SupportsTranscoding,
      transcodingUrl: transcodingUrl
        ? transcodingUrl.replace(/([?&]api_key=)[^&]+/, "$1***")
        : null,
      container: mediaSource?.Container,
      ...urlDebugParams,
    });
    let url: string;
    let playMethod: StreamInfo["playMethod"];

    // Check framerate against the device's actual capability.
    // Jellyfin's CodecProfile conditions aren't always respected, so we enforce
    // the limit here using the real framerate from the stream metadata.
    const videoStream = mediaSource?.MediaStreams?.find((s) => s.Type === "Video");
    const frameRate = videoStream?.RealFrameRate ?? videoStream?.AverageFrameRate ?? 0;
    const frameRateOk = frameRate === 0 || frameRate <= getMaxFramerate();
    const supportsDirectPlay = (mediaSource?.SupportsDirectPlay ?? false) && frameRateOk;

    if (!frameRateOk) {
      console.log(
        `[StreamInitializer] Framerate ${frameRate}fps exceeds device limit (${getMaxFramerate()}fps) — forcing transcode`,
      );
    }

    // Derive video/audio transcoding separately from the TranscodeReasons param
    // embedded in the transcoding URL — more reliable than SupportsDirectStream.
    const transcodeReasons = parseTranscodeReasons(transcodingUrl);
    const videoTranscoded = transcodeReasons.some((r) =>
      VIDEO_TRANSCODE_REASONS.has(r),
    );
    const audioTranscoded = transcodeReasons.some((r) =>
      AUDIO_TRANSCODE_REASONS.has(r),
    );

    if (supportsDirectPlay) {
      const params = new URLSearchParams({
        static: "true",
        mediaSourceId: mediaSource?.Id ?? customData.Id,
        api_key: api.accessToken,
      });
      if (sessionId) params.append("playSessionId", sessionId);
      url = `${api.basePath}/Videos/${customData.Id}/stream.${mediaSource?.Container ?? "mp4"}?${params}`;
      playMethod = "DirectPlay";
      console.log(
        "[StreamInitializer] Direct play:",
        url.replace(/([?&]api_key=)[^&]+/, "$1***"),
      );
    } else if (transcodingUrl) {
      url = `${api.basePath}${transcodingUrl}`;
      // Audio-only transcode is still DirectStream — video is copied as-is.
      playMethod = videoTranscoded ? "Transcode" : "DirectStream";
      console.log(
        `[StreamInitializer] ${playMethod} — video: ${videoTranscoded ? "transcode" : "copy"}, audio: ${audioTranscoded ? "transcode" : "copy"}, reasons: ${transcodeReasons.join(", ") || "none"}`,
      );
    } else {
      // No transcoding URL — build a direct stream URL manually
      url = `${api.basePath}/Videos/${customData.Id}/stream?${new URLSearchParams(
        {
          static: "true",
          mediaSourceId: mediaSource?.Id ?? customData.Id,
          api_key: api.accessToken,
        },
      )}`;
      playMethod = "DirectStream";
      console.log(
        "[StreamInitializer] Direct stream (manual):",
        url.replace(/([?&]api_key=)[^&]+/, "$1***"),
      );
    }

    const container = mediaSource?.Container?.toLowerCase();
    const contentType = url.includes(".m3u8")
      ? "application/x-mpegURL"
      : container === "webm" ? "video/webm"
      : container === "ts" ? "video/mp2t"
      : "video/mp4";

    console.log("[StreamInitializer] Sending to Cast player:", {
      contentType,
      playMethod,
      url: url.replace(/([?&]api_key=)[^&]+/, "$1***"),
    });

    // Build external subtitle track if one was requested.
    // Jellyfin serves SubRip/text subtitles as VTT via a dedicated endpoint.
    let subtitleTrack: SubtitleTrackInfo | null = null;
    if (customData.subtitleStreamIndex !== undefined && mediaSource?.Id) {
      const subtitleStream = mediaSource.MediaStreams?.find(
        (s) => s.Index === customData.subtitleStreamIndex,
      );
      if (subtitleStream) {
        const vttUrl =
          `${api.basePath}/Videos/${customData.Id}/${mediaSource.Id}` +
          `/Subtitles/${customData.subtitleStreamIndex}/0/Stream.vtt` +
          `?api_key=${api.accessToken}`;
        subtitleTrack = {
          url: vttUrl,
          language: subtitleStream.Language ?? null,
          name: subtitleStream.DisplayTitle ?? subtitleStream.Language ?? null,
          index: customData.subtitleStreamIndex,
        };
        console.log("[StreamInitializer] External subtitle:", subtitleStream.DisplayTitle, vttUrl.replace(/([?&]api_key=)[^&]+/, "$1***"));
      }
    }

    return {
      url,
      contentType,
      sessionId,
      mediaSourceId: mediaSource?.Id ?? null,
      transcodingUrl,
      playMethod,
      videoTranscoded,
      audioTranscoded,
      subtitleTrack,
    };
  } catch (error) {
    console.error("[StreamInitializer] getPlaybackInfo failed:", error);
    return null;
  }
}
