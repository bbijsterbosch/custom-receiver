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
  playMethod: "Transcode" | "DirectPlay" | "DirectStream";
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
      "[StreamInitializer] Media source:",
      mediaSource?.SupportsDirectPlay,
      mediaSource?.SupportsDirectStream,
    );
    let url: string;
    let playMethod: StreamInfo["playMethod"];

    const supportsDirectPlay = mediaSource?.SupportsDirectPlay ?? false;
    const supportsDirectStream = mediaSource?.SupportsDirectStream ?? false;
    const isActualTranscode = !supportsDirectPlay && !supportsDirectStream;

    // This logic is not correct yet but it works for now. 
    // (supportsDirectstream is always false even when it should be true)
    if (transcodingUrl && isActualTranscode) {
      url = `${api.basePath}${transcodingUrl}`;
      playMethod = "Transcode";
      console.log("[StreamInitializer] Transcoded stream:", url);
    } else if (supportsDirectPlay) {
      const params = new URLSearchParams({
        static: "true",
        mediaSourceId: mediaSource?.Id ?? customData.Id,
        api_key: api.accessToken,
      });
      if (sessionId) params.append("playSessionId", sessionId);
      url = `${api.basePath}/Videos/${customData.Id}/stream.${mediaSource?.Container ?? "mp4"}?${params}`;
      playMethod = "DirectPlay";
      console.log("[StreamInitializer] Direct play:", url);
    } else {
      // DirectStream — use the transcodingUrl if available (remux), else build manually
      url = transcodingUrl
        ? `${api.basePath}${transcodingUrl}`
        : `${api.basePath}/Videos/${customData.Id}/stream?${new URLSearchParams(
            {
              static: "true",
              mediaSourceId: mediaSource?.Id ?? customData.Id,
              api_key: api.accessToken,
            },
          )}`;
      playMethod = "DirectStream";
      console.log("[StreamInitializer] Direct stream:", url);
    }

    return {
      url,
      contentType: "video/mp4",
      sessionId,
      mediaSourceId: mediaSource?.Id ?? null,
      transcodingUrl,
      playMethod,
    };
  } catch (error) {
    console.error("[StreamInitializer] getPlaybackInfo failed:", error);
    return null;
  }
}
