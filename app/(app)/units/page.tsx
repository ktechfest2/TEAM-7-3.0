import { Suspense } from "react";
import { connection } from "next/server";
import { CircleAlert, Database } from "lucide-react";
import { Command, EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { parseElection, type Election } from "@/lib/elections";
import { t } from "@/lib/i18n";
import { many } from "@/lib/rows";
import { publicClient } from "@/lib/supabase/server";
import type { UnitStatus } from "@/lib/schemas";
import { UnitBrowser, type UnitCardData } from "./UnitBrowser";

export default function UnitsPage({ searchParams }: PageProps<"/units">) {
  return (
    <>
      <PageHeader title={t("units.title")} subtitle={t("units.subtitle")} />
      {/* Live data: rendered per request, streamed in behind this fallback. */}
      <Suspense fallback={<ListSkeleton />}>
        <UnitList searchParams={searchParams} />
      </Suspense>
    </>
  );
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-label={t("units.loading")}>
      <div className="h-13 animate-pulse rounded-2xl bg-surface-2" />
      <div className="flex flex-col gap-3">{[0, 1, 2, 3].map((i) => <div key={i} className="card h-36 animate-pulse" />)}</div>
    </div>
  );
}

type Row = {
  id: string;
  code: string;
  name: string;
  ward: string;
  lga: string;
  moved: boolean;
  unit_results: { status: UnitStatus; witness_count: number } | { status: UnitStatus; witness_count: number }[] | null;
  discrepancies: { count: number }[];
};

async function UnitList({ searchParams }: Pick<PageProps<"/units">, "searchParams">) {
  await connection(); // always live: statuses change as witnesses submit
  const election: Election = parseElection((await searchParams).election);
  const { data, error } = await publicClient()
    .from("polling_units")
    .select("id, code, name, ward, lga, moved, unit_results(status, witness_count), discrepancies(count)")
    .eq("unit_results.election", election)
    .eq("discrepancies.election", election)
    .order("code")
    .limit(1000)
    .returns<Row[]>();

  if (error) return <EmptyState icon={CircleAlert} title={t("units.error")} body={error.message} />;
  if (!data.length)
    return (
      <EmptyState icon={Database} title={t("units.empty.title")} body={t("units.empty.body")}>
        <Command>npm run seed</Command>
        <p className="text-xs text-muted">{t("units.empty.hint")}</p>
      </EmptyState>
    );

  const units: UnitCardData[] = data.map((u) => {
    const result = many(u.unit_results)[0];
    return {
      id: u.id,
      code: u.code,
      name: u.name,
      ward: u.ward,
      lga: u.lga,
      moved: u.moved,
      status: result?.status ?? "pending",
      witnesses: result?.witness_count ?? 0,
      mismatches: u.discrepancies[0]?.count ?? 0,
    };
  });
  return (
    <Suspense>
      <UnitBrowser units={units} election={election} />
    </Suspense>
  );
}
