import { prisma } from "@/lib/db";
import TokenForm from "@/components/TokenForm";

// See src/app/page.tsx for why this is needed: no dynamic API is used here,
// so without this the route would be statically baked at build time.
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const settings = await prisma.settings.findUnique({ where: { id: 1 } });

  return (
    <div className="max-w-md space-y-6">
      <h1 className="text-xl font-semibold">Settings</h1>

      {settings?.discogsUsername && (
        <p className="text-sm text-black/60 dark:text-white/60">
          Connected as <span className="font-medium">{settings.discogsUsername}</span>
        </p>
      )}

      <TokenForm hasToken={Boolean(settings?.discogsToken)} />
    </div>
  );
}
