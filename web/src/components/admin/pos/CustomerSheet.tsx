"use client";

/**
 * CustomerSheet — C06/C08/C10 in one sheet with three views:
 *
 *   search  (`POSCustomer`)              the search box, one row per hit with
 *                                        initials, name and a second line,
 *                                        `New customer "lau…"` and
 *                                        `No customer (walk-in)`.
 *   create  (`POSCustomerCreate`)        Name · Phone · Email · Language ·
 *                                        offers, the duplicate warning when a
 *                                        hit shares the phone or email, and
 *                                        `Save & add to sale`.
 *   failed  (`POSCustomerAttachFailed`)  the saved row with a `Saved` pill,
 *                                        the retry sentence, and
 *                                        `Add {name} to the sale`.
 *
 * A NEW CUSTOMER IS NAMED ON THE SALE, NOT INSERTED HERE. The engine attaches
 * the buyer at collection (`startCollection` → `ensureCustomer`, idempotent
 * on email and on phone), so `Save & add to sale` hands the three fields back
 * to the caller, who keeps them on the sale until the money is taken. That is
 * also why the duplicate check is a search: the same phone would resolve to
 * the same row anyway, and saying so up front is what stops the cashier
 * typing a second Laura. Language and offers have no writer on this path
 * yet, so both are drawn disabled with their sentence (D-POS-18).
 */

import { AlertTriangle, Check, ChevronRight, Plus, Search, User } from "lucide-react";

import { interpolate } from "@/i18n/interpolate";
import { cn } from "@/lib/utils";
import { PosSheet } from "./PosSheet";
import {
  POS_INPUT,
  POS_LABEL,
  POS_NOTE_INFO,
  POS_NOTE_WARN,
  POS_OUTLINE_ACTION,
  POS_PILL,
  POS_PILL_GREEN,
  POS_PRIMARY_ACTION,
  POS_SECONDARY_ACTION,
} from "./pos-classes";
import type { PosAttachedCustomer } from "./pos-types";

export type CustomerSheetCopy = {
  readonly title: string;
  readonly subtitle: string;
  readonly searchLabel: string;
  readonly searchPlaceholder: string;
  readonly none: string;
  /** `New customer "{query}"` */
  readonly createFromQuery: string;
  readonly create: string;
  readonly walkIn: string;
  readonly cashierNote: string;
  readonly crumb: string;
  readonly createTitle: string;
  readonly createSubtitle: string;
  readonly name: string;
  readonly phone: string;
  readonly email: string;
  readonly emailOptional: string;
  readonly contactHint: string;
  readonly language: string;
  readonly languageUnavailable: string;
  readonly offers: string;
  readonly offersUnavailable: string;
  /** `Looks like {name} already exists (same phone or email). Use that record instead?` */
  readonly duplicate: string;
  /** `Use existing {name}` */
  readonly useExisting: string;
  readonly differentPerson: string;
  readonly cancel: string;
  readonly saveAndAdd: string;
  /** `{name} was saved, but not added to the sale` */
  readonly failedTitle: string;
  readonly failedSubtitle: string;
  readonly savedPill: string;
  /** `Trying again adds this saved {name} to the sale. It will not create a second {name}.` */
  readonly failedNote: string;
  readonly continueWithout: string;
  /** `Add {name} to the sale` */
  readonly addToSale: string;
  readonly closeLabel: string;
};

export type CustomerDraft = { readonly name: string; readonly phone: string; readonly email: string };

export type CustomerSheetProps = {
  readonly open: boolean;
  readonly view: "search" | "create" | "failed";
  readonly onViewChange: (view: "search" | "create") => void;
  readonly onClose: () => void;
  readonly query: string;
  readonly onQueryChange: (value: string) => void;
  readonly hits: readonly PosAttachedCustomer[];
  readonly onPick: (customerId: string) => void;
  readonly onWalkIn: () => void;
  readonly draft: CustomerDraft;
  readonly onDraftChange: (draft: CustomerDraft) => void;
  /** A hit whose phone or email matches the draft: the duplicate warning. */
  readonly duplicate: PosAttachedCustomer | null;
  readonly onUseDuplicate: (customerId: string) => void;
  readonly onDismissDuplicate: () => void;
  readonly onSaveDraft: () => void;
  /** The customer whose attach did not take (C10). */
  readonly failed: PosAttachedCustomer | null;
  readonly onRetryAttach: () => void;
  readonly copy: CustomerSheetCopy;
};

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const second = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? "" : parts[0]?.[1] ?? "";
  return (first + second).toUpperCase() || "?";
}

function Avatar({ name }: { name: string }) {
  return (
    <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-admin-brand-soft text-[14px] font-semibold text-admin-brand">
      {initialsOf(name)}
    </span>
  );
}

export function CustomerSheet(props: CustomerSheetProps) {
  const { copy } = props;

  if (props.view === "failed" && props.failed) {
    const name = props.failed.displayName;
    return (
      <PosSheet
        open={props.open}
        name="customer-failed"
        crumb={copy.crumb}
        title={interpolate(copy.failedTitle, { name })}
        subtitle={copy.failedSubtitle}
        closeLabel={copy.closeLabel}
        onClose={props.onClose}
        footerStart={
          <button type="button" onClick={props.onWalkIn} className={POS_SECONDARY_ACTION}>
            {copy.continueWithout}
          </button>
        }
        footerEnd={
          <button type="button" data-pos-customer-retry onClick={props.onRetryAttach} className={POS_PRIMARY_ACTION}>
            {interpolate(copy.addToSale, { name })}
          </button>
        }
      >
        <div className="flex items-center gap-3.5 rounded-[14px] border-[1.5px] border-admin-border px-4 py-4">
          <Avatar name={name} />
          <div className="min-w-0 flex-1">
            <p className="m-0 text-[16px] font-semibold text-admin-ink">{name}</p>
            <p className="m-0 truncate text-[14px] text-admin-ink-muted">
              {[props.failed.phone, props.failed.email].filter(Boolean).join(" · ")}
            </p>
          </div>
          <span className={cn(POS_PILL, POS_PILL_GREEN, "px-3 py-1 text-[13px]")}>{copy.savedPill}</span>
        </div>
        <p className={cn(POS_NOTE_INFO, "mt-3")}>
          <Check aria-hidden size={16} strokeWidth={2} className="mt-0.5 shrink-0" />
          <span>{interpolate(copy.failedNote, { name })}</span>
        </p>
      </PosSheet>
    );
  }

  if (props.view === "create") {
    return (
      <PosSheet
        open={props.open}
        name="customer-create"
        crumb={copy.crumb}
        title={copy.createTitle}
        subtitle={copy.createSubtitle}
        closeLabel={copy.closeLabel}
        onClose={props.onClose}
        footerStart={
          <button type="button" onClick={() => props.onViewChange("search")} className={POS_SECONDARY_ACTION}>
            {copy.cancel}
          </button>
        }
        footerEnd={
          <button
            type="button"
            data-pos-customer-save
            disabled={props.draft.name.trim().length === 0 || (!props.draft.phone.trim() && !props.draft.email.trim())}
            onClick={props.onSaveDraft}
            className={POS_PRIMARY_ACTION}
          >
            {copy.saveAndAdd}
          </button>
        }
      >
        <div className="flex flex-col gap-4">
          <div>
            <label className={POS_LABEL} htmlFor="pos-buyer-name">
              {copy.name} <span className="text-admin-red">*</span>
            </label>
            <input
              id="pos-buyer-name"
              className={POS_INPUT}
              value={props.draft.name}
              onChange={(e) => props.onDraftChange({ ...props.draft, name: e.target.value })}
              autoComplete="off"
            />
          </div>
          <div className="grid grid-cols-2 gap-3.5">
            <div>
              <label className={POS_LABEL} htmlFor="pos-buyer-phone">
                {copy.phone}
              </label>
              <input
                id="pos-buyer-phone"
                type="tel"
                className={POS_INPUT}
                value={props.draft.phone}
                onChange={(e) => props.onDraftChange({ ...props.draft, phone: e.target.value })}
                autoComplete="off"
              />
              <p className="m-0 mt-1.5 text-[13px] text-admin-ink-dim">{copy.contactHint}</p>
            </div>
            <div>
              <label className={POS_LABEL} htmlFor="pos-buyer-email">
                {copy.email}
              </label>
              <input
                id="pos-buyer-email"
                type="email"
                className={POS_INPUT}
                placeholder={copy.emailOptional}
                value={props.draft.email}
                onChange={(e) => props.onDraftChange({ ...props.draft, email: e.target.value })}
                autoComplete="off"
              />
            </div>
          </div>
          <div>
            <span className={POS_LABEL}>{copy.language}</span>
            <input className={POS_INPUT} disabled readOnly value="" title={copy.languageUnavailable} />
            <p className="m-0 mt-1.5 text-[13px] text-admin-ink-dim">{copy.languageUnavailable}</p>
          </div>
          <label className="flex items-center gap-2.5 text-[15px] text-admin-ink-dim" title={copy.offersUnavailable}>
            <input type="checkbox" disabled className="h-5 w-5 rounded-md border-admin-border" />
            {copy.offers}
            <span className="sr-only">{copy.offersUnavailable}</span>
          </label>
          {props.duplicate && (
            <>
              <p role="alert" data-pos-customer-duplicate className={POS_NOTE_WARN}>
                <AlertTriangle aria-hidden size={16} strokeWidth={1.75} className="mt-0.5 shrink-0" />
                <span>{interpolate(copy.duplicate, { name: props.duplicate.displayName })}</span>
              </p>
              <div className="flex gap-2.5">
                <button type="button" onClick={() => props.onUseDuplicate(props.duplicate!.id)} className={POS_OUTLINE_ACTION}>
                  {interpolate(copy.useExisting, { name: props.duplicate.displayName })}
                </button>
                <button type="button" onClick={props.onDismissDuplicate} className={POS_SECONDARY_ACTION}>
                  {copy.differentPerson}
                </button>
              </div>
            </>
          )}
        </div>
      </PosSheet>
    );
  }

  const trimmed = props.query.trim();
  return (
    <PosSheet
      open={props.open}
      name="customer"
      title={copy.title}
      subtitle={copy.subtitle}
      closeLabel={copy.closeLabel}
      onClose={props.onClose}
      footerEnd={<span className="text-[13px] text-admin-ink-dim">{copy.cashierNote}</span>}
    >
      <div className="flex h-14 items-center gap-2.5 rounded-[14px] border-[1.5px] border-admin-brand bg-admin-card px-4">
        <Search aria-hidden size={18} strokeWidth={1.75} className="shrink-0 text-admin-ink-dim" />
        <label className="sr-only" htmlFor="pos-customer-search">
          {copy.searchLabel}
        </label>
        <input
          id="pos-customer-search"
          type="search"
          autoFocus
          className="h-full min-w-0 flex-1 bg-transparent text-[16px] text-admin-ink outline-none placeholder:text-admin-ink-dim"
          placeholder={copy.searchPlaceholder}
          value={props.query}
          onChange={(e) => props.onQueryChange(e.target.value)}
        />
      </div>

      <ul className="m-0 mt-3 flex list-none flex-col gap-2 p-0">
        {props.hits.map((hit) => (
          <li key={hit.id}>
            <button
              type="button"
              data-pos-customer-hit={hit.id}
              onClick={() => props.onPick(hit.id)}
              className="flex w-full items-center gap-3.5 rounded-[14px] border-[1.5px] border-admin-border bg-admin-card px-4 py-3.5 text-left hover:bg-admin-surface-alt"
            >
              <Avatar name={hit.displayName} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[16px] font-semibold text-admin-ink">{hit.displayName}</span>
                <span className="block truncate text-[14px] text-admin-ink-muted">
                  {[hit.phone, hit.email].filter(Boolean).join(" · ")}
                </span>
              </span>
              <ChevronRight aria-hidden size={18} strokeWidth={1.75} className="text-admin-ink-dim" />
            </button>
          </li>
        ))}
      </ul>
      {trimmed.length >= 2 && props.hits.length === 0 && (
        <p className="m-0 mt-3 text-[14px] text-admin-ink-muted">{copy.none}</p>
      )}

      <div className="mt-3 grid grid-cols-2 gap-3">
        <button
          type="button"
          data-pos-customer-new
          onClick={() => props.onViewChange("create")}
          className={cn(POS_OUTLINE_ACTION, "h-12")}
        >
          <Plus aria-hidden size={18} strokeWidth={2} />
          <span className="truncate">
            {trimmed ? interpolate(copy.createFromQuery, { query: trimmed }) : copy.create}
          </span>
        </button>
        <button type="button" data-pos-customer-walkin onClick={props.onWalkIn} className={cn(POS_SECONDARY_ACTION, "h-12")}>
          <User aria-hidden size={18} strokeWidth={1.75} />
          {copy.walkIn}
        </button>
      </div>
    </PosSheet>
  );
}
