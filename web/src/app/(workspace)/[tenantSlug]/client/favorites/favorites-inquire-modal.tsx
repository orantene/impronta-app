"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  FavoritesModalView,
  TULALA_LIGHT_SURFACE,
  useFavoritesSelection,
  type FavoriteModalTalent,
  type FavoritesModalCopy,
  type FavoritesModalTokens,
} from "@/components/directory/favorites-modal-view";
import { ClientConfirmDialog } from "../_components/ConfirmDialog";
import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";

/**
 * Client-dashboard favorites → inquiry modal. Same redesigned surface as the
 * public storefront modal (rich 4:5 cards + per-talent select), but bridged
 * through the dashboard's OWN canonical multi-talent path: POST
 * /api/discover/inquiry with the selected talent ids (the exact endpoint the
 * Shortlists "send inquiry" uses), then route to the inquiries thread.
 *
 * Why not the chat launcher / `requestOpenChat()` like the public modal? The
 * authed client dashboard mounts no chat launcher, and the public inquiry sheet
 * resolves its tenant from the PUBLIC host (it would render a closed state on
 * the workspace host). The discover-inquiry endpoint is the dashboard's real,
 * host-independent lineup → inquiry bridge. Favorites (`client_favorites`) are
 * never merged into anything — the selected ids are sent straight to the engine.
 *
 * The panel is portaled to <body>, which sits OUTSIDE the dashboard's
 * `.client-root` token scope, so explicit light tokens are passed (the cascade
 * can't reach a body portal here).
 */
// On-brand editorial gold (deep enough for AA on the ivory surface). The
// dashboard portal escapes the cascade, so the accent is set explicitly here;
// it matches the storefront's resolved tenant gold for one consistent look.
const DASHBOARD_TOKENS: FavoritesModalTokens = {
  ...TULALA_LIGHT_SURFACE,
  accent: "#9a7b1f",
};

export function FavoritesInquireModal({
  open,
  onOpenChange,
  talents,
  tenantSlug,
  onRemove,
  onClearAll,
  cardCssVars,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  talents: FavoriteModalTalent[];
  tenantSlug: string;
  onRemove: (id: string) => void;
  onClearAll: () => void;
  cardCssVars?: Record<string, string>;
}) {
  const router = useRouter();
  const t = useT();
  const [pending, setPending] = useState(false);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);

  const COPY = useMemo<FavoritesModalCopy>(() => ({
    title: t("dashboard.clientFavorites.modalTitle"),
    subtitle: t("dashboard.clientFavorites.modalSubtitle"),
    close: t("dashboard.clientFavorites.modalClose"),
    selectAll: t("dashboard.clientFavorites.modalSelectAll"),
    clearSelection: t("dashboard.clientFavorites.modalClearSelection"),
    selectedOfCount: t("dashboard.clientFavorites.modalSelectedOfCount"),
    inquireZero: t("dashboard.clientFavorites.modalInquireZero"),
    inquireOne: t("dashboard.clientFavorites.modalInquireOne"),
    inquireMany: t("dashboard.clientFavorites.modalInquireMany"),
    inquirePending: t("dashboard.clientFavorites.modalInquirePending"),
    clearAll: t("dashboard.clientFavorites.modalClearAll"),
    favoritesPageLabel: "",
    saveForever: "",
    saveForeverFollows: "",
    viewProfile: t("dashboard.clientFavorites.modalViewProfile"),
    selectAria: t("dashboard.clientFavorites.modalSelectAria"),
    deselectAria: t("dashboard.clientFavorites.modalDeselectAria"),
    removeAria: t("dashboard.clientFavorites.modalRemoveAria"),
    hiddenUnavailable: t("dashboard.clientFavorites.modalHiddenUnavailable"),
    emptyTitle: t("dashboard.clientFavorites.modalEmptyTitle"),
    emptyDescription: t("dashboard.clientFavorites.modalEmptyDescription"),
  }), [t]);

  const talentIds = useMemo(() => talents.map((tt) => tt.id), [talents]);
  const { selectedIds, toggle, selectAll, clear, drop } = useFavoritesSelection(
    talentIds,
    open,
  );

  const handleRemove = useCallback(
    (id: string) => {
      onRemove(id);
      drop(id);
    },
    [onRemove, drop],
  );

  // Clear-all un-favorites the client's ENTIRE saved lineup — a destructive,
  // irreversible action. Gate it behind a styled confirm instead of firing it
  // straight from the footer button.
  const requestClearAll = useCallback(() => {
    setClearConfirmOpen(true);
  }, []);
  const performClearAll = useCallback(() => {
    setClearConfirmOpen(false);
    onClearAll();
    clear();
  }, [onClearAll, clear]);

  const onInquire = useCallback(async () => {
    const selected = talents
      .filter((tt) => selectedIds.has(tt.id))
      .map((tt) => tt.id);
    if (selected.length === 0) return;
    setPending(true);
    try {
      const res = await fetch("/api/discover/inquiry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ talentIds: selected }),
      });
      const data = (await res.json().catch(() => null)) as {
        inquiries?: unknown[];
        skipped?: unknown[];
        error?: string;
      } | null;
      if (!res.ok) {
        toast.error(data?.error || t("dashboard.clientFavorites.inquiryErrorGeneric"));
        return;
      }
      const created = Array.isArray(data?.inquiries) ? data.inquiries.length : 0;
      const skipped = Array.isArray(data?.skipped) ? data.skipped.length : 0;
      let msg = t("dashboard.clientFavorites.inquirySent");
      if (created > 0) {
        const base = created === 1
          ? t("dashboard.clientFavorites.sentOne")
          : interpolate(t("dashboard.clientFavorites.sentMany"), { count: created });
        const skippedSuffix = skipped > 0
          ? interpolate(t(skipped === 1 ? "dashboard.clientFavorites.skippedSuffixOne" : "dashboard.clientFavorites.skippedSuffixMany"), { count: skipped })
          : "";
        msg = base + skippedSuffix;
      }
      toast.success(msg);
      onOpenChange(false);
      router.push(`/${tenantSlug}/client/inquiries`);
    } catch {
      toast.error(t("dashboard.clientFavorites.inquiryErrorGeneric"));
    } finally {
      setPending(false);
    }
  }, [talents, selectedIds, tenantSlug, router, onOpenChange, t]);

  return (
    <>
      <FavoritesModalView
        open={open}
        onOpenChange={onOpenChange}
        talents={talents}
        totalCount={talents.length}
        loading={false}
        selectedIds={selectedIds}
        onToggleSelect={toggle}
        onSelectAll={selectAll}
        onClearSelection={clear}
        onRemove={handleRemove}
        onClearAll={requestClearAll}
        onInquire={onInquire}
        inquirePending={pending}
        isAuthenticated
        signupHref="#"
        favoritesPageHref={null}
        copy={COPY}
        tokens={DASHBOARD_TOKENS}
        cardCssVars={cardCssVars}
      />
      <ClientConfirmDialog
        open={clearConfirmOpen}
        onClose={() => setClearConfirmOpen(false)}
        onConfirm={performClearAll}
        destructive
        // Sits above the favorites Radix dialog (overlay z-[120] / panel z-[121]).
        zIndex={130}
        title={t("dashboard.clientConfirm.clearFavoritesTitle")}
        body={t("dashboard.clientConfirm.clearFavoritesBody")}
        confirmLabel={t("dashboard.clientConfirm.clearFavoritesConfirm")}
        cancelLabel={t("dashboard.clientConfirm.keep")}
      />
    </>
  );
}
