"use client";

import { useEffect, useMemo, useState, useTransition } from "react";

import { messagingTalentStartConversation } from "@/lib/server-actions/messaging-talent-writes";
import { loadTalentClients } from "@/lib/talent/clients-actions";
import type { TalentClientRow } from "@/lib/talent/clients-merge";
import { loadTalentOfferingsForEditor } from "@/lib/talent/offerings-actions";
import { formatOfferingPrice, type TalentOffering } from "@/lib/talent/offerings-types";

import { useAdminShell } from "../../state";
import { AgendaPanelFrame, createPanelStore } from "./AgendaPanelFrame";
import { TaskShell } from "./primitives/TaskShell";
import { useAgendaCopy } from "./use-agenda-copy";

/**
 * Send quote as ONE shared panel over Today and Messages (mockup tc_ctas,
 * mc_inquiry): pick a client, pick one of her offerings, add a note. It creates
 * the conversation through the inquiry funnel (createInquiryFromIntent, via
 * messagingTalentStartConversation) with the offering and its catalog price on
 * it; she reviews and sends the offer from that conversation. The full
 * Messages page stays the fallback when the profile is not loaded.
 */
const store = createPanelStore();

export const openSendQuotePanel = store.open;
export const closeSendQuotePanel = store.close;

const FIELD =
  "mt-1 w-full min-h-[44px] rounded-xl border border-black/15 bg-white px-3 text-[14px] text-[var(--tc-primary)]";
const LABEL = "block text-[13px] font-semibold text-[var(--tc-primary)]";

type Picked = { name: string; phone: string; email: string };

/** Mounted once in the talent router; renders nothing until opened. */
export function SendQuotePanelHost({
  onOpenThread,
  onFallback,
}: {
  /** Opens the new conversation in Messages. */
  onOpenThread: (inquiryId: string) => void;
  /** Opens the Messages page instead (profile not loaded). */
  onFallback: () => void;
}) {
  const open = store.useOpen();
  const { bridgeTalentSelfProfile } = useAdminShell();
  const talentProfileId = bridgeTalentSelfProfile?.id ?? null;

  useEffect(() => {
    if (open && !talentProfileId) {
      store.close();
      onFallback();
    }
  }, [open, talentProfileId, onFallback]);

  if (!open || !talentProfileId) return null;
  return <SendQuoteForm talentProfileId={talentProfileId} onOpenThread={onOpenThread} />;
}

function SendQuoteForm({
  talentProfileId,
  onOpenThread,
}: {
  talentProfileId: string;
  onOpenThread: (inquiryId: string) => void;
}) {
  const copy = useAgendaCopy();
  const [clients, setClients] = useState<TalentClientRow[]>([]);
  const [offerings, setOfferings] = useState<TalentOffering[]>([]);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Picked | null>(null);
  const [adding, setAdding] = useState(false);
  const [offeringId, setOfferingId] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    let cancelled = false;
    void loadTalentClients(talentProfileId).then((res) => {
      if (!cancelled && res.ok) setClients(res.items);
    });
    void loadTalentOfferingsForEditor(talentProfileId).then((res) => {
      if (!cancelled && res.ok) setOfferings(res.items.filter((o) => o.status === "published"));
    });
    return () => {
      cancelled = true;
    };
  }, [talentProfileId]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = q
      ? clients.filter((c) => [c.name, c.phone ?? "", c.email ?? ""].some((v) => v.toLowerCase().includes(q)))
      : clients;
    return rows.slice(0, 6);
  }, [clients, query]);

  const offering = offerings.find((o) => o.id === offeringId);
  const hasContact = Boolean(picked && (picked.phone.trim() || picked.email.trim()));
  const canCreate = Boolean(picked?.name.trim() && hasContact && offering && !pending);

  function create() {
    if (!picked || !offering || !canCreate) return;
    setError(null);
    start(async () => {
      const res = await messagingTalentStartConversation({
        name: picked.name.trim(),
        email: picked.email.trim() || null,
        phone: picked.phone.trim() || null,
        channel: "counter",
        quoteOfferingId: offering.id,
        quoteNote: note.trim() || null,
      });
      if (!res.ok) {
        setError(
          res.reason === "invalid"
            ? copy.t("Add a phone or an email so the client can be reached.")
            : copy.t("Could not create the quote. Nothing was sent."),
        );
        return;
      }
      setCreatedId(res.inquiryId);
    });
  }

  function close() {
    store.close();
  }

  if (createdId) {
    return (
      <TaskShell
        open
        panel
        onClose={close}
        title={copy.t("Quote ready")}
        primaryActionLabel={copy.t("Open conversation")}
        onPrimaryAction={() => {
          close();
          onOpenThread(createdId);
        }}
        secondaryActionLabel={copy.t("Close")}
      >
        <div className="space-y-2" aria-live="polite">
          <p className="text-[15px] font-semibold text-[var(--tc-ok)]">{copy.t("Conversation created")}</p>
          <p className="text-[13.5px] text-[var(--tc-primary)]">
            {copy.t("Your service and its price are on the conversation. Review and send the quote to the client there. Nothing has been sent yet.")}
          </p>
        </div>
      </TaskShell>
    );
  }

  return (
    <AgendaPanelFrame
      title={copy.t("Send quote")}
      onClose={close}
      dataAttr="data-send-quote-panel"
      footer={
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={close}
            className="min-h-[44px] rounded-full border border-black/10 bg-white px-5 text-[14px] font-semibold text-[var(--tc-primary)]"
          >
            {copy.t("Cancel")}
          </button>
          <button
            type="button"
            onClick={create}
            disabled={!canCreate}
            className="min-h-[48px] flex-1 rounded-full bg-[var(--tc-primary)] px-5 text-[15px] font-semibold text-white disabled:opacity-40 md:flex-none"
          >
            {pending ? copy.t("Working…") : copy.t("Create quote")}
          </button>
        </div>
      }
    >
      <div className="space-y-5">
        <section className="space-y-2">
          <h3 className={LABEL}>{copy.t("Client")}</h3>
          {picked && !adding ? (
            <div className="flex items-center gap-2 rounded-xl border border-black/10 bg-white px-3 py-2 text-[14px]">
              <span className="min-w-0 flex-1 truncate font-semibold text-[var(--tc-primary)]">{picked.name}</span>
              <button
                type="button"
                onClick={() => setPicked(null)}
                className="min-h-[44px] px-2 text-[13px] font-semibold text-[var(--tc-accent)]"
              >
                {copy.t("Change")}
              </button>
            </div>
          ) : adding ? null : (
            <>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={copy.t("Search your clients")}
                aria-label={copy.t("Search your clients")}
                className={FIELD}
              />
              <ul className="overflow-hidden rounded-xl border border-black/10 bg-white">
                {matches.map((c, i) => (
                  <li key={c.id} className={i ? "border-t border-black/10" : ""}>
                    <button
                      type="button"
                      onClick={() => setPicked({ name: c.name, phone: c.phone ?? "", email: c.email ?? "" })}
                      className="flex min-h-[48px] w-full items-center px-3 text-left text-[14px] text-[var(--tc-primary)]"
                    >
                      {c.name}
                    </button>
                  </li>
                ))}
                {matches.length === 0 ? (
                  <li className="px-3 py-3 text-[13px] text-[var(--tc-muted)]">{copy.t("No clients match.")}</li>
                ) : null}
              </ul>
              <button
                type="button"
                onClick={() => {
                  setAdding(true);
                  setPicked({ name: query.trim(), phone: "", email: "" });
                }}
                className="min-h-[44px] text-[13px] font-semibold text-[var(--tc-accent)]"
              >
                + {copy.t("New client")}
              </button>
            </>
          )}
          {picked && (adding || !hasContact) ? (
            <div className="space-y-2">
              {adding ? (
                <label className={LABEL}>
                  {copy.t("Name")}
                  <input className={FIELD} value={picked.name} onChange={(e) => setPicked({ ...picked, name: e.target.value })} />
                </label>
              ) : (
                <p className="text-[12.5px] text-[var(--tc-muted)]">{copy.t("Add a phone or an email so the client can be reached.")}</p>
              )}
              <label className={LABEL}>
                {copy.t("Phone")}
                <input
                  type="tel"
                  inputMode="tel"
                  className={FIELD}
                  value={picked.phone}
                  onChange={(e) => setPicked({ ...picked, phone: e.target.value })}
                />
              </label>
              <label className={LABEL}>
                {copy.t("Email")}
                <input
                  type="email"
                  inputMode="email"
                  className={FIELD}
                  value={picked.email}
                  onChange={(e) => setPicked({ ...picked, email: e.target.value })}
                />
              </label>
              {adding ? (
                <button
                  type="button"
                  onClick={() => {
                    setAdding(false);
                    setPicked(null);
                  }}
                  className="min-h-[44px] text-[13px] font-semibold text-[var(--tc-accent)]"
                >
                  {copy.t("Pick an existing client")}
                </button>
              ) : null}
            </div>
          ) : null}
        </section>

        <section className="space-y-2">
          <label className={LABEL}>
            {copy.t("What is it for?")}
            <select className={FIELD} value={offeringId} onChange={(e) => setOfferingId(e.target.value)}>
              <option value="">{copy.t("Choose an offering")}</option>
              {offerings.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.title}
                  {o.amountCents != null ? ` · ${formatOfferingPrice(o.amountCents, o.currency, copy.locale)}` : ""}
                </option>
              ))}
            </select>
          </label>
          {offerings.length === 0 ? (
            <p className="text-[12.5px] text-[var(--tc-muted)]">{copy.t("Publish a service first. Quotes are made from your services.")}</p>
          ) : null}
        </section>

        <label className={LABEL}>
          {copy.t("Note for the client")}
          <textarea className={`${FIELD} min-h-[88px] py-2`} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>

        <p className="text-[12.5px] text-[var(--tc-muted)]">
          {copy.t("Creates the conversation with your service and price. You review and send the quote from there.")}
        </p>
        {error ? (
          <p role="alert" className="text-[13px] text-[var(--tc-risk)]">
            {error}
          </p>
        ) : null}
      </div>
    </AgendaPanelFrame>
  );
}
