"use client";

/**
 * Domain setup wizard body (Buy domain · Connect existing · Get help).
 * Mounted inside the shell `talent-custom-domain` drawer.
 * Buy path: search + quote in-app via Registrar API, pay exact quote via Stripe.
 */

import { useEffect, useMemo, useState, useTransition, type CSSProperties } from "react";

import { COLORS, FONTS } from "@/components/admin/shell/internal/state";
import { useDashboardText } from "@/components/admin/shell/internal/dashboard-i18n";
import { PrimaryButton, SecondaryButton } from "@/components/admin/shell/internal/primitives";
import { TalentSiteDomainPanel } from "@/components/talent/site/TalentSiteDomainPanel";
import {
  requestTalentDomainHelpAction,
  searchTalentDomainAction,
  startTalentDomainPurchaseCheckoutAction,
} from "@/lib/talent-site/server/talent-domain-purchase-actions";
import type { DomainSearchQuote } from "@/lib/saas/vercel-domains-registrar";
import type { TalentDomainContactDraft } from "@/lib/stripe/talent-domain-billing";

type Path = "choose" | "search" | "connect" | "help" | "provisioning";

type ContactForm = TalentDomainContactDraft;

const EMPTY_CONTACT: ContactForm = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  address1: "",
  address2: "",
  city: "",
  state: "",
  zip: "",
  country: "US",
};

export function DomainSetupDrawerBody({
  provisioning = false,
}: {
  /** When returning from Stripe Checkout success. */
  provisioning?: boolean;
}) {
  const copy = useDashboardText();
  const [path, setPath] = useState<Path>(provisioning ? "provisioning" : "choose");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [quote, setQuote] = useState<DomainSearchQuote | null>(null);
  const [contact, setContact] = useState<ContactForm>(EMPTY_CONTACT);
  const [helpHost, setHelpHost] = useState("");
  const [helpNote, setHelpNote] = useState("");

  // Parent may flip provisioning after mount (Checkout return). Keep path in sync.
  useEffect(() => {
    if (provisioning) setPath("provisioning");
  }, [provisioning]);

  const priceLabel = useMemo(() => {
    if (!quote?.priceCents) return null;
    const dollars = (quote.priceCents / 100).toFixed(2);
    const currency = (quote.currency ?? "usd").toUpperCase();
    return `${currency} ${dollars} / year`;
  }, [quote]);

  function go(next: Path) {
    setError(null);
    setMessage(null);
    setPath(next);
  }

  function search() {
    startTransition(async () => {
      setError(null);
      setQuote(null);
      const result = await searchTalentDomainAction(query);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setQuote(result.quote);
    });
  }

  function checkout() {
    if (!quote?.available || !quote.priceCents) return;
    startTransition(async () => {
      setError(null);
      const result = await startTalentDomainPurchaseCheckoutAction({
        domain: quote.domain,
        expectedPriceCents: quote.priceCents!,
        contact,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      window.location.assign(result.url);
    });
  }

  function sendHelp() {
    startTransition(async () => {
      setError(null);
      setMessage(null);
      const result = await requestTalentDomainHelpAction({
        hostname: helpHost,
        note: helpNote,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setMessage(
        copy
          .t("Support ticket #{n} created. We will follow up soon.")
          .replace("{n}", String(result.ticketNumber)),
      );
    });
  }

  if (path === "choose") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <p style={lead}>{copy.t("Choose how you want to set up your custom domain.")}</p>
        <PathCard
          title={copy.t("Buy domain")}
          body={copy.t("Search here, pay the registrar price, we register it for you.")}
          mark="1"
          onClick={() => go("search")}
        />
        <PathCard
          title={copy.t("Connect existing")}
          body={copy.t("Point a domain you already own at your website.")}
          mark="2"
          onClick={() => go("connect")}
        />
        <PathCard
          title={copy.t("Get help")}
          body={copy.t("Ask Tulala to help finish domain setup.")}
          mark="3"
          onClick={() => go("help")}
        />
      </div>
    );
  }

  if (path === "provisioning") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div
          style={{
            borderRadius: 14,
            border: `1px solid ${COLORS.borderSoft}`,
            background: COLORS.surfaceAlt,
            padding: "14px 16px",
          }}
        >
          <p style={{ ...lead, color: COLORS.ink, fontWeight: 650 }}>
            {copy.t("Payment received. We are registering and attaching your domain.")}
          </p>
          <p style={{ margin: "8px 0 0", fontSize: 12.5, color: COLORS.inkMuted, lineHeight: 1.5 }}>
            {copy.t(
              "This usually finishes within a few minutes. You can close this drawer and check the Custom domain row.",
            )}
          </p>
        </div>
        <PrimaryButton onClick={() => go("connect")}>{copy.t("View domain status")}</PrimaryButton>
        <SecondaryButton onClick={() => go("choose")}>{copy.t("Back")}</SecondaryButton>
      </div>
    );
  }

  if (path === "connect") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <SecondaryButton onClick={() => go("choose")}>{copy.t("Back")}</SecondaryButton>
        <TalentSiteDomainPanel canManage embedded />
      </div>
    );
  }

  if (path === "help") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <SecondaryButton onClick={() => go("choose")}>{copy.t("Back")}</SecondaryButton>
        <p style={lead}>{copy.t("Tell us the domain and anything we should know.")}</p>
        <Field
          label={copy.t("Hostname (optional)")}
          value={helpHost}
          onChange={setHelpHost}
          placeholder="yourname.com"
        />
        <label style={labelStyle}>
          {copy.t("Notes (optional)")}
          <textarea
            value={helpNote}
            onChange={(e) => setHelpNote(e.target.value)}
            rows={4}
            style={{ ...inputStyle, minHeight: 88, resize: "vertical" }}
          />
        </label>
        {error ? <Err>{error}</Err> : null}
        {message ? <Ok>{message}</Ok> : null}
        <PrimaryButton onClick={sendHelp} disabled={pending}>
          {pending ? copy.t("Sending…") : copy.t("Create support ticket")}
        </PrimaryButton>
      </div>
    );
  }

  // search
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <SecondaryButton onClick={() => go("choose")}>{copy.t("Back")}</SecondaryButton>
      <p style={lead}>
        {copy.t("Search for a domain. The price shown is the Vercel Registrar quote.")}
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              search();
            }
          }}
          placeholder="yourname.com"
          style={{ ...inputStyle, flex: 1, minWidth: 160 }}
        />
        <PrimaryButton onClick={search} disabled={pending || !query.trim()}>
          {pending ? copy.t("Searching…") : copy.t("Search")}
        </PrimaryButton>
      </div>
      {error ? <Err>{error}</Err> : null}
      {quote ? (
        <div
          style={{
            border: `1px solid ${COLORS.borderSoft}`,
            borderRadius: 14,
            padding: "14px 16px",
            background: COLORS.card,
          }}
        >
          <div style={{ fontWeight: 650, color: COLORS.ink, fontSize: 15 }}>{quote.domain}</div>
          <div style={{ marginTop: 6, fontSize: 12.5, color: COLORS.inkMuted, lineHeight: 1.45 }}>
            {quote.available
              ? priceLabel
                ? copy.t("Available · {price} (Vercel price)").replace("{price}", priceLabel)
                : copy.t("Available")
              : copy.t("Not available")}
          </div>
        </div>
      ) : null}

      {quote?.available && quote.priceCents ? (
        <>
          <p style={{ ...lead, marginTop: 4 }}>
            {copy.t("Registrant contact (required for the domain registry)")}
          </p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
              gap: 8,
            }}
          >
            <Field
              label={copy.t("First name")}
              value={contact.firstName}
              onChange={(v) => setContact({ ...contact, firstName: v })}
            />
            <Field
              label={copy.t("Last name")}
              value={contact.lastName}
              onChange={(v) => setContact({ ...contact, lastName: v })}
            />
            <Field
              label={copy.t("Email")}
              value={contact.email}
              onChange={(v) => setContact({ ...contact, email: v })}
            />
            <Field
              label={copy.t("Phone (E.164)")}
              value={contact.phone}
              onChange={(v) => setContact({ ...contact, phone: v })}
              placeholder="+15551234567"
            />
            <Field
              label={copy.t("Address")}
              value={contact.address1}
              onChange={(v) => setContact({ ...contact, address1: v })}
            />
            <Field
              label={copy.t("Address line 2")}
              value={contact.address2 ?? ""}
              onChange={(v) => setContact({ ...contact, address2: v })}
            />
            <Field
              label={copy.t("City")}
              value={contact.city}
              onChange={(v) => setContact({ ...contact, city: v })}
            />
            <Field
              label={copy.t("State")}
              value={contact.state}
              onChange={(v) => setContact({ ...contact, state: v })}
            />
            <Field
              label={copy.t("ZIP")}
              value={contact.zip}
              onChange={(v) => setContact({ ...contact, zip: v })}
            />
            <Field
              label={copy.t("Country (ISO)")}
              value={contact.country}
              onChange={(v) => setContact({ ...contact, country: v })}
              placeholder="US"
            />
          </div>
          <PrimaryButton
            onClick={checkout}
            disabled={
              pending ||
              !contact.firstName.trim() ||
              !contact.lastName.trim() ||
              !contact.email.trim() ||
              !contact.phone.trim() ||
              !contact.address1.trim() ||
              !contact.city.trim() ||
              !contact.state.trim() ||
              !contact.zip.trim() ||
              !contact.country.trim()
            }
          >
            {pending ? copy.t("Opening checkout…") : copy.t("Buy domain")}
          </PrimaryButton>
        </>
      ) : null}
    </div>
  );
}

function PathCard({
  title,
  body,
  mark,
  onClick,
}: {
  title: string;
  body: string;
  mark: string;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        textAlign: "left",
        padding: "14px 16px",
        borderRadius: 14,
        border: `1px solid ${hovered ? COLORS.border : COLORS.borderSoft}`,
        background: hovered ? COLORS.surfaceAlt : COLORS.card,
        cursor: "pointer",
        fontFamily: FONTS.body,
        transition: "background 120ms ease, border-color 120ms ease",
      }}
    >
      <span
        aria-hidden
        style={{
          flexShrink: 0,
          width: 28,
          height: 28,
          borderRadius: 8,
          display: "grid",
          placeItems: "center",
          background: COLORS.ink,
          color: COLORS.card,
          fontSize: 12,
          fontWeight: 700,
        }}
      >
        {mark}
      </span>
      <span style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 650, fontSize: 14, color: COLORS.ink }}>{title}</div>
        <div style={{ marginTop: 4, fontSize: 12.5, color: COLORS.inkMuted, lineHeight: 1.45 }}>
          {body}
        </div>
      </span>
    </button>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label style={labelStyle}>
      {label}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={inputStyle}
      />
    </label>
  );
}

function Err({ children }: { children: string }) {
  return <p style={{ margin: 0, fontSize: 12.5, color: COLORS.criticalDeep }}>{children}</p>;
}

function Ok({ children }: { children: string }) {
  return <p style={{ margin: 0, fontSize: 12.5, color: COLORS.successDeep }}>{children}</p>;
}

const lead: CSSProperties = {
  margin: 0,
  fontSize: 13,
  color: COLORS.inkMuted,
  lineHeight: 1.5,
  fontFamily: FONTS.body,
};

const labelStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  fontSize: 12,
  fontWeight: 600,
  color: COLORS.inkMuted,
  fontFamily: FONTS.body,
};

const inputStyle: CSSProperties = {
  padding: "9px 11px",
  borderRadius: 10,
  border: `1px solid ${COLORS.borderSoft}`,
  fontSize: 13,
  color: COLORS.ink,
  fontFamily: FONTS.body,
  fontWeight: 500,
  background: COLORS.card,
};
