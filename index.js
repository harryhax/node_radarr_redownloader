#!/usr/bin/env node

const {
  RADARR_URL,
  RADARR_API_KEY,
  DEFAULT_QUALITY_PROFILE_ID,
  DEFAULT_ROOT_FOLDER_PATH,
} = require("./src/config");
const { RadarrClient } = require("./src/radarrApi");
const { getMovieSize, formatBytes } = require("./src/utils");
const { createPromptInterface, askInteger, askForConfirmation } = require("./src/prompts");
const { processMovies } = require("./src/movieWorkflow");

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

  // Process largest movies first.
  const sortedMovies = [...movies].sort((a, b) => getMovieSize(b) - getMovieSize(a));

  const rl = createPromptInterface();

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

  console.log("\nTop selected movies (largest first):");
  for (let index = 0; index < count; index += 1) {
    const movie = sortedMovies[index];
    console.log(
      `${index + 1}. ${movie.title} (${movie.year || "unknown"}) - ${formatBytes(getMovieSize(movie))}`
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
    console.log("\nRemembered in memory during this run:");
    rememberedMovies.forEach((movie, index) => {
      console.log(
        `${index + 1}. ${movie.title} | imdb: ${movie.imdbId || "n/a"} | tmdb: ${movie.tmdbId || "n/a"}`
      );
    });
  }

  if (failures.length > 0) {
    console.log("\nFailures:");
    failures.forEach((failure, index) => {
      console.log(`${index + 1}. ${failure.title} (${failure.imdbId || "n/a"})`);
      console.log(`   ${failure.error}`);
    });
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`Fatal error: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
