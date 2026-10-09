"use client";

/**
 * TUL-436: one address field (plus an optional access note) for services that
 * happen at the client's place. Controlled and presentational: the sheet owns
 * the state and runs `validateServiceAddress`. Plain input with
 * autocomplete="street-address": the repo's Places routes only resolve CITIES
 * (and the admin ones are gated), so street autocomplete is a later phase.
 * Length is validated, not truncated by maxLength, so a long paste gets an
 * explanation instead of silently losing its tail.
 */
import { useId } from "react";

import type { ServiceAddressErrorCode } from "@/lib/scheduling/service-address";

import { serviceAddressCopy } from "./service-address-copy";

export function ServiceAddressField({
  value,
  note,
  onChange,
  error,
  locale,
}: {
  value: string;
  note: string;
  onChange: (next: { address: string; note: string }) => void;
  error?: ServiceAddressErrorCode | null;
  locale?: string | null;
}) {
  const copy = serviceAddressCopy(locale);
  const uid = useId();
  const addressId = `${uid}-address`;
  const noteId = `${uid}-note`;
  const hintId = `${uid}-hint`;
  const errorId = `${uid}-error`;
  const noteErrorId = `${uid}-note-error`;
  const addressError = error && error !== "note_too_long" ? copy.errors[error] : null;
  const noteError = error === "note_too_long" ? copy.errors.note_too_long : null;
  return (
    <div className="jb-field" data-service-address-field>
      <label htmlFor={addressId}>{copy.addressLabel}</label>
      <input
        id={addressId}
        type="text"
        name="service-address"
        autoComplete="street-address"
        required
        value={value}
        placeholder={copy.addressPlaceholder}
        aria-invalid={addressError ? true : undefined}
        aria-describedby={addressError ? `${hintId} ${errorId}` : hintId}
        onChange={(e) => onChange({ address: e.target.value, note })}
        data-testid="cb-service-address"
      />
      <small id={hintId} className="jb-fixture">
        {copy.privacy}
      </small>
      {addressError ? (
        <small id={errorId} role="alert" data-testid="cb-service-address-error">
          {addressError}
        </small>
      ) : null}
      <label htmlFor={noteId}>{copy.noteLabel}</label>
      <input
        id={noteId}
        type="text"
        name="service-address-note"
        autoComplete="off"
        value={note}
        placeholder={copy.notePlaceholder}
        aria-invalid={noteError ? true : undefined}
        aria-describedby={noteError ? noteErrorId : undefined}
        onChange={(e) => onChange({ address: value, note: e.target.value })}
        data-testid="cb-service-address-note"
      />
      {noteError ? (
        <small id={noteErrorId} role="alert" data-testid="cb-service-address-note-error">
          {noteError}
        </small>
      ) : null}
    </div>
  );
}
