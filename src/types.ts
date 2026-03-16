/**
 * Sent from the sender to the receiver via the custom channel
 * (urn:x-cast:streamyfin) as soon as the Cast session connects.
 * Kept out of media customData so credentials never appear in media metadata.
 */
export interface JellyfinCredentials {
  serverUrl: string;
  accessToken: string;
  userId: string;
}

/**
 * Sent in customData of each LOAD request.
 * Contains only item metadata — no credentials.
 */
export interface ReceiverCustomData {
  Id: string;
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
