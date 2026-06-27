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
const DASHBOARD_TOKENS: FavoritesModalTokens = {
  ...TULALA_LIGHT_SURFACE,
  accent: "#1D4ED8",
};

const COPY: FavoritesModalCopy = {
  title: "Your saved talent",
  subtitle: "Pick who you want to inquire about, then send to the agency.",
  close: "Close",
  selectAll: "Select all",
  clearSelection: "Clear selection",
  selectedOfCount: "{selected} of {total} selected",
  inquireZero: "Select talent to inquire",
  inquireOne: "Send inquiry about 1 selected",
  inquireMany: "Send inquiry about the {count} selected",
  inquirePending: "Sending your inquiry...",
  clearAll: "Clear all",
  favoritesPageLabel: "",
  saveForever: "",
  saveForeverFollows: "",
  viewProfile: "View profile",
  selectAria: "Select {name}",
  deselectAria: "Deselect {name}",
  removeAria: "Remove {name}",
  hiddenUnavailable: "{count} hidden",
  emptyTitle: "No talent selected",
  emptyDescription: "Close this and tap the heart on a talent to save them here.",
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
  const [pending, setPending] = useState(false);

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

  const handleClearAll = useCallback(() => {
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
        toast.error(data?.error || "Could not send your inquiry. Please try again.");
        return;
      }
      const created = Array.isArray(data?.inquiries) ? data.inquiries.length : 0;
      const skipped = Array.isArray(data?.skipped) ? data.skipped.length : 0;
      toast.success(
        created > 0
          ? `Sent ${created} ${created === 1 ? "inquiry" : "inquiries"}.${
              skipped > 0
                ? ` ${skipped} talent${skipped === 1 ? " was" : "s were"} skipped (reach them directly).`
                : ""
            }`
          : "Inquiry sent.",
      );
      onOpenChange(false);
      router.push(`/${tenantSlug}/client/inquiries`);
    } catch {
      toast.error("Could not send your inquiry. Please try again.");
    } finally {
      setPending(false);
    }
  }, [talents, selectedIds, tenantSlug, router, onOpenChange]);

  return (
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
      onClearAll={handleClearAll}
      onInquire={onInquire}
      inquirePending={pending}
      isAuthenticated
      signupHref="#"
      favoritesPageHref={null}
      copy={COPY}
      tokens={DASHBOARD_TOKENS}
      cardCssVars={cardCssVars}
    />
  );
}
