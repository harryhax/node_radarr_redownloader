const { wait } = require("./utils");

function buildReAddPayload(movie, defaults) {
  // Radarr add payload with search enabled to immediately trigger a download.
  const tmdbId = movie.tmdbId;
  if (!tmdbId) {
    throw new Error(`Cannot re-add '${movie.title}': missing tmdbId.`);
  }

  const qualityProfileId =
    movie.qualityProfileId ||
    (Number.isInteger(defaults.defaultQualityProfileId) ? defaults.defaultQualityProfileId : null);

  const rootFolderPath = movie.rootFolderPath || defaults.defaultRootFolderPath || null;

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

async function processMovies(client, movies, { count, delaySeconds, defaults }) {
  const rememberedMovies = [];
  const failures = [];

  // Process one movie at a time to avoid overloading Radarr.
  for (let index = 0; index < count; index += 1) {
    const movie = movies[index];
    const name = movie.title || "Unknown title";
    const imdbId = movie.imdbId || null;

    console.log(`\n[${index + 1}/${count}] Processing ${name}${imdbId ? ` (${imdbId})` : ""}`);

    rememberedMovies.push({
      // Saved for end-of-run reporting and troubleshooting.
      title: name,
      imdbId,
      tmdbId: movie.tmdbId || null,
    });

    try {
      await client.deleteMovie(movie.id);
      // Give Radarr a brief moment to settle delete side-effects before re-adding.
      await wait(1500);

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

      console.error(`Failed for ${name}: ${error instanceof Error ? error.message : error}`);
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
