export interface JellyfinCredentials {
  serverUrl: string;
  accessToken: string;
  userId: string;
  deviceId: string;
  deviceName: string;
}

export interface ReceiverCustomData extends JellyfinCredentials {
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
