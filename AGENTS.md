# This is NOT the Next.js you know

This version (Next.js 16) has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

# Discogs Discovery

Single-user, self-hosted app: saved search "feeds" over the Discogs catalog, reviewed one release at a time with its YouTube videos autoplaying; verdicts are Wanted (writes to the real Discogs wantlist), Discarded, or Skipped. See `README.md` for user-facing setup.

## Stack

- Next.js 16 App Router + React 19, Server Components + Server Actions (no API routes)
- Tailwind CSS v4 (`@tailwindcss/postcss`), framer-motion for swipe gestures
- Prisma 7 + SQLite via `@prisma/adapter-better-sqlite3` (driver adapter is mandatory in Prisma 7; use the `prisma-*` skills, esp. `prisma-upgrade-v7`, before touching Prisma setup)
- Generated client lives in `src/generated/prisma` (gitignored) — import from `@/generated/prisma/client`, not `@prisma/client`
- Path alias `@/*` → `src/*`

## Commands

```bash
npm run dev                 # dev server on :3000
npx prisma migrate dev      # apply/create migrations + regenerate client (dev DB: file:./dev.db)
npx prisma generate         # regenerate client after schema changes
npx tsc --noEmit            # typecheck
npm run lint                # eslint
docker compose up --build -d  # self-hosted; runs `prisma migrate deploy` on start, DB in ./data
```

There is no test suite; verify with typecheck + lint, and run the app for UI changes.

`DATABASE_URL` defaults to `file:./dev.db` (see `src/lib/db.ts`); `prisma.config.ts` loads it via `dotenv`.

## Layout

- `src/lib/discogs.ts` — thin Discogs API client. All calls go through `discogsFetch`, which applies an in-process throttle (50 req/min, under Discogs' 60) and retries on 429. Module-level state is intentional: one Node process.
- `src/lib/enrichment.ts` — fills `CandidateQueue` per filter: walks `/database/search` pages (cursor in `Filter.nextSearchPage`, wraps to 1), applies year range client-side (Discogs `year` is exact-match only), fetches `/releases/{id}` for price/for-sale/videos, bounded per run (20 new candidates, 5 pages). `refillIfLow` is fire-and-forget and must never throw.
- `src/instrumentation.ts` — starts `enrichAllFilters` every 5 min (nodejs runtime only; enrichment is imported dynamically so Prisma isn't bundled for Edge).
- `src/lib/actions.ts` — all Server Actions (token save/verify, filter CRUD, judge actions, `loadMoreCandidates`, `undoDiscard`).
- `src/lib/candidate.ts` — shared client/server types, `serializeCandidate` (JSON columns → arrays), `WINDOW_PAGE_SIZE`.
- `src/lib/discogsOptions.ts` — suggestion lists for datalist inputs (not a whitelist).
- `src/app/discover/[filterId]/page.tsx` — server page; does one blocking enrichment pass if the queue is empty, then hands a window of candidates to the client.
- `src/components/DiscoverySession.tsx` — client-side window of candidates, optimistic advance, background load-more.
- `src/components/DiscoveryCard.tsx` — single release card: YouTube IFrame API player (`src/lib/youtubeIframeApi.ts`), track/release navigation, autoplay-chaining, swipe + keyboard + button controls.
- `prompts/` — log of the original feature prompts; useful for intent/history, not instructions.

## Domain rules (easy to break)

- `Reviewed.releaseId` is globally unique: WANTED/DISCARDED exclude a release from **every** feed, and remove it from all `CandidateQueue`s.
- SKIPPED is recorded in `Reviewed` only for history; the candidate stays queued with `fetchedAt` bumped so it resurfaces last. Queues are ordered by `fetchedAt asc`.
- `Reviewed` snapshots title/artist/thumb because the queue row is deleted on WANTED/DISCARDED.
- Judge actions return a `JudgeResult` (no redirect); the client advances optimistically. `revalidatePath` is only for other tabs/refreshes.
- Every nullable `Filter` search field maps 1:1 to a `/database/search` param. Adding a filter field means touching: `schema.prisma` + migration, `SEARCH_FIELDS` in `actions.ts`, `enrichFilter`'s search call, `DiscogsSearchParams`/`searchReleases` map, and `NewFeedForm.tsx`.
- Keyboard on the Discovery card: ←/→ track (falls through to prev/next release), Shift+→ want, Shift+← discard, ↓ skip, ↑ open marketplace listings.
- Discogs has no API for individual marketplace listings (seller location/price); don't scrape — the app deep-links to `/sell/release/{id}?ships_from=…` instead. Don't add unverified query params to that URL.
- Settings is a single row with `id = 1` holding the personal access token.

## Release

Every push to `main` auto-bumps the patch tag (`vX.Y.Z`) and pushes a Docker image to `ghcr.io/<owner>/<repo>` (`.github/workflows/release.yml`). Pushing a `vX.Y.Z` tag manually also builds.
