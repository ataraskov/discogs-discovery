# Discogs Discovery

A personal, self-hosted app for discovering records on Discogs: define saved
search feeds (genre, year, format, aggregate price/for-sale thresholds),
then review matching releases one at a time — with their YouTube reference
video playing — swiping to add to your real Discogs wantlist or discard.

See `plan-a-web-app-silly-walrus.md` for the full design rationale.

## Running locally (development)

```bash
npm install
npx prisma migrate dev
npm run dev
```

Open http://localhost:3000, go to **Settings**, and paste in a Discogs
personal access token (generate one at
https://www.discogs.com/settings/developers). Then create a feed under
**Feeds** and start reviewing.

## Running self-hosted (Docker Compose)

```bash
docker compose up --build -d
```

This builds the app, applies Prisma migrations on startup, and persists the
SQLite database to `./data/discogs-discovery.db` on the host via a mounted
volume. Open http://localhost:3000 and configure your token as above.

## Notes on Discogs API limits

- Catalog search (genre/year/format/etc.) and aggregate marketplace stats
  (lowest price, number for sale) come straight from the Discogs API.
- Discogs has no public API for searching individual marketplace listings
  by seller location or exact price — that data is only browsable on
  discogs.com itself, and scraping it is against Discogs' API Terms of Use.
  The **Listings** button on each card deep-links to the release's
  marketplace page (pre-filtered by ships-from country, when the feed sets
  one) for a quick manual check.
- Requests are throttled in-process to stay under Discogs' documented
  60 requests/minute limit for authenticated calls.
