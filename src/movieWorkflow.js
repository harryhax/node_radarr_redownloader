const { wait } = require("./utils");

function normalizeFolderPath(pathValue) {
  return String(pathValue || "")
    .trim()
    .replace(/[\\/]+$/, "");
}

function buildReAddPayload(movie, defaults) {
  // Radarr add payload with search enabled to immediately trigger a download.
  const tmdbId = movie.tmdbId;
  if (!tmdbId) {
    throw new Error(`Cannot re-add '${movie.title}': missing tmdbId.`);
  }

  const qualityProfileId =
    movie.qualityProfileId ||
    (Number.isInteger(defaults.defaultQualityProfileId) ? defaults.defaultQualityProfileId : null);
  const envRootFolderPath = String(defaults.defaultRootFolderPath || "").trim();
  const movieRootFolderPath = String(movie.rootFolderPath || "").trim();
  const envRootFolderPathNormalized = normalizeFolderPath(envRootFolderPath);
  const movieRootFolderPathNormalized = normalizeFolderPath(movieRootFolderPath);
  const rootFolderPath =
    envRootFolderPath && movieRootFolderPathNormalized !== envRootFolderPathNormalized
      ? envRootFolderPath
      : movieRootFolderPath || envRootFolderPath || null;

  if (!qualityProfileId) {
    throw new Error(
      `Cannot re-add '${movie.title}': missing qualityProfileId. Set RADARR_DEFAULT_QUALITY_PROFILE_ID.`
    );
  }

  if (!rootFolderPath) {
    throw new Error(
      `Cannot re-add '${movie.title}': missing rootFolderPath. Set RADARR_DEFAULT_ROOT_FOLDER_PATH.`
    );
  }

  return {
    // Keep original metadata where possible so re-added entries stay consistent.
    title: movie.title,
    qualityProfileId,
    titleSlug: movie.titleSlug,
    images: Array.isArray(movie.images) ? movie.images : [],
    tmdbId,
    year: movie.year,
    rootFolderPath,
    monitored: movie.monitored !== false,
    minimumAvailability: movie.minimumAvailability || "released",
    tags: Array.isArray(movie.tags) ? movie.tags : [],
    addOptions: {
      searchForMovie: true,
    },
  };
}

async function processMovies(client, movies, { count, delaySeconds, deleteToAddDelaySeconds, defaults }) {
  const rememberedMovies = [];
  const failures = [];
  const parsedDeleteToAddDelaySeconds = Number(deleteToAddDelaySeconds);
  const deleteToAddDelaySecondsSafe = Number.isFinite(parsedDeleteToAddDelaySeconds)
    ? Math.max(2, parsedDeleteToAddDelaySeconds)
    : 2;

  // Process one movie at a time to avoid overloading Radarr.
  for (let index = 0; index < count; index += 1) {
    const movie = movies[index];
    const name = movie.title || "Unknown title";
    const imdbId = movie.imdbId || null;
    const movieIdentity = `imdb: ${imdbId || "n/a"} | ${name}`;

    console.log(`\n[${index + 1}/${count}] Processing ${movieIdentity}`);

    rememberedMovies.push({
      // Saved for end-of-run reporting and troubleshooting.
      title: name,
      imdbId,
      tmdbId: movie.tmdbId || null,
    });

    try {
      await client.deleteMovie(movie.id);
      // Give Radarr time to settle delete side-effects before re-adding.
      console.log(`Waiting ${deleteToAddDelaySecondsSafe}s between delete and re-add...`);
      await wait(deleteToAddDelaySecondsSafe * 1000);

      const payload = buildReAddPayload(movie, defaults);
      await client.addMovie(payload);
      console.log("Re-added with search enabled.");
    } catch (error) {
      failures.push({
        title: name,
        imdbId,
        // Store full error text for console summary and file logging.
        error: error instanceof Error ? error.message : String(error),
      });

      console.error(`Failed for ${movieIdentity}: ${error instanceof Error ? error.message : error}`);
    }

    if (index < count - 1) {
      console.log(`Waiting ${delaySeconds}s before next movie...`);
      await wait(delaySeconds * 1000);
    }
  }

  return {
    rememberedMovies,
    failures,
  };
}

module.exports = {
  processMovies,
};
