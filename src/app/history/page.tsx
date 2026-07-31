import { prisma } from "@/lib/db";
import { undoDiscard } from "@/lib/actions";
import type { Reviewed } from "@/generated/prisma/client";

// See src/app/page.tsx for why this is needed: no dynamic API is used here,
// so without this the route would be statically baked at build time.
export const dynamic = "force-dynamic";

function ReviewedRow({ item, showUndo }: { item: Reviewed; showUndo?: boolean }) {
  return (
    <li className="flex items-center justify-between gap-3 py-3">
      <div className="flex items-center gap-3">
        {item.thumbUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.thumbUrl} alt="" className="h-12 w-12 rounded object-cover" />
        ) : (
          <div className="h-12 w-12 rounded bg-black/10 dark:bg-white/10" />
        )}
        <div>
          <a
            href={`https://www.discogs.com/release/${item.releaseId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium hover:underline"
          >
            {item.title}
          </a>
          {item.artist && (
            <p className="text-sm text-black/60 dark:text-white/60">{item.artist}</p>
          )}
        </div>
      </div>
      {showUndo && (
        <form action={undoDiscard}>
          <input type="hidden" name="releaseId" value={item.releaseId} />
          <button type="submit" className="text-sm underline">
            Undo
          </button>
        </form>
      )}
    </li>
  );
}

export default async function HistoryPage() {
  const [wanted, discarded, skipped] = await Promise.all([
    prisma.reviewed.findMany({ where: { status: "WANTED" }, orderBy: { reviewedAt: "desc" } }),
    prisma.reviewed.findMany({ where: { status: "DISCARDED" }, orderBy: { reviewedAt: "desc" } }),
    prisma.reviewed.findMany({ where: { status: "SKIPPED" }, orderBy: { reviewedAt: "desc" } }),
  ]);

  return (
    <div className="space-y-10">
      <h1 className="text-xl font-semibold">Review history</h1>

      <section>
        <h2 className="mb-1 font-medium">Wantlisted ({wanted.length})</h2>
        {wanted.length === 0 ? (
          <p className="text-sm text-black/60 dark:text-white/60">Nothing yet.</p>
        ) : (
          <ul className="divide-y divide-black/10 dark:divide-white/10">
            {wanted.map((item) => (
              <ReviewedRow key={item.id} item={item} />
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-1 font-medium">Discarded ({discarded.length})</h2>
        {discarded.length === 0 ? (
          <p className="text-sm text-black/60 dark:text-white/60">Nothing yet.</p>
        ) : (
          <ul className="divide-y divide-black/10 dark:divide-white/10">
            {discarded.map((item) => (
              <ReviewedRow key={item.id} item={item} showUndo />
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-1 font-medium">Skipped, will resurface ({skipped.length})</h2>
        {skipped.length === 0 ? (
          <p className="text-sm text-black/60 dark:text-white/60">Nothing yet.</p>
        ) : (
          <ul className="divide-y divide-black/10 dark:divide-white/10">
            {skipped.map((item) => (
              <ReviewedRow key={item.id} item={item} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
