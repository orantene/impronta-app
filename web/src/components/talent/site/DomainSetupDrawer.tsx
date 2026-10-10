"use client";

/**
 * Domain setup wizard body (search → buy · connect mine · help).
 * Mounted inside the shell `talent-custom-domain` drawer.
 * One primary action per state. Price in the talent's currency with USD charge noted.
 * Buy path stays dark when the registrar token is missing ("Coming soon").
 */

import { useEffect, useMemo, useState, useTransition, type CSSProperties, type ReactNode } from "react";

import { COLORS, FONTS } from "@/components/admin/shell/internal/state";
import { useDashboardText } from "@/components/admin/shell/internal/dashboard-i18n";
import { PrimaryButton, SecondaryButton } from "@/components/admin/shell/internal/primitives";
import { InfoTip } from "@/components/ui/info-tip";
import { TalentSiteDomainPanel } from "@/components/talent/site/TalentSiteDomainPanel";
import { buildDomainPriceDisplay } from "@/lib/pricing/domain-price-display";
import type { UsdRates } from "@/lib/pricing/usd-equivalent";
import {
  isTalentDomainSearchConfiguredAction,
  loadTalentDomainPriceDisplayAction,
  requestTalentDomainHelpAction,
  searchTalentDomainAction,
  startTalentDomainPurchaseCheckoutAction,
} from "@/lib/talent-site/server/talent-domain-purchase-actions";
import type { DomainSearchQuote } from "@/lib/saas/vercel-domains-registrar";
import type { TalentDomainContactDraft } from "@/lib/stripe/talent-domain-billing";

type Path = "search" | "connect" | "help" | "provisioning";

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
  country: "MX",
};

const NOT_CONFIGURED_SEARCH_ERROR =
  "Domain search is not configured yet. Use Connect or Get help instead.";

export function DomainSetupDrawerBody({
  provisioning = false,
}: {
  /** When returning from Stripe Checkout success. */
  provisioning?: boolean;
}) {
  const copy = useDashboardText();
  const [path, setPath] = useState<Path>(provisioning ? "provisioning" : "search");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  // Default false so missing registrar token never flashes a searchable Buy path.
  const [searchConfigured, setSearchConfigured] = useState(false);
  const [talentCurrency, setTalentCurrency] = useState("USD");
  const [fx, setFx] = useState<UsdRates | null>(null);

  const [query, setQuery] = useState("");
  const [quote, setQuote] = useState<DomainSearchQuote | null>(null);
  const [contact, setContact] = useState<ContactForm>(EMPTY_CONTACT);
  const [helpHost, setHelpHost] = useState("");
  const [helpNote, setHelpNote] = useState("");

  // Parent may flip provisioning after mount (Checkout return). Keep path in sync.
  useEffect(() => {
    if (provisioning) setPath("provisioning");
  }, [provisioning]);

  useEffect(() => {
    let cancelled = false;
    void isTalentDomainSearchConfiguredAction().then((ok) => {
      if (!cancelled) setSearchConfigured(ok);
    });
    void loadTalentDomainPriceDisplayAction().then((ctx) => {
      if (cancelled) return;
      setTalentCurrency(ctx.currency);
      setFx(ctx.rates);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const priceDisplay = useMemo(() => {
    if (!quote?.priceCents) return null;
    return buildDomainPriceDisplay({
      usdCents: quote.priceCents,
      talentCurrency,
      fx,
      locale: copy.locale,
    });
  }, [quote, talentCurrency, fx, copy.locale]);

  function go(next: Path) {
    setError(null);
    setMessage(null);
    setPath(next);
  }

  function search() {
    if (!searchConfigured) {
      setError(null);
      return;
    }
    startTransition(async () => {
      setError(null);
      setQuote(null);
      const result = await searchTalentDomainAction(query);
      if (!result.ok) {
        // Honest parked state — never show the red "not configured" error in the drawer.
        if (result.error === NOT_CONFIGURED_SEARCH_ERROR) {
          setSearchConfigured(false);
          setError(null);
          return;
        }
        setError(copy.t(result.error));
        return;
      }
      setQuote(result.quote);
    });
  }

  function checkout() {
    if (!quote?.available || !quote.priceCents) return;
    startTransition(async () => {
      setError(null);
      const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email.trim());
      const phoneOk = /^\+[1-9]\d{7,14}$/.test(contact.phone.trim());
      const countryOk = /^[A-Z]{2}$/.test(contact.country.trim().toUpperCase());
      if (!emailOk) {
        setError(copy.t("Enter a valid email for the registrant."));
        return;
      }
      if (!phoneOk) {
        setError(copy.t("Enter a phone with country code, like +52…"));
        return;
      }
      if (!countryOk) {
        setError(copy.t("Enter a 2-letter country, like MX or US."));
        return;
      }
      const result = await startTalentDomainPurchaseCheckoutAction({
        domain: quote.domain,
        expectedPriceCents: quote.priceCents!,
        contact: { ...contact, country: contact.country.trim().toUpperCase() },
      });
      if (!result.ok) {
        setError(copy.t(result.error));
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
        setError(copy.t(result.error));
        return;
      }
      setMessage(
        copy
          .t("Support ticket #{n} created. We will follow up soon.")
          .replace("{n}", String(result.ticketNumber)),
      );
    });
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
        <TextLink onClick={() => go("search")}>{copy.t("Back")}</TextLink>
      </div>
    );
  }

  if (path === "connect") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <TextLink onClick={() => go("search")}>{copy.t("Back to search")}</TextLink>
        <p style={lead}>{copy.t("Enter a domain you already own. We will show the DNS steps next.")}</p>
        <TalentSiteDomainPanel canManage embedded connectLabel={copy.t("Connect mine")} />
      </div>
    );
  }

  if (path === "help") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <TextLink onClick={() => go("search")}>{copy.t("Back")}</TextLink>
        <p style={lead}>{copy.t("Tell us the domain and anything we should know.")}</p>
        <Field
          label={copy.t("Domain (optional)")}
          value={helpHost}
          onChange={setHelpHost}
          placeholder={copy.t("yourname.com")}
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
          {pending ? copy.t("Sending…") : copy.t("Ask for help")}
        </PrimaryButton>
      </div>
    );
  }

  // ── Search (default) — one primary: Search → Buy ─────────────────────
  const canBuy = Boolean(searchConfigured && quote?.available && quote.priceCents);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <p style={lead}>
        {copy.t("Search for a domain for your site. Or connect one you already own.")}
      </p>

      {!searchConfigured ? (
        <div
          style={{
            borderRadius: 14,
            border: `1px solid ${COLORS.borderSoft}`,
            background: COLORS.surfaceAlt,
            padding: "14px 16px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <p style={{ ...lead, color: COLORS.ink, fontWeight: 650, margin: 0 }}>
              {copy.t("Buy domain")}
            </p>
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: 0.3,
                textTransform: "uppercase",
                color: COLORS.inkMuted,
                background: COLORS.borderSoft,
                padding: "2px 7px",
                borderRadius: 999,
              }}
            >
              {copy.t("Coming soon")}
            </span>
            <InfoTip
              label={copy.t("Domain purchase will open here soon. You can connect a domain you already own now.")}
              triggerLabel={copy.t("More info")}
              className="text-admin-ink-dim hover:text-admin-ink"
            />
          </div>
        </div>
      ) : (
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
            placeholder={copy.t("yourname.com")}
            spellCheck={false}
            autoCapitalize="none"
            autoCorrect="off"
            style={{ ...inputStyle, flex: 1, minWidth: 160 }}
          />
          {canBuy ? (
            <SecondaryButton onClick={search} disabled={pending || !query.trim()}>
              {pending ? copy.t("Searching…") : copy.t("Search")}
            </SecondaryButton>
          ) : (
            <PrimaryButton onClick={search} disabled={pending || !query.trim()}>
              {pending ? copy.t("Searching…") : copy.t("Search")}
            </PrimaryButton>
          )}
        </div>
      )}

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
          {quote.available && priceDisplay ? (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 15, fontWeight: 650, color: COLORS.ink }}>
                {copy.t("{price} / year").replace("{price}", priceDisplay.primary)}
              </div>
              <div
                style={{
                  marginTop: 4,
                  fontSize: 12,
                  color: COLORS.inkMuted,
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  flexWrap: "wrap",
                }}
              >
                <span>
                  {copy
                    .t("Charged in USD: {usd}")
                    .replace("{usd}", priceDisplay.usdCharge)}
                </span>
                {priceDisplay.converted ? (
                  <InfoTip
                    label={copy.t("You pay in US dollars at checkout. The amount above is an estimate in your currency.")}
                    triggerLabel={copy.t("More info")}
                    className="text-admin-ink-dim hover:text-admin-ink"
                  />
                ) : null}
              </div>
            </div>
          ) : (
            <div style={{ marginTop: 6, fontSize: 12.5, color: COLORS.inkMuted }}>
              {copy.t("Not available")}
            </div>
          )}
        </div>
      ) : null}

      {canBuy ? (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
            <p style={{ ...lead, margin: 0, fontWeight: 600, color: COLORS.ink }}>
              {copy.t("Owner contact")}
            </p>
            <InfoTip
              label={copy.t("The domain registry needs a real owner name and address.")}
              triggerLabel={copy.t("More info")}
              className="text-admin-ink-dim hover:text-admin-ink"
            />
          </div>
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
              label={copy.t("Phone")}
              value={contact.phone}
              onChange={(v) => setContact({ ...contact, phone: v })}
              placeholder="+52…"
              tip={copy.t("Include the country code, like +52…")}
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
              label={copy.t("Country")}
              value={contact.country}
              onChange={(v) => setContact({ ...contact, country: v })}
              placeholder="MX"
              tip={copy.t("Two letters, like MX or US.")}
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
            {pending ? copy.t("Opening checkout…") : copy.t("Buy")}
          </PrimaryButton>
        </>
      ) : null}

      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
        {/* One filled primary per state: Coming soon → Connect mine; search live →
            Search (above); quote ready → Buy (above). Connect / help are links
            whenever another primary already owns the filled button. */}
        {!searchConfigured ? (
          <PrimaryButton onClick={() => go("connect")}>{copy.t("Connect mine")}</PrimaryButton>
        ) : (
          <TextLink onClick={() => go("connect")}>{copy.t("Connect mine")}</TextLink>
        )}
        <TextLink onClick={() => go("help")}>{copy.t("Need help?")}</TextLink>
      </div>
    </div>
  );
}

function TextLink({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        alignSelf: "flex-start",
        background: "none",
        border: "none",
        padding: 0,
        fontSize: 12.5,
        fontWeight: 600,
        color: COLORS.inkMuted,
        cursor: "pointer",
        fontFamily: FONTS.body,
        textDecoration: "underline",
        textUnderlineOffset: 2,
      }}
    >
      {children}
    </button>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  tip,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  tip?: string;
}) {
  const copy = useDashboardText();
  return (
    <label style={labelStyle}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
        {label}
        {tip ? (
          <InfoTip
            label={tip}
            triggerLabel={copy.t("More info")}
            className="text-admin-ink-dim hover:text-admin-ink"
          />
        ) : null}
      </span>
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
