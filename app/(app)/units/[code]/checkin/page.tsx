import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { PageHeader } from "@/components/PageHeader";
import { CheckinPanel } from "@/components/solidarity/CheckinPanel";
import { t } from "@/lib/i18n";
import { SOLIDARITY_ENABLED } from "@/lib/solidarity/config";
import { publicClient } from "@/lib/supabase/server";

export default function CheckinPage({ params }: PageProps<"/units/[code]/checkin">) {
  if (!SOLIDARITY_ENABLED) notFound();
  return (
    <Suspense fallback={<div className="card h-64 animate-pulse" />}>
      <Checkin params={params} />
    </Suspense>
  );
}

async function Checkin({ params }: Pick<PageProps<"/units/[code]/checkin">, "params">) {
  await connection();
  const { code } = await params;
  const { data: unit } = await publicClient()
    .from("polling_units")
    .select("id, code, name")
    .eq("code", decodeURIComponent(code))
    .maybeSingle();
  if (!unit) notFound();

  return (
    <>
      <PageHeader
        back={{ href: `/units/${encodeURIComponent(unit.code)}`, label: unit.name }}
        title={t("sol.checkin.title")}
        subtitle={`${unit.name} · ${t("sol.checkin.subtitle")}`}
      />
      <CheckinPanel unitId={unit.id} />
    </>
  );
}
