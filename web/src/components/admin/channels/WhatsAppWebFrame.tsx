"use client";

import { useEffect, useState } from "react";

import { useT } from "@/i18n/use-t";

export function WhatsAppWebFrame({ viewUrl }: { viewUrl: string }) {
  const t = useT();
  const [embeddable, setEmbeddable] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch(viewUrl, { mode: "no-cors" })
      .then(() => {
        if (!cancelled) setEmbeddable(true);
      })
      .catch(() => {
        if (!cancelled) setEmbeddable(false);
      });
    return () => {
      cancelled = true;
    };
  }, [viewUrl]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#111b21]" data-tulala-whatsapp-web>
      {embeddable ? (
        <iframe
          title={t("dashboard.channels.drawer.webTitle")}
          src={viewUrl}
          className="h-full w-full flex-1 border-0"
          allow="clipboard-read; clipboard-write"
        />
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 py-10 text-center">
          <h2 className="m-0 text-[20px] font-semibold text-white">
            {t("dashboard.channels.drawer.webTitle")}
          </h2>
          <p className="m-0 max-w-[420px] text-[14px] leading-[1.5] text-[#8696a0]">
            {embeddable === null
              ? t("dashboard.channels.drawer.webWaiting")
              : t("dashboard.channels.drawer.webBody")}
          </p>
          {embeddable === false ? (
            <p className="m-0 max-w-[420px] text-[13px] leading-[1.5] text-[#667781]">
              {t("dashboard.channels.drawer.webHint")}
            </p>
          ) : null}
          <button
            type="button"
            className="mt-2 inline-flex h-11 items-center justify-center rounded-[10px] bg-[#00a884] px-5 text-[14px] font-semibold text-white"
            onClick={() => {
              window.open(viewUrl, "tulala-whatsapp-web", "noopener,width=1100,height=800");
            }}
          >
            {t("dashboard.channels.drawer.webOpen")}
          </button>
        </div>
      )}
    </div>
  );
}
