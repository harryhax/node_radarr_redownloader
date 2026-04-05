// Trim trailing slashes so URL joins are consistent.
const RADARR_URL = (process.env.RADARR_URL || "http://localhost:7878").replace(/\/+$/, "");
const RADARR_API_KEY = process.env.RADARR_API_KEY;
// Optional fallbacks used only when a movie record is missing these values.
const DEFAULT_QUALITY_PROFILE_ID = Number.parseInt(
  process.env.RADARR_DEFAULT_QUALITY_PROFILE_ID || "",
  10
);
const DEFAULT_ROOT_FOLDER_PATH = process.env.RADARR_DEFAULT_ROOT_FOLDER_PATH || "";

module.exports = {
  RADARR_URL,
  RADARR_API_KEY,
  DEFAULT_QUALITY_PROFILE_ID,
  DEFAULT_ROOT_FOLDER_PATH,
};
