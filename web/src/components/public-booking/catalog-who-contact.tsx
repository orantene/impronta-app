"use client";

import { sanitizeGuestPhone } from "./guest-phone";

/** The who-step contact fields of the catalog booking sheet (split out for max-lines). */
export function CatalogWhoContact({
  es, name, phone, email, setName, setPhone, setEmail, onBlur,
  touched, nameValid, phoneValid, emailValid, askAttempted, chatPhoneValid,
}: {
  es: boolean;
  name: string;
  phone: string;
  email: string;
  setName: (v: string) => void;
  setPhone: (v: string) => void;
  setEmail: (v: string) => void;
  onBlur: () => void;
  touched: boolean;
  nameValid: boolean;
  phoneValid: boolean;
  emailValid: boolean;
  askAttempted: boolean;
  chatPhoneValid: boolean;
}) {
  return (
    <>
      <label className="jb-field">
        <span>{es ? "Nombre" : "Name"}</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={onBlur}
          placeholder={es ? "Tu nombre" : "Your name"}
          aria-invalid={touched && !nameValid}
          data-testid="cb-name"
        />
        {touched && !nameValid ? <em>{es ? "Escribe tu nombre para confirmar." : "Enter your name to confirm."}</em> : null}
      </label>
      <label className="jb-field">
        <span>
          WhatsApp <i>{es ? "opcional" : "optional"}</i>
        </span>
        <input
          value={phone}
          onChange={(e) => setPhone(sanitizeGuestPhone(e.target.value))}
          onBlur={onBlur}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder={es ? "Para avisarte de cualquier cambio" : "If we need to reach you"}
          aria-invalid={touched && !phoneValid}
          data-testid="cb-phone"
        />
        {touched && !phoneValid ? <em>{es ? "Revisa el número." : "Check the number."}</em> : null}
        {askAttempted && !chatPhoneValid ? <em>{es ? "WhatsApp hace falta para chatear." : "WhatsApp is needed to chat."}</em> : null}
      </label>
      <label className="jb-field">
        <span>{es ? "Correo" : "Email"}</span>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onBlur={onBlur}
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder={es ? "Para enviarte la confirmación" : "For the confirmation"}
          aria-invalid={touched && !emailValid}
          data-testid="cb-email"
        />
        {touched && !emailValid ? <em>{es ? "Necesitamos un correo válido." : "We need a valid email."}</em> : null}
      </label>
    </>
  );
}
