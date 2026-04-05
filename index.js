#!/usr/bin/env node

const {
  RADARR_URL,
  RADARR_API_KEY,
  DEFAULT_QUALITY_PROFILE_ID,
  DEFAULT_ROOT_FOLDER_PATH,
} = require("./src/config");
const { RadarrClient } = require("./src/radarrApi");
const { getMovieSize, isMovieBelowQualityCutoff, formatBytes } = require("./src/utils");
const { createPromptInterface, askInteger, askForConfirmation } = require("./src/prompts");
const { processMovies } = require("./src/movieWorkflow");
const { writeFailureLog } = require("./src/failureLogger");

const QUALITY_FILTER_BELOW_ONLY = "below-only";
const QUALITY_FILTER_ABOVE_ONLY = "above-only";
const QUALITY_FILTER_BOTH = "both";

const SORT_MODE_QUALITY_FIRST = "quality-first";
const SORT_MODE_SIZE_DESC = "size-desc";

function sortMoviesByMode(movies, sortMode) {
  if (sortMode === SORT_MODE_SIZE_DESC) {
    return [...movies].sort((a, b) => getMovieSize(b) - getMovieSize(a));
  }

  // Default: prioritize movies below quality cutoff, then use size as tie-breaker.
  return [...movies].sort((a, b) => {
    const aPriority = isMovieBelowQualityCutoff(a) ? 1 : 0;
    const bPriority = isMovieBelowQualityCutoff(b) ? 1 : 0;

    if (bPriority !== aPriority) {
      return bPriority - aPriority;
    }

    return getMovieSize(b) - getMovieSize(a);
  });
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
  console.log(`Movies below quality cutoff: ${belowCutoffCount}`);
  console.log(`Movies at/above quality cutoff: ${atOrAboveCutoffCount}`);

  const rl = createPromptInterface();

  console.log("\nChoose quality cutoff filter:");
  console.log("1. Below quality cutoff only");
  console.log("2. At/above quality cutoff only");
  console.log("3. Both");

  const qualityFilterChoice = await askInteger(rl, "Quality filter", {
    defaultValue: 1,
    min: 1,
    max: 3,
  });

  const qualityFilter =
    qualityFilterChoice === 2
      ? QUALITY_FILTER_ABOVE_ONLY
      : qualityFilterChoice === 3
        ? QUALITY_FILTER_BOTH
        : QUALITY_FILTER_BELOW_ONLY;

  const filteredMovies = movies.filter((movie) => {
    const isBelowCutoff = isMovieBelowQualityCutoff(movie);

    if (qualityFilter === QUALITY_FILTER_BELOW_ONLY) {
      return isBelowCutoff;
    }

    if (qualityFilter === QUALITY_FILTER_ABOVE_ONLY) {
      return !isBelowCutoff;
    }

    return true;
  });

  if (filteredMovies.length === 0) {
    console.log("No movies matched the selected quality filter.");
    rl.close();
    return;
  }

  console.log("\nChoose sorting mode:");
  console.log("1. Below quality cutoff first (recommended)");
  console.log("2. Size descending");

  const sortModeChoice = await askInteger(rl, "Sorting mode", {
    defaultValue: 1,
    min: 1,
    max: 2,
  });

  const sortMode = sortModeChoice === 2 ? SORT_MODE_SIZE_DESC : SORT_MODE_QUALITY_FIRST;
  const sortedMovies = sortMoviesByMode(filteredMovies, sortMode);

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

  const sortModeLabel =
    sortMode === SORT_MODE_QUALITY_FIRST ? "below quality cutoff first" : "size descending";
  const qualityFilterLabel =
    qualityFilter === QUALITY_FILTER_BELOW_ONLY
      ? "below quality cutoff only"
      : qualityFilter === QUALITY_FILTER_ABOVE_ONLY
        ? "at/above quality cutoff only"
        : "both";

  console.log(`\nSelected quality filter: ${qualityFilterLabel}`);

  console.log(`\nTop selected movies (${sortModeLabel}):`);
  for (let index = 0; index < count; index += 1) {
    const movie = sortedMovies[index];
    const qualityMarker = isMovieBelowQualityCutoff(movie) ? "below cutoff" : "at/above cutoff";
    const imdbLabel = movie.imdbId || "n/a";
    console.log(
      `${index + 1}. imdb: ${imdbLabel} | ${movie.title} (${movie.year || "unknown"}) - ${formatBytes(getMovieSize(movie))} | ${qualityMarker}`
    );
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
