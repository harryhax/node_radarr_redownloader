class RadarrApiError extends Error {
  constructor(message, status, details) {
    super(message);
    this.name = "RadarrApiError";
    this.status = status;
    this.details = details;
  }
}

class RadarrClient {
  constructor({ baseUrl, apiKey }) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
  }

  // Shared request wrapper for all Radarr endpoints used by this tool.
  async request(path, { method = "GET", body, query } = {}) {
    if (!this.apiKey) {
      throw new Error("RADARR_API_KEY is required.");
    }

    const url = new URL(`${this.baseUrl}/api/v3${path}`);

    // Query params are used by Radarr for options like deleteFiles=true.
    if (query && typeof query === "object") {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== null) {
          url.searchParams.set(key, String(value));
        }
      }
    }

    const response = await fetch(url, {
      method,
      headers: {
        "X-Api-Key": this.apiKey,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    // Radarr responses can be JSON or plain text, so parse defensively.
    const responseText = await response.text();
    let parsedBody = null;

    if (responseText) {
      try {
        parsedBody = JSON.parse(responseText);
      } catch {
        parsedBody = responseText;
      }
    }

    if (!response.ok) {
      // Surface both status and API-provided detail text to make failures actionable.
      const detailText = typeof parsedBody === "string" ? parsedBody : JSON.stringify(parsedBody);
      throw new RadarrApiError(
        `Request failed (${response.status}) ${response.statusText}: ${detailText}`,
        response.status,
        parsedBody
      );
    }

    return parsedBody;
  }

  async getMovies() {
    // Returns full movie records, including ids and metadata needed to re-add.
    return this.request("/movie");
  }

  async getQualityProfiles() {
    // Used to read profile-level minimum custom format score defaults.
    return this.request("/qualityprofile");
  }

  async deleteMovie(movieId) {
    // deleteFiles=true removes files/folders along with the Radarr entry.
    return this.request(`/movie/${movieId}`, {
      method: "DELETE",
      query: {
        deleteFiles: true,
      },
    });
  }

  async addMovie(moviePayload) {
    // addOptions.searchForMovie is supplied by the caller in the payload.
    return this.request("/movie", {
      method: "POST",
      body: moviePayload,
    });
  }
}

module.exports = {
  RadarrApiError,
  RadarrClient,
};
