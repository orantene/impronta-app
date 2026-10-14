"use client";

/** The sheet's "TU RESERVA" contact fields that need more than a plain input: phone and notes. */
import { GuestPhoneField } from "@/components/ui/guest-phone-field";
import { GUEST_PHONE_LABEL } from "@/lib/phone/guest-phone";
import { TASK_NOTE_MAX } from "@/lib/talent/offering-task-brief";

export function CatalogWhoPhone({
  es,
  locale,
  phone,
  onPhone,
  onBlur,
  invalid,
  chatError,
}: {
  es: boolean;
  locale: string;
  phone: string;
  onPhone: (e164: string) => void;
  onBlur: () => void;
  invalid: boolean;
  chatError: boolean;
}) {
  return (
    <div className="jb-field">
      <span>{es ? GUEST_PHONE_LABEL.es : GUEST_PHONE_LABEL.en}</span>
      <GuestPhoneField value={phone} onChange={onPhone} onBlur={onBlur} locale={locale} invalid={invalid} testId="cb-phone" />
      {invalid ? <em>{es ? "Revisa el número." : "Check the number."}</em> : null}
      {chatError ? <em>{es ? "El teléfono hace falta para chatear." : "A phone number is needed to chat."}</em> : null}
    </div>
  );
}

export function CatalogWhoNotes({ es, value, onChange }: { es: boolean; value: string; onChange: (v: string) => void }) {
  return (
    <label className="jb-field">
      <span>
        {es ? "Notas" : "Notes"} <i>{es ? "opcional" : "optional"}</i>
      </span>
      <textarea
        rows={3}
        maxLength={TASK_NOTE_MAX}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={es ? "Algo que deba saber antes de tu cita" : "Anything to know before your visit"}
        data-testid="cb-notes"
      />
    </label>
  );
}
