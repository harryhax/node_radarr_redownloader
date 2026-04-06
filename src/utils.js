function wait(ms) {
  // Small async delay helper used to pace Radarr operations.
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getMovieSize(movie) {
  // Prefer sizeOnDisk, then fallback to movieFile.size when available.
  const raw = movie?.sizeOnDisk ?? movie?.movieFile?.size ?? 0;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isMovieBelowQualityCutoff(movie) {
  // Radarr sets this when the existing file does not meet current quality cutoff rules.
  const cutoffNotMet = movie?.movieFile?.qualityCutoffNotMet ?? movie?.qualityCutoffNotMet;
  return cutoffNotMet === true;
}

function getMovieCustomFormatScore(movie) {
  const scoreRaw = movie?.movieFile?.customFormatScore ?? movie?.customFormatScore;
  const score = Number(scoreRaw);
  return Number.isFinite(score) ? score : 0;
}

function movieUsesCustomFormat(movie) {
  // Prefer score when available; otherwise fallback to custom format array length.
  const score = getMovieCustomFormatScore(movie);
  if (score > 0) {
    return score > 0;
  }

  const movieFileCustomFormats = Array.isArray(movie?.movieFile?.customFormats)
    ? movie.movieFile.customFormats
    : null;
  if (movieFileCustomFormats) {
    return movieFileCustomFormats.length > 0;
  }

  const movieCustomFormats = Array.isArray(movie?.customFormats) ? movie.customFormats : null;
  if (movieCustomFormats) {
    return movieCustomFormats.length > 0;
  }

  return false;
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }

  // Human-readable binary units for console output.
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${value.toFixed(value >= 10 || exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

module.exports = {
  wait,
  getMovieSize,
  isMovieBelowQualityCutoff,
  getMovieCustomFormatScore,
  movieUsesCustomFormat,
  formatBytes,
};
