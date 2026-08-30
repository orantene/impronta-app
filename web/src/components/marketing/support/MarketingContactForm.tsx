"use client";

import { useState } from "react";
import { getMarketingSupportCopy } from "@/lib/marketing/support-copy";
import { submitMarketingContactAction } from "@/lib/support/guest-actions";
import { trackProductEvent } from "@/lib/analytics/track-client";
import { PRODUCT_ANALYTICS_EVENTS } from "@/lib/analytics/product-events";

export function MarketingContactForm({ locale }: { locale: string }) {
  const copy = getMarketingSupportCopy(locale);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [topic, setTopic] = useState("product");
  const [message, setMessage] = useState("");
  const [phone, setPhone] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <div className="mt-10 rounded-2xl bg-[var(--plt-bg-raised)] px-5 py-6">
        <h2 className="text-lg font-semibold">{copy.successTitle}</h2>
        <p className="mt-2 text-[var(--plt-ink-soft)]">{copy.successBody}</p>
      </div>
    );
  }

  return (
    <form
      className="mt-10 flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        void (async () => {
          setBusy(true);
          setError(null);
          const result = await submitMarketingContactAction({
            name,
            email,
            topic,
            message,
            phone: phone || null,
            honeypot,
            locale: locale === "es" ? "es" : "en",
          });
          setBusy(false);
          if (!result.ok) {
            setError(result.error);
            return;
          }
          trackProductEvent(PRODUCT_ANALYTICS_EVENTS.marketing_contact_form_submitted, { locale });
          setDone(true);
        })();
      }}
    >
      <div aria-hidden className="hidden">
        <label>
          Website
          <input value={honeypot} onChange={(e) => setHoneypot(e.target.value)} tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-sm">
        {copy.nameLabel}
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded-xl border border-[var(--plt-hairline-strong)] bg-[var(--plt-bg)] px-3 py-2"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {copy.emailLabel}
        <input
          required
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded-xl border border-[var(--plt-hairline-strong)] bg-[var(--plt-bg)] px-3 py-2"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {copy.topicLabel}
        <select
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          className="rounded-xl border border-[var(--plt-hairline-strong)] bg-[var(--plt-bg)] px-3 py-2"
        >
          <option value="product">{copy.topicProduct}</option>
          <option value="pricing">{copy.topicPricing}</option>
          <option value="demo">{copy.topicDemo}</option>
          <option value="other">{copy.topicOther}</option>
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {copy.messageLabel}
        <textarea
          required
          rows={6}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="rounded-xl border border-[var(--plt-hairline-strong)] bg-[var(--plt-bg)] px-3 py-2"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {copy.phoneLabel}
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="rounded-xl border border-[var(--plt-hairline-strong)] bg-[var(--plt-bg)] px-3 py-2"
        />
      </label>
      {error ? <p className="text-sm">{error}</p> : null}
      <button
        type="submit"
        disabled={busy}
        className="self-start rounded-full bg-[var(--plt-forest)] px-5 py-2 text-sm font-medium text-[var(--plt-bg)] hover:bg-[var(--plt-ink)] disabled:opacity-50"
      >
        {busy ? copy.submitting : copy.submit}
      </button>
      <p className="text-[0.75rem] text-[var(--plt-muted)]">{copy.emailConsent}</p>
    </form>
  );
}
