"use client";

import { useState, type ReactNode } from "react";

import {
  archiveClient,
  createClientRecord,
  saveClientNote,
  updateClientDetails,
  type ClientRecordResult,
} from "@/lib/talent/client-records-actions";
import {
  parseClientDetails,
  type ClientRecordErrorCode,
} from "@/lib/talent/client-records";
import type { TalentClientRow } from "@/lib/talent/clients-merge";
import { AgendaPanelFrame } from "../agenda/AgendaPanelFrame";

type T = (s: string) => string;

const FIELD =
  "h-11 w-full rounded-[12px] border border-admin-border-soft bg-white px-4 font-admin-body text-[14px] text-admin-ink outline-none focus:border-admin-ink";
const PRIMARY =
  "inline-flex h-11 flex-1 items-center justify-center rounded-full border border-[var(--tc-action)] bg-[var(--tc-action)] px-4 font-admin-body text-[14px] font-semibold text-white hover:bg-[var(--tc-action-hover)] disabled:opacity-50";
const SECONDARY =
  "inline-flex h-11 items-center justify-center rounded-full border border-admin-border-soft bg-white px-4 font-admin-body text-[14px] font-semibold text-admin-ink";

/** One sentence per failure code. A failed write always says so. */
export function clientErrorText(code: ClientRecordErrorCode, t: T): string {
  switch (code) {
    case "invalid_name":
      return t("Add a name.");
    case "invalid_email":
      return t("That email does not look right.");
    case "invalid_phone":
      return t("That phone number does not look right.");
    case "too_long":
      return t("That is too long.");
    case "forbidden":
      return t("You cannot change this client.");
    case "not_found":
      return t("This client could not be found.");
    case "unavailable":
      return t("Saving clients is not available yet. Try again later.");
    default:
      return t("Could not save. Try again.");
  }
}

function StickyFooter({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-0 -mx-5 mt-5 flex gap-2 border-t border-black/10 bg-white px-5 py-3">
      {children}
    </div>
  );
}

/** Add client (no `row`) and Edit details (with `row`) share one panel. */
export function ClientDetailsPanel(props: {
  talentId: string;
  row?: TalentClientRow;
  t: T;
  onClose: () => void;
  onSaved: (result: { key: string; message: string }) => void;
}) {
  const { row, t } = props;
  const [name, setName] = useState(row?.name ?? "");
  const [email, setEmail] = useState(row?.email ?? "");
  const [phone, setPhone] = useState(row?.phone ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    const parsed = parseClientDetails({ name, email, phone });
    if (!parsed.ok) {
      setError(clientErrorText(parsed.code, t));
      return;
    }
    setBusy(true);
    setError(null);
    let res: ClientRecordResult;
    try {
      res = row
        ? await updateClientDetails(props.talentId, row.id, parsed.value)
        : await createClientRecord(props.talentId, parsed.value);
    } catch {
      res = { ok: false, code: "failed" };
    }
    setBusy(false);
    if (!res.ok) {
      setError(clientErrorText(res.code, t));
      return;
    }
    props.onSaved({ key: res.key, message: row ? t("Client updated") : t("Client added") });
  }

  return (
    <AgendaPanelFrame
      title={row ? t("Edit client") : t("Add client")}
      onClose={props.onClose}
      dataAttr="data-client-details-panel"
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <label className="block font-admin-body text-[13px] font-semibold text-admin-ink">
          {t("Name")}
          <input
            className={`${FIELD} mt-1 font-normal`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="off"
            data-client-field="name"
          />
        </label>
        <label className="block font-admin-body text-[13px] font-semibold text-admin-ink">
          {t("Email")}
          <input
            className={`${FIELD} mt-1 font-normal`}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="off"
            data-client-field="email"
          />
        </label>
        <label className="block font-admin-body text-[13px] font-semibold text-admin-ink">
          {t("Phone")}
          <input
            className={`${FIELD} mt-1 font-normal`}
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            autoComplete="off"
            data-client-field="phone"
          />
        </label>
        {error ? (
          <p role="alert" className="font-admin-body text-[13px] text-destructive" data-client-error>
            {error}
          </p>
        ) : null}
        <StickyFooter>
          <button type="button" className={SECONDARY} onClick={props.onClose}>
            {t("Cancel")}
          </button>
          <button type="submit" className={PRIMARY} disabled={busy} data-client-save>
            {busy ? t("Saving") : t("Save")}
          </button>
        </StickyFooter>
      </form>
    </AgendaPanelFrame>
  );
}

/** Archive needs a confirm sheet. Nothing is deleted; bookings and messages stay. */
export function ClientArchiveSheet(props: {
  talentId: string;
  row: TalentClientRow;
  t: T;
  onClose: () => void;
  onArchived: () => void;
}) {
  const { row, t } = props;
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    setError(null);
    let res: ClientRecordResult;
    try {
      res = await archiveClient(props.talentId, row.id);
    } catch {
      res = { ok: false, code: "failed" };
    }
    setBusy(false);
    if (!res.ok) {
      setError(clientErrorText(res.code, t));
      return;
    }
    props.onArchived();
  }

  return (
    <AgendaPanelFrame title={t("Archive client")} onClose={props.onClose} dataAttr="data-client-archive-sheet">
      <p className="font-admin-body text-[15px] font-semibold text-admin-ink">
        {t("Archive {name}?").replace("{name}", row.name)}
      </p>
      <p className="mt-2 font-admin-body text-[14px] text-admin-ink-muted">
        {t("They leave your Clients list. Their bookings, messages and payments are not touched.")}
      </p>
      {error ? (
        <p role="alert" className="mt-3 font-admin-body text-[13px] text-destructive" data-client-error>
          {error}
        </p>
      ) : null}
      <StickyFooter>
        <button type="button" className={SECONDARY} onClick={props.onClose}>
          {t("Cancel")}
        </button>
        <button type="button" className={PRIMARY} disabled={busy} onClick={() => void confirm()} data-client-archive-confirm>
          {busy ? t("Saving") : t("Archive")}
        </button>
      </StickyFooter>
    </AgendaPanelFrame>
  );
}

/** Private note, edited in place on the client record. */
export function ClientNoteInline(props: {
  talentId: string;
  row: TalentClientRow;
  t: T;
  onSaved: (note: string | null) => void;
}) {
  const { row, t } = props;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(row.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    setError(null);
    let res: ClientRecordResult;
    try {
      res = await saveClientNote(props.talentId, row.id, draft);
    } catch {
      res = { ok: false, code: "failed" };
    }
    setBusy(false);
    if (!res.ok) {
      setError(clientErrorText(res.code, t));
      return;
    }
    setEditing(false);
    props.onSaved(draft.trim() || null);
  }

  return (
    <div data-client-note>
      <div className="flex items-baseline gap-2">
        <h3 className="flex-1 font-admin-body text-[16px] font-semibold text-admin-ink">{t("Private notes")}</h3>
        {!editing ? (
          <button
            type="button"
            onClick={() => {
              setDraft(row.note ?? "");
              setEditing(true);
            }}
            className="min-h-[32px] text-[13px] font-semibold text-admin-accent"
            data-client-note-edit
          >
            {row.note ? t("Edit") : t("Add a note")}
          </button>
        ) : null}
      </div>
      {editing ? (
        <div className="mt-2 flex flex-col gap-2">
          <textarea
            className="min-h-[120px] w-full rounded-[12px] border border-admin-border-soft bg-white p-3 font-admin-body text-[14px] text-admin-ink outline-none focus:border-admin-ink"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            data-client-note-input
          />
          {error ? (
            <p role="alert" className="font-admin-body text-[13px] text-destructive" data-client-error>
              {error}
            </p>
          ) : null}
          <div className="flex gap-2">
            <button type="button" className={SECONDARY} onClick={() => setEditing(false)}>
              {t("Cancel")}
            </button>
            <button type="button" className={PRIMARY} disabled={busy} onClick={() => void save()} data-client-note-save>
              {busy ? t("Saving") : t("Save note")}
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-2 whitespace-pre-wrap rounded-[12px] border border-admin-border-soft bg-white p-4 font-admin-body text-[13px] text-admin-ink-muted">
          {row.note ??
            t("Only you see this. Never shown in checkout, receipts, your public pages or message previews.")}
        </div>
      )}
    </div>
  );
}
