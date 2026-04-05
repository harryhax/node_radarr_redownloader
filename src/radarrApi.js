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

  async request(path, { method = "GET", body, query } = {}) {
    if (!this.apiKey) {
      throw new Error("RADARR_API_KEY is required.");
    }

    const url = new URL(`${this.baseUrl}/api/v3${path}`);

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
    return this.request("/movie");
  }

  async deleteMovie(movieId) {
    return this.request(`/movie/${movieId}`, {
      method: "DELETE",
      query: {
        deleteFiles: true,
      },
    });
  }

  async addMovie(moviePayload) {
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
