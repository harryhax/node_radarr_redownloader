# Node Radarr Redownloader

Node Radarr Redownloader is a CLI that refreshes selected movies in size order: it deletes each movie and files from Radarr, then re-adds it with search enabled so the download restarts automatically. It is useful for batch re-downloads with a configurable count and delay.

This script:

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

## Important

- This script is destructive: it deletes Radarr movie entries and files before re-adding.
- It asks for explicit `YES` confirmation before making changes.
- If re-add fails for a movie, that movie may remain deleted and will be shown in the failure summary.
