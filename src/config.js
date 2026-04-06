// Trim trailing slashes so URL joins are consistent.
const RADARR_URL = (process.env.RADARR_URL || "http://localhost:7878").replace(/\/+$/, "");
// Required for all authenticated Radarr API requests.
const RADARR_API_KEY = process.env.RADARR_API_KEY;
// Optional fallbacks used only when a movie record is missing these values.
const DEFAULT_QUALITY_PROFILE_ID = Number.parseInt(
  process.env.RADARR_DEFAULT_QUALITY_PROFILE_ID || "",
  10
);
const DEFAULT_ROOT_FOLDER_PATH = process.env.RADARR_DEFAULT_ROOT_FOLDER_PATH || "";
const RAW_DELETE_TO_ADD_DELAY_SECONDS = Number.parseInt(
  process.env.RADARR_DELETE_TO_ADD_DELAY_SECONDS || "",
  10
);
// Keep delete/re-add pacing conservative to avoid Radarr race conditions.
const DELETE_TO_ADD_DELAY_SECONDS = Number.isInteger(RAW_DELETE_TO_ADD_DELAY_SECONDS)
  ? Math.max(2, RAW_DELETE_TO_ADD_DELAY_SECONDS)
  : 2;

module.exports = {
  RADARR_URL,
  RADARR_API_KEY,
  DEFAULT_QUALITY_PROFILE_ID,
  DEFAULT_ROOT_FOLDER_PATH,
  DELETE_TO_ADD_DELAY_SECONDS,
};
