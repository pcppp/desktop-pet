# Claude-like Desktop Pet MVP

This is a minimal runnable Electron + React + Vite desktop pet prototype aimed at validating interaction flow before any Steam-specific packaging work.

## What it does

- Transparent always-on-top pet window
- Drag the pet window to any screen position
- Click animation
- Idle animation after 15 seconds without interaction
- External `reply-finished` event trigger
- Right-click menu showing 5-hour and week usage from Claude Code `/status`

## Environment

- Node.js 20+ recommended
- npm 10+
- macOS, Windows, or Linux desktop with Electron support

## Run

```bash
npm install
npm start
```

`npm start` launches Electron directly with the built transparent pet window in `dist/`.

For hot-reload development:

```bash
npm run start:dev
```

If you only want the frontend dev server:

```bash
npm run dev
```

If you want to verify the production-style renderer bundle:

```bash
npm run start:built
```

## Simulate Claude Code reply finished

In another terminal:

```bash
npm run trigger:reply
```

## Update demo quotas

```bash
npm run quota:demo
```

## Sync real quota data from Claude Code

The app now reads the right-click usage values from the interactive Claude Code `/status` panel, specifically:

- `Current session` -> `5h Quota`
- `Current week` -> `Week Quota`

Manual sync:

```bash
npm run quota:sync
```

Notes:

- Claude Code currently exposes these values as `% used` plus reset times, not `used/limit` counts.
- The app caches the latest successful result in `data/quota.json`.
- On app launch and every 10 minutes, the app refreshes quota cache in the background.
- Right-click opens immediately from cached data and shows a loading state while a fresh sync runs in the background.
- If sync fails, the menu falls back to the cached file.

## How the MVP bridge works

- `data/events.ndjson` is a local event bus.
- `scripts/trigger-reply-finished.js` appends a `reply-finished` event.
- `data/quota.json` stores current quota numbers for the right-click menu.

## Steam and branding note

If you intend to publish on Steam, do not ship with Anthropic or Claude trademarks, logos, or an official character likeness unless you have explicit permission. This MVP uses an original Claude-like placeholder mascot and a local quota stub so the interaction model can be validated safely.
