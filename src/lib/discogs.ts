// Thin client for the parts of the Discogs API this app uses:
// - /database/search      (catalog search, per Filter)
// - /releases/{id}        (aggregate marketplace stats + videos)
// - /oauth/identity        (resolve the token's username)
// - /users/{username}/wants/{id}  (write to the real Discogs wantlist)
//
// Discogs enforces 60 requests/minute per IP for authenticated requests
// (see https://www.discogs.com/developers). `throttle()` below keeps this
// process under that limit with headroom, since the enrichment job can
// otherwise burst through many /releases/{id} calls in a row.

const BASE_URL = "https://api.discogs.com";
const USER_AGENT = "DiscogsDiscovery/0.1 (+personal self-hosted app)";
const MAX_REQUESTS_PER_MINUTE = 50;
const WINDOW_MS = 60_000;

class DiscogsApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "DiscogsApiError";
  }
}

// Module-level state is fine here: this app runs as a single self-hosted
// Node process, not a serverless/multi-instance deployment.
const requestTimestamps: number[] = [];

async function throttle() {
  for (;;) {
    const now = Date.now();
    while (requestTimestamps.length && now - requestTimestamps[0] > WINDOW_MS) {
      requestTimestamps.shift();
    }
    if (requestTimestamps.length < MAX_REQUESTS_PER_MINUTE) {
      requestTimestamps.push(now);
      return;
    }
    const waitMs = WINDOW_MS - (now - requestTimestamps[0]) + 50;
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
}

async function discogsFetch<T>(
  path: string,
  token: string,
  init?: RequestInit,
): Promise<T> {
  await throttle();

  const url = path.startsWith("http") ? path : `${BASE_URL}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      ...init?.headers,
      Authorization: `Discogs token=${token}`,
      "User-Agent": USER_AGENT,
    },
  });

  if (res.status === 429) {
    const retryAfterSec = Number(res.headers.get("Retry-After")) || 60;
    await new Promise((resolve) => setTimeout(resolve, retryAfterSec * 1000));
    return discogsFetch<T>(path, token, init);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new DiscogsApiError(
      `Discogs API ${res.status} on ${path}: ${body}`,
      res.status,
    );
  }

  return res.json() as Promise<T>;
}

export type DiscogsSearchParams = {
  q?: string;
  title?: string;
  releaseTitle?: string;
  artist?: string;
  anv?: string;
  credit?: string;
  label?: string;
  genre?: string;
  style?: string;
  country?: string;
  year?: number;
  format?: string;
  catno?: string;
  barcode?: string;
  track?: string;
  submitter?: string;
  contributor?: string;
  sort?: string;
  sortOrder?: string;
  page?: number;
  perPage?: number;
};

export type DiscogsSearchResult = {
  id: number;
  title: string;
  year?: string;
  genre?: string[];
  style?: string[];
  label?: string[];
  format?: string[];
  country?: string;
  thumb?: string;
  cover_image?: string;
};

export type DiscogsSearchResponse = {
  pagination: { page: number; pages: number; per_page: number; items: number };
  results: DiscogsSearchResult[];
};

// Maps our camelCase params to Discogs' snake_case query params and drops
// anything unset, so a mostly-empty Filter produces a broad search.
export async function searchReleases(
  params: DiscogsSearchParams,
  token: string,
): Promise<DiscogsSearchResponse> {
  const query = new URLSearchParams();
  query.set("type", "release");
  query.set("page", String(params.page ?? 1));
  query.set("per_page", String(params.perPage ?? 50));

  const map: Record<string, string | number | undefined> = {
    q: params.q,
    title: params.title,
    release_title: params.releaseTitle,
    artist: params.artist,
    anv: params.anv,
    credit: params.credit,
    label: params.label,
    genre: params.genre,
    style: params.style,
    country: params.country,
    year: params.year,
    format: params.format,
    catno: params.catno,
    barcode: params.barcode,
    track: params.track,
    submitter: params.submitter,
    contributor: params.contributor,
    sort: params.sort,
    sort_order: params.sortOrder,
  };
  for (const [key, value] of Object.entries(map)) {
    if (value !== undefined && value !== null && value !== "") {
      query.set(key, String(value));
    }
  }

  return discogsFetch<DiscogsSearchResponse>(
    `/database/search?${query.toString()}`,
    token,
  );
}

export type DiscogsVideo = {
  uri: string;
  title: string;
  duration?: number;
};

export type DiscogsRelease = {
  id: number;
  title: string;
  artists?: { name: string }[];
  labels?: { name: string; catno?: string }[];
  year?: number;
  genres?: string[];
  styles?: string[];
  formats?: { name: string; descriptions?: string[] }[];
  thumb?: string;
  videos?: DiscogsVideo[];
  num_for_sale?: number;
  lowest_price?: number | null;
};

export async function getRelease(
  releaseId: number,
  token: string,
): Promise<DiscogsRelease> {
  return discogsFetch<DiscogsRelease>(`/releases/${releaseId}`, token);
}

export async function getIdentity(
  token: string,
): Promise<{ id: number; username: string }> {
  return discogsFetch<{ id: number; username: string }>(
    "/oauth/identity",
    token,
  );
}

export async function addToWantlist(
  username: string,
  releaseId: number,
  token: string,
): Promise<void> {
  await discogsFetch(
    `/users/${encodeURIComponent(username)}/wants/${releaseId}`,
    token,
    { method: "PUT" },
  );
}

// Builds a deep link to Discogs' own marketplace listings for a release,
// pre-filled with the ships-from country, so the seller-location cut (not
// available via the API) can be checked with one click during review.
//
// Only `ships_from` is set here: it's a confirmed, working query param on
// Discogs' marketplace pages. A price-filter param for this specific page
// could not be verified, and guessing one is worse than omitting it — an
// unrecognized param is silently ignored by Discogs, which would make the
// link look filtered by price when it isn't. The aggregate lowest price is
// already shown on the candidate card itself.
export function marketplaceListingsUrl(
  releaseId: number,
  opts?: { shipsFromCountry?: string },
): string {
  const url = new URL(`https://www.discogs.com/sell/release/${releaseId}`);
  if (opts?.shipsFromCountry) {
    url.searchParams.set("ships_from", opts.shipsFromCountry);
  }
  return url.toString();
}

export { DiscogsApiError };
