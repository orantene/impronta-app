"use client";

/**
 * W47's amount and file, per milestone row.
 *
 * AMOUNT: `booking_deliverables.amount_cents` through `setDeliverableAmountAction`.
 * The figure is shown as money; `Edit` turns it into an input in the record's
 * currency; blur or Enter writes it; the engine's refusal is a sentence under
 * the field. A zero is drawn as the record's dash so "not set" and "$0" are
 * not one glyph.
 *
 * FILE: the existing inquiry-files signed-upload path (mint a URL for THIS
 * conversation, PUT the bytes, register the attachment so the conversation's
 * Files tab lists it), then `attachDeliverableFileAction` stamps the object
 * path on the milestone. A project with no conversation has no bucket
 * prefix, so its Upload is disabled with that sentence.
 */

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { cn } from "@/lib/utils";
import { formatOrderMoney, minorUnitDivisor } from "@/lib/orders/money-format";
import { attachDeliverableFileAction, setDeliverableAmountAction } from "@/lib/server-actions/scheduling-engine";
import {
  actionCreateInquiryAttachmentUploadUrl,
  actionRegisterInquiryAttachment,
} from "@/lib/server-actions/inquiry-attachment-signed";
import { putToSignedUrl } from "@/lib/client/signed-upload-core";
import { schedulingEngineSentence, type SchedulingEngineSentences } from "@/lib/scheduling/engine-refusals";
import { BTN_ROW, BTN_SECONDARY } from "../_shared";

export type MilestoneMoneyFileCopy = {
  edit: string;
  save: string;
  upload: string;
  replace: string;
  uploadNoInquiry: string;
  uploadFailed: string;
  uploading: string;
  amountUnknown: string;
  engine: SchedulingEngineSentences;
};

function fileName(path: string): string {
  // The minted path is `<tenant>/<inquiry>/<uuid>-<name>`; show the name.
  const last = path.slice(path.lastIndexOf("/") + 1);
  const named = /^[0-9a-f-]{36}-(.+)$/i.exec(last);
  return named ? named[1] : last;
}

export function MilestoneAmount({
  deliverableId,
  amountCents,
  currency,
  editable,
  copy,
}: {
  deliverableId: string;
  amountCents: number;
  currency: string;
  editable: boolean;
  copy: MilestoneMoneyFileCopy;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const divisor = minorUnitDivisor(currency);

  function commit(raw: string) {
    const n = Number(raw.trim());
    if (raw.trim() === "" || !Number.isFinite(n) || n < 0) {
      setEditing(false);
      return;
    }
    const cents = Math.round(n * divisor);
    if (cents === amountCents) {
      setEditing(false);
      return;
    }
    setNote(null);
    startTransition(async () => {
      const result = await setDeliverableAmountAction({ deliverableId, amountCents: cents });
      if (!result.ok) {
        setNote(schedulingEngineSentence(result.reason, copy.engine));
        return;
      }
      setEditing(false);
      router.refresh();
    });
  }

  if (editing) {
    return (
      <span className="flex flex-col gap-1">
        <input
          type="number"
          inputMode="decimal"
          min={0}
          step={1 / divisor}
          defaultValue={amountCents === 0 ? "" : (amountCents / divisor).toString()}
          autoFocus
          disabled={pending}
          aria-label={copy.edit}
          data-milestone-amount-input
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit(e.currentTarget.value);
            if (e.key === "Escape") setEditing(false);
          }}
          className="h-[30px] w-[110px] rounded-[8px] border border-admin-border bg-admin-card px-2 text-[13px] tabular-nums text-admin-ink"
        />
        {note ? (
          <span role="status" className="text-[11.5px] text-admin-red">
            {note}
          </span>
        ) : null}
      </span>
    );
  }
  return (
    <button
      type="button"
      disabled={!editable}
      title={editable ? copy.edit : copy.amountUnknown}
      onClick={() => setEditing(true)}
      data-milestone-amount
      className={cn(
        "m-0 border-0 bg-transparent p-0 text-left text-[15px] font-semibold tracking-[-0.02em] tabular-nums",
        amountCents === 0 ? "text-admin-ink-dim" : "text-admin-ink",
        editable ? "cursor-pointer underline-offset-4 hover:underline" : "cursor-default",
      )}
    >
      {amountCents === 0 ? "—" : formatOrderMoney(amountCents, currency)}
    </button>
  );
}

export function MilestoneFile({
  deliverableId,
  inquiryId,
  filePath,
  copy,
}: {
  deliverableId: string;
  inquiryId: string | null;
  filePath: string | null;
  copy: MilestoneMoneyFileCopy;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function upload(file: File) {
    if (!inquiryId) return;
    setBusy(true);
    setNote(null);
    try {
      const grant = await actionCreateInquiryAttachmentUploadUrl(inquiryId, file.name);
      if (!grant.ok) {
        setNote(copy.uploadFailed);
        return;
      }
      const put = await putToSignedUrl(grant.data.uploadUrl, file);
      if (!put.ok) {
        setNote(copy.uploadFailed);
        return;
      }
      const registered = await actionRegisterInquiryAttachment({
        inquiryId,
        storagePath: grant.data.storagePath,
        filename: file.name,
        mimeType: file.type || null,
        attachmentKind: "other",
      });
      if (!registered.ok) {
        setNote(copy.uploadFailed);
        return;
      }
      const attached = await attachDeliverableFileAction({ deliverableId, filePath: grant.data.storagePath });
      if (!attached.ok) {
        setNote(schedulingEngineSentence(attached.reason, copy.engine));
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="flex flex-col items-end gap-1">
      {filePath ? <span className="max-w-[160px] truncate text-[11.5px] text-admin-ink-muted" title={filePath}>{fileName(filePath)}</span> : null}
      <input
        ref={input}
        type="file"
        className="hidden"
        aria-hidden
        tabIndex={-1}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void upload(f);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        disabled={busy || !inquiryId}
        title={inquiryId ? undefined : copy.uploadNoInquiry}
        onClick={() => input.current?.click()}
        className={cn(BTN_SECONDARY, BTN_ROW)}
        data-milestone-upload
      >
        {busy ? copy.uploading : filePath ? copy.replace : copy.upload}
      </button>
      {note ? (
        <span role="status" className="text-[11.5px] text-admin-red">
          {note}
        </span>
      ) : null}
    </span>
  );
}
