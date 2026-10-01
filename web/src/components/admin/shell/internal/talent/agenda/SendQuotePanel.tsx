"use client";

import { useEffect, useMemo, useState, useTransition } from "react";

import { messagingTalentQuoteSend, messagingTalentQuoteStart } from "@/lib/server-actions/messaging-talent-quote";
import { loadTalentClients } from "@/lib/talent/clients-actions";
import { clientPickerHint, dedupeClientsByPerson, type TalentClientRow } from "@/lib/talent/clients-merge";
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

/**
 * The thread Send quote was opened from, if any. With one, the quote goes into
 * THAT conversation; it never spawns a second "Mostrador" thread beside it
 * (e2e P1). Opened from Today (no thread) it still starts a conversation.
 */
let threadContext: string | null = null;

/** Safe as an onClick handler: anything that is not a thread id (a click event) means "no thread". */
export function openSendQuotePanel(inquiryId?: unknown): void {
  threadContext = typeof inquiryId === "string" && inquiryId ? inquiryId : null;
  store.open();
}
export const closeSendQuotePanel = () => {
  threadContext = null;
  store.close();
};

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
  const [amount, setAmount] = useState("");
  const [sent, setSent] = useState(false);
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [error, setError] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [threadId] = useState(threadContext);

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

  const people = useMemo(() => dedupeClientsByPerson(clients), [clients]);
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = q
      ? people.filter((c) => [c.name, c.phone ?? "", c.email ?? ""].some((v) => v.toLowerCase().includes(q)))
      : people;
    return rows.slice(0, 6);
  }, [people, query]);

  const offering = offerings.find((o) => o.id === offeringId);
  const hasContact = Boolean(picked && (picked.phone.trim() || picked.email.trim()));
  const amountCents = Math.round(parseFloat(amount || "0") * 100);
  const canCreate = threadId
    ? Boolean(offering && amountCents > 0 && !pending)
    : Boolean(picked?.name.trim() && hasContact && offering && amountCents > 0 && !pending);

  function create() {
    if (!offering || !canCreate) return;
    setError(null);
    if (threadId) {
      // Post the quote in the conversation she is in.
      start(async () => {
        setStep(2);
        const res = await messagingTalentQuoteSend({ inquiryId: threadId, offeringId: offering.id, amountCents, note: note.trim() || null });
        setStep(0);
        setSent(res.ok);
        setCreatedId(threadId);
      });
      return;
    }
    if (!picked) return;
    start(async () => {
      // F99: two real steps, each shown as it runs, so a slow one is visible and
      // a failure after step 1 says exactly what exists.
      setStep(1);
      const started = await messagingTalentQuoteStart({
        name: picked.name.trim(),
        email: picked.email.trim() || null,
        phone: picked.phone.trim() || null,
        offeringId: offering.id,
        note: note.trim() || null,
      });
      if (!started.ok) {
        setStep(0);
        setError(
          started.reason === "invalid"
            ? copy.t("Add a phone or an email so the client can be reached.")
            : copy.t("Could not create the quote. Nothing was sent."),
        );
        return;
      }
      setStep(2);
      const res = await messagingTalentQuoteSend({
        inquiryId: started.inquiryId,
        offeringId: offering.id,
        amountCents,
        note: note.trim() || null,
      });
      setStep(0);
      // The conversation exists even if the quote did not go out: say so, never fake a send.
      setSent(res.ok);
      setCreatedId(started.inquiryId);
    });
  }

  function close() {
    closeSendQuotePanel();
  }

  if (createdId) {
    return (
      <TaskShell
        open
        panel
        onClose={close}
        title={sent ? copy.t("Quote sent") : copy.t("Quote not sent")}
        primaryActionLabel={copy.t("Open conversation")}
        onPrimaryAction={() => {
          close();
          onOpenThread(createdId);
        }}
        secondaryActionLabel={copy.t("Close")}
      >
        <div className="space-y-2" aria-live="polite">
          <p className={`text-[15px] font-semibold ${sent ? "text-[var(--tc-ok)]" : "text-[var(--tc-risk)]"}`}>
            {sent ? copy.t("The client has your quote") : copy.t("The conversation was created but the quote did not go out")}
          </p>
          <p className="text-[13.5px] text-[var(--tc-primary)]">
            {sent
              ? copy.t("They can accept it from the link. You will see the answer in the conversation.")
              : copy.t("Open the conversation to send the quote from there. Nothing reached the client yet.")}
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
            {pending ? (step === 2 ? copy.t("Sending quote… (2 of 2)") : copy.t("Creating conversation… (1 of 2)")) : copy.t("Send quote")}
          </button>
        </div>
      }
    >
      <div className="space-y-5">
        {threadId ? null : (
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
                      <span className="min-w-0 truncate">
                        {c.name}
                        {clientPickerHint(c, people) ? (
                          <span className="ml-2 text-[12.5px] font-normal text-[var(--tc-muted)]">{clientPickerHint(c, people)}</span>
                        ) : null}
                      </span>
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
        )}

        <section className="space-y-2">
          <label className={LABEL}>
            {copy.t("What is it for?")}
            <select className={FIELD} value={offeringId} onChange={(e) => {
                setOfferingId(e.target.value);
                const chosen = offerings.find((o) => o.id === e.target.value);
                setAmount(chosen?.amountCents != null ? (chosen.amountCents / 100).toFixed(2) : "");
              }}>
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
          {copy.t("Price")} {offering ? `(${offering.currency})` : ""}
          <input
            type="number"
            inputMode="decimal"
            min="1"
            step="0.01"
            className={FIELD}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>

        <label className={LABEL}>
          {copy.t("Note for the client")}
          <textarea className={`${FIELD} min-h-[88px] py-2`} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>

        <p className="text-[12.5px] text-[var(--tc-muted)]">
          {copy.t("Sends the client your quote for this service. They can accept it from the link.")}
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
