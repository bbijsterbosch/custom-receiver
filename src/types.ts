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
  /** Play method determined by the sender from mediaSource.TranscodingUrl. */
  playMethod?: "Transcode" | "DirectStream" | "DirectPlay";
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
