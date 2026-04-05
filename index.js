#!/usr/bin/env node

const {
  RADARR_URL,
  RADARR_API_KEY,
  DEFAULT_QUALITY_PROFILE_ID,
  DEFAULT_ROOT_FOLDER_PATH,
} = require("./src/config");
const { RadarrClient } = require("./src/radarrApi");
const {
  getMovieSize,
  isMovieBelowQualityCutoff,
  movieUsesCustomFormat,
  formatBytes,
} = require("./src/utils");
const { createPromptInterface, askInteger, askForConfirmation } = require("./src/prompts");
const { processMovies } = require("./src/movieWorkflow");
const { writeFailureLog } = require("./src/failureLogger");

const MAIN_MODE_QUALITY = "quality";
const MAIN_MODE_FILTER = "filter";
const MAIN_MODE_SIZE = "size";
const MAIN_MODE_NEWEST = "newest";
const MAIN_MODE_OLDEST = "oldest";

const QUALITY_SCOPE_BELOW = "below";
const QUALITY_SCOPE_AT_OR_ABOVE = "at-or-above";
const QUALITY_SCOPE_BOTH = "both";

function getMovieAddedTimestamp(movie) {
  const addedRaw = movie?.added ?? movie?.addedDate ?? movie?.dateAdded ?? null;
  const parsed = addedRaw ? Date.parse(String(addedRaw)) : NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

function getMovieAddedDisplay(movie) {
  const addedTimestamp = getMovieAddedTimestamp(movie);
  if (!addedTimestamp) {
    return "unknown";
  }

  return new Date(addedTimestamp).toISOString().slice(0, 10);
}

function getMoviesByMainMode(movies, mode, qualityScope) {
  const modeFilteredMovies =
    mode === MAIN_MODE_QUALITY
      ? movies.filter((movie) => {
          const isBelowCutoff = isMovieBelowQualityCutoff(movie);

          if (qualityScope === QUALITY_SCOPE_BELOW) {
            return isBelowCutoff;
          }

          if (qualityScope === QUALITY_SCOPE_AT_OR_ABOVE) {
            return !isBelowCutoff;
          }

          return true;
        })
      : mode === MAIN_MODE_FILTER
        ? movies.filter((movie) => !movieUsesCustomFormat(movie))
        : movies;

  if (mode === MAIN_MODE_NEWEST) {
    return [...modeFilteredMovies].sort((a, b) => {
      const addedDiff = getMovieAddedTimestamp(b) - getMovieAddedTimestamp(a);
      if (addedDiff !== 0) {
        return addedDiff;
      }

      return getMovieSize(b) - getMovieSize(a);
    });
  }

  if (mode === MAIN_MODE_OLDEST) {
    return [...modeFilteredMovies].sort((a, b) => {
      const addedDiff = getMovieAddedTimestamp(a) - getMovieAddedTimestamp(b);
      if (addedDiff !== 0) {
        return addedDiff;
      }

      return getMovieSize(b) - getMovieSize(a);
    });
  }

  // Quality/filter/size modes default to largest files first.
  return [...modeFilteredMovies].sort((a, b) => getMovieSize(b) - getMovieSize(a));
}

function getMoviePreviewSuffix(movie, selectedMode) {
  if (selectedMode === MAIN_MODE_QUALITY) {
    return isMovieBelowQualityCutoff(movie) ? "below cutoff" : "at/above cutoff";
  }

  if (selectedMode === MAIN_MODE_FILTER) {
    return "no custom format";
  }

  if (selectedMode === MAIN_MODE_NEWEST || selectedMode === MAIN_MODE_OLDEST) {
    return `added: ${getMovieAddedDisplay(movie)}`;
  }

  return "";
}

// Orchestrates the end-to-end interactive workflow.
async function main() {
  if (!RADARR_API_KEY) {
    console.error("Missing RADARR_API_KEY environment variable.");
    process.exit(1);
  }

  console.log(`Using Radarr at ${RADARR_URL}`);
  console.log("Fetching movies...");

  const client = new RadarrClient({
    baseUrl: RADARR_URL,
    apiKey: RADARR_API_KEY,
  });

  const movies = await client.getMovies();
  if (!Array.isArray(movies) || movies.length === 0) {
    console.log("No movies returned by Radarr.");
    return;
  }

  const belowCutoffCount = movies.filter((movie) => isMovieBelowQualityCutoff(movie)).length;
  const atOrAboveCutoffCount = movies.length - belowCutoffCount;
  const withCustomFormatCount = movies.filter((movie) => movieUsesCustomFormat(movie)).length;
  const withoutCustomFormatCount = movies.length - withCustomFormatCount;
  console.log(`Movies below quality cutoff: ${belowCutoffCount}`);
  console.log(`Movies at/above quality cutoff: ${atOrAboveCutoffCount}`);
  console.log(`Movies using custom format: ${withCustomFormatCount}`);
  console.log(`Movies without custom format: ${withoutCustomFormatCount}`);

  const rl = createPromptInterface();

  console.log("\nChoose selection mode:");
  console.log("1. Quality");
  console.log("2. Filter (without custom format only)");
  console.log("3. Size (largest first)");
  console.log("4. Newest added");
  console.log("5. Oldest added");

  const modeChoice = await askInteger(rl, "Mode", {
    defaultValue: 1,
    min: 1,
    max: 5,
  });

  const selectedMode =
    modeChoice === 2
      ? MAIN_MODE_FILTER
      : modeChoice === 3
        ? MAIN_MODE_SIZE
        : modeChoice === 4
          ? MAIN_MODE_NEWEST
          : modeChoice === 5
            ? MAIN_MODE_OLDEST
            : MAIN_MODE_QUALITY;

  let qualityScope = QUALITY_SCOPE_BOTH;
  if (selectedMode === MAIN_MODE_QUALITY) {
    console.log("\nChoose quality filter:");
    console.log("1. Below quality cutoff only");
    console.log("2. At/above quality cutoff only");
    console.log("3. Both");

    const qualityScopeChoice = await askInteger(rl, "Quality filter", {
      defaultValue: 1,
      min: 1,
      max: 3,
    });

    qualityScope =
      qualityScopeChoice === 2
        ? QUALITY_SCOPE_AT_OR_ABOVE
        : qualityScopeChoice === 3
          ? QUALITY_SCOPE_BOTH
          : QUALITY_SCOPE_BELOW;
  }

  const filteredMovies = getMoviesByMainMode(movies, selectedMode, qualityScope);

  if (filteredMovies.length === 0) {
    console.log("No movies matched the selected mode.");
    rl.close();
    return;
  }
  const sortedMovies = filteredMovies;

  const count = await askInteger(rl, "How many movies should be processed", {
    defaultValue: 1,
    min: 1,
    max: sortedMovies.length,
  });

  const delaySeconds = await askInteger(rl, "Delay between each movie in seconds", {
    defaultValue: 3,
    min: 1,
    max: 300,
  });

  const modeLabel =
    selectedMode === MAIN_MODE_QUALITY
      ? qualityScope === QUALITY_SCOPE_BELOW
        ? "quality (below quality cutoff only)"
        : qualityScope === QUALITY_SCOPE_AT_OR_ABOVE
          ? "quality (at/above quality cutoff only)"
          : "quality (both)"
      : selectedMode === MAIN_MODE_FILTER
        ? "filter (without custom format only)"
        : selectedMode === MAIN_MODE_SIZE
          ? "size (largest first)"
          : selectedMode === MAIN_MODE_NEWEST
            ? "newest added"
            : "oldest added";

  console.log(`\nSelected mode: ${modeLabel}`);

  console.log("\nTop selected movies:");
  for (let index = 0; index < count; index += 1) {
    const movie = sortedMovies[index];
    const previewSuffix = getMoviePreviewSuffix(movie, selectedMode);
    const imdbLabel = movie.imdbId || "n/a";
    const previewBase = `${index + 1}. imdb: ${imdbLabel} | ${movie.title} (${movie.year || "unknown"}) - ${formatBytes(getMovieSize(movie))}`;
    console.log(previewSuffix ? `${previewBase} | ${previewSuffix}` : previewBase);
  }

  const confirmed = await askForConfirmation(rl);
  rl.close();

  if (!confirmed) {
    console.log("Aborted by user.");
    return;
  }

  // Runs the delete + re-add cycle with the requested pacing.
  const { rememberedMovies, failures } = await processMovies(client, sortedMovies, {
    count,
    delaySeconds,
    defaults: {
      defaultQualityProfileId: DEFAULT_QUALITY_PROFILE_ID,
      defaultRootFolderPath: DEFAULT_ROOT_FOLDER_PATH,
    },
  });

  const successCount = count - failures.length;

  console.log("\nRun complete.");
  console.log(`Requested: ${count}`);
  console.log(`Succeeded: ${successCount}`);
  console.log(`Failed: ${failures.length}`);

  if (rememberedMovies.length > 0) {
    // Echo the in-memory list so users can cross-check exactly what was touched.
    console.log("\nRemembered in memory during this run:");
    rememberedMovies.forEach((movie, index) => {
      console.log(
        `${index + 1}. imdb: ${movie.imdbId || "n/a"} | ${movie.title} | tmdb: ${movie.tmdbId || "n/a"}`
      );
    });
  }

  if (failures.length > 0) {
    console.log("\nFailures:");
    failures.forEach((failure, index) => {
      console.log(`${index + 1}. imdb: ${failure.imdbId || "n/a"} | ${failure.title}`);
      console.log(`   ${failure.error}`);
    });

    try {
      // Persist failures to disk so users can revisit what still needs manual attention.
      const logFilePath = await writeFailureLog(failures);
      if (logFilePath) {
        console.log(`\nFailure log written to ${logFilePath}`);
      }
    } catch (error) {
      console.error(`Could not write failure log: ${error instanceof Error ? error.message : error}`);
    }

    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`Fatal error: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
