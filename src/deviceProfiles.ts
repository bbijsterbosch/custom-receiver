/**
 * Jellyfin device profiles for the Chromecast receiver.
 * Copied from streamyfin/utils/profiles/chromecast(h265).ts so the receiver
 * can call getPlaybackInfo itself and get the correct stream URL.
 */

interface DeviceProfile {
  Name?: string;
  MaxStreamingBitrate?: number;
  MaxStaticBitrate?: number;
  MusicStreamingTranscodingBitrate?: number;
  CodecProfiles?: unknown[];
  ContainerProfiles?: unknown[];
  DirectPlayProfiles?: unknown[];
  TranscodingProfiles?: unknown[];
  SubtitleProfiles?: unknown[];
}

const chromecast: DeviceProfile = {
  Name: "Chromecast Video Profile",
  MaxStreamingBitrate: 16000000,
  MaxStaticBitrate: 16000000,
  MusicStreamingTranscodingBitrate: 384000,
  CodecProfiles: [
    { Type: "Video", Codec: "h264" },
    {
      Type: "Audio",
      Codec: "aac,mp3,flac,opus,vorbis",
      Conditions: [{ Condition: "LessThanEqual", Property: "AudioChannels", Value: "2" }],
    },
  ],
  ContainerProfiles: [],
  DirectPlayProfiles: [
    { Container: "mp4", Type: "Video", VideoCodec: "h264", AudioCodec: "aac,mp3,opus,vorbis" },
    { Container: "mp3", Type: "Audio" },
    { Container: "aac", Type: "Audio" },
    { Container: "flac", Type: "Audio" },
    { Container: "wav", Type: "Audio" },
  ],
  TranscodingProfiles: [
    {
      Container: "ts", Type: "Video", VideoCodec: "h264", AudioCodec: "aac,mp3",
      Protocol: "hls", Context: "Streaming", MaxAudioChannels: "2",
      MinSegments: 2, BreakOnNonKeyFrames: true,
    },
    {
      Container: "mp4", Type: "Video", VideoCodec: "h264", AudioCodec: "aac",
      Protocol: "http", Context: "Streaming", MaxAudioChannels: "2", MinSegments: 2,
    },
    { Container: "mp3", Type: "Audio", AudioCodec: "mp3", Protocol: "http", Context: "Streaming", MaxAudioChannels: "2" },
    { Container: "aac", Type: "Audio", AudioCodec: "aac", Protocol: "http", Context: "Streaming", MaxAudioChannels: "2" },
  ],
  SubtitleProfiles: [{ Format: "vtt", Method: "Encode" }],
};

const chromecastH265: DeviceProfile = {
  Name: "Chromecast Video Profile (H265)",
  MaxStreamingBitrate: 16000000,
  MaxStaticBitrate: 16000000,
  MusicStreamingTranscodingBitrate: 384000,
  CodecProfiles: [
    { Type: "Video", Codec: "hevc,h264" },
    {
      Type: "Audio",
      Codec: "aac,mp3,flac,opus,vorbis",
      Conditions: [{ Condition: "LessThanEqual", Property: "AudioChannels", Value: "2" }],
    },
  ],
  ContainerProfiles: [],
  DirectPlayProfiles: [
    { Container: "mp4,mkv", Type: "Video", VideoCodec: "hevc,h264", AudioCodec: "aac,mp3,opus,vorbis" },
    { Container: "mp3", Type: "Audio" },
    { Container: "aac", Type: "Audio" },
    { Container: "flac", Type: "Audio" },
    { Container: "wav", Type: "Audio" },
  ],
  TranscodingProfiles: [
    {
      Container: "ts", Type: "Video", VideoCodec: "hevc,h264", AudioCodec: "aac,mp3",
      Protocol: "hls", Context: "Streaming", MaxAudioChannels: "2",
      MinSegments: 2, BreakOnNonKeyFrames: true,
    },
    {
      Container: "mp4,mkv", Type: "Video", VideoCodec: "hevc,h264", AudioCodec: "aac",
      Protocol: "http", Context: "Streaming", MaxAudioChannels: "2", MinSegments: 2,
    },
    { Container: "mp3", Type: "Audio", AudioCodec: "mp3", Protocol: "http", Context: "Streaming", MaxAudioChannels: "2" },
    { Container: "aac", Type: "Audio", AudioCodec: "aac", Protocol: "http", Context: "Streaming", MaxAudioChannels: "2" },
  ],
  SubtitleProfiles: [{ Format: "vtt", Method: "Encode" }],
};

export function getDeviceProfile(enableH265: boolean): DeviceProfile {
  return enableH265 ? chromecastH265 : chromecast;
}
