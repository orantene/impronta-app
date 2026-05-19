/**
 * MessagesShell — three distinct product shells on one shared engine.
 *
 * The data model is one chain (request → inquiry → offer → booking)
 * but each role gets a deliberately different product:
 *
 *   pov="admin"   → AdminOperationsShell  (operations console)
 *                   • thread hierarchy: Client thread is PRIMARY,
 *                     Talent group + Internal notes are SECONDARY
 *                   • right rail: Lineup · Offer builder · Coordinator ·
 *                     Activity · Files
 *                   • feel: "I am running this deal"
 *
 *   pov="talent"  → TalentJobShell       (assignment-centric)
 *                   • detail = job card, NOT chat-first
 *                   • hero: status, dates, location, your-take-home
 *                   • big actions: Accept · Decline · Hold · Request change
 *                   • conversation is secondary at the bottom
 *                   • feel: "What is this job and what do I do?"
 *
 *   pov="client"  → ClientProjectShell   (project status)
 *                   • detail = project status page, NOT chat-first
 *                   • hero: stage progress · single primary "Next action" CTA
 *                   • agency card · talent lineup · schedule · timeline
 *                   • conversation is at the bottom (single thread)
 *                   • feel: "Calm, premium, guided. Where does this stand?"
 *
 * The shells SHARE the design system (avatars, trust badges, primitives)
 * but the layouts, hierarchies, list rows, filter chips, and detail
 * structures are deliberately different per role. A single inquiry will
 * look like three different products depending on who's looking.
 *
 * Data:
 *   admin uses RICH_INQUIRIES (workspace data)
 *   talent + client use MOCK_CONVERSATIONS (talent-side data)
 *
 * Companion spec: ./docs/canonical-flow.json + MESSAGING_FLOW.md
 */

"use client";

// ════════════════════════════════════════════════════════════════════
// Phase 1c — messages.tsx is now a thin POV dispatcher + re-export
// barrel. Bodies live in ./messages/* (byte-for-byte moves). Every
// symbol this module historically exported is re-exported below so
// external importers stay byte-unbroken.
// ════════════════════════════════════════════════════════════════════

import { AdminOperationsShell } from "./messages/AdminOperationsShell";
import { TalentJobShell } from "./messages/TalentJobShell";
import { ClientProjectShell } from "./messages/ClientProjectShell";
import type { MessagesPov } from "./messages/messages-shared";

export { INQUIRY_TO_CONV_GLOBAL, appendLocalMessage, applyOfferOverride, applyRowOverrides, archiveInquiry, clearHandoff, clearRowOverrides, consumePendingConversation, consumePendingThreadTab, getEffectiveOffer, getIncomingHandoffs, getRowOverride, isLocallySeen, isManualUnread, isPinned, markConvSeen, pinNextConversation, pinNextThreadTab, readConvNote, readLocalMessages, recordHandoff, routeToInquiry, setRowOverride, toggleManualUnread, togglePin, writeConvNote } from "./messages/conversation-stash";
export { ageLabel } from "./messages/messages-shared";
export type { MessagesPov } from "./messages/messages-shared";
export { getWorkspaceIdentity, usePresence } from "./messages/shared/inbox-identity-1";
export type { Presence, WorkspaceIdentity } from "./messages/shared/inbox-identity-1";
export { TALENT_RATE_FOR_CONV } from "./messages/shared/inbox-layout-1";
export { buildInquiryTabs } from "./messages/shared/machinery-1";
export { CoordinatorNoteBubble, LogisticsTab, PaymentTab, ShellNextActionBar, SystemEventBubble, chatSystemEventsFor, resolveShellAction } from "./messages/shared/machinery-6";
export type { DetailsPov, ShellAction } from "./messages/shared/machinery-6";
export { DetailsPanel, PageTopUtility } from "./messages/shared/machinery-7";
export { InquiryComposer, PageTopCollection, PageTopThread, getProtoInquiries } from "./messages/shared/machinery-8";
export type { ChatSubThreadId, ComposerDraft, ComposerMode, ThreadTabId } from "./messages/shared/machinery-8";
export { isTalentCoordOnOffer, talentCoordCombinedTotal } from "./messages/shared/machinery-9";


export function MessagesShell({ pov }: { pov: MessagesPov }) {
  if (pov === "admin")  return <AdminOperationsShell />;
  if (pov === "talent") return <TalentJobShell />;
  return <ClientProjectShell />;
}
