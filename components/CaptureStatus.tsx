import { CircleAlert, CircleCheck, CloudOff, Loader2, MapPinPlus } from "lucide-react";
import { t } from "@/lib/i18n";
import type { QueuedCapture } from "@/lib/schemas";

/** One-line, icon-led state of a queued capture. */
export function CaptureStatus({ item, online }: { item: QueuedCapture; online: boolean }) {
  const { status } = item;
  if (status === "done")
    return <Line icon={<CircleCheck className="size-4" />} cls="text-ok-text" text={t("queue.done")} />;
  if (status === "draft")
    return <Line icon={<MapPinPlus className="size-4" />} cls="text-sim-text" text={t("queue.draft")} />;
  if (status === "failed")
    return <Line icon={<CircleAlert className="size-4" />} cls="text-review-text" text={item.error ?? t("queue.failed")} />;
  if (status === "queued" && !online)
    return <Line icon={<CloudOff className="size-4" />} cls="text-muted" text={t("queue.waitingNetwork")} />;
  return <Line icon={<Loader2 className="size-4 animate-spin" />} cls="text-muted" text={t(`queue.${status}`)} />;
}

function Line({ icon, cls, text }: { icon: React.ReactNode; cls: string; text: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-sm font-medium ${cls}`}>
      <span aria-hidden>{icon}</span>
      {text}
    </span>
  );
}
