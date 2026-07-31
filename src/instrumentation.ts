const INTERVAL_MS = 5 * 60 * 1000;

// Runs once when the server process starts. Keeps every feed's candidate
// queue topped up in the background, independent of whether the Discovery
// screen is currently open (that path is covered separately by
// refillIfLow, called from the page itself).
//
// The enrichment module (and everything it pulls in, incl. the Prisma
// client) is imported dynamically inside the nodejs branch rather than at
// the top of this file — a top-level import would make Next.js bundle it
// for the Edge runtime too, which can't run Prisma's Node-only client.
export function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  import("@/lib/enrichment").then(({ enrichAllFilters }) => {
    setInterval(() => {
      enrichAllFilters().catch((err) => {
        console.error("Background enrichment failed:", err);
      });
    }, INTERVAL_MS);
  });
}
