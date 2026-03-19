# Streamyfin Cast Receiver

A custom Google Cast (CAF) receiver for [Streamyfin](https://github.com/streamyfin/streamyfin) that handles Jellyfin stream initialization and playback reporting directly from the casting device.

## Why a custom receiver?

The default Google Cast receiver has no knowledge of Jellyfin. A naive approach — sending the stream URL from the phone and reporting progress from the phone — has two problems:

- **Progress tracking breaks** when the sender app sleeps or loses connection.
- **Session mismatch**: if the phone resolves the stream URL under its own Jellyfin identity, but the receiver reports playback under a different identity, Jellyfin cannot link the transcoding job to the playback session. Tools like Tracearr will show wrong codec/transcode info.

This receiver fixes both by owning the entire Jellyfin session itself:

1. The sender sends only the **item ID + playback settings** (bitrate cap, audio/subtitle index, H265 preference, start position).
2. The receiver calls `getPlaybackInfo` using its own fixed Jellyfin identity (`Streamyfin Cast Receiver`), obtaining the stream URL, session ID, and media source.
3. Playback start, progress (every 10 s), and stop events are reported to Jellyfin directly from the receiver, using the same session.

This means progress tracking works even when the sender app is closed, and transcoding information is always accurate.

## How it works — detailed flow

```
Sender (phone)                         Receiver (Chromecast)
──────────────────────────────────     ──────────────────────────────────────────
1. loadMedia({ customData: {           
     Id, startTimeTicks,               
     audioStreamIndex, ...             
   }, contentUrl: "" })                
                                    ──▶ LOAD interceptor fires
                                        • waits for credentials if not yet received
                                        • calls getPlaybackInfo(customData)
                                        • patches contentUrl with real stream URL
                                        • starts playback reporting

2. sendMessage(credentials) ────────▶  credentials listener fires
   { serverUrl, accessToken,           • initializes Jellyfin API client
     userId }                          • loads backdrop images for idle screen
                                        • signals credentials-ready gate
```

The credentials message and the LOAD request can arrive in either order. A promise-based gate ensures the LOAD interceptor always waits for credentials before calling Jellyfin.

## Project structure

```
src/
  main.ts                  Entry point — initializes the CAF receiver
  receiver.ts              LOAD interceptor, volume, event handlers, session lifecycle
  idleScreen.ts            Backdrop cycling for the idle screen
  types.ts                 TypeScript interfaces for sender/receiver communication
  deviceProfiles.ts        Jellyfin device profiles (chromecast / chromecastH265)
  services/
    jellyfinApi.ts         Jellyfin SDK client initialization and singleton
    streamInitializer.ts   Calls getPlaybackInfo and resolves stream URL + metadata
    playbackReporter.ts    Playback start / progress / stop reporting to Jellyfin
```

## Sender/receiver contract

### Credentials (sent via custom channel `urn:x-cast:streamyfin`)

```ts
interface JellyfinCredentials {
  serverUrl: string;    // e.g. "https://jellyfin.example.com"
  accessToken: string;
  userId: string;
}
```

### Media custom data (sent inside `loadMedia`)

```ts
interface ReceiverCustomData {
  Id: string;                    // Jellyfin item ID

  // Playback settings passed to getPlaybackInfo
  startTimeTicks?: number;
  audioStreamIndex?: number;
  subtitleStreamIndex?: number;
  maxStreamingBitrate?: number;
  mediaSourceId?: string;
  enableH265?: boolean;          // selects the H265 device profile when true

  // Display metadata for the sender UI
  Name?: string;
  Type?: string;
  // ...other BaseItemDto fields
}
```

## Development

```bash
bun install
bun run dev
```

The dev server runs at `http://localhost:5173`. For local testing with a Chromecast device you need a publicly reachable URL (use `ngrok` or similar) and a registered receiver App ID.

### Debugging the receiver

1. On a desktop Chrome/Chromium, navigate to `chrome://inspect/#devices`.
2. Cast any media from Streamyfin.
3. The receiver page will appear under **Other** — click **Inspect** to open DevTools and see console output.

## Build

```bash
bun run build
```

Output goes to `dist/`. The bundle is ~100 kB (27 kB gzipped).

## Linting and formatting

```bash
bun run lint        # check
bun run lint:fix    # auto-fix
bun run format      # format only
```

Uses [Biome](https://biomejs.dev), matching the main Streamyfin app.

## Deployment

A GitHub Actions workflow automatically deploys `dist/` to GitHub Pages on every push to `main`.

To set it up for your own fork:

1. Push the repo to GitHub.
2. Go to **Settings → Pages** and set the source to **GitHub Actions**.
3. The receiver will be live at `https://<username>.github.io/<repo-name>/`.
4. Register that URL in the [Google Cast Developer Console](https://cast.google.com/publish/) to get a receiver App ID.
5. Set the App ID in the Streamyfin app settings.

## Tech stack

- [Cast Application Framework (CAF)](https://developers.google.com/cast/docs/web_receiver) — receiver SDK loaded from Google's CDN
- [@jellyfin/sdk](https://github.com/jellyfin/jellyfin-sdk-typescript) — Jellyfin API client
- [Vite](https://vite.dev) — browser bundle build tool
- [Bun](https://bun.sh) — package manager
- [Biome](https://biomejs.dev) — linter and formatter
- TypeScript
