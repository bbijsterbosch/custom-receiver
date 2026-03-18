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
 *
 * The receiver uses this to call getPlaybackInfo itself and obtain the stream
 * URL — keeping the full playback lifecycle (stream init → play → report) on
 * the receiver side with a single, consistent Jellyfin API identity.
 */
export interface ReceiverCustomData {
  /** Jellyfin item ID. */
  Id: string;

  // ── Playback settings ──────────────────────────────────────────────────────
  startTimeTicks?: number;
  audioStreamIndex?: number;
  subtitleStreamIndex?: number;
  maxStreamingBitrate?: number;
  mediaSourceId?: string;
  /** Use H265/HEVC device profile when true. */
  enableH265?: boolean;

  // ── Display metadata (for sender UI via mediaStatus.mediaInfo.customData) ──
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
