import { prisma } from "@/lib/db";
import { getRelease, searchReleases, DiscogsApiError } from "@/lib/discogs";
import { Prisma, type Filter } from "@/generated/prisma/client";

const PER_PAGE = 50;
// Stop a single enrichment run once it has queued this many new candidates
// for a filter, so one run can't monopolize the whole rate-limit budget.
const MAX_NEW_CANDIDATES_PER_RUN = 20;
// Below this many un-reviewed queued candidates, a filter is considered
// "running low" and worth refilling.
const LOW_WATERMARK = 10;

// CandidateQueue rows are removed once reviewed (see review actions), so a
// plain count of queued rows for the filter already reflects "unreviewed".
async function queueDepth(filterId: string): Promise<number> {
  return prisma.candidateQueue.count({ where: { filterId } });
}

function parseYear(year: string | number | undefined): number | undefined {
  if (year === undefined) return undefined;
  const n = typeof year === "number" ? year : parseInt(year, 10);
  return Number.isFinite(n) ? n : undefined;
}

// In-flight enrichment runs, keyed by filter id. Refills are triggered from
// many places at once (every judge action, the client's load-more, page
// renders, the background interval), and a single run can take many seconds
// under the Discogs throttle. Without this, overlapping runs for the same
// filter read the same `nextSearchPage`, both pass the "already queued"
// check for the same release, and the second insert fails on the
// (filterId, releaseId) unique constraint. Module-level state is fine: this
// app runs as a single Node process (see discogs.ts).
const inFlight = new Map<string, Promise<number>>();

// Concurrent callers for the same filter share the run already in progress
// instead of starting a second one.
export function enrichFilter(filter: Filter, token: string): Promise<number> {
  const existing = inFlight.get(filter.id);
  if (existing) return existing;

  const run = runEnrichFilter(filter.id, token).finally(() => {
    inFlight.delete(filter.id);
  });
  inFlight.set(filter.id, run);
  return run;
}

async function runEnrichFilter(filterId: string, token: string): Promise<number> {
  // Re-read inside the lock so the pagination cursor reflects the previous
  // run's final update, not a snapshot the caller loaded earlier.
  const filter = await prisma.filter.findUnique({ where: { id: filterId } });
  if (!filter) return 0;

  let added = 0;
  let page = filter.nextSearchPage || 1;
  let totalPages = page;

  // Bound the number of search pages walked per run too, independent of
  // how many candidates passed enrichment, so a filter that matches almost
  // nothing (e.g. a very narrow year+price combo) can't spin forever.
  const MAX_PAGES_PER_RUN = 5;

  for (let pagesWalked = 0; pagesWalked < MAX_PAGES_PER_RUN && added < MAX_NEW_CANDIDATES_PER_RUN; pagesWalked++) {
    const response = await searchReleases(
      {
        q: filter.q ?? undefined,
        title: filter.title ?? undefined,
        releaseTitle: filter.releaseTitle ?? undefined,
        artist: filter.artist ?? undefined,
        anv: filter.anv ?? undefined,
        credit: filter.credit ?? undefined,
        label: filter.label ?? undefined,
        genre: filter.genre ?? undefined,
        style: filter.style ?? undefined,
        country: filter.country ?? undefined,
        format: filter.format ?? undefined,
        catno: filter.catno ?? undefined,
        barcode: filter.barcode ?? undefined,
        track: filter.track ?? undefined,
        submitter: filter.submitter ?? undefined,
        contributor: filter.contributor ?? undefined,
        sort: filter.sort ?? undefined,
        sortOrder: filter.sortOrder ?? undefined,
        page,
        perPage: PER_PAGE,
      },
      token,
    );

    totalPages = response.pagination.pages || 1;

    for (const result of response.results) {
      if (added >= MAX_NEW_CANDIDATES_PER_RUN) break;

      // `year` on /database/search is a single exact-match query param, not
      // a range, so the from/to bounds are applied client-side here against
      // each result's own year.
      const year = parseYear(result.year);
      if (filter.yearFrom !== null && (year === undefined || year < filter.yearFrom)) continue;
      if (filter.yearTo !== null && (year === undefined || year > filter.yearTo)) continue;

      const alreadyReviewed = await prisma.reviewed.findUnique({
        where: { releaseId: result.id },
      });
      if (alreadyReviewed) continue;

      const alreadyQueued = await prisma.candidateQueue.findUnique({
        where: { filterId_releaseId: { filterId: filter.id, releaseId: result.id } },
      });
      if (alreadyQueued) continue;

      let release;
      try {
        release = await getRelease(result.id, token);
      } catch (err) {
        // A single bad/removed release shouldn't abort the whole run.
        if (err instanceof DiscogsApiError) continue;
        throw err;
      }

      if (filter.minForSale !== null) {
        if (!release.num_for_sale || release.num_for_sale < filter.minForSale) continue;
      }
      if (filter.maxLowestPrice !== null) {
        if (release.lowest_price == null || release.lowest_price > filter.maxLowestPrice) continue;
      }

      try {
        await prisma.candidateQueue.create({
          data: {
            filterId: filter.id,
            releaseId: release.id,
            title: release.title,
            artist: release.artists?.map((a) => a.name).join(", "),
            year: release.year,
            label: release.labels?.map((l) => l.name).join(", "),
            format: release.formats
              ?.map((f) => [f.name, ...(f.descriptions ?? [])].join(" "))
              .join(", "),
            genresJson: JSON.stringify(release.genres ?? []),
            stylesJson: JSON.stringify(release.styles ?? []),
            thumbUrl: release.thumb || null,
            videosJson: JSON.stringify(
              (release.videos ?? []).map((v) => ({
                uri: v.uri,
                title: v.title,
                duration: v.duration,
              })),
            ),
            numForSale: release.num_for_sale ?? null,
            lowestPrice: release.lowest_price ?? null,
          },
        });
      } catch (err) {
        // Defensive backstop for the race the in-flight map prevents in
        // practice (e.g. dev-mode HMR loading two copies of this module):
        // a duplicate just means another run queued it first.
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") continue;
        throw err;
      }
      added++;
    }

    page = page >= totalPages ? 1 : page + 1;
  }

  await prisma.filter.update({
    where: { id: filter.id },
    data: { nextSearchPage: page },
  });

  return added;
}

// Refills a single filter's queue if it's running low. Intended to be
// called (without awaiting, "fire and forget") right before the Discovery
// screen renders, so browsing itself keeps the queue topped up.
export async function refillIfLow(filterId: string): Promise<void> {
  const settings = await prisma.settings.findUnique({ where: { id: 1 } });
  if (!settings?.discogsToken) return;

  const depth = await queueDepth(filterId);
  if (depth >= LOW_WATERMARK) return;

  const filter = await prisma.filter.findUnique({ where: { id: filterId } });
  if (!filter) return;

  // Best-effort: callers invoke this without awaiting ("fire and forget"),
  // so an error here must not become an unhandled promise rejection.
  try {
    await enrichFilter(filter, settings.discogsToken);
  } catch (err) {
    console.error(`Background refill failed for filter ${filter.name}:`, err);
  }
}

// Walks every saved filter once. Intended to be run on an interval from
// instrumentation.ts, as the "runs proactively every few minutes" path —
// independent of whether anyone currently has the Discovery screen open.
export async function enrichAllFilters(): Promise<void> {
  const settings = await prisma.settings.findUnique({ where: { id: 1 } });
  if (!settings?.discogsToken) return;

  const filters = await prisma.filter.findMany();
  for (const filter of filters) {
    const depth = await queueDepth(filter.id);
    if (depth >= LOW_WATERMARK) continue;
    try {
      await enrichFilter(filter, settings.discogsToken);
    } catch (err) {
      console.error(`Enrichment failed for filter ${filter.name}:`, err);
    }
  }
}
