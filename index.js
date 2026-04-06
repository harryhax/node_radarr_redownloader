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
  getMovieCustomFormatScore,
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
const MAIN_MODE_FOLDER = "folder";

const FILTER_SCOPE_WITHOUT_CUSTOM_FORMAT = "without-custom-format";
const FILTER_SCOPE_BELOW_MIN_SCORE = "below-min-score";
const FILTER_SCORE_SOURCE_MANUAL = "manual";
const FILTER_SCORE_SOURCE_RADARR_DEFAULT = "radarr-default";

const QUALITY_SCOPE_BELOW = "below";
const QUALITY_SCOPE_AT_OR_ABOVE = "at-or-above";
const QUALITY_SCOPE_BOTH = "both";

function getMovieFolderPath(movie) {
  const pathValue =
    movie?.path ??
    movie?.folderName ??
    movie?.movieFile?.relativePath ??
    movie?.movieFile?.path ??
    "";

  return typeof pathValue === "string" ? pathValue.trim() : "";
}

function getLastPathSegment(pathValue) {
  if (!pathValue) {
    return "";
  }

  const normalizedPath = pathValue.replace(/[\\/]+$/, "");
  if (!normalizedPath) {
    return "";
  }

  const segments = normalizedPath.split(/[\\/]/);
  return segments[segments.length - 1] || "";
}

function compileFolderPattern(rawPattern) {
  const pattern = String(rawPattern || "").trim();
  if (!pattern) {
    return null;
  }

  if (!/[?*]/.test(pattern)) {
    const loweredPattern = pattern.toLowerCase();
    return {
      displayPattern: `*${pattern}*`,
      matches: (input) => String(input || "").toLowerCase().includes(loweredPattern),
    };
  }

  const regexSource = pattern
    .split("")
    .map((character) => {
      if (character === "*") {
        return ".*";
      }

      if (character === "?") {
        return ".";
      }

      return /[\\^$.*+?()[\]{}|]/.test(character) ? `\\${character}` : character;
    })
    .join("");

  const patternRegex = new RegExp(`^${regexSource}$`, "i");

  return {
    displayPattern: pattern,
    matches: (input) => patternRegex.test(String(input || "")),
  };
}

function movieMatchesFolderPattern(movie, folderFilter) {
  if (!folderFilter || typeof folderFilter.matches !== "function") {
    return true;
  }

  const fullPath = getMovieFolderPath(movie);
  const folderName = getLastPathSegment(fullPath);

  return folderFilter.matches(fullPath) || folderFilter.matches(folderName);
}

async function askFolderPattern(readlineInterface) {
  // Pattern supports shell-like wildcards: * for many chars, ? for one char.
  const answer = (
    await readlineInterface.question("Folder/directory pattern [default: *]: ")
  ).trim();

  return answer || "*";
}

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

function getProfileMinimumCustomFormatScore(profile) {
  // Radarr quality profile stores this as minFormatScore.
  const minimumScoreRaw = profile?.minFormatScore ?? profile?.minimumCustomFormatScore ?? 0;
  const minimumScore = Number(minimumScoreRaw);
  return Number.isFinite(minimumScore) ? minimumScore : 0;
}

function buildQualityProfileMinimumScoreMap(qualityProfiles) {
  const scoreMap = new Map();

  if (!Array.isArray(qualityProfiles)) {
    return scoreMap;
  }

  qualityProfiles.forEach((profile) => {
    const profileId = Number(profile?.id);
    if (!Number.isInteger(profileId)) {
      return;
    }

    scoreMap.set(profileId, getProfileMinimumCustomFormatScore(profile));
  });

  return scoreMap;
}

function getMovieMinimumCustomFormatScore(movie, filterSettings) {
  if (filterSettings.scoreSource === FILTER_SCORE_SOURCE_MANUAL) {
    return filterSettings.manualMinimumScore;
  }

  if (filterSettings.scoreSource === FILTER_SCORE_SOURCE_RADARR_DEFAULT) {
    const profileId = Number(movie?.qualityProfileId);
    if (!Number.isInteger(profileId)) {
      return null;
    }

    return filterSettings.qualityProfileMinimumScoreById.get(profileId) ?? null;
  }

  return null;
}

function getMoviesByMainMode(movies, mode, qualityScope, customFormatFilter, folderFilter) {
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
        ? customFormatFilter.scope === FILTER_SCOPE_BELOW_MIN_SCORE
          ? movies.filter((movie) => {
              const minimumScore = getMovieMinimumCustomFormatScore(movie, customFormatFilter);
              if (!Number.isFinite(minimumScore)) {
                return false;
              }

              return getMovieCustomFormatScore(movie) < minimumScore;
            })
          : movies.filter((movie) => !movieUsesCustomFormat(movie))
        : mode === MAIN_MODE_FOLDER
          ? movies.filter((movie) => movieMatchesFolderPattern(movie, folderFilter))
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

function getMoviePreviewSuffix(movie, selectedMode, customFormatFilter) {
  if (selectedMode === MAIN_MODE_QUALITY) {
    return isMovieBelowQualityCutoff(movie) ? "below cutoff" : "at/above cutoff";
  }

  if (selectedMode === MAIN_MODE_FILTER) {
    if (customFormatFilter.scope === FILTER_SCOPE_BELOW_MIN_SCORE) {
      const minimumScore = getMovieMinimumCustomFormatScore(movie, customFormatFilter);
      const currentScore = getMovieCustomFormatScore(movie);
      return `score: ${currentScore} < min: ${minimumScore}`;
    }

    return "no custom format";
  }

  if (selectedMode === MAIN_MODE_NEWEST || selectedMode === MAIN_MODE_OLDEST) {
    return `added: ${getMovieAddedDisplay(movie)}`;
  }

  if (selectedMode === MAIN_MODE_FOLDER) {
    return `folder: ${getMovieFolderPath(movie) || "unknown"}`;
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
  console.log("2. Customer Filters");
  console.log("3. File Size");
  console.log("4. Newest added");
  console.log("5. Oldest added");
  console.log("6. Folder pattern");

  const modeChoice = await askInteger(rl, "Mode", {
    defaultValue: 1,
    min: 1,
    max: 6,
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
            : modeChoice === 6
              ? MAIN_MODE_FOLDER
            : MAIN_MODE_QUALITY;

  let customFormatFilter = {
    scope: FILTER_SCOPE_WITHOUT_CUSTOM_FORMAT,
    scoreSource: null,
    manualMinimumScore: null,
    qualityProfileMinimumScoreById: new Map(),
  };

  let folderFilter = {
    rawPattern: "*",
    displayPattern: "*",
    matches: () => true,
  };

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

  if (selectedMode === MAIN_MODE_FILTER) {
    console.log("\nChoose custom format filter:");
    console.log("1. Without custom format only");
    console.log("2. Below minimum custom format score");

    const customFormatFilterChoice = await askInteger(rl, "Custom format filter", {
      defaultValue: 2,
      min: 1,
      max: 2,
    });

    if (customFormatFilterChoice === 2) {
      customFormatFilter.scope = FILTER_SCOPE_BELOW_MIN_SCORE;

      console.log("\nChoose minimum custom format score source:");
      console.log("1. Use Radarr quality profile minimum score");
      console.log("2. Enter score manually");

      const scoreSourceChoice = await askInteger(rl, "Score source", {
        defaultValue: 1,
        min: 1,
        max: 2,
      });

      if (scoreSourceChoice === 2) {
        customFormatFilter.scoreSource = FILTER_SCORE_SOURCE_MANUAL;
        customFormatFilter.manualMinimumScore = await askInteger(
          rl,
          "Minimum custom format score",
          {
            defaultValue: 0,
            min: -100000,
            max: 100000,
          }
        );
      } else {
        customFormatFilter.scoreSource = FILTER_SCORE_SOURCE_RADARR_DEFAULT;
        console.log("Fetching quality profiles...");

        const qualityProfiles = await client.getQualityProfiles();
        customFormatFilter.qualityProfileMinimumScoreById =
          buildQualityProfileMinimumScoreMap(qualityProfiles);

        if (customFormatFilter.qualityProfileMinimumScoreById.size === 0) {
          throw new Error("No quality profiles were returned by Radarr.");
        }
      }
    }
  }

  if (selectedMode === MAIN_MODE_FOLDER) {
    console.log("\nEnter folder/directory pattern:");
    console.log("- Use * for any number of characters");
    console.log("- Use ? for exactly one character");
    console.log("- Example: *2TB_*");

    const rawPattern = await askFolderPattern(rl);
    const compiledPattern = compileFolderPattern(rawPattern);

    if (!compiledPattern) {
      throw new Error("Folder pattern cannot be empty.");
    }

    folderFilter = {
      rawPattern,
      displayPattern: compiledPattern.displayPattern,
      matches: compiledPattern.matches,
    };
  }

  const filteredMovies = getMoviesByMainMode(
    movies,
    selectedMode,
    qualityScope,
    customFormatFilter,
    folderFilter
  );

  if (filteredMovies.length === 0) {
    console.log("No movies matched the selected mode.");
    rl.close();
    return;
  }

  if (selectedMode === MAIN_MODE_FOLDER) {
    console.log(
      `\nMatched ${filteredMovies.length} movie(s) for folder pattern: ${folderFilter.displayPattern}`
    );

    filteredMovies.forEach((movie, index) => {
      const imdbLabel = movie.imdbId || "n/a";
      const folderPath = getMovieFolderPath(movie) || "unknown";
      console.log(
        `${index + 1}. imdb: ${imdbLabel} | ${movie.title} (${movie.year || "unknown"}) | folder: ${folderPath}`
      );
    });
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
        ? customFormatFilter.scope === FILTER_SCOPE_BELOW_MIN_SCORE
          ? customFormatFilter.scoreSource === FILTER_SCORE_SOURCE_MANUAL
            ? `filter (below minimum custom format score: < ${customFormatFilter.manualMinimumScore})`
            : "filter (below minimum custom format score: Radarr profile default)"
          : "filter (without custom format only)"
        : selectedMode === MAIN_MODE_SIZE
          ? "size (largest first)"
          : selectedMode === MAIN_MODE_NEWEST
            ? "newest added"
            : selectedMode === MAIN_MODE_OLDEST
              ? "oldest added"
              : `folder pattern (${folderFilter.displayPattern})`;

  console.log(`\nSelected mode: ${modeLabel}`);

  console.log("\nTop selected movies:");
  for (let index = 0; index < count; index += 1) {
    const movie = sortedMovies[index];
    const previewSuffix = getMoviePreviewSuffix(movie, selectedMode, customFormatFilter);
    const customFormatScore = getMovieCustomFormatScore(movie);
    const imdbLabel = movie.imdbId || "n/a";
    const previewBase = `${index + 1}. imdb: ${imdbLabel} | ${movie.title} (${movie.year || "unknown"}) - ${formatBytes(getMovieSize(movie))} | custom format score: ${customFormatScore}`;
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
