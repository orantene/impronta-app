"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { PromoCallout, MonthRollup } from "@/components/promos/results";
import { PromoShareSheet } from "@/components/promos/share/promo-share-sheet";
import { PageHeader } from "@/components/admin/shell/internal/talent/shared/page-chrome-1";
import { Icon } from "@/components/admin/shell/internal/primitives";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { useDashboardLocale } from "@/i18n/use-dashboard-locale";
import { loadPromosPage, type PromoListItem, type PromosPageData } from "@/lib/promos/actions";
import { promoCopy } from "@/lib/promos/copy/talent";
import { buildCaption } from "@/lib/promos/share/captions";
import { groupByTab, type PromoTab } from "@/lib/promos/talent-view";
import { TEMPLATE_ORDER, buildDraft, type PromoDraft, type TemplateKey } from "@/lib/promos/templates";
import { PromoCard } from "./PromoCard";
import { PromoDetailSheet } from "./PromoDetailSheet";
import { QuickCreateDrawer } from "./QuickCreateDrawer";
import { TemplateGrid } from "./TemplateGrid";
import { Chip, InfoTip, UI } from "./ui";

const CALLOUT_TEMPLATE = {
  cancellation: "last_minute",
  empty_days: "fill_week",
  lapsed_clients: "come_back",
  idle_service: "custom",
} as const satisfies Record<string, TemplateKey>;

type Editor = { draft: PromoDraft; editingId: string | null; used: number; key: string };

export function PromosPage() {
  const copy = promoCopy(useDashboardLocale());
  const router = useRouter();
  const params = useSearchParams();
  const [data, setData] = useState<PromosPageData | null>(null);
  const [failed, setFailed] = useState(false);
  const [tab, setTab] = useState<PromoTab>("live");
  const [picker, setPicker] = useState(false);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [shareId, setShareId] = useState<string | null>(null);
  const consumed = useRef<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const r = await loadPromosPage();
      if (r.ok) {
        setData(r.data);
        setFailed(false);
      } else setFailed(true);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  // On a cold load the shell's first router refresh can abort this action's
  // request, and an aborted server action never settles. Retry until data lands.
  useEffect(() => {
    if (data || failed) return;
    let tries = 0;
    const t = setInterval(() => {
      tries += 1;
      if (tries > 4) clearInterval(t);
      else void reload();
    }, 2500);
    return () => clearInterval(t);
  }, [data, failed, reload]);

  const start = useCallback(
    (key: TemplateKey) => {
      if (!data) return;
      const addon = data.addons[0] ?? null;
      const draft = buildDraft(key, {
        now: data.nowIso,
        tz: data.tz,
        currency: data.currency,
        locale: copy.locale,
        addon: addon ? { id: addon.id, list_cents: addon.list_cents } : null,
        trialAvailable: data.plan === "free" && !data.trialUsed,
      });
      setPicker(false);
      setEditor({ draft, editingId: null, used: 0, key: `${key}-${Date.now()}` });
    },
    [data, copy.locale],
  );

  // A callout (or a link) can open a template directly: /talent/promos?new=fill_week
  const wanted = params.get("new");
  useEffect(() => {
    if (!data || !wanted || consumed.current === wanted) return;
    if ((TEMPLATE_ORDER as readonly string[]).includes(wanted)) {
      consumed.current = wanted;
      start(wanted as TemplateKey);
      router.replace("/talent/promos");
    }
  }, [data, wanted, start, router]);

  if (failed && !data) {
    return (
      <div className="flex flex-col gap-3">
        <PageHeader title={copy.t("page.title")} />
        <p role="alert" className={`${UI.card} p-4 text-[14px] ${UI.ink}`}>{copy.t("page.error")}</p>
        <button type="button" className={`${UI.secondary} self-start`} onClick={() => void reload()}>{copy.t("page.retry")}</button>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="flex flex-col gap-3" aria-busy="true">
        <PageHeader title={copy.t("page.title")} />
        <p className={`text-[13px] ${UI.muted}`}>{copy.t("page.loading")}</p>
      </div>
    );
  }

  const groups = groupByTab(data.promos.map((p) => ({ ...p, ends_at: p.promo.ends_at ?? null, tz: p.promo.tz })));
  const list = groups[tab];
  const detail = data.promos.find((p) => p.id === detailId) ?? null;
  const shareItem = data.promos.find((p) => p.id === shareId) ?? null;
  const empty = data.promos.length === 0;

  const openEdit = (item: PromoListItem) => {
    setDetailId(null);
    setEditor({ draft: item.draft, editingId: item.id, used: item.used, key: `${item.id}-${Date.now()}` });
  };

  return (
    <div className="flex flex-col gap-3.5">
      <PageHeader
        title={copy.t("page.title")}
        actions={
          <button type="button" className={`${UI.primary} min-h-11`} onClick={() => setPicker(true)}>
            <Icon name="plus" size={15} stroke={2} color="currentColor" />
            {copy.t("page.new")}
          </button>
        }
      />

      {data.plan === "free" ? (
        <p className={`flex items-center justify-between rounded-xl bg-[var(--tc-soft,#e6f4f1)] pl-3 text-[13px] font-medium ${UI.ink}`}>
          {data.trialUsed ? copy.t("free.trial_used") : copy.t("free.banner")}
          <InfoTip text={copy.t("free.info")} label={copy.t("info.label")} />
        </p>
      ) : null}

      {data.callout ? (
        <PromoCallout callout={data.callout} lang={copy.locale} createHref={`/talent/promos?new=${CALLOUT_TEMPLATE[data.callout.type]}`} />
      ) : null}

      <MonthRollup rollup={data.results.month} currency={data.currency} lang={copy.locale} />

      {empty ? (
        <section className="flex flex-col gap-3">
          <div>
            <h2 className={`text-[17px] font-semibold ${UI.ink}`}>{copy.t("empty.title")}</h2>
            <p className={`text-[13px] ${UI.muted}`}>{copy.t("empty.sub")}</p>
          </div>
          <TemplateGrid copy={copy} onPick={start} />
        </section>
      ) : (
        <>
          <div role="tablist" className="flex gap-2 overflow-x-auto">
            {(["live", "scheduled", "past"] as const).map((k) => (
              <Chip key={k} active={tab === k} onClick={() => setTab(k)}>
                {copy.t(`tab.${k}` as const)} {groups[k].length > 0 ? groups[k].length : ""}
              </Chip>
            ))}
          </div>
          {list.length === 0 ? (
            <p className={`${UI.card} p-4 text-[13px] ${UI.muted}`}>{copy.t(`tab.empty.${tab}` as const)}</p>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {list.map((it) => (
                <li key={it.id}>
                  <PromoCard item={it} copy={copy} onOpen={() => setDetailId(it.id)} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <Sheet open={picker} onOpenChange={setPicker}>
        <SheetContent side="bottom" aria-describedby={undefined} className="max-h-[92vh] overflow-y-auto rounded-t-3xl bg-[var(--tc-canvas,#fafafa)] p-4">
          <SheetTitle className={`text-[17px] font-semibold ${UI.ink}`}>{copy.t("picker.title")}</SheetTitle>
          <SheetDescription className={`mb-3 text-[13px] ${UI.muted}`}>{copy.t("picker.sub")}</SheetDescription>
          <TemplateGrid copy={copy} onPick={start} />
        </SheetContent>
      </Sheet>

      {editor ? (
        <QuickCreateDrawer
          key={editor.key}
          open
          onClose={() => setEditor(null)}
          copy={copy}
          data={data}
          initial={editor.draft}
          editingId={editor.editingId}
          usedCount={editor.used}
          onSaved={() => void reload()}
        />
      ) : null}

      <PromoDetailSheet
        item={detail}
        data={data}
        copy={copy}
        onClose={() => setDetailId(null)}
        onEdit={openEdit}
        onShare={(it) => setShareId(it.id)}
        onChanged={() => void reload()}
      />

      {shareItem && shareItem.link_slug ? (
        <PromoShareSheet
          open
          onClose={() => setShareId(null)}
          promoId={shareItem.id}
          promoName={shareItem.name}
          slug={shareItem.link_slug}
          origin={typeof window === "undefined" ? "" : window.location.origin}
          profileCode={data.profileCode || null}
          defaultLang={copy.locale}
          captions={{
            es: buildCaption({ promo: shareItem.promo, lang: "es", link: "{link}" }),
            en: buildCaption({ promo: shareItem.promo, lang: "en", link: "{link}" }),
          }}
          code={shareItem.promo.unlock === "code" ? shareItem.promo.code ?? null : null}
          printEnabled={data.plan === "paid"}
        />
      ) : null}
    </div>
  );
}
