"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { motion, useMotionValue, useTransform, animate } from "framer-motion";
import type { PanInfo } from "framer-motion";
import type { DiscoveryWindowItem, JudgeResult } from "@/lib/candidate";
import { youTubeVideoId } from "@/lib/candidate";
import { markWanted, markDiscarded, markSkipped } from "@/lib/actions";
import { loadYouTubeIframeApi } from "@/lib/youtubeIframeApi";

const SWIPE_THRESHOLD = 120;
const FLING_DISTANCE = 600;

export function DiscoveryCard({
  candidate,
  queueCount,
  nextThumbUrl,
  feedName,
  initialTrackIndex,
  onReleasePrev,
  onReleaseNext,
  canGoPrevRelease,
  canGoNextRelease,
  autoSkipEmpty,
  onJudged,
}: {
  candidate: DiscoveryWindowItem;
  queueCount: number;
  nextThumbUrl: string | null;
  feedName: string;
  initialTrackIndex: number;
  onReleasePrev: () => void;
  onReleaseNext: () => void;
  canGoPrevRelease: boolean;
  canGoNextRelease: boolean;
  autoSkipEmpty: boolean;
  onJudged: (result: JudgeResult) => void;
}) {
  const wantedFormRef = useRef<HTMLFormElement>(null);
  const discardFormRef = useRef<HTMLFormElement>(null);
  const skipFormRef = useRef<HTMLFormElement>(null);

  const [wantedState, wantedFormAction] = useActionState<JudgeResult | null, FormData>(
    markWanted,
    null,
  );
  const [discardState, discardFormAction] = useActionState<JudgeResult | null, FormData>(
    markDiscarded,
    null,
  );
  const [skipState, skipFormAction] = useActionState<JudgeResult | null, FormData>(
    markSkipped,
    null,
  );
  const handledRef = useRef<{ wanted: unknown; discard: unknown; skip: unknown }>({
    wanted: null,
    discard: null,
    skip: null,
  });

  // One verdict per card at a time. Without this, rapid input (a key held or
  // pressed twice before the first verdict returns) queues several submits
  // for the same candidate: the first succeeds, the rest come back "already
  // reviewed", and since useActionState only surfaces the *last* result,
  // onJudged sees just the error and the card never advances.
  // The ref is the actual guard (it updates synchronously, so two keydowns
  // in the same tick can't both pass); the state only drives the disabled
  // look of the buttons. Released on error so the user can retry (e.g. a
  // rejected wantlist write); on success this card is replaced by the next
  // one (keyed by candidate id), which starts unlocked.
  const judgingRef = useRef(false);
  const [judging, setJudging] = useState(false);

  function guardSubmit(e: React.FormEvent<HTMLFormElement>) {
    if (judgingRef.current) {
      e.preventDefault();
      return;
    }
    judgingRef.current = true;
    setJudging(true);
  }

  function handleResult(result: JudgeResult) {
    if (result.status === "error") {
      judgingRef.current = false;
      setJudging(false);
    }
    onJudged(result);
  }

  useEffect(() => {
    if (wantedState && wantedState !== handledRef.current.wanted) {
      handledRef.current.wanted = wantedState;
      handleResult(wantedState);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantedState, onJudged]);
  useEffect(() => {
    if (discardState && discardState !== handledRef.current.discard) {
      handledRef.current.discard = discardState;
      handleResult(discardState);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [discardState, onJudged]);
  useEffect(() => {
    if (skipState && skipState !== handledRef.current.skip) {
      handledRef.current.skip = skipState;
      handleResult(skipState);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skipState, onJudged]);

  const [trackIndex, setTrackIndex] = useState(initialTrackIndex);

  const x = useMotionValue(0);
  const rotate = useTransform(x, [-300, 300], [-12, 12]);

  const videos = candidate.videos;
  const video = videos[trackIndex] ?? null;
  const videoId = video ? youTubeVideoId(video.uri) : null;

  // Moves within the current release's videos, spilling over into the
  // adjacent release (a non-destructive peek) once the track list is
  // exhausted in that direction. Shared by the arrow keys, chevrons, swipe,
  // and the autoplay "video ended" handler so they all agree on behavior.
  function advance(direction: 1 | -1) {
    const next = trackIndex + direction;
    if (next >= 0 && next < videos.length) {
      setTrackIndex(next);
      return;
    }
    if (direction > 0) {
      if (canGoNextRelease) onReleaseNext();
    } else {
      if (canGoPrevRelease) onReleasePrev();
    }
  }

  const advanceRef = useRef(advance);
  useEffect(() => {
    advanceRef.current = advance;
  });

  // A release with zero videos has nothing to auto-chain from — skip forward
  // past it automatically, same as autoplay reaching the end of a video.
  // `autoSkipEmpty` (false after several consecutive empty releases, see
  // DiscoverySession) prevents this from spinning through a long empty run.
  useEffect(() => {
    if (videos.length === 0 && autoSkipEmpty && canGoNextRelease) {
      advanceRef.current(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "ArrowRight" && e.shiftKey) wantedFormRef.current?.requestSubmit();
      else if (e.key === "ArrowLeft" && e.shiftKey) discardFormRef.current?.requestSubmit();
      else if (e.key === "ArrowRight") advanceRef.current(1);
      else if (e.key === "ArrowLeft") advanceRef.current(-1);
      else if (e.key === "ArrowDown") skipFormRef.current?.requestSubmit();
      else if (e.key === "ArrowUp") window.open(candidate.listingsUrl, "_blank", "noopener");
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [candidate.listingsUrl]);

  function handleDragEnd(_: unknown, info: PanInfo) {
    if (info.offset.x > SWIPE_THRESHOLD) {
      void animate(x, FLING_DISTANCE, { duration: 0.15 }).then(() => {
        x.set(0);
        advanceRef.current(1);
      });
    } else if (info.offset.x < -SWIPE_THRESHOLD) {
      void animate(x, -FLING_DISTANCE, { duration: 0.15 }).then(() => {
        x.set(0);
        advanceRef.current(-1);
      });
    } else {
      void animate(x, 0, { type: "spring", stiffness: 400, damping: 30 });
    }
  }

  // --- YouTube player: wired to the IFrame Player API (not a raw iframe src)
  // so a video ending can trigger autoplay-chaining to the next one.
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<{ loadVideoById(id: string): void; destroy(): void } | null>(null);
  const videoIdRef = useRef(videoId);
  useEffect(() => {
    videoIdRef.current = videoId;
  });
  const lastLoadedVideoIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!videoIdRef.current || !playerContainerRef.current) return;
    let cancelled = false;

    loadYouTubeIframeApi().then((YT) => {
      if (cancelled || !playerContainerRef.current || !videoIdRef.current) return;
      lastLoadedVideoIdRef.current = videoIdRef.current;
      playerRef.current = new YT.Player(playerContainerRef.current, {
        videoId: videoIdRef.current,
        playerVars: { autoplay: 1, playsinline: 1 },
        events: {
          onStateChange: (event) => {
            if (event.data === YT.PlayerState.ENDED) advanceRef.current(1);
          },
        },
      });
    });

    return () => {
      cancelled = true;
      playerRef.current?.destroy();
      playerRef.current = null;
    };
    // Intentionally only on mount: this container is remounted whenever the
    // release changes (key={candidate.id} in the parent), and within-release
    // track changes are handled by loadVideoById below instead of a teardown.
  }, []);

  useEffect(() => {
    if (videoId && playerRef.current && videoId !== lastLoadedVideoIdRef.current) {
      playerRef.current.loadVideoById(videoId);
      lastLoadedVideoIdRef.current = videoId;
    }
  }, [videoId]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-sm text-black/60 dark:text-white/60">
        <span>{feedName}</span>
        <span>{queueCount} remaining</span>
      </div>

      {/* Warms the browser's image cache for the next card so there's no
          flash of a blank thumbnail after this one is judged. */}
      {nextThumbUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={nextThumbUrl} alt="" width={1} height={1} className="sr-only" />
      )}

      <motion.div
        style={{ x, rotate }}
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.9}
        onDragEnd={handleDragEnd}
        className="touch-pan-y select-none rounded-xl border border-black/10 bg-white shadow-sm dark:border-white/10 dark:bg-zinc-900"
      >
        <div className="relative aspect-video w-full overflow-hidden rounded-t-xl bg-black">
          {videoId ? (
            <div ref={playerContainerRef} className="h-full w-full" />
          ) : candidate.thumbUrl ? (
            <div className="relative h-full w-full">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={candidate.thumbUrl}
                alt={candidate.title}
                className="h-full w-full object-contain"
              />
              <div className="absolute inset-x-0 bottom-0 bg-black/60 px-3 py-1 text-center text-xs text-white">
                No video available
              </div>
            </div>
          ) : (
            <div className="flex h-full w-full items-center justify-center text-sm text-white/70">
              No video available
            </div>
          )}

          {videos.length > 1 && (
            <>
              <button
                type="button"
                aria-label="Previous video"
                title="Previous video (←)"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => advance(-1)}
                disabled={trackIndex === 0 && !canGoPrevRelease}
                className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white disabled:opacity-30"
              >
                ‹
              </button>
              <button
                type="button"
                aria-label="Next video"
                title="Next video (→)"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => advance(1)}
                disabled={trackIndex === videos.length - 1 && !canGoNextRelease}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white disabled:opacity-30"
              >
                ›
              </button>
              <div
                className="absolute inset-x-0 bottom-2 flex justify-center gap-1"
                onPointerDown={(e) => e.stopPropagation()}
              >
                {videos.map((v, i) => (
                  <button
                    key={v.uri + i}
                    type="button"
                    aria-label={`Video ${i + 1}: ${v.title}`}
                    title={v.title}
                    onClick={() => setTrackIndex(i)}
                    className={`h-1.5 w-1.5 rounded-full ${
                      i === trackIndex ? "bg-white" : "bg-white/40"
                    }`}
                  />
                ))}
              </div>
            </>
          )}
        </div>

        <div className="space-y-2 p-4">
          <div>
            <h2 className="text-lg font-semibold leading-tight">{candidate.title}</h2>
            {candidate.artist && (
              <p className="text-black/70 dark:text-white/70">{candidate.artist}</p>
            )}
          </div>

          <p className="text-sm text-black/60 dark:text-white/60">
            {[candidate.year, candidate.label, candidate.format].filter(Boolean).join(" · ")}
          </p>

          {(candidate.genres.length > 0 || candidate.styles.length > 0) && (
            <div className="flex flex-wrap gap-1">
              {[...candidate.genres, ...candidate.styles].map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-black/5 px-2 py-0.5 text-xs dark:bg-white/10"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          <p className="text-sm">
            {candidate.numForSale ? `${candidate.numForSale} for sale` : "None for sale"}
            {candidate.lowestPrice != null && ` · from ${candidate.lowestPrice}`}
          </p>
        </div>
      </motion.div>

      <div className="grid grid-cols-4 gap-2">
        <form ref={discardFormRef} action={discardFormAction} onSubmit={guardSubmit}>
          <input type="hidden" name="candidateId" value={candidate.id} />
          <input type="hidden" name="filterId" value={candidate.filterId} />
          <button
            type="submit"
            disabled={judging}
            className="w-full rounded border border-black/20 py-2 text-sm dark:border-white/20 disabled:opacity-50"
            title="Discard (⇧←)"
          >
            Discard
          </button>
        </form>

        <form ref={skipFormRef} action={skipFormAction} onSubmit={guardSubmit}>
          <input type="hidden" name="candidateId" value={candidate.id} />
          <input type="hidden" name="filterId" value={candidate.filterId} />
          <button
            type="submit"
            disabled={judging}
            className="w-full rounded border border-black/20 py-2 text-sm dark:border-white/20 disabled:opacity-50"
            title="Skip for later (↓)"
          >
            Skip
          </button>
        </form>

        <a
          href={candidate.listingsUrl}
          target="_blank"
          rel="noopener noreferrer"
          title="Check listings on Discogs (↑)"
          className="flex w-full items-center justify-center rounded border border-black/20 py-2 text-center text-sm dark:border-white/20"
        >
          Listings
        </a>

        <form ref={wantedFormRef} action={wantedFormAction} onSubmit={guardSubmit}>
          <input type="hidden" name="candidateId" value={candidate.id} />
          <input type="hidden" name="filterId" value={candidate.filterId} />
          <button
            type="submit"
            disabled={judging}
            className="w-full rounded bg-black py-2 text-sm text-white dark:bg-white dark:text-black disabled:opacity-50"
            title="Add to wantlist (⇧→)"
          >
            Wantlist
          </button>
        </form>
      </div>

      <p className="text-center text-xs text-black/40 dark:text-white/40">
        Drag, or use ⇧← discard · ↓ skip · ↑ listings · ⇧→ wantlist · ←/→ browse videos
      </p>
    </div>
  );
}
