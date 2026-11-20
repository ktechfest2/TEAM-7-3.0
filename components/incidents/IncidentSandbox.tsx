"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, MessageSquareWarning, Radio, RefreshCw, Search, Send } from "lucide-react";
import { HeroPanel, HeroTray } from "@/components/HeroPanel";
import { t, type MessageKey } from "@/lib/i18n";
import { errorMessage, fetchJson } from "@/lib/http";

type Report = {
  id: string;
  incident_code: string;
  incident_label: string;
  source: "demo" | "at_sandbox";
  received_at: string;
  polling_units: { code: string; name: string; ward: string; lga: string; state: string } | null;
};

const incidentCodes = ["VUB", "VIO", "MSB", "BOG", "INT"];

export function IncidentSandbox() {
  const [from, setFrom] = useState("+2348012345678");
  const [message, setMessage] = useState("");
  const [sampleUnit, setSampleUnit] = useState("");
  const [reports, setReports] = useState<Report[]>([]);
  const [reply, setReply] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [loadError, setLoadError] = useState("");

  const refresh = useCallback(async () => {
    try {
      const data = await fetchJson<{ reports: Report[] }>("/api/incidents", { cache: "no-store" }, "incidents.loadFailed");
      setReports(data.reports);
      setLoadError("");
    } catch (e) {
      // Keep showing the last reports; the next refresh (every 5 s) may succeed.
      setLoadError(errorMessage(e, "incidents.loadFailed"));
    }
  }, []);

  useEffect(() => {
    void fetch("/api/polling-units?limit=1", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => {
        const code = data?.data?.[0]?.code;
        if (typeof code === "string") {
          setSampleUnit(code);
          setMessage(`PU${code}VUB`);
        }
      })
      .catch(() => undefined);
    // First load right away, then every 5 s. Run as a timer callback so the state updates happen
    // outside the effect body (react-hooks/set-state-in-effect).
    const first = window.setTimeout(() => void refresh(), 0);
    const timer = window.setInterval(() => void refresh(), 5000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [refresh]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setReply("");
    setError("");
    try {
      const data = await fetchJson<{ reply: string }>("/api/sms/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from, text: message }),
      }, "incidents.sendFailed");
      setReply(data.reply);
      await refresh();
    } catch (e) {
      setError(errorMessage(e, "incidents.sendFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <HeroPanel
        id="incidents-doodles"
        eyebrow={t("incidents.hero.eyebrow")}
        eyebrowIcon={MessageSquareWarning}
        live
        title={t("incidents.hero.title")}
        highlight={t("incidents.hero.title2")}
        highlightClass="text-e-assembly"
        subtitle={t("incidents.hero.sub")}
        aside={
          <div className="flex gap-3 rounded-3xl bg-accent p-4 text-e-ink lg:w-80">
            <AlertTriangle aria-hidden className="mt-0.5 size-5 shrink-0" />
            <div>
              <p className="font-bold">{t("incidents.demo.title")}</p>
              <p className="mt-1 text-sm">{t("incidents.demo.body")}</p>
            </div>
          </div>
        }
      >
        <HeroTray>
          <form onSubmit={submit} className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <Send aria-hidden className="size-5 text-brand" />
              <h2 className="font-display text-xl font-extrabold">{t("incidents.sim.title")}</h2>
            </div>
            <div className="grid gap-3 lg:grid-cols-[16rem_1fr_auto] lg:items-end">
              <label className="flex flex-col gap-1.5 text-xs font-semibold tracking-wide text-muted uppercase">
                {t("incidents.sim.phone")}
                <input className="field min-h-12 bg-surface font-normal tracking-normal text-text normal-case" value={from} onChange={(e) => setFrom(e.target.value)} maxLength={24} required />
              </label>
              <label className="flex flex-col gap-1.5 text-xs font-semibold tracking-wide text-muted uppercase">
                {t("incidents.sim.message")}
                <input className="field min-h-12 bg-surface font-mono text-sm font-normal text-text uppercase" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={500} required />
              </label>
              <button className="btn btn-primary min-h-12 px-6" disabled={busy}>
                {busy ? <RefreshCw aria-hidden className="size-4 animate-spin" /> : <Send aria-hidden className="size-4" />}
                {busy ? t("incidents.sim.sending") : t("incidents.sim.submit")}
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={!sampleUnit}
                className="inline-flex items-center gap-1.5 rounded-full bg-brand/15 px-3 py-1.5 font-mono text-xs font-bold text-brand transition hover:bg-brand/25 disabled:opacity-50"
                onClick={() => setMessage(`LKP PU${sampleUnit}`)}
              >
                <Search aria-hidden className="size-3.5" /> LKP · look up unit
              </button>
              {incidentCodes.map((code) => (
                <button
                  key={code}
                  type="button"
                  disabled={!sampleUnit}
                  className="rounded-full bg-surface-2 px-3 py-1.5 font-mono text-xs font-semibold transition hover:bg-border disabled:opacity-50"
                  onClick={() => setMessage(`PU${sampleUnit}${code}`)}
                >
                  {code}
                </button>
              ))}
              <p className="text-xs text-muted">
                {sampleUnit ? <>{t("incidents.sim.sample", { code: sampleUnit })} Send <code>LKP PU{sampleUnit}</code> to look up reports received in the last 24 hours.</> : t("incidents.sim.loadingSample")}
              </p>
            </div>
            {reply && <p role="status" className="rounded-xl bg-ok-bg p-3 text-sm text-ok-text">{reply}</p>}
            {error && <p role="alert" className="rounded-xl bg-review-bg p-3 text-sm text-review-text">{error}</p>}
          </form>
        </HeroTray>
      </HeroPanel>

      <section className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-border p-5">
          <div>
            <span className="eyebrow">{t("incidents.recent.live")}</span>
            <h2 className="font-display text-xl font-extrabold">{t("incidents.recent.title")}</h2>
            <p className="mt-1 text-xs text-muted">{t("incidents.recent.sub")}</p>
          </div>
          <button onClick={() => void refresh()} aria-label={t("incidents.recent.refresh")} className="grid size-10 place-items-center rounded-full bg-surface-2 transition hover:bg-border"><RefreshCw aria-hidden className="size-4" /></button>
        </div>
        {loadError && <p role="alert" className="m-4 mb-0 rounded-xl bg-review-bg p-3 text-sm text-review-text md:m-5 md:mb-0">{loadError}</p>}
        {!reports.length ? (
          !loadError && <p className="p-6 text-sm text-muted">{t("incidents.recent.empty")}</p>
        ) : (
          <ul className="grid gap-3 p-4 md:grid-cols-2 md:p-5">
            {reports.map((report) => (
              <li key={report.id} className="flex items-start gap-3 rounded-2xl border border-border p-4">
                <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-xl bg-e-assembly font-mono text-[11px] font-bold text-e-ink">{report.incident_code}</span>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <p className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-bold">{t(`incident.${report.incident_code}` as MessageKey)}</span>
                    <time className="text-xs text-muted">{new Date(report.received_at).toLocaleTimeString()}</time>
                  </p>
                  <p className="truncate font-mono text-sm">{report.polling_units?.code ?? t("incidents.unknownUnit")}</p>
                  <p className="truncate text-xs text-muted">{[report.polling_units?.name, report.polling_units?.ward, report.polling_units?.lga, report.polling_units?.state].filter(Boolean).join(" / ")}</p>
                  <span className="mt-1 flex flex-wrap gap-2 text-xs">
                    <span className="rounded-full bg-sim-bg px-2.5 py-1 font-bold text-sim-text">{report.source === "demo" ? t("common.simulated") : t("feed.sandbox")}</span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-review-bg px-2.5 py-1 font-bold text-review-text"><Radio aria-hidden className="size-3.5" />{t("feed.publicReport")}</span>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
