"use client";

import { useEffect, useState } from "react";
import { bytesToDataUrl } from "@/lib/image";
import { getPhoto } from "@/lib/offline/queue";

/** Shows a photo still saved on the phone (as an inline data URL: no Blob, which Safari mishandles). */
export function StoredPhoto({ localId, alt, className }: { localId: string; alt: string; className?: string }) {
  const [src, setSrc] = useState<{ id: string; url: string } | null>(null);
  useEffect(() => {
    let active = true;
    void getPhoto(localId).then((bytes) => {
      if (active && bytes) setSrc({ id: localId, url: bytesToDataUrl(bytes) });
    });
    return () => { active = false; };
  }, [localId]);
  const url = src?.id === localId ? src.url : undefined;
  // eslint-disable-next-line @next/next/no-img-element -- local photo bytes
  return url ? <img src={url} alt={alt} className={className} /> : <span aria-hidden className={className} />;
}
