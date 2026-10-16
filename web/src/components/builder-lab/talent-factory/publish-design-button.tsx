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
import { ConfirmDialog } from "@/app/(workspace)/platform/admin/builder-lab/themes/[releaseId]/confirm-dialog";

const COPY = {
  en: {
    label: "Publish and update demos",
    busy: "Publishing…",
    confirm: "Publish this design as a new version and update its demo sites? Talents are not changed until you open the release to them.",
    confirmLabel: "Publish",
    cancel: "Cancel",
    problems: "To fix before publishing:",
    failed: (e: string) => `Could not publish: ${e}`,
    done: (v: number) => `Published v${v}. Opening the release…`,
  },
  es: {
    label: "Publicar y actualizar demos",
    busy: "Publicando…",
    confirm: "¿Publicar este diseño como nueva versión y actualizar sus sitios demo? Los talentos no cambian hasta que les abras la versión.",
    confirmLabel: "Publicar",
    cancel: "Cancelar",
    problems: "Por corregir antes de publicar:",
    failed: (e: string) => `No se pudo publicar: ${e}`,
    done: (v: number) => `Versión v${v} publicada. Abriendo la versión…`,
  },
} as const;

export function PublishDesignButton({ design, lang }: { design: string; lang: "en" | "es" }) {
  const t = COPY[lang];
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [issues, setIssues] = useState<string[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const run = async () => {
    setConfirmOpen(false);
    setIssues([]);
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
      // TUL-998: the server returns the concrete problems; say what they are.
      setIssues(res.issues ?? []);
      return;
    }
    setMsg(t.done(res.data.version));
    router.push(res.data.href);
  };

  return (
    <span className="flex items-center gap-2">
      <ConfirmDialog
        open={confirmOpen}
        message={t.confirm}
        confirmLabel={t.confirmLabel}
        cancelLabel={t.cancel}
        onConfirm={run}
        onCancel={() => setConfirmOpen(false)}
      />
      <button
        type="button"
        onClick={() => setConfirmOpen(true)}
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
      {issues.length > 0 ? (
        <span className="block text-xs text-black/70" data-publish-issues>
          {t.problems}
          <ul className="mt-1 list-disc pl-4">
            {issues.map((issue, i) => (
              <li key={`${i}-${issue}`}>{issue}</li>
            ))}
          </ul>
        </span>
      ) : null}
    </span>
  );
}
