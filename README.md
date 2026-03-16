# Streamyfin Cast Receiver

A custom Google Cast (CAF) receiver for [Streamyfin](https://github.com/streamyfin/streamyfin) that handles Jellyfin playback reporting directly from the casting device.

## Why a custom receiver?

The default Google Cast receiver has no knowledge of Jellyfin. Playback reporting (tracking watch progress) has to happen from the sender (your phone), which breaks when the app goes to sleep or loses connection. This custom receiver reports playback status directly to your Jellyfin server, making progress tracking reliable regardless of what the sender device is doing.

## How it works

1. The Streamyfin app sends media to the receiver along with Jellyfin credentials via `customData`
2. The receiver intercepts the LOAD request, initializes a Jellyfin API client, and begins playback
3. Playback start, progress (every 10s), and stop events are reported directly to Jellyfin from the receiver
4. Google's `cast-media-player` handles all video rendering and the TV-side UI

## Project structure

```
src/
  main.ts                  Entry point — initializes the CAF receiver
  receiver.ts              LOAD interceptor, event handlers, volume tracking
  types.ts                 TypeScript interfaces for sender/receiver communication
  services/
    jellyfinApi.ts         Jellyfin SDK client initialization
    playbackReporter.ts    Playback start/progress/stop reporting
```

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

Output goes to `dist/`.

## Deployment

This project includes a GitHub Actions workflow that automatically deploys to GitHub Pages on every push to `main`.

To set it up:

1. Push this repo to GitHub
2. Go to **Settings > Pages** and set the source to **GitHub Actions**
3. The receiver will be live at `https://<username>.github.io/<repo-name>/`

Register the URL in the [Google Cast Developer Console](https://cast.google.com/publish/) to get a receiver App ID.

## Tech stack

- [Cast Application Framework (CAF)](https://developers.google.com/cast/docs/web_receiver) — receiver SDK
- [@jellyfin/sdk](https://github.com/jellyfin/jellyfin-sdk-typescript) — Jellyfin API client
- [Vite](https://vite.dev) — build tooling
- TypeScript
