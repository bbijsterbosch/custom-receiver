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
    {
      Type: "Video",
      Codec: "h264",
      Conditions: [
        { Condition: "LessThanEqual", Property: "VideoFramerate", Value: "30", IsRequired: false },
        { Condition: "LessThanEqual", Property: "VideoLevel", Value: "41", IsRequired: false },
      ],
    },
    {
      Type: "Audio",
      Codec: "aac,mp3,flac,opus,vorbis",
      Conditions: [
        { Condition: "LessThanEqual", Property: "AudioChannels", Value: "2" },
      ],
    },
  ],
  ContainerProfiles: [],
  DirectPlayProfiles: [
    {
      Container: "mp4",
      Type: "Video",
      VideoCodec: "h264",
      AudioCodec: "aac,mp3,opus,vorbis",
    },
    {
      Container: "webm",
      Type: "Video",
      VideoCodec: "vp8",
      AudioCodec: "vorbis,opus",
    },
    { Container: "mp3", Type: "Audio" },
    { Container: "aac", Type: "Audio" },
    { Container: "flac", Type: "Audio" },
    { Container: "wav", Type: "Audio" },
    { Container: "ogg", Type: "Audio" },
  ],
  TranscodingProfiles: [
    {
      Container: "ts",
      Type: "Video",
      VideoCodec: "h264",
      AudioCodec: "aac,mp3",
      Protocol: "hls",
      Context: "Streaming",
      MaxAudioChannels: "2",
      MinSegments: 2,
      BreakOnNonKeyFrames: true,
    },
    {
      Container: "mp4",
      Type: "Video",
      VideoCodec: "h264",
      AudioCodec: "aac",
      Protocol: "http",
      Context: "Streaming",
      MaxAudioChannels: "2",
      MinSegments: 2,
    },
    {
      Container: "mp3",
      Type: "Audio",
      AudioCodec: "mp3",
      Protocol: "http",
      Context: "Streaming",
      MaxAudioChannels: "2",
    },
    {
      Container: "aac",
      Type: "Audio",
      AudioCodec: "aac",
      Protocol: "http",
      Context: "Streaming",
      MaxAudioChannels: "2",
    },
  ],
  SubtitleProfiles: [{ Format: "vtt", Method: "External" }],
};

const chromecastH265: DeviceProfile = {
  Name: "Chromecast Video Profile (H265)",
  MaxStreamingBitrate: 16000000,
  MaxStaticBitrate: 16000000,
  MusicStreamingTranscodingBitrate: 384000,
  CodecProfiles: [
    {
      Type: "Video",
      Codec: "hevc,h264",
      Conditions: [
        { Condition: "LessThanEqual", Property: "VideoFramerate", Value: "60", IsRequired: false },
      ],
    },
    {
      Type: "Audio",
      Codec: "aac,mp3,flac,opus,vorbis",
      Conditions: [
        { Condition: "LessThanEqual", Property: "AudioChannels", Value: "2" },
      ],
    },
  ],
  ContainerProfiles: [],
  DirectPlayProfiles: [
    {
      Container: "mp4",
      Type: "Video",
      VideoCodec: "hevc,h264",
      AudioCodec: "aac,mp3,opus,vorbis",
    },
    {
      Container: "webm",
      Type: "Video",
      VideoCodec: "vp9,vp8",
      AudioCodec: "vorbis,opus",
    },
    { Container: "mp3", Type: "Audio" },
    { Container: "aac", Type: "Audio" },
    { Container: "flac", Type: "Audio" },
    { Container: "wav", Type: "Audio" },
    { Container: "ogg", Type: "Audio" },
  ],
  TranscodingProfiles: [
    {
      Container: "ts",
      Type: "Video",
      VideoCodec: "hevc,h264",
      AudioCodec: "aac,mp3",
      Protocol: "hls",
      Context: "Streaming",
      MaxAudioChannels: "2",
      MinSegments: 2,
      BreakOnNonKeyFrames: true,
    },
    {
      Container: "mp4",
      Type: "Video",
      VideoCodec: "hevc,h264",
      AudioCodec: "aac",
      Protocol: "http",
      Context: "Streaming",
      MaxAudioChannels: "2",
      MinSegments: 2,
    },
    {
      Container: "mp3",
      Type: "Audio",
      AudioCodec: "mp3",
      Protocol: "http",
      Context: "Streaming",
      MaxAudioChannels: "2",
    },
    {
      Container: "aac",
      Type: "Audio",
      AudioCodec: "aac",
      Protocol: "http",
      Context: "Streaming",
      MaxAudioChannels: "2",
    },
  ],
  SubtitleProfiles: [{ Format: "vtt", Method: "Encode" }],
};

let _h265Supported: boolean | null = null;

function detectH265Support(): boolean {
  if (_h265Supported !== null) return _h265Supported;
  try {
    _h265Supported =
      MediaSource.isTypeSupported('video/mp4; codecs="hvc1.1.6.L153.B0"') ||
      MediaSource.isTypeSupported('video/mp4; codecs="hev1.1.6.L153.B0"');
  } catch {
    _h265Supported = false;
  }
  console.log(`[DeviceProfile] H265 supported: ${_h265Supported}`);
  return _h265Supported;
}

export function getDeviceProfile(): DeviceProfile {
  return detectH265Support() ? chromecastH265 : chromecast;
}

/** Maximum framerate the current device supports for direct play. */
export function getMaxFramerate(): number {
  return detectH265Support() ? 60 : 30;
}
