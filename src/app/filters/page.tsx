import Link from "next/link";
import { prisma } from "@/lib/db";
import { deleteFilter } from "@/lib/actions";
import { NewFeedForm } from "./NewFeedForm";

// See src/app/page.tsx for why this is needed: no dynamic API is used here,
// so without this the route would be statically baked at build time.
export const dynamic = "force-dynamic";

export default async function FiltersPage() {
  const filters = await prisma.filter.findMany({ orderBy: { createdAt: "desc" } });

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-xl font-semibold">Discovery feeds</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          Every field maps to a Discogs <code>/database/search</code> parameter, except
          the two marketplace fields at the bottom which come from the release&apos;s
          aggregate stats. Leave anything you don&apos;t care about blank.
        </p>
      </div>

      {filters.length > 0 && (
        <ul className="divide-y divide-black/10 dark:divide-white/10">
          {filters.map((filter) => (
            <li key={filter.id} className="flex items-center justify-between py-3">
              <div>
                <div className="font-medium">{filter.name}</div>
                <div className="text-sm text-black/60 dark:text-white/60">
                  {[filter.genre, filter.style, filter.format]
                    .filter(Boolean)
                    .join(" · ") || "no metadata filters set"}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Link href={`/discover/${filter.id}`} className="text-sm underline">
                  Discover
                </Link>
                <form action={deleteFilter}>
                  <input type="hidden" name="id" value={filter.id} />
                  <button type="submit" className="text-sm text-red-600 hover:underline">
                    Delete
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}

      <NewFeedForm />
    </div>
  );
}
