import Link from "next/link";
import { prisma } from "@/lib/db";

// No dynamic API is used below, so Next would otherwise treat this route as
// fully static (revalidate: false) and bake it at build time — meaning it'd
// keep serving whatever the DB looked like when the image was built, only
// picking up real changes via revalidatePath's in-process cache, which does
// not survive a redeploy/restart. Force per-request rendering instead.
export const dynamic = "force-dynamic";

export default async function Home() {
  const settings = await prisma.settings.findUnique({ where: { id: 1 } });

  if (!settings?.discogsToken) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold">Welcome</h1>
        <p>
          Add your Discogs personal access token in{" "}
          <Link href="/settings" className="underline">
            Settings
          </Link>{" "}
          to get started.
        </p>
      </div>
    );
  }

  const filters = await prisma.filter.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { candidates: true } } },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Discovery feeds</h1>
        <Link
          href="/filters"
          className="rounded bg-black px-3 py-1.5 text-sm text-white dark:bg-white dark:text-black"
        >
          Manage feeds
        </Link>
      </div>

      {filters.length === 0 ? (
        <p>
          No feeds yet.{" "}
          <Link href="/filters" className="underline">
            Create one
          </Link>{" "}
          to start discovering records.
        </p>
      ) : (
        <ul className="divide-y divide-black/10 dark:divide-white/10">
          {filters.map((filter) => (
            <li key={filter.id} className="flex items-center justify-between py-3">
              <div>
                <div className="font-medium">{filter.name}</div>
                <div className="text-sm text-black/60 dark:text-white/60">
                  {filter._count.candidates} ready to review
                </div>
              </div>
              <Link
                href={`/discover/${filter.id}`}
                className="rounded bg-black px-3 py-1.5 text-sm text-white dark:bg-white dark:text-black"
              >
                Discover
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
