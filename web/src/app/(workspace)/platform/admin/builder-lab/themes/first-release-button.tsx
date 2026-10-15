"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { ConfirmDialog } from "./[releaseId]/confirm-dialog";
import { actionCreateFirstRelease } from "./actions";
import { COPY, type Lang } from "./copy";

const btn =
  "rounded border border-white/30 px-3 py-1.5 text-sm text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40";

/** TUL-404: a design with no release yet gets a draft release at its catalog version, then opens the release page. */
export function FirstReleaseButton({ design, version, lang }: { design: string; version: number; lang: Lang }) {
  const t = COPY[lang];
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function create() {
    setOpen(false);
    setError(null);
    start(async () => {
      const r = await actionCreateFirstRelease(design);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.push(`/platform/admin/builder-lab/themes/${encodeURIComponent(r.data.releaseId)}${lang === "es" ? "?lang=es" : ""}`);
    });
  }

  return (
    <div className="mt-2" data-first-release={design}>
      <button type="button" className={btn} disabled={pending} onClick={() => setOpen(true)}>
        {pending ? t.firstReleaseWorking : `${t.firstRelease} (v${version})`}
      </button>
      {error ? (
        <p role="alert" className="mt-1 text-xs text-red-300">
          {error}
        </p>
      ) : null}
      <ConfirmDialog
        open={open}
        message={t.firstReleaseConfirm}
        confirmLabel={`${t.firstRelease} (v${version})`}
        cancelLabel={t.confirmCancel}
        onConfirm={create}
        onCancel={() => setOpen(false)}
      />
    </div>
  );
}
