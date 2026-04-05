# Node Radarr Redownloader

Node Radarr Redownloader is a CLI that refreshes selected movies in size order: it deletes each movie and files from Radarr, then re-adds it with search enabled so the download restarts automatically. It is useful for batch re-downloads with a configurable count and delay.

## TLDR; 
Re-download movies after Radarr profile changes, so new grabs follow your updated quality and selection rules.

## Details

1. Fetches all Radarr movies
2. Sorts them by size descending
3. Lets you choose how many to process
4. For each movie, stores its title/imdb in memory (in-process array), deletes the movie with files, and adds it back with search enabled
5. Waits between each movie so Radarr can catch up

## Project Structure

- `index.js`: Main CLI entry point and high-level flow
- `src/config.js`: Environment variable parsing and defaults
- `src/radarrApi.js`: Radarr API client and error handling
- `src/prompts.js`: Interactive user prompt helpers
- `src/movieWorkflow.js`: Delete/re-add processing loop logic
- `src/utils.js`: Shared utility helpers (delay, size formatting)

## Requirements

- Node.js 18+ (minimum)
- Radarr v3+ with API v3 endpoints enabled (minimum)
- Radarr API key

Download links:

- Node.js: https://nodejs.org/en/download
- Radarr: https://radarr.video/#download

## Setup

1. Copy `.env.example` values into your shell environment.
2. Set at least:
   - `RADARR_URL`
   - `RADARR_API_KEY`

Optional fallback values:

- `RADARR_DEFAULT_QUALITY_PROFILE_ID`
- `RADARR_DEFAULT_ROOT_FOLDER_PATH`

## Run

```bash
RADARR_URL=http://localhost:7878 \
RADARR_API_KEY=your_api_key_here \
node index.js
```

or

```bash
npm start
```

## Standalone Binaries (Windows, Linux, macOS)

This project can be compiled to standalone executables so users do not need Node.js installed.

Build for your current machine:

```bash
npm run build:current
```

Build all targets (win-x64, linux-x64, macos-x64, macos-arm64):

```bash
npm run build:all
```

Compiled files are written to `dist/`.

Running compiled binaries:

- Linux/macOS: run the file from `dist/` directly
- Windows: run the `.exe` file from `dist/`

Environment variables are still required for API access (`RADARR_URL`, `RADARR_API_KEY`, and optional fallback variables).

## Important

- This script is destructive: it deletes Radarr movie entries and files before re-adding.
- It asks for explicit `YES` confirmation before making changes.
- If re-add fails for a movie, that movie may remain deleted and will be shown in the failure summary.
- Failed items are also appended to `logs/failed-movies.log` so you can track what still needs to be re-added or downloaded.
