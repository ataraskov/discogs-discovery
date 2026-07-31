"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { DiscoveryCard } from "./DiscoveryCard";
import { loadMoreCandidates } from "@/lib/actions";
import type { DiscoveryWindowItem, JudgeResult } from "@/lib/candidate";

// Once fewer than this many loaded candidates remain ahead of the current
// view, top up the window in the background so the user rarely hits the
// blocking "load more" path in ensureIndex below.
const LOAD_MORE_THRESHOLD = 3;

// Caps autoplay-chaining's automatic skip-past-empty-release behavior so a
// long run of video-less releases can't spin through load-more indefinitely.
// Manual navigation (arrows/chevrons/buttons) is never subject to this cap.
const MAX_CONSECUTIVE_EMPTY_AUTO_SKIP = 5;

function consecutiveEmptyStreak(candidates: DiscoveryWindowItem[], viewIndex: number): number {
  let streak = 0;
  for (let i = viewIndex; i >= 0 && candidates[i].videos.length === 0; i--) streak++;
  return streak;
}

type SessionState = {
  candidates: DiscoveryWindowItem[];
  viewIndex: number;
  // Which end of the newly-shown release's video list DiscoveryCard should
  // start on: "first" after moving forward, "last" after moving backward
  // across a release boundary (symmetrical with how the boundary was
  // crossed).
  entryPoint: "first" | "last";
};

export function DiscoverySession({
  filterId,
  feedName,
  initialCandidates,
  initialQueueCount,
}: {
  filterId: string;
  feedName: string;
  initialCandidates: DiscoveryWindowItem[];
  initialQueueCount: number;
}) {
  const [session, setSession] = useState<SessionState>({
    candidates: initialCandidates,
    viewIndex: 0,
    entryPoint: "first",
  });
  const [queueCount, setQueueCount] = useState(initialQueueCount);
  const [exhausted, setExhausted] = useState(initialCandidates.length === 0);
  const [judgeError, setJudgeError] = useState<string | null>(null);
  const inFlightRef = useRef(false);

  const sessionRef = useRef(session);
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  // Resolves a desired index into the (possibly not-yet-fully-loaded) window:
  // in range -> no-op; before the start -> clamp to 0; past the end -> fetch
  // the next page from the server, append de-duplicated results, and clamp.
  const ensureIndex = useCallback(
    async (targetIndex: number, currentCandidates: DiscoveryWindowItem[]) => {
      if (targetIndex >= 0 && targetIndex < currentCandidates.length) {
        return { candidates: currentCandidates, clampedIndex: targetIndex };
      }
      if (targetIndex < 0) {
        return { candidates: currentCandidates, clampedIndex: 0 };
      }
      if (inFlightRef.current) {
        return {
          candidates: currentCandidates,
          clampedIndex: Math.max(0, currentCandidates.length - 1),
        };
      }
      inFlightRef.current = true;
      try {
        const excludeIds = currentCandidates.map((c) => c.id);
        const result = await loadMoreCandidates(filterId, excludeIds);
        setQueueCount(result.queueCount);
        if (result.candidates.length === 0) {
          setExhausted(true);
          return {
            candidates: currentCandidates,
            clampedIndex: Math.max(0, currentCandidates.length - 1),
          };
        }
        const existingIds = new Set(currentCandidates.map((c) => c.id));
        const fresh = result.candidates.filter((c) => !existingIds.has(c.id));
        const merged = [...currentCandidates, ...fresh];
        return { candidates: merged, clampedIndex: Math.min(targetIndex, merged.length - 1) };
      } finally {
        inFlightRef.current = false;
      }
    },
    [filterId],
  );

  const goRelease = useCallback(
    async (delta: 1 | -1) => {
      const current = sessionRef.current;
      const targetIndex = current.viewIndex + delta;
      const { candidates, clampedIndex } = await ensureIndex(targetIndex, current.candidates);
      setSession({ candidates, viewIndex: clampedIndex, entryPoint: delta > 0 ? "first" : "last" });
    },
    [ensureIndex],
  );

  const onJudged = useCallback(
    (result: JudgeResult) => {
      if (result.status === "error") {
        setJudgeError(result.message);
        return;
      }
      setJudgeError(null);
      if (result.verdict !== "SKIPPED") {
        setQueueCount((n) => Math.max(0, n - 1));
      }
      const current = sessionRef.current;
      const idx = current.candidates.findIndex((c) => c.id === result.candidateId);
      if (idx === -1) return;
      const spliced = current.candidates.slice();
      spliced.splice(idx, 1);
      // The item that followed now occupies this same index — unless the
      // judged item was the last one loaded, in which case this funnels
      // through the same load-more path as goRelease.
      void ensureIndex(idx, spliced).then(({ candidates, clampedIndex }) => {
        setSession({ candidates, viewIndex: clampedIndex, entryPoint: "first" });
      });
    },
    [ensureIndex],
  );

  // Background top-up: keep a few releases ahead loaded so goRelease/onJudged
  // rarely need to block on a network round trip themselves.
  useEffect(() => {
    if (exhausted || inFlightRef.current) return;
    const remaining = session.candidates.length - session.viewIndex;
    if (remaining > LOAD_MORE_THRESHOLD) return;

    inFlightRef.current = true;
    const excludeIds = session.candidates.map((c) => c.id);
    loadMoreCandidates(filterId, excludeIds)
      .then((result) => {
        setQueueCount(result.queueCount);
        if (result.candidates.length === 0) {
          setExhausted(true);
          return;
        }
        setSession((prev) => {
          const existingIds = new Set(prev.candidates.map((c) => c.id));
          const fresh = result.candidates.filter((c) => !existingIds.has(c.id));
          return fresh.length > 0 ? { ...prev, candidates: [...prev.candidates, ...fresh] } : prev;
        });
      })
      .finally(() => {
        inFlightRef.current = false;
      });
    // Re-runs whenever the window shrinks/grows or the view moves; the
    // in-flight guard keeps this from overlapping with itself or with
    // goRelease/onJudged's own load-more calls.
  }, [session.candidates, session.viewIndex, exhausted, filterId]);

  const current = session.candidates[session.viewIndex];
  const canGoPrevRelease = session.viewIndex > 0;
  const canGoNextRelease = !(exhausted && session.viewIndex >= session.candidates.length - 1);
  const autoSkipEmpty =
    consecutiveEmptyStreak(session.candidates, session.viewIndex) < MAX_CONSECUTIVE_EMPTY_AUTO_SKIP;

  if (!current) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold">{feedName}</h1>
        <p>You&apos;ve reviewed everything currently queued. Check back once more has been found.</p>
        <Link href="/filters" className="underline text-sm">
          Back to feeds
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {judgeError && (
        <p className="rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
          {judgeError}
        </p>
      )}

      {/* Warm the image cache a couple releases further ahead than the
          single "next" thumbnail DiscoveryCard already prefetches, so
          peeking forward doesn't flash a blank thumbnail either. */}
      {[session.viewIndex + 2, session.viewIndex + 3].map((i) => {
        const thumbUrl = session.candidates[i]?.thumbUrl;
        return thumbUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={i} src={thumbUrl} alt="" width={1} height={1} className="sr-only" />
        ) : null;
      })}

      <DiscoveryCard
        key={current.id}
        candidate={current}
        queueCount={queueCount}
        nextThumbUrl={session.candidates[session.viewIndex + 1]?.thumbUrl ?? null}
        feedName={feedName}
        initialTrackIndex={
          session.entryPoint === "last" ? Math.max(0, current.videos.length - 1) : 0
        }
        onReleasePrev={() => void goRelease(-1)}
        onReleaseNext={() => void goRelease(1)}
        canGoPrevRelease={canGoPrevRelease}
        canGoNextRelease={canGoNextRelease}
        autoSkipEmpty={autoSkipEmpty}
        onJudged={onJudged}
      />
    </div>
  );
}
