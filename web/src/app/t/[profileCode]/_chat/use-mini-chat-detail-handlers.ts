/**
 * useDetailHandlers — MiniChatPanel's thread-switch + chip / talent / brief /
 * contact / retry-sync handlers. Extracted verbatim from MiniChatPanel.tsx
 * (W1-A decomposition pre-pass) to keep that file under the 800-line cap.
 * Named as a hook (not a plain factory) so the two refs it closes over
 * (lastSeenIsoRef, lastPatchRef) are passed in the hooks-aware way — a plain
 * function receiving refs gets flagged by react-hooks/refs as "may read a
 * ref during render". Calls no hooks itself; it is a stable per-render
 * closure builder, exactly mirroring the original inline functions'
 * closures. No logic changes.
 */

import type { Dispatch, MutableRefObject, SetStateAction } from "react";

import type { GuestChipKind, GuestChipValue } from "@/lib/inquiry/guest-chat-contract";
import type { UnifiedInquiryPatch } from "./use-unified-inquiry";
import type { StreamRow } from "./MiniChatMessageBubble";
import type { MiniChatPanelLocalProps } from "./mini-chat-panel-props";
import { chipValueToPatch } from "./unified-inquiry-bridge";
import { reconcileCartRemovals } from "./mini-chat-panel-helpers";
import { EMAIL_RE, splitGuestFullName } from "./mini-chat-styles";

type Stage = "intro" | "gate" | "thread";

export function useDetailHandlers({
  inquiryId,
  setInquiryId,
  setRows,
  lastSeenIsoRef,
  setStage,
  setCapturedChipKinds,
  setCapturedChipValues,
  lastPatchRef,
  patch,
  promoteContact,
  cartTalentIds,
  onRemoveCartTalent,
  setFirstName,
  setLastName,
  setEmail,
}: {
  inquiryId: string | null;
  setInquiryId: Dispatch<SetStateAction<string | null>>;
  setRows: Dispatch<SetStateAction<StreamRow[]>>;
  lastSeenIsoRef: MutableRefObject<string | null>;
  setStage: Dispatch<SetStateAction<Stage>>;
  setCapturedChipKinds: Dispatch<SetStateAction<GuestChipKind[]>>;
  setCapturedChipValues: Dispatch<
    SetStateAction<Partial<Record<GuestChipKind, GuestChipValue>>>
  >;
  lastPatchRef: MutableRefObject<UnifiedInquiryPatch | null>;
  patch: (p: UnifiedInquiryPatch) => Promise<void>;
  promoteContact: (value: {
    name: string;
    email: string;
    phone?: string | null;
  }) => Promise<boolean>;
  cartTalentIds: MiniChatPanelLocalProps["cartTalentIds"];
  onRemoveCartTalent: MiniChatPanelLocalProps["onRemoveCartTalent"];
  setFirstName: Dispatch<SetStateAction<string>>;
  setLastName: Dispatch<SetStateAction<string>>;
  setEmail: Dispatch<SetStateAction<string>>;
}) {
  // Named switch handler — shared by mini-mode dropdown + expanded left pane.
  function handleSwitchInquiry(id: string) {
    if (id === inquiryId) return;
    setInquiryId(id);
    setRows([]);
    lastSeenIsoRef.current = null;
    setStage("thread");
    setCapturedChipKinds([]);
  }

  // Finding #3: re-run the exact last failed patch when the draft banner's retry
  // is tapped (no-op when nothing has been patched yet).
  function handleRetrySync() {
    const last = lastPatchRef.current;
    if (last) void patch(last);
  }

  // P1-T1/T2: a chip edit routes through the unified hook (optimistic local
  // display, then patch() the single record; micro-status via unified.fieldState).
  async function handleChipPatch(kind: GuestChipKind, value: GuestChipValue) {
    setCapturedChipValues((prev) => ({ ...prev, [kind]: value }));
    setCapturedChipKinds((k) => (k.includes(kind) ? k : [...k, kind]));
    const p = chipValueToPatch(kind, value);
    if (!p) return;
    lastPatchRef.current = p;
    await patch(p);
  }

  // Phase 2 / Addendum A: Talent / Brief / Contact editors route through the SAME
  // useUnifiedInquiry.patch path as the chips (one record, synced thread note).
  async function handleTalentChange(
    selectedIds: string[],
    selectionMode: "i_know_who" | "agency_recommends",
    selectedNames: string[],
  ) {
    // Keep the launcher cart (the rail's single source) in sync: a cart talent
    // dropped in-chat is also removed from the cart, so rail + form + record agree.
    reconcileCartRemovals(selectedIds, cartTalentIds, onRemoveCartTalent);
    lastPatchRef.current = { kind: "talent", selectedIds, selectionMode, selectedNames };
    await patch({ kind: "talent", selectedIds, selectionMode, selectedNames });
  }

  async function handleBriefChange(summary: string) {
    lastPatchRef.current = { kind: "brief", summary };
    await patch({ kind: "brief", summary });
  }

  async function handleContactChange(value: {
    name: string;
    email: string;
    phone: string;
  }) {
    // Mirror into the gate state so a later first-message send is pre-satisfied.
    if (value.name) {
      const parts = splitGuestFullName(value.name);
      setFirstName(parts.firstName);
      setLastName(parts.lastName);
    }
    if (value.email) setEmail(value.email);
    // When the editor supplies a complete, valid contact, PROMOTE the early row
    // (flips contactPromoted) so a later send continues the thread instead of
    // re-forcing the gate. Partial edits fall back to a debounced patch.
    if (value.name.trim() && EMAIL_RE.test(value.email.trim())) {
      await promoteContact({
        name: value.name.trim(),
        email: value.email.trim(),
        phone: value.phone.trim() || null,
      });
      return;
    }
    const contactPatch: UnifiedInquiryPatch = {
      kind: "contact",
      name: value.name || null,
      email: value.email || null,
      phone: value.phone || null,
    };
    lastPatchRef.current = contactPatch;
    await patch(contactPatch);
  }

  return {
    handleSwitchInquiry,
    handleRetrySync,
    handleChipPatch,
    handleTalentChange,
    handleBriefChange,
    handleContactChange,
  };
}
