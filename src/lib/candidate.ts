import type { CandidateQueue } from "@/generated/prisma/client";

export type DiscoveryVideo = { uri: string; title: string; duration?: number };

export type DiscoveryCandidate = {
  id: string;
  filterId: string;
  releaseId: number;
  title: string;
  artist: string | null;
  year: number | null;
  label: string | null;
  format: string | null;
  genres: string[];
  styles: string[];
  thumbUrl: string | null;
  videos: DiscoveryVideo[];
  numForSale: number | null;
  lowestPrice: number | null;
};

export function serializeCandidate(row: CandidateQueue): DiscoveryCandidate {
  return {
    id: row.id,
    filterId: row.filterId,
    releaseId: row.releaseId,
    title: row.title,
    artist: row.artist,
    year: row.year,
    label: row.label,
    format: row.format,
    genres: JSON.parse(row.genresJson),
    styles: JSON.parse(row.stylesJson),
    thumbUrl: row.thumbUrl,
    videos: JSON.parse(row.videosJson),
    numForSale: row.numForSale,
    lowestPrice: row.lowestPrice,
  };
}

// A single "window" fetch/load-more page size, shared by the initial page
// load and the client's load-more calls so both stay in sync.
export const WINDOW_PAGE_SIZE = 15;

export type DiscoveryWindowItem = DiscoveryCandidate & { listingsUrl: string };

export type JudgeVerdict = "WANTED" | "DISCARDED" | "SKIPPED";

export type JudgeResult =
  | { status: "ok"; candidateId: string; releaseId: number; verdict: JudgeVerdict }
  | { status: "error"; message: string };

export type LoadMoreResult = { candidates: DiscoveryWindowItem[]; queueCount: number };

export function youTubeVideoId(uri: string): string | null {
  try {
    const url = new URL(uri);
    if (url.hostname.includes("youtu.be")) return url.pathname.slice(1) || null;
    return url.searchParams.get("v");
  } catch {
    return null;
  }
}
