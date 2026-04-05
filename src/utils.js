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
  formatBytes,
};
