"use client";

import { useState } from "react";
import { duplicateInquiry } from "@/app/(dashboard)/admin/actions";
import { ADMIN_FORM_CONTROL } from "@/lib/dashboard-shell-classes";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

type Account = { id: string; name: string };
type Contact = { id: string; client_account_id: string; label: string };

export function DuplicateInquiryForm({
  sourceInquiryId,
  accounts,
  contacts,
}: {
  sourceInquiryId: string;
  accounts: Account[];
  contacts: Contact[];
}) {
  const [keepAcc, setKeepAcc] = useState(true);
  const [keepCon, setKeepCon] = useState(true);
  const [newAcc, setNewAcc] = useState("");

  const filteredContacts = newAcc ? contacts.filter((c) => c.client_account_id === newAcc) : contacts;
  const showRefreshOption = !keepAcc || !keepCon;

  return (
    <form action={duplicateInquiry} className="space-y-4 rounded-lg border border-border/45 bg-muted/10 p-4">
      <input type="hidden" name="source_inquiry_id" value={sourceInquiryId} />
      <p className="text-sm font-medium text-foreground">Duplicate inquiry</p>
      <p className="text-xs text-muted-foreground">
        Creates a new lead in <span className="font-medium">new</span> status. Relational links and field copies follow the options below.
      </p>
      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="keep_client_account"
          value="true"
          checked={keepAcc}
          onChange={(e) => setKeepAcc(e.target.checked)}
          className="size-4 rounded border-border"
        />
        Keep Client Location link
      </label>
      {!keepAcc ? (
        <div className="space-y-2 border-l-2 border-border/45 pl-3">
          <Label htmlFor="dup_i_acc">New Client Location</Label>
          <select
            id="dup_i_acc"
            name="new_client_account_id"
            value={newAcc}
            onChange={(e) => setNewAcc(e.target.value)}
            className={ADMIN_FORM_CONTROL}
          >
            <option value="">— None —</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="keep_contact"
          value="true"
          checked={keepCon}
          onChange={(e) => setKeepCon(e.target.checked)}
          className="size-4 rounded border-border"
        />
        Keep secondary contact
      </label>
      {!keepCon ? (
        <div className="space-y-2 border-l-2 border-border/45 pl-3">
          <Label htmlFor="dup_i_con">New secondary contact</Label>
          <select id="dup_i_con" name="new_client_contact_id" className={ADMIN_FORM_CONTROL} defaultValue="">
            <option value="">— None —</option>
            {filteredContacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      {showRefreshOption ? (
        <label className="flex cursor-pointer items-start gap-2 text-sm">
          <input type="checkbox" name="refresh_snapshots_for_new_links" value="true" defaultChecked className="mt-1 size-4 rounded border-border" />
          <span>
            Refresh company / contact snapshot fields from the new account or contact (uncheck to keep the original inquiry&apos;s text)
          </span>
        </label>
      ) : null}
      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <input type="checkbox" name="keep_talent" value="true" defaultChecked className="size-4 rounded border-border" />
        Copy talent lineup
      </label>
      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <input type="checkbox" name="clear_dates" value="true" defaultChecked className="size-4 rounded border-border" />
        Clear event date, location, and quantity on the copy
      </label>
      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <input type="checkbox" name="clear_assigned_staff" value="true" defaultChecked className="size-4 rounded border-border" />
        Clear assigned staff
      </label>
      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <input type="checkbox" name="clear_staff_notes" value="true" className="size-4 rounded border-border" />
        Clear internal staff notes
      </label>
      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <input type="checkbox" name="clear_client_message" value="true" className="size-4 rounded border-border" />
        Clear client message
      </label>
      <Button type="submit" variant="secondary" size="sm">
        Duplicate
      </Button>
    </form>
  );
}
