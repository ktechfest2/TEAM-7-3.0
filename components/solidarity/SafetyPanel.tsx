import Link from "next/link";
import { HeartHandshake } from "lucide-react";
import { Card } from "@/components/Card";
import { t } from "@/lib/i18n";
import { MIN_PUBLIC_COUNT } from "@/lib/solidarity/config";
import { publicClient } from "@/lib/supabase/server";

/**
 * Read-only Solidarity panel for the unit page (only mounted when the feature flag is on).
 * Reads the public view, which already withholds need_help rows and units below the minimum.
 */
export async function SolidarityPanel({ unitId, code }: { unitId: string; code: string }) {
  const { data } = await publicClient().from("public_unit_safety").select("on_my_way, voted, home_safe, total").eq("unit_id", unitId).maybeSingle();
  // Belt and braces: the view enforces the minimum, and so does this check.
  const totals = data && data.total >= MIN_PUBLIC_COUNT ? data : null;

  return (
    <Card title={t("sol.safety.title")} icon={HeartHandshake}>
      {totals ? (
        <>
          <ul className="grid grid-cols-3 gap-2 text-center">
            {(["on_my_way", "voted", "home_safe"] as const).map((k) => (
              <li key={k} className="rounded-xl bg-surface-2 p-3">
                <p className="display text-3xl">{totals[k]}</p>
                <p className="text-xs text-muted">{t(`sol.checkin.${k}`)}</p>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted">{t("sol.safety.total", { n: totals.total })}</p>
        </>
      ) : (
        <div className="rounded-xl bg-surface-2 p-4 text-sm">
          <p className="font-medium">{t("sol.safety.notEnough")}</p>
          <p className="mt-1 text-muted">{t("sol.safety.notEnough.why")}</p>
        </div>
      )}
      <Link href={`/units/${encodeURIComponent(code)}/checkin`} className="btn btn-secondary min-h-12">
        {t("sol.safety.cta")}
      </Link>
    </Card>
  );
}
