"use client";

/**
 * Import starter content (W44–W59) — choose → review → result.
 * Desktop: 560px right panel over dimmed preview. Phone: full-screen step.
 */

import { useEffect, useMemo, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import {
  commitMaisonImportAction,
  loadMaisonImportPreviewAction,
  retryMaisonImportItemAction,
  undoMaisonImportAction,
  type MaisonImportPreview,
} from "@/lib/talent-site/server/maison-import-actions";
import type { MaisonImportCommitResult } from "@/lib/talent-site/server/maison-import-core";
import {
  emptyImportSelection,
  plannedServiceDraftCount,
  selectionCounts,
  selectionSummaryLine,
  type DuplicateResolution,
  type ImportSelectionState,
} from "@/lib/talent-site/theme-catalog/maison/maison-starter-catalog";
import { maisonSetupT, type MaisonSetupLocale } from "./maison-setup-copy";

type Step = "choose" | "review" | "result";

type Props = {
  locale: MaisonSetupLocale;
  onClose: () => void;
  onContinueDesigning: () => void;
};

function toggleKey(list: string[], key: string): string[] {
  return list.includes(key) ? list.filter((k) => k !== key) : [...list, key];
}

function groupTriState(selected: number, total: number): "all" | "some" | "none" {
  if (selected === 0) return "none";
  if (selected === total) return "all";
  return "some";
}

export function ImportStarterPanel({ locale, onClose, onContinueDesigning }: Props) {
  const [step, setStep] = useState<Step>("choose");
  const [preview, setPreview] = useState<MaisonImportPreview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sel, setSel] = useState<ImportSelectionState>(emptyImportSelection);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    services: false,
    faqs: false,
    sections: false,
  });
  const [resolutions, setResolutions] = useState<Record<string, DuplicateResolution>>({});
  const [changeKey, setChangeKey] = useState<string | null>(null);
  const [organizeOpen, setOrganizeOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [result, setResult] = useState<MaisonImportCommitResult | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [detailKey, setDetailKey] = useState<string | null>(null);

  useEffect(() => {
    startTransition(async () => {
      const res = await loadMaisonImportPreviewAction();
      if (!res.ok) {
        setLoadError(res.error);
        return;
      }
      setPreview(res.data);
    });
  }, []);

  const counts = selectionCounts(sel);
  const catalog = preview?.catalog;

  const duplicateKeys = useMemo(() => {
    if (!preview) return [] as string[];
    return sel.serviceKeys.filter((k) => preview.duplicates[k]);
  }, [preview, sel.serviceKeys]);

  const draftServiceCount = useMemo(() => {
    if (!preview) return 0;
    return plannedServiceDraftCount(sel.serviceKeys, resolutions, preview.duplicates);
  }, [preview, sel.serviceKeys, resolutions]);

  function setGroupAll(kind: "services" | "faqs" | "sections", on: boolean) {
    if (!catalog) return;
    if (kind === "services") {
      setSel((s) => ({
        ...s,
        serviceKeys: on ? catalog.services.map((x) => x.key) : [],
      }));
    } else if (kind === "faqs") {
      setSel((s) => ({
        ...s,
        faqKeys: on ? catalog.faqs.map((x) => x.key) : [],
      }));
    } else {
      setSel((s) => ({
        ...s,
        sectionKeys: on ? catalog.sectionText.map((x) => x.key) : [],
      }));
    }
  }

  function handleCommit() {
    startTransition(async () => {
      setActionError(null);
      const res = await commitMaisonImportAction({ selection: sel, resolutions });
      if (!res.ok) {
        setActionError(res.error);
        return;
      }
      setResult(res.data);
      setStep("result");
    });
  }

  function handleUndo() {
    if (!result) return;
    const editedAsk = window.confirm(
      locale === "es"
        ? "Si editaste algún borrador, ¿también lo eliminamos? Aceptar = eliminar también editados. Cancelar = conservar editados."
        : "If you edited any drafts, remove those too? OK = remove edited as well. Cancel = keep edited drafts.",
    );
    startTransition(async () => {
      setActionError(null);
      const res = await undoMaisonImportAction({
        batchId: result.batchId,
        removeEdited: editedAsk,
      });
      if (!res.ok) {
        setActionError(res.error);
        return;
      }
      setResult(null);
      setStep("choose");
      setSel(emptyImportSelection());
    });
  }

  function handleRetry(starterKey: string) {
    if (!result) return;
    startTransition(async () => {
      setActionError(null);
      const res = await retryMaisonImportItemAction({
        batchId: result.batchId,
        starterKey,
      });
      if (!res.ok) {
        setActionError(res.error);
        return;
      }
      setResult({
        ...result,
        serviceDraftIds: [...result.serviceDraftIds, res.data.offeringId],
        failed: result.failed.filter((f) => f.starterKey !== starterKey),
        status: result.failed.length <= 1 ? "complete" : "partial",
      });
    });
  }

  const shell = (body: ReactNode) => (
    <div
      className="fixed inset-0 z-[80] flex justify-end bg-black/35"
      data-testid="maison-import-panel"
      data-maison-import-step={step}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="flex h-full w-full max-w-[560px] flex-col bg-white shadow-xl max-md:max-w-none"
        onClick={(e) => e.stopPropagation()}
      >
        {body}
      </div>
    </div>
  );

  if (loadError) {
    return shell(
      <div className="p-4">
        <p className="text-[13px] text-red-800">{loadError}</p>
        <button type="button" className="mt-3 text-[13px] font-semibold" onClick={onClose}>
          {maisonSetupT(locale, "Close")}
        </button>
      </div>,
    );
  }

  if (!catalog) {
    return shell(
      <div className="p-4 text-[13px] text-admin-ink-muted">…</div>,
    );
  }

  if (step === "result" && result) {
    const partial = result.status === "partial" && result.failed.length > 0;
    return shell(
      <>
        <header className="border-b border-admin-border-soft px-4 py-3">
          <button type="button" onClick={onClose} className="text-[13px] font-semibold text-admin-ink-muted">
            {maisonSetupT(locale, "Close")}
          </button>
          <h2 className="mt-1 text-[18px] font-semibold text-admin-ink" data-testid="maison-import-result-title">
            {partial
              ? locale === "es"
                ? "La mayor parte del contenido se agregó"
                : "Most starter content added"
              : locale === "es"
                ? "✓ Contenido inicial agregado"
                : "✓ Starter content added"}
          </h2>
          <p className="mt-1 text-[13px] text-admin-ink-muted">
            {locale === "es"
              ? `${result.serviceDraftIds.length} borradores de servicio y ${result.faqDraftIds.length} preguntas FAQ listos para revisar.`
              : `${result.serviceDraftIds.length} service drafts and ${result.faqDraftIds.length} FAQ prompts are ready to review.`}
          </p>
          <p className="mt-1 text-[12px] text-admin-ink-dim">
            {locale === "es"
              ? "Los borradores no aparecen en tu sitio público hasta que los revises y publiques."
              : "Draft services stay off your public site until reviewed and published."}
          </p>
        </header>
        <div className="flex-1 space-y-3 overflow-auto px-4 py-4">
          {partial
            ? result.failed.map((f) => (
                <div
                  key={f.starterKey}
                  data-testid={`maison-import-failed-${f.starterKey}`}
                  className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[13px]"
                >
                  <p>
                    {locale === "es"
                      ? `1 servicio no se pudo agregar: ${f.name}. Nada se duplicó.`
                      : `1 service couldn't be added: ${f.name}. Nothing was duplicated.`}
                  </p>
                  <button
                    type="button"
                    data-testid="maison-import-retry"
                    className="mt-1 font-semibold underline"
                    disabled={pending}
                    onClick={() => handleRetry(f.starterKey)}
                  >
                    {maisonSetupT(locale, "Try again")}
                  </button>
                </div>
              ))
            : null}
          <button
            type="button"
            data-testid="maison-import-details-toggle"
            className="text-[13px] font-semibold text-admin-ink"
            onClick={() => setDetailsOpen((v) => !v)}
          >
            {locale === "es" ? "Detalles de la importación" : "Import details"}{" "}
            {detailsOpen ? "▴" : "▾"}
          </button>
          {detailsOpen ? (
            <div data-testid="maison-import-details" className="space-y-1 text-[13px] text-admin-ink-muted">
              <p>
                {locale === "es" ? "Borradores de servicio agregados" : "Service drafts added"}{" "}
                {result.serviceDraftIds.length}
              </p>
              <p>
                {locale === "es" ? "Preguntas FAQ agregadas" : "FAQ prompts added"}{" "}
                {result.faqDraftIds.length}
              </p>
              {result.keptExisting.map((k) => (
                <p key={k.starterKey}>
                  {locale === "es" ? "Se conservó tu existente:" : "Kept your existing:"} {k.name}
                </p>
              ))}
              {result.skipped.length > 0
                ? result.skipped.map((k) => (
                    <p key={k.starterKey}>
                      {locale === "es" ? "Omitido:" : "Skipped:"} {k.name}
                    </p>
                  ))
                : null}
              <button
                type="button"
                data-testid="maison-import-undo"
                className="mt-2 font-semibold text-admin-ink underline"
                disabled={pending}
                onClick={handleUndo}
              >
                {locale === "es" ? "Deshacer importación" : "Undo import"}
              </button>
              <p className="text-[12px] text-admin-ink-dim">
                {locale === "es"
                  ? `Elimina los ${result.serviceDraftIds.length + result.faqDraftIds.length} borradores que creó esta importación. Nada más cambia.`
                  : `Removes the ${result.serviceDraftIds.length + result.faqDraftIds.length} drafts this import created. Nothing else changes.`}
              </p>
            </div>
          ) : null}
          {actionError ? <p className="text-[13px] text-red-800">{actionError}</p> : null}
        </div>
        <footer className="flex flex-wrap gap-2 border-t border-admin-border-soft px-4 py-3">
          <button
            type="button"
            data-testid="maison-import-continue"
            className="min-h-12 flex-1 rounded-xl bg-emerald-900 text-[14px] font-semibold text-white"
            onClick={onContinueDesigning}
          >
            {locale === "es" ? "Seguir diseñando" : "Continue designing"}
          </button>
          <Link
            href="/talent/services?from=website-setup&filter=draft"
            data-testid="maison-import-review-services"
            className="inline-flex min-h-12 flex-1 items-center justify-center rounded-xl border border-admin-border-soft text-[14px] font-semibold text-admin-ink"
          >
            {locale === "es" ? "Revisar servicios" : "Review services"}
          </Link>
        </footer>
      </>,
    );
  }

  if (step === "review") {
    return shell(
      <>
        <header className="border-b border-admin-border-soft px-4 py-3">
          <button
            type="button"
            data-testid="maison-import-back-choose"
            className="text-[13px] font-semibold text-admin-ink-muted"
            onClick={() => setStep("choose")}
          >
            ‹ {locale === "es" ? "Elegir" : "Choose"}
          </button>
          <h2 className="mt-1 text-[18px] font-semibold text-admin-ink">
            {locale === "es" ? "Revisar importación" : "Review import"}
          </h2>
        </header>
        <div className="flex-1 space-y-3 overflow-auto px-4 py-4">
          {duplicateKeys.length > 0 ? (
            <p className="text-[13px] font-semibold text-admin-ink" data-testid="maison-import-dup-count">
              {duplicateKeys.length === 1
                ? locale === "es"
                  ? "1 posible duplicado"
                  : "1 possible duplicate"
                : locale === "es"
                  ? `${duplicateKeys.length} posibles duplicados`
                  : `${duplicateKeys.length} possible duplicates`}
            </p>
          ) : null}
          {duplicateKeys.map((key) => {
            const svc = catalog.services.find((s) => s.key === key)!;
            const res = resolutions[key] ?? "keep_existing";
            const label =
              res === "keep_existing"
                ? locale === "es"
                  ? "Conservar servicio existente"
                  : "Keep existing service"
                : res === "add_as_draft"
                  ? locale === "es"
                    ? "Agregar como borrador nuevo"
                    : "Add as new draft"
                  : locale === "es"
                    ? "Omitir este inicial"
                    : "Skip this starter item";
            return (
              <div
                key={key}
                data-testid={`maison-import-dup-${key}`}
                className="rounded-xl border border-admin-border-soft px-3 py-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[13px] font-semibold text-admin-ink">{svc.name}</p>
                    <p className="text-[12px] text-admin-ink-muted">
                      {locale === "es"
                        ? "Posible coincidencia en tus servicios · "
                        : "Possible match in your services · "}
                      <span className="font-semibold">{label}</span>
                    </p>
                  </div>
                  <button
                    type="button"
                    className="text-[13px] font-semibold underline"
                    onClick={() => setChangeKey(changeKey === key ? null : key)}
                  >
                    {locale === "es" ? "Cambiar" : "Change"}
                  </button>
                </div>
                {changeKey === key ? (
                  <div className="mt-2 space-y-1 border-t border-admin-border-soft pt-2 text-[12px]">
                    {(
                      [
                        ["keep_existing", "Keep existing service", "Conservar servicio existente"],
                        ["add_as_draft", "Add as new draft", "Agregar como borrador nuevo"],
                        ["skip", "Skip this starter item", "Omitir este inicial"],
                      ] as const
                    ).map(([val, en, es]) => (
                      <button
                        key={val}
                        type="button"
                        className="block w-full rounded-lg px-2 py-2 text-left hover:bg-admin-surface-alt"
                        onClick={() => {
                          setResolutions((r) => ({ ...r, [key]: val }));
                          setChangeKey(null);
                        }}
                      >
                        {locale === "es" ? es : en}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}

          <p className="text-[13px] text-admin-ink" data-testid="maison-import-will-add">
            {locale === "es" ? "Se agregarán como borradores:" : "Will be added as drafts:"}{" "}
            <strong>
              {locale === "es"
                ? `Servicios ${draftServiceCount}`
                : `Service drafts ${draftServiceCount}`}
            </strong>
            {" · "}
            <strong>
              {locale === "es"
                ? `Preguntas FAQ ${sel.faqKeys.length}`
                : `FAQ prompts ${sel.faqKeys.length}`}
            </strong>
          </p>

          <button
            type="button"
            data-testid="maison-import-organize"
            className="flex w-full items-center justify-between rounded-xl border border-admin-border-soft px-3 py-2 text-[13px] font-semibold"
            onClick={() => setOrganizeOpen((v) => !v)}
          >
            <span>{locale === "es" ? "Organizar servicios importados" : "Organize imported services"}</span>
            <span className="font-normal text-admin-ink-muted">
              {locale === "es" ? "Ordenado automáticamente" : "Sorted automatically"}
            </span>
          </button>
          {organizeOpen ? (
            <div className="space-y-1 text-[12px] text-admin-ink-muted" data-testid="maison-import-organize-body">
              <p>
                Extensiones de uñas →{" "}
                {locale === "es" ? "Tu categoría · Uñas" : "Your category · Uñas"}
              </p>
              <p>
                {locale === "es"
                  ? "4 servicios de pestañas y cejas → Nueva categoría · Pestañas"
                  : "4 lash and brow services → New category · Pestañas"}
              </p>
            </div>
          ) : null}

          <p className="text-[12px] text-admin-ink-dim">
            {locale === "es"
              ? "Los borradores no aparecen en tu sitio público hasta que los revises y publiques."
              : "Drafts stay off your public site until you review and publish them."}
          </p>
          {actionError ? <p className="text-[13px] text-red-800">{actionError}</p> : null}
        </div>
        <footer className="border-t border-admin-border-soft px-4 py-3">
          <p className="mb-2 text-[12px] text-admin-ink-muted">
            {draftServiceCount} {locale === "es" ? "servicios" : "services"} · {sel.faqKeys.length}{" "}
            {locale === "es" ? "preguntas FAQ" : "FAQ prompts"}
            {sel.sectionKeys.length
              ? ` · ${sel.sectionKeys.length} ${locale === "es" ? "textos" : "section text"}`
              : ""}
          </p>
          <button
            type="button"
            data-testid="maison-import-commit"
            disabled={pending}
            onClick={handleCommit}
            className="min-h-12 w-full rounded-xl bg-emerald-900 text-[14px] font-semibold text-white disabled:opacity-50"
          >
            {locale === "es" ? "Importar contenido seleccionado" : "Import selected content"}
          </button>
        </footer>
      </>,
    );
  }

  // Choose step
  const svcState = groupTriState(sel.serviceKeys.length, catalog.services.length);
  const faqState = groupTriState(sel.faqKeys.length, catalog.faqs.length);
  const secState = groupTriState(sel.sectionKeys.length, catalog.sectionText.length);

  return shell(
    <>
      <header className="border-b border-admin-border-soft px-4 py-3">
        <button type="button" onClick={onClose} className="text-[13px] font-semibold text-admin-ink-muted">
          {maisonSetupT(locale, "Close")}
        </button>
        <h2 className="mt-1 text-[18px] font-semibold text-admin-ink" data-testid="maison-import-heading">
          {locale === "es" ? "Agregar contenido inicial" : "Add starter content"}
        </h2>
        <p className="mt-0.5 text-[13px] text-admin-ink-muted">
          {locale === "es"
            ? "Elige lo que te ayude. Lo importado se guarda como borradores."
            : "Choose what helps. Imported items are saved as drafts."}
        </p>
      </header>

      <div className="flex-1 space-y-2 overflow-auto px-4 py-3">
        {/* Services group */}
        <div data-testid="maison-import-group-services" className="rounded-xl border border-admin-border-soft">
          <div className="flex items-center gap-1 px-2 py-1">
            <button
              type="button"
              data-testid="maison-import-group-services-check"
              aria-label="Select all services"
              className="flex h-11 w-11 items-center justify-center text-[16px]"
              onClick={() => setGroupAll("services", svcState !== "all")}
            >
              {svcState === "all" ? "☑" : svcState === "some" ? "–" : "☐"}
            </button>
            <button
              type="button"
              data-testid="maison-import-group-services-chevron"
              className="flex min-h-11 flex-1 items-center justify-between px-1 text-left text-[13px] font-semibold"
              onClick={() => setOpenGroups((g) => ({ ...g, services: !g.services }))}
            >
              <span>
                {locale === "es" ? "Servicios iniciales" : "Starter services"} ·{" "}
                {catalog.services.length} {locale === "es" ? "disponibles" : "available"} ·{" "}
                {sel.serviceKeys.length} {locale === "es" ? "seleccionados" : "selected"}
              </span>
              <span>{openGroups.services ? "▴" : "▾"}</span>
            </button>
          </div>
          {openGroups.services
            ? catalog.services.map((svc) => (
                <div
                  key={svc.key}
                  data-testid={`maison-import-svc-${svc.key}`}
                  className="flex items-start gap-2 border-t border-admin-border-soft px-3 py-2"
                >
                  <button
                    type="button"
                    className="mt-0.5 flex h-11 w-11 items-center justify-center"
                    onClick={() =>
                      setSel((s) => ({ ...s, serviceKeys: toggleKey(s.serviceKeys, svc.key) }))
                    }
                  >
                    {sel.serviceKeys.includes(svc.key) ? "☑" : "☐"}
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold text-admin-ink">{svc.name}</p>
                    <p className="text-[12px] text-admin-ink-muted">
                      {svc.category} ·{" "}
                      {locale === "es" ? "Solo imagen de vista previa" : "Preview image only"}
                    </p>
                    <button
                      type="button"
                      className="text-[12px] font-semibold underline"
                      onClick={() => setDetailKey(detailKey === svc.key ? null : svc.key)}
                    >
                      {locale === "es" ? "Detalles" : "Details"}
                    </button>
                    {detailKey === svc.key ? (
                      <p className="mt-1 text-[12px] text-admin-ink-dim">
                        ${svc.priceMxn} MXN · {svc.durationMin} min
                      </p>
                    ) : null}
                  </div>
                </div>
              ))
            : null}
        </div>

        {/* FAQ group */}
        <div data-testid="maison-import-group-faqs" className="rounded-xl border border-admin-border-soft">
          <div className="flex items-center gap-1 px-2 py-1">
            <button
              type="button"
              data-testid="maison-import-group-faqs-check"
              className="flex h-11 w-11 items-center justify-center text-[16px]"
              onClick={() => setGroupAll("faqs", faqState !== "all")}
            >
              {faqState === "all" ? "☑" : faqState === "some" ? "–" : "☐"}
            </button>
            <button
              type="button"
              data-testid="maison-import-group-faqs-chevron"
              className="flex min-h-11 flex-1 items-center justify-between px-1 text-left text-[13px] font-semibold"
              onClick={() => setOpenGroups((g) => ({ ...g, faqs: !g.faqs }))}
            >
              <span>
                {locale === "es" ? "Preguntas FAQ" : "FAQ prompts"} · {catalog.faqs.length}{" "}
                {locale === "es" ? "disponibles" : "available"} · {sel.faqKeys.length}{" "}
                {locale === "es" ? "seleccionados" : "selected"}
              </span>
              <span>{openGroups.faqs ? "▴" : "▾"}</span>
            </button>
          </div>
          {openGroups.faqs
            ? catalog.faqs.map((faq) => (
                <label
                  key={faq.key}
                  data-testid={`maison-import-faq-${faq.key}`}
                  className="flex cursor-pointer items-start gap-2 border-t border-admin-border-soft px-3 py-2 text-[13px]"
                >
                  <input
                    type="checkbox"
                    className="mt-1 h-5 w-5"
                    checked={sel.faqKeys.includes(faq.key)}
                    onChange={() =>
                      setSel((s) => ({ ...s, faqKeys: toggleKey(s.faqKeys, faq.key) }))
                    }
                  />
                  <span>{faq.question}</span>
                </label>
              ))
            : null}
        </div>

        {/* Section text — no images group (W47) */}
        {!catalog.imagesLicensedForReuse ? null : null}
        <div data-testid="maison-import-group-sections" className="rounded-xl border border-admin-border-soft">
          <div className="flex items-center gap-1 px-2 py-1">
            <button
              type="button"
              data-testid="maison-import-group-sections-check"
              className="flex h-11 w-11 items-center justify-center text-[16px]"
              onClick={() => setGroupAll("sections", secState !== "all")}
            >
              {secState === "all" ? "☑" : secState === "some" ? "–" : "☐"}
            </button>
            <button
              type="button"
              data-testid="maison-import-group-sections-chevron"
              className="flex min-h-11 flex-1 items-center justify-between px-1 text-left text-[13px] font-semibold"
              onClick={() => setOpenGroups((g) => ({ ...g, sections: !g.sections }))}
            >
              <span>
                {locale === "es" ? "Texto de sección" : "Section text"} ·{" "}
                {catalog.sectionText.length} {locale === "es" ? "disponibles" : "available"} ·{" "}
                {sel.sectionKeys.length} {locale === "es" ? "seleccionados" : "selected"}
              </span>
              <span>{openGroups.sections ? "▴" : "▾"}</span>
            </button>
          </div>
          {openGroups.sections
            ? catalog.sectionText.map((sec) => (
                <label
                  key={sec.key}
                  data-testid={`maison-import-sec-${sec.key}`}
                  className="flex cursor-pointer items-start gap-2 border-t border-admin-border-soft px-3 py-2 text-[13px]"
                >
                  <input
                    type="checkbox"
                    className="mt-1 h-5 w-5"
                    checked={sel.sectionKeys.includes(sec.key)}
                    onChange={() =>
                      setSel((s) => ({ ...s, sectionKeys: toggleKey(s.sectionKeys, sec.key) }))
                    }
                  />
                  <span>{locale === "es" ? sec.labelEs : sec.labelEn}</span>
                </label>
              ))
            : null}
        </div>

        <p className="text-[12px] text-admin-ink-dim" data-testid="maison-import-preview-only-note">
          {locale === "es"
            ? "Las fotos de esta demo son solo de vista previa y no se ofrecen para importar. El estilo del menú y el orden de secciones son ajustes de diseño; vienen con el diseño."
            : "This demo's photos are for preview only and are not offered for import. Menu style and section order are design settings, not content; they come with the design."}
        </p>
      </div>

      <footer className="sticky bottom-0 border-t border-admin-border-soft bg-white px-4 py-3">
        <p className="mb-2 text-[12px] text-admin-ink-muted" data-testid="maison-import-summary">
          {selectionSummaryLine(sel, locale)}
        </p>
        <button
          type="button"
          data-testid="maison-import-review"
          disabled={counts.total === 0 || pending}
          onClick={() => setStep("review")}
          className="min-h-12 w-full rounded-xl bg-emerald-900 text-[14px] font-semibold text-white disabled:opacity-40"
        >
          {locale === "es" ? "Revisar importación" : "Review import"}
        </button>
      </footer>
    </>,
  );
}
