/**
 * Sent from the sender via the custom channel (urn:x-cast:streamyfin)
 * as soon as the Cast session connects — before any media is loaded.
 */
export interface JellyfinCredentials {
  serverUrl: string;
  accessToken: string;
  userId: string;
}

/**
 * Sent in customData of each LOAD request.
 * Contains only item metadata — credentials come via the custom channel.
 */
export interface ReceiverCustomData {
  Id: string;
  /**
   * mediaSource.TranscodingUrl from the sender.
   * If present the stream is transcoded; PlaySessionId and MediaSourceId
   * are extracted from its query params.
   * Absent for direct-stream / direct-play.
   */
  transcodingUrl?: string | null;
  /** PlaySessionId for direct-stream/direct-play sessions (no transcodingUrl). */
  sessionId?: string | null;
  /** MediaSourceId for direct-stream/direct-play sessions. */
  mediaSourceId?: string | null;
  /** Selected audio stream index. */
  audioStreamIndex?: number;
  /** Selected subtitle stream index. */
  subtitleStreamIndex?: number;
  Name?: string;
  Type?: string;
  SeriesName?: string;
  SeriesId?: string;
  SeasonId?: string;
  IndexNumber?: number;
  ParentIndexNumber?: number;
  RunTimeTicks?: number;
  Overview?: string;
  ImageTags?: Record<string, string>;
  MediaStreams?: unknown[];
  MediaSources?: Array<{
    Id?: string;
    Bitrate?: number;
    Container?: string;
    Name?: string;
  }>;
  UserData?: {
    PlaybackPositionTicks?: number;
  };
}
