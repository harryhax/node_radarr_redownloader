# Node Radarr Redownloader

[![Release](https://img.shields.io/github/v/release/harryhax/node_radarr_redownloader?display_name=tag)](https://github.com/harryhax/node_radarr_redownloader/releases)
[![Node](https://img.shields.io/badge/node-%3E%3D18-339933?logo=node.js&logoColor=white)](https://nodejs.org/en/download)
[![License](https://img.shields.io/github/license/harryhax/node_radarr_redownloader)](https://github.com/harryhax/node_radarr_redownloader/blob/main/LICENSE)


Node Radarr Redownloader is a CLI that refreshes selected Radarr movies after profile/rule changes by deleting and re-adding them with search enabled.

## Screenshot
<p align="center">
   <a href="screenshots/ss1.png">
      <img src="screenshots/ss1.png" alt="Node Radarr Redownloader Screenshot 1" width="48%" />
   </a>
</p>

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
```

3. Run:

```bash
npm start
```

4. Confirm by typing `YES` when prompted.

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
```

## Selection Modes

- `Quality`: asks next for `below`, `at/above`, or `both` quality cutoff groups.
- `Filter`: only movies without custom format.
- `Size`: largest files first.
- `Newest added`: latest Radarr-added movies first.
- `Oldest added`: earliest Radarr-added movies first.

## Requirements

- Node.js 18+
- Radarr v3+ with API v3 endpoints enabled
- Radarr API key with permission to view, delete, and add movies

## What It Does

1. Fetches your Radarr movie list.
2. Filters/sorts by selected mode.
3. Lets you choose how many movies to process and delay between each.
4. Deletes each selected movie (including files), then re-adds with search enabled.
 
## Acknowledgement

This workflow update was requested by [u/Limebaish](https://www.reddit.com/user/Limebaish/) in this Reddit thread comment:
[r/radarr comment link](https://www.reddit.com/r/radarr/comments/1sdgsar/comment/oeiskvc/?utm_source=share&utm_medium=web3x&utm_name=web3xcss&utm_term=1&utm_content=share_button)

## Important Safety Notes

- Heads up: this script removes existing movie entries and files before re-adding them, so use it only for movies you intentionally want to refresh.
- It asks for explicit `YES` confirmation before making any changes.
- If re-add fails for a movie, that movie may remain deleted and is listed in the failure summary.
- Failed items are also appended to `logs/failed-movies.log` so you can track what still needs to be re-added or downloaded.
