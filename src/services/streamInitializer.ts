import { getMediaInfoApi } from "@jellyfin/sdk/lib/utils/api";
import { getDeviceProfile } from "../deviceProfiles";
import type { ReceiverCustomData } from "../types";
import { getApi, getCredentials } from "./jellyfinApi";

export interface StreamInfo {
  url: string;
  contentType: string;
  sessionId: string | null;
  mediaSourceId: string | null;
  transcodingUrl: string | null;
}

/**
 * Calls Jellyfin's getPlaybackInfo using the receiver's own API credentials,
 * resolves the stream URL, and returns everything needed for playback reporting.
 * This keeps the full playback lifecycle on the receiver side.
 */
export async function initializeStream(
  customData: ReceiverCustomData
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
      }
    );

    const sessionId = res.data.PlaySessionId ?? null;
    const mediaSource = res.data.MediaSources?.[0];
    const transcodingUrl = mediaSource?.TranscodingUrl ?? null;

    let url: string;
    let contentType: string;

    if (transcodingUrl) {
      url = `${api.basePath}${transcodingUrl}`;
      contentType = "application/x-mpegurl";
      console.log("[StreamInitializer] Transcoded stream:", url);
    } else {
      const params = new URLSearchParams({
        static: "true",
        mediaSourceId: mediaSource?.Id ?? customData.Id,
        api_key: api.accessToken,
      });
      if (sessionId) params.append("playSessionId", sessionId);
      url = `${api.basePath}/Videos/${customData.Id}/stream.mp4?${params}`;
      contentType = "video/mp4";
      console.log("[StreamInitializer] Direct stream:", url);
    }

    return {
      url,
      contentType,
      sessionId,
      mediaSourceId: mediaSource?.Id ?? null,
      transcodingUrl,
    };
  } catch (error) {
    console.error("[StreamInitializer] getPlaybackInfo failed:", error);
    return null;
  }
}
