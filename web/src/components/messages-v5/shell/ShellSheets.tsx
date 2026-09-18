"use client";

/**
 * The sheets the shell owns (boards D10, M08): assign / hand over, close as
 * lost, the client link, and new conversation. Each is the kit Sheet with
 * kit rows and one primary button; refusals come back as a RefusalLine.
 */

import { useEffect, useState } from "react";

import type { HandOverTarget } from "@/lib/messaging/sheets";
import type { MessagingChannel, MessagingRefusal } from "@/lib/messaging/types";

import { OptionRow } from "../kit/OptionRow";
import { Btn } from "../kit/primitives";
import { RefusalLine } from "../kit/RefusalLine";
import { Sheet } from "../kit/Sheet";
import { Skeleton } from "../kit/Skeleton";
import type { ScreenVariant } from "../screens/contracts";
import type { ScreenCopy } from "../screens/copy";

type Base = { readonly open: boolean; readonly onClose: () => void; readonly copy: ScreenCopy; readonly variant: ScreenVariant };

function sheetVariant(variant: ScreenVariant) {
  return variant === "mobile" ? ("mobile-h60" as const) : ("desktop" as const);
}

export function AssignSheet({ open, onClose, copy, variant, mode, currentOwnerId, loadTargets, onPick }: Base & { readonly mode: "assign" | "handover"; readonly currentOwnerId: string | null; readonly loadTargets: () => Promise<{ ok: true; targets: HandOverTarget[] } | { ok: false; reason: MessagingRefusal }>; readonly onPick: (ownerUserId: string | null) => Promise<MessagingRefusal | null> }) {
  const [targets, setTargets] = useState<HandOverTarget[] | null>(null);
  const [selected, setSelected] = useState<string | null>(currentOwnerId);
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<MessagingRefusal | null>(null);
  useEffect(() => {
    if (!open) return;
    setTargets(null);
    setRefusal(null);
    setSelected(currentOwnerId);
    let alive = true;
    void loadTargets().then((r) => {
      if (!alive) return;
      if (r.ok) setTargets(r.targets);
      else {
        setTargets([]);
        setRefusal(r.reason);
      }
    });
    return () => {
      alive = false;
    };
  }, [open, loadTargets, currentOwnerId]);
  const s = copy.shell;
  const save = async () => {
    if (busy) return;
    if (mode === "handover" && !selected) return;
    setBusy(true);
    const r = await onPick(selected);
    setBusy(false);
    if (r) setRefusal(r);
    else onClose();
  };
  return (
    <Sheet
      open={open}
      title={mode === "assign" ? s.assignTitle : s.handoverTitle}
      copy={copy.kit}
      onClose={onClose}
      variant={sheetVariant(variant)}
      hint={s.assignHint}
      footer={
        <Btn size="lg" variant="primary" busy={busy} disabled={mode === "handover" && !selected} onClick={() => void save()} data-assign-save>
          {mode === "assign" ? s.assignSave : s.handoverSave}
        </Btn>
      }
    >
      {refusal ? <RefusalLine code={refusal} copy={copy.kit} variant={variant} /> : null}
      {targets === null ? <Skeleton rows={3} copy={copy.kit} variant={variant} /> : null}
      {targets && targets.length === 0 && !refusal ? <p className="sheet-note">{s.assignEmpty}</p> : null}
      <div className="sheet-list">
        {mode === "assign" ? <OptionRow control="radio" selected={selected === null} title={s.assignUnassign} variant={variant} onSelect={() => setSelected(null)} /> : null}
        {targets?.map((t) => (
          <OptionRow key={t.userId} control="radio" selected={selected === t.userId} title={t.name} sub={t.role} variant={variant} onSelect={() => setSelected(t.userId)} />
        ))}
      </div>
    </Sheet>
  );
}

export function LostSheet({ open, onClose, copy, variant, onConfirm }: Base & { readonly onConfirm: (reason: string) => Promise<MessagingRefusal | null> }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<MessagingRefusal | null>(null);
  const s = copy.shell;
  const confirm = async () => {
    if (busy || reason.trim().length < 2) return;
    setBusy(true);
    const r = await onConfirm(reason.trim());
    setBusy(false);
    if (r) setRefusal(r);
    else {
      setReason("");
      onClose();
    }
  };
  return (
    <Sheet
      open={open}
      title={s.lostTitle}
      copy={copy.kit}
      onClose={onClose}
      variant={sheetVariant(variant)}
      hint={s.lostHint}
      footer={
        <Btn size="lg" variant="danger" busy={busy} disabled={reason.trim().length < 2} onClick={() => void confirm()} data-lost-confirm>
          {s.lostConfirm}
        </Btn>
      }
    >
      {refusal ? <RefusalLine code={refusal} copy={copy.kit} variant={variant} /> : null}
      <div className="sheet-form">
        <div className="fld">
          <label htmlFor="msgv5-lost-reason">{s.lostReason}</label>
          <textarea id="msgv5-lost-reason" className="in" value={reason} placeholder={s.lostReasonPlaceholder} onChange={(e) => setReason(e.target.value)} />
        </div>
      </div>
    </Sheet>
  );
}

export function LinkSheet({ open, onClose, copy, variant, url, copied, refusal, onCopy }: Base & { readonly url: string | null; readonly copied: boolean; readonly refusal: MessagingRefusal | null; readonly onCopy: () => void }) {
  const s = copy.shell;
  return (
    <Sheet open={open} title={s.linkTitle} copy={copy.kit} onClose={onClose} variant={sheetVariant(variant)}>
      {refusal ? <RefusalLine code={refusal} copy={copy.kit} variant={variant} /> : null}
      <p className="sheet-note">{s.linkBody}</p>
      {url === null && !refusal ? <Skeleton rows={1} copy={copy.kit} variant={variant} /> : null}
      {url ? (
        <div className="link-box">
          <input className="in" readOnly value={url} data-thread-link />
          <Btn size="sm" variant="primary" onClick={onCopy} data-thread-link-copy>
            {copied ? s.linkCopied : s.copy}
          </Btn>
        </div>
      ) : null}
    </Sheet>
  );
}

const NEW_CHANNELS: readonly MessagingChannel[] = ["email", "whatsapp", "sms", "counter"];

export function NewConversationSheet({ open, onClose, copy, variant, onStart }: Base & { readonly onStart: (input: { name: string; phone: string | null; email: string | null; channel: MessagingChannel; firstMessage: string | null }) => Promise<MessagingRefusal | null> }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [channel, setChannel] = useState<MessagingChannel>("email");
  const [first, setFirst] = useState("");
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<MessagingRefusal | null>(null);
  const s = copy.shell;
  const can = name.trim().length > 0 && (phone.trim().length > 0 || email.trim().length > 0);
  const start = async () => {
    if (busy || !can) return;
    setBusy(true);
    const r = await onStart({ name: name.trim(), phone: phone.trim() || null, email: email.trim() || null, channel, firstMessage: first.trim() || null });
    setBusy(false);
    if (r) setRefusal(r);
    else {
      setName("");
      setPhone("");
      setEmail("");
      setFirst("");
      onClose();
    }
  };
  return (
    <Sheet
      open={open}
      title={s.newTitle}
      copy={copy.kit}
      onClose={onClose}
      variant={variant === "mobile" ? "mobile-h92" : "desktop"}
      hint={s.newHint}
      footer={
        <Btn size="lg" variant="primary" busy={busy} disabled={!can} onClick={() => void start()} data-new-start>
          {s.newStart}
        </Btn>
      }
    >
      {refusal ? <RefusalLine code={refusal} copy={copy.kit} variant={variant} /> : null}
      <div className="sheet-form">
        <div className="fld">
          <label htmlFor="msgv5-new-name">{s.newName}</label>
          <input id="msgv5-new-name" className="in" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="split">
          <div className="fld">
            <label htmlFor="msgv5-new-phone">{s.newPhone}</label>
            <input id="msgv5-new-phone" className="in" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="fld">
            <label htmlFor="msgv5-new-email">{s.newEmail}</label>
            <input id="msgv5-new-email" className="in" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
        </div>
        <div className="fld">
          <span className="sheet-note">{s.newChannel}</span>
          <div className="sheet-list">
            {NEW_CHANNELS.map((c) => (
              <OptionRow key={c} control="radio" selected={channel === c} title={copy.kit.channel[c]} sub={c === "sms" ? s.viaComing : null} disabled={c === "sms"} variant={variant} onSelect={c === "sms" ? undefined : () => setChannel(c)} />
            ))}
          </div>
        </div>
        <div className="fld">
          <label htmlFor="msgv5-new-first">{s.newFirst}</label>
          <textarea id="msgv5-new-first" className="in" value={first} placeholder={s.newFirstPlaceholder} onChange={(e) => setFirst(e.target.value)} />
        </div>
      </div>
    </Sheet>
  );
}
