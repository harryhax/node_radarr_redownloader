# Node Radarr Redownloader

[![Release](https://img.shields.io/github/v/release/harryhax/node_radarr_redownloader?display_name=tag)](https://github.com/harryhax/node_radarr_redownloader/releases)
[![Downloads](https://img.shields.io/github/downloads/harryhax/node_radarr_redownloader/total)](https://github.com/harryhax/node_radarr_redownloader/releases)
[![Node](https://img.shields.io/badge/node-%3E%3D18-339933?logo=node.js&logoColor=white)](https://nodejs.org/en/download)
[![License](https://img.shields.io/github/license/harryhax/node_radarr_redownloader)](https://github.com/harryhax/node_radarr_redownloader/blob/main/LICENSE)


Node Radarr Redownloader is a CLI that refreshes selected Radarr movies after profile/rule changes by deleting and re-adding them with search enabled.

## Quick Start

1. Install dependencies:

```bash
npm install
```

2. Create/edit your `.env`:

```bash
cp .env.example .env
```

Required values:

```env
RADARR_URL=http://localhost:7878
RADARR_API_KEY=your_api_key_here
```

Optional fallback values:

```env
RADARR_DEFAULT_QUALITY_PROFILE_ID=
RADARR_DEFAULT_ROOT_FOLDER_PATH=
RADARR_DELETE_TO_ADD_DELAY_SECONDS=2
```

3. Run:

```bash
npm start
```

4. Confirm by typing `YES` when prompted.

## CLI Demo

Example main menu shown after startup:

```text
$ npm start
Using Radarr at http://localhost:7878
Fetching movies...
Movies below quality cutoff: 123
Movies at/above quality cutoff: 456
Movies using custom format: 321
Movies without custom format: 258

Choose selection mode:
1. Quality
2. Custom Filters
3. File Size
4. Newest added
5. Oldest added
6. Folder pattern
Mode [default: 1]:
```

## Run Prebuilt Binaries

If you downloaded a binary from the GitHub Releases page, you can run it without Node.js.

1. Download the asset for your OS from Releases.
2. Set these environment variables:

```env
RADARR_URL=http://localhost:7878
RADARR_API_KEY=your_api_key_here
```

3. Run the binary:

macOS/Linux:

```bash
chmod +x ./node-radarr-redownloader
RADARR_URL=http://localhost:7878 RADARR_API_KEY=your_api_key_here ./node-radarr-redownloader
```

Windows (PowerShell):

```powershell
$env:RADARR_URL = "http://localhost:7878"
$env:RADARR_API_KEY = "your_api_key_here"
.\node-radarr-redownloader.exe
```

Optional fallback values also work with binaries:

```env
RADARR_DEFAULT_QUALITY_PROFILE_ID=
RADARR_DEFAULT_ROOT_FOLDER_PATH=
RADARR_DELETE_TO_ADD_DELAY_SECONDS=2
```

`RADARR_DELETE_TO_ADD_DELAY_SECONDS` controls the delay between deleting a movie and re-adding it. Any value lower than `2` is automatically treated as `2` seconds.

`RADARR_DEFAULT_ROOT_FOLDER_PATH` is used only when a movie's existing Radarr root folder path does not match this value.

## Selection Modes

- `Quality`: asks next for `below`, `at/above`, or `both` quality cutoff groups.
- `Filter`: asks next for one of:
   - `Without custom format only`
   - `Below minimum custom format score` and then either:
      - use Radarr profile default (Minimum Custom Format Score)
      - enter a manual score
- `Size`: largest files first.
- `Newest added`: latest Radarr-added movies first.
- `Oldest added`: earliest Radarr-added movies first.
- `Folder pattern`: filters by movie folder/path name using wildcard search:
   - `*` matches any number of characters
   - `?` matches exactly one character
   - Example: `*2TB_*`

## Requirements

- Node.js 18+
- Radarr v3+ with API v3 endpoints enabled
- Radarr API key with permission to view, delete, and add movies

## What It Does

1. Fetches your Radarr movie list.
2. Filters/sorts by selected mode.
3. Lets you choose how many movies to process and delay between each.
4. Deletes each selected movie (including files), waits the configured delete-to-add delay (minimum 2 seconds), then re-adds with search enabled.
 
## Acknowledgement

This workflow update was requested by [u/Limebaish](https://www.reddit.com/user/Limebaish/) in this Reddit thread comment:
[r/radarr comment link](https://www.reddit.com/r/radarr/comments/1sdgsar/comment/oeiskvc/?utm_source=share&utm_medium=web3x&utm_name=web3xcss&utm_term=1&utm_content=share_button)

## Important Safety Notes

- Heads up: this script removes existing movie entries and files before re-adding them, so use it only for movies you intentionally want to refresh.
- It asks for explicit `YES` confirmation before making any changes.
- If re-add fails for a movie, that movie may remain deleted and is listed in the failure summary.
- Failed items are also appended to `logs/failed-movies.log` so you can track what still needs to be re-added or downloaded.
