"use server";

import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { addToWantlist, getIdentity, marketplaceListingsUrl, DiscogsApiError } from "@/lib/discogs";
import { refillIfLow } from "@/lib/enrichment";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  serializeCandidate,
  WINDOW_PAGE_SIZE,
  type JudgeResult,
  type LoadMoreResult,
} from "@/lib/candidate";

async function requireSettings() {
  const settings = await prisma.settings.findUnique({ where: { id: 1 } });
  if (!settings?.discogsToken) {
    throw new Error("No Discogs token configured");
  }
  return settings as typeof settings & { discogsToken: string };
}

// --- Settings ---------------------------------------------------------

export type TokenActionState = {
  status: "idle" | "success" | "error";
  message?: string;
};

// Also doubles as a "test connection" action: with the token field left
// blank (allowed once a token is already saved, since the input only shows
// a *** placeholder rather than the real value), it re-verifies the stored
// token against Discogs without changing it.
export async function saveToken(
  _prevState: TokenActionState,
  formData: FormData,
): Promise<TokenActionState> {
  const token = String(formData.get("token") ?? "").trim();

  const existing = await prisma.settings.findUnique({ where: { id: 1 } });
  const effectiveToken = token || existing?.discogsToken;
  if (!effectiveToken) {
    return { status: "error", message: "Token is required" };
  }

  let identity;
  try {
    identity = await getIdentity(effectiveToken);
  } catch (err) {
    if (err instanceof DiscogsApiError && err.status === 401) {
      return {
        status: "error",
        message: "Discogs rejected this token — check it and try again",
      };
    }
    return {
      status: "error",
      message: err instanceof Error ? err.message : "Could not reach Discogs",
    };
  }

  await prisma.settings.upsert({
    where: { id: 1 },
    create: { id: 1, discogsToken: effectiveToken, discogsUsername: identity.username },
    update: { discogsToken: effectiveToken, discogsUsername: identity.username },
  });

  revalidatePath("/settings");
  revalidatePath("/");
  return { status: "success", message: `Connected as ${identity.username}` };
}

// --- Filters ------------------------------------------------------------

const SEARCH_FIELDS = [
  "q",
  "title",
  "releaseTitle",
  "artist",
  "anv",
  "credit",
  "label",
  "genre",
  "style",
  "country",
  "format",
  "catno",
  "barcode",
  "track",
  "submitter",
  "contributor",
  "sort",
  "sortOrder",
] as const;

function str(formData: FormData, key: string): string | null {
  const v = formData.get(key);
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed === "" ? null : trimmed;
}

function num(formData: FormData, key: string): number | null {
  const v = str(formData, key);
  if (v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export type CreateFilterState = { error: string } | null;

export async function createFilter(
  _prevState: CreateFilterState,
  formData: FormData,
): Promise<CreateFilterState> {
  const name = str(formData, "name");
  if (!name) return { error: "Name is required" };

  const data: Record<string, string | number | null> = {};
  for (const field of SEARCH_FIELDS) data[field] = str(formData, field);
  data.yearFrom = num(formData, "yearFrom");
  data.yearTo = num(formData, "yearTo");
  data.maxLowestPrice = num(formData, "maxLowestPrice");
  data.minForSale = num(formData, "minForSale");

  try {
    await prisma.filter.create({ data: { name, ...data } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { error: `A feed named "${name}" already exists` };
    }
    throw err;
  }
  revalidatePath("/");
  revalidatePath("/filters");
  redirect("/filters");
}

export async function deleteFilter(formData: FormData) {
  const id = String(formData.get("id"));
  await prisma.filter.delete({ where: { id } });
  revalidatePath("/");
  revalidatePath("/filters");
  redirect("/filters");
}

// --- Review actions -------------------------------------------------

async function removeFromAllQueues(releaseId: number) {
  await prisma.candidateQueue.deleteMany({ where: { releaseId } });
}

// Judge actions used to redirect(`/discover/${filterId}`) to advance to the
// next candidate — that was the entire "advance" mechanism when the page
// only ever showed the queue head. Now the Discovery screen holds a
// client-side peek window (see DiscoverySession) and advances optimistically
// on the client, so these return a JudgeResult instead of redirecting;
// revalidatePath below is only for *other* navigations to this route (a hard
// refresh, a second tab), not for driving the current tab's UI.

export async function markWanted(
  _prevState: JudgeResult | null,
  formData: FormData,
): Promise<JudgeResult> {
  const candidateId = String(formData.get("candidateId"));
  const filterId = String(formData.get("filterId"));

  const candidate = await prisma.candidateQueue.findUnique({ where: { id: candidateId } });
  if (!candidate) {
    return { status: "error", message: "This item was already reviewed elsewhere." };
  }

  const settings = await requireSettings();
  if (!settings.discogsUsername) {
    throw new Error("No Discogs username resolved for this token — re-save it in Settings");
  }
  try {
    await addToWantlist(settings.discogsUsername, candidate.releaseId, settings.discogsToken);
  } catch (err) {
    return {
      status: "error",
      message:
        err instanceof DiscogsApiError
          ? `Discogs rejected the wantlist request (${err.status})`
          : "Could not reach Discogs",
    };
  }

  await prisma.reviewed.upsert({
    where: { releaseId: candidate.releaseId },
    create: {
      releaseId: candidate.releaseId,
      status: "WANTED",
      filterId,
      title: candidate.title,
      artist: candidate.artist,
      thumbUrl: candidate.thumbUrl,
    },
    update: { status: "WANTED", filterId, reviewedAt: new Date() },
  });
  await removeFromAllQueues(candidate.releaseId);
  void refillIfLow(filterId);
  revalidatePath(`/discover/${filterId}`);
  return { status: "ok", candidateId, releaseId: candidate.releaseId, verdict: "WANTED" };
}

export async function markDiscarded(
  _prevState: JudgeResult | null,
  formData: FormData,
): Promise<JudgeResult> {
  const candidateId = String(formData.get("candidateId"));
  const filterId = String(formData.get("filterId"));

  const candidate = await prisma.candidateQueue.findUnique({ where: { id: candidateId } });
  if (!candidate) {
    return { status: "error", message: "This item was already reviewed elsewhere." };
  }

  await prisma.reviewed.upsert({
    where: { releaseId: candidate.releaseId },
    create: {
      releaseId: candidate.releaseId,
      status: "DISCARDED",
      filterId,
      title: candidate.title,
      artist: candidate.artist,
      thumbUrl: candidate.thumbUrl,
    },
    update: { status: "DISCARDED", filterId, reviewedAt: new Date() },
  });
  await removeFromAllQueues(candidate.releaseId);
  void refillIfLow(filterId);
  revalidatePath(`/discover/${filterId}`);
  return { status: "ok", candidateId, releaseId: candidate.releaseId, verdict: "DISCARDED" };
}

// Skip does NOT permanently exclude the release: it's recorded in Reviewed
// (status SKIPPED) purely so Review History can list it, but the Discovery
// query only treats WANTED/DISCARDED as "never show again". The candidate
// stays in its queue with a bumped `fetchedAt` so it resurfaces after
// everything else already queued has been seen.
export async function markSkipped(
  _prevState: JudgeResult | null,
  formData: FormData,
): Promise<JudgeResult> {
  const candidateId = String(formData.get("candidateId"));
  const filterId = String(formData.get("filterId"));

  const candidate = await prisma.candidateQueue.findUnique({ where: { id: candidateId } });
  if (!candidate) {
    return { status: "error", message: "This item was already reviewed elsewhere." };
  }

  await prisma.reviewed.upsert({
    where: { releaseId: candidate.releaseId },
    create: {
      releaseId: candidate.releaseId,
      status: "SKIPPED",
      filterId,
      title: candidate.title,
      artist: candidate.artist,
      thumbUrl: candidate.thumbUrl,
    },
    update: { status: "SKIPPED", filterId, reviewedAt: new Date() },
  });
  await prisma.candidateQueue.update({
    where: { id: candidateId },
    data: { fetchedAt: new Date() },
  });
  void refillIfLow(filterId);
  revalidatePath(`/discover/${filterId}`);
  return { status: "ok", candidateId, releaseId: candidate.releaseId, verdict: "SKIPPED" };
}

// Powers the Discovery screen's non-destructive "peek ahead" navigation:
// fetches the next page of not-yet-loaded candidates for a filter so the
// client can extend its local browsing window without recording any verdict.
export async function loadMoreCandidates(
  filterId: string,
  excludeIds: string[],
  take: number = WINDOW_PAGE_SIZE,
): Promise<LoadMoreResult> {
  const filter = await prisma.filter.findUnique({ where: { id: filterId } });
  if (!filter) return { candidates: [], queueCount: 0 };

  const rows = await prisma.candidateQueue.findMany({
    where: { filterId, id: { notIn: excludeIds } },
    orderBy: { fetchedAt: "asc" },
    take,
  });
  const queueCount = await prisma.candidateQueue.count({ where: { filterId } });
  void refillIfLow(filterId);

  return {
    candidates: rows.map((row) => ({
      ...serializeCandidate(row),
      listingsUrl: marketplaceListingsUrl(row.releaseId, {
        shipsFromCountry: filter.country ?? undefined,
      }),
    })),
    queueCount,
  };
}

export async function undoDiscard(formData: FormData) {
  const releaseId = Number(formData.get("releaseId"));
  await prisma.reviewed.delete({ where: { releaseId } }).catch(() => {});
  redirect("/history");
}
