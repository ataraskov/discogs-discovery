import Link from "next/link";
import { prisma } from "@/lib/db";
import { enrichFilter, refillIfLow } from "@/lib/enrichment";
import { serializeCandidate, WINDOW_PAGE_SIZE, type DiscoveryWindowItem } from "@/lib/candidate";
import { marketplaceListingsUrl, DiscogsApiError } from "@/lib/discogs";
import { DiscoverySession } from "@/components/DiscoverySession";

export default async function DiscoverPage({
  params,
}: {
  params: Promise<{ filterId: string }>;
}) {
  const { filterId } = await params;

  const filter = await prisma.filter.findUnique({ where: { id: filterId } });
  if (!filter) {
    return <p>Feed not found. <Link href="/filters" className="underline">Back to feeds</Link></p>;
  }

  const settings = await prisma.settings.findUnique({ where: { id: 1 } });
  if (!settings?.discogsToken) {
    return (
      <p>
        Add a Discogs token in <Link href="/settings" className="underline">Settings</Link> first.
      </p>
    );
  }

  let rows = await prisma.candidateQueue.findMany({
    where: { filterId },
    orderBy: { fetchedAt: "asc" },
    take: WINDOW_PAGE_SIZE,
  });

  // Empty feed on first visit: do one blocking enrichment pass so there's
  // something to show, instead of an immediate dead end.
  if (rows.length === 0) {
    try {
      await enrichFilter(filter, settings.discogsToken);
    } catch (err) {
      if (err instanceof DiscogsApiError && err.status === 401) {
        return (
          <p>
            Discogs rejected the saved token. Update it in{" "}
            <Link href="/settings" className="underline">
              Settings
            </Link>
            .
          </p>
        );
      }
      return (
        <div className="space-y-2">
          <p>Discogs API request failed while searching for candidates. Try again shortly.</p>
          <Link href="/filters" className="underline text-sm">
            Back to feeds
          </Link>
        </div>
      );
    }
    rows = await prisma.candidateQueue.findMany({
      where: { filterId },
      orderBy: { fetchedAt: "asc" },
      take: WINDOW_PAGE_SIZE,
    });
  } else {
    void refillIfLow(filterId);
  }

  const queueCount = await prisma.candidateQueue.count({ where: { filterId } });

  if (rows.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold">{filter.name}</h1>
        <p>
          No matches found (yet). This can happen with a narrow filter, or if Discogs&apos;
          catalog for this search is small. The background job will keep checking; come
          back in a bit.
        </p>
        <Link href="/filters" className="underline text-sm">
          Back to feeds
        </Link>
      </div>
    );
  }

  const candidates: DiscoveryWindowItem[] = rows.map((row) => ({
    ...serializeCandidate(row),
    listingsUrl: marketplaceListingsUrl(row.releaseId, {
      shipsFromCountry: filter.country ?? undefined,
    }),
  }));

  return (
    <DiscoverySession
      key={filterId}
      filterId={filterId}
      feedName={filter.name}
      initialCandidates={candidates}
      initialQueueCount={queueCount}
    />
  );
}
