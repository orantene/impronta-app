"use client";

/**
 * "Publish and update demos" for the Talent design editor: publishes the
 * saved draft as the design's next version, writes the release (notes are
 * generated), dry-runs it and sends it to demos. Never opens it to talents.
 * The draft rev comes from the builder's live CAS version.
 */
import { localizeBuilderLabError } from "@/lib/talent-site/theme-releases/builder-lab-errors";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { getPageVersionSnapshot } from "@/components/edit-chrome/save-cycle-bridge";
import { actionPublishDesignAndUpdateDemos } from "@/app/(workspace)/platform/admin/builder-lab/talent-designs/publish-actions";

const COPY = {
  en: {
    label: "Publish and update demos",
    busy: "Publishing…",
    confirm: "Publish this design as a new version and update its demo sites? Talents are not changed until you open the release to them.",
    failed: (e: string) => `Could not publish: ${e}`,
    done: (v: number) => `Published v${v}. Opening the release…`,
  },
  es: {
    label: "Publicar y actualizar demos",
    busy: "Publicando…",
    confirm: "¿Publicar este diseño como nueva versión y actualizar sus sitios demo? Los talentos no cambian hasta que les abras la versión.",
    failed: (e: string) => `No se pudo publicar: ${e}`,
    done: (v: number) => `Versión v${v} publicada. Abriendo la versión…`,
  },
} as const;

export function PublishDesignButton({ design, lang }: { design: string; lang: "en" | "es" }) {
  const t = COPY[lang];
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const run = async () => {
    if (!window.confirm(t.confirm)) return;
    const rev = getPageVersionSnapshot();
    if (typeof rev !== "number") {
      setMsg(t.failed(localizeBuilderLabError("draft revision unknown", lang)));
      return;
    }
    setBusy(true);
    setMsg(null);
    const res = await actionPublishDesignAndUpdateDemos(design, rev);
    setBusy(false);
    if (!res.ok) {
      setMsg(t.failed(localizeBuilderLabError(res.error, lang, res.errorEs)));
      return;
    }
    setMsg(t.done(res.data.version));
    router.push(res.data.href);
  };

  return (
    <span className="flex items-center gap-2">
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className="rounded-full bg-black px-3 py-1 text-xs text-white disabled:opacity-50"
        data-publish-new-version
      >
        {busy ? t.busy : t.label}
      </button>
      {msg ? (
        <span role="status" className="text-xs text-black/70" data-publish-status>
          {msg}
        </span>
      ) : null}
    </span>
  );
}
