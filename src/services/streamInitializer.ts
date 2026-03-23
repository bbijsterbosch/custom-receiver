import { getMediaInfoApi } from "@jellyfin/sdk/lib/utils/api";
import { getDeviceProfile } from "../deviceProfiles";
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
  const raw = new URLSearchParams(relativeUrl.slice(q + 1)).get("TranscodeReasons");
  return raw ? raw.split(",") : [];
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
    const res = await getMediaInfoApi(api).getPlaybackInfo(
      { itemId: customData.Id },
      {
        method: "POST",
        data: {
          userId: creds.userId,
          deviceProfile: getDeviceProfile(customData.enableH265 ?? false),
          audioStreamIndex: customData.audioStreamIndex,
          subtitleStreamIndex: customData.subtitleStreamIndex,
          startTimeTicks: customData.startTimeTicks ?? 0,
          isPlayback: true,
          autoOpenLiveStream: true,
          maxStreamingBitrate: customData.maxStreamingBitrate,
          mediaSourceId: customData.mediaSourceId,
        },
      },
    );

    const sessionId = res.data.PlaySessionId ?? null;
    const mediaSource = res.data.MediaSources?.[0];
    const transcodingUrl = mediaSource?.TranscodingUrl ?? null;
    console.log(
      "[StreamInitializer] Media source — directPlay:",
      mediaSource?.SupportsDirectPlay,
    );
    let url: string;
    let playMethod: StreamInfo["playMethod"];

    const supportsDirectPlay = mediaSource?.SupportsDirectPlay ?? false;

    // Derive video/audio transcoding separately from the TranscodeReasons param
    // embedded in the transcoding URL — more reliable than SupportsDirectStream.
    const transcodeReasons = parseTranscodeReasons(transcodingUrl);
    const videoTranscoded = transcodeReasons.some((r) => VIDEO_TRANSCODE_REASONS.has(r));
    const audioTranscoded = transcodeReasons.some((r) => AUDIO_TRANSCODE_REASONS.has(r));

    if (supportsDirectPlay) {
      const params = new URLSearchParams({
        static: "true",
        mediaSourceId: mediaSource?.Id ?? customData.Id,
        api_key: api.accessToken,
      });
      if (sessionId) params.append("playSessionId", sessionId);
      url = `${api.basePath}/Videos/${customData.Id}/stream.${mediaSource?.Container ?? "mp4"}?${params}`;
      playMethod = "DirectPlay";
      console.log("[StreamInitializer] Direct play:", url.replace(/([?&]api_key=)[^&]+/, "$1***"));
    } else if (transcodingUrl) {
      url = `${api.basePath}${transcodingUrl}`;
      playMethod = videoTranscoded || audioTranscoded ? "Transcode" : "DirectStream";
      console.log(
        `[StreamInitializer] ${playMethod} — video: ${videoTranscoded ? "transcode" : "copy"}, audio: ${audioTranscoded ? "transcode" : "copy"}, reasons: ${transcodeReasons.join(", ") || "none"}`,
      );
    } else {
      // No transcoding URL — build a direct stream URL manually
      url = `${api.basePath}/Videos/${customData.Id}/stream?${new URLSearchParams({
        static: "true",
        mediaSourceId: mediaSource?.Id ?? customData.Id,
        api_key: api.accessToken,
      })}`;
      playMethod = "DirectStream";
      console.log("[StreamInitializer] Direct stream (manual):", url.replace(/([?&]api_key=)[^&]+/, "$1***"));
    }

    const contentType = url.includes(".m3u8")
      ? "application/x-mpegURL"
      : "video/mp4";

    return {
      url,
      contentType,
      sessionId,
      mediaSourceId: mediaSource?.Id ?? null,
      transcodingUrl,
      playMethod,
      videoTranscoded,
      audioTranscoded,
    };
  } catch (error) {
    console.error("[StreamInitializer] getPlaybackInfo failed:", error);
    return null;
  }
}
