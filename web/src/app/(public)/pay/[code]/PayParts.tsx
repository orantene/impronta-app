import type { CSSProperties, ReactNode } from "react";

/**
 * The building blocks of every pay-page state (TUL-467): one component sheet, so each
 * state is composed, never hand-styled. TOKENS ONLY: the seller's palette and type
 * (`--token-color-*`, `--site-radius-*`, `--site-heading-font`) projected by the public
 * layout; a static test pins the absence of `admin-*` classes.
 */

export const INK = "var(--token-color-ink, #1a1a1a)";
export const MUTED = "var(--token-color-muted, #5c5c5c)";
export const LINE = "var(--token-color-line, #e5e5e5)";
export const RAISED = "var(--token-color-surface-raised, #ffffff)";
export const SURFACE = "var(--token-color-background, var(--token-color-surface, #fafafa))";
export const PRIMARY = "var(--token-color-primary, #1a1a1a)";
export const PRIMARY_ON = "var(--token-color-primary-on, #ffffff)";
export const RADIUS = "var(--site-radius-base, 0.75rem)";
export const RADIUS_LG = "var(--site-radius-lg, 1rem)";
export const HEADING = "var(--site-heading-font, inherit)";

const actionBase: CSSProperties = {
  display: "inline-flex",
  minHeight: 48,
  width: "100%",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: RADIUS,
  padding: "0 16px",
  fontSize: 15,
  fontWeight: 600,
  textDecoration: "none",
  cursor: "pointer",
};
const ACTION_STYLE: Record<"primary" | "secondary" | "link", CSSProperties> = {
  primary: { ...actionBase, background: PRIMARY, color: PRIMARY_ON, border: `1px solid ${PRIMARY}` },
  secondary: { ...actionBase, background: "transparent", color: INK, border: `1px solid ${LINE}` },
  link: { ...actionBase, background: "transparent", color: INK, border: "1px solid transparent", fontWeight: 500, textDecoration: "underline", textUnderlineOffset: 3 },
};

export function Action(props: {
  kind: "primary" | "secondary" | "link";
  href?: string;
  download?: string;
  external?: boolean;
  onClick?: () => void;
  onNavigate?: () => void;
  "data-pay-calendar"?: "ics" | "google";
  children: ReactNode;
}) {
  const style = ACTION_STYLE[props.kind];
  if (props.href) {
    return (
      <a
        style={style}
        href={props.href}
        download={props.download}
        onClick={props.onNavigate}
        data-pay-calendar={props["data-pay-calendar"]}
        {...(props.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      >
        {props.children}
      </a>
    );
  }
  return (
    <button type="button" style={style} onClick={props.onClick} data-pay-calendar={props["data-pay-calendar"]}>
      {props.children}
    </button>
  );
}

type IconName = "check" | "clock" | "calendar" | "pin" | "lock" | "info" | "undo" | "alert" | "link";
const ICON_PATH: Record<IconName, ReactNode> = {
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  calendar: (
    <>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M4 10h16M9 3v4M15 3v4" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z" />
      <circle cx="12" cy="9.5" r="2.5" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </>
  ),
  undo: <path d="M9 14l-4-4 4-4M5 10h9a5 5 0 0 1 0 10h-3" />,
  alert: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v6M12 16.5h.01" />
    </>
  ),
  link: <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />,
};

export function Icon(props: { name: IconName; size?: number }) {
  const size = props.size ?? 20;
  return (
    <svg aria-hidden viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flex: "none" }}>
      {ICON_PATH[props.name]}
    </svg>
  );
}

/** The page frame: the business first (name, small logo), then the state. */
export function Shell(props: { business?: string | null; logoUrl?: string | null; children: ReactNode }) {
  return (
    <main
      className="mx-auto flex min-h-screen w-full max-w-[480px] flex-col gap-5 px-4 py-6"
      style={{ background: SURFACE, color: INK }}
      data-pos-messages="checkout"
      data-pay-theme="tokens"
    >
      {props.business ? (
        <header className="flex items-center gap-3" data-pay-business="">
          {props.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- the seller's own logo, any host; a fixed 40px mark
            <img src={props.logoUrl} alt="" width={40} height={40} className="h-10 w-10 rounded-full object-cover" />
          ) : null}
          <p className="text-[17px] font-semibold leading-tight" style={{ fontFamily: HEADING, color: INK }}>
            {props.business}
          </p>
        </header>
      ) : null}
      {props.children}
    </main>
  );
}

/** Icon + title (+ body) at the head of a status state. `tone="success"` fills the icon with the primary. */
export function StatusHeader(props: {
  icon: IconName;
  tone?: "success" | "neutral";
  title: string;
  body?: string | null;
  spinner?: boolean;
  dataReturn?: string;
  children?: ReactNode;
}) {
  const success = props.tone === "success";
  return (
    <div role="status" aria-live="polite" data-pay-return={props.dataReturn} className="flex flex-col gap-3">
      {props.spinner ? (
        <span aria-hidden className="h-10 w-10 animate-spin rounded-full border-2" style={{ borderColor: LINE, borderTopColor: INK }} />
      ) : (
        <span
          aria-hidden
          className="flex h-12 w-12 items-center justify-center rounded-full"
          style={success ? { background: PRIMARY, color: PRIMARY_ON } : { background: RAISED, color: INK, border: `1px solid ${LINE}` }}
        >
          <Icon name={props.icon} size={26} />
        </span>
      )}
      <h1 className="text-[26px] font-semibold leading-tight" style={{ fontFamily: HEADING, color: INK }}>
        {props.title}
      </h1>
      {props.body ? (
        <p className="text-[15px] leading-snug" style={{ color: MUTED }}>
          {props.body}
        </p>
      ) : null}
      {props.children}
    </div>
  );
}

/** The amount: big, one format, the approximate US$ line small and marked approximate. */
export function AmountBlock(props: { amount: string; usdLine?: string | null; approxHint?: string; note?: string | null }) {
  return (
    <div className="flex flex-col gap-1" data-pay-amount="">
      <p className="text-[36px] font-semibold leading-none tabular-nums" style={{ fontFamily: HEADING, color: INK }}>
        {props.amount}
      </p>
      {props.usdLine ? (
        <p className="text-[14px]" style={{ color: MUTED }} title={props.approxHint} data-pay-usd="">
          {props.usdLine}
        </p>
      ) : null}
      {props.note ? (
        <p className="text-[14px]" style={{ color: MUTED }} data-pay-deposit="">
          {props.note}
        </p>
      ) : null}
    </div>
  );
}

export type SummaryRow = { readonly key: string; readonly icon?: IconName; readonly label: string; readonly value: string; readonly strong?: boolean };

/** What was bought, when and where: rows that have no data simply drop out. */
export function SummaryCard(props: {
  items: readonly { readonly label: string; readonly price: string }[];
  rows: readonly SummaryRow[];
  fees?: readonly SummaryRow[];
}) {
  return (
    <section
      className="flex flex-col gap-3 p-4"
      style={{ borderRadius: RADIUS_LG, border: `1px solid ${LINE}`, background: RAISED, color: INK }}
      data-pay-summary=""
    >
      {props.items.length ? (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {props.items.map((item, i) => (
            <li key={`${item.label}-${i}`} className="flex justify-between gap-3 text-[15px]">
              <span>{item.label}</span>
              <span className="tabular-nums">{item.price}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {props.fees?.length ? (
        <dl className="m-0 flex flex-col gap-1 pt-3 text-[14px]" style={{ borderTop: `1px solid ${LINE}` }} data-pay-fees="">
          {props.fees.map((f) => (
            <div key={f.key} data-fee-line={f.key} className="flex justify-between gap-3" style={f.strong ? { fontWeight: 600 } : { color: MUTED }}>
              <dt>{f.label}</dt>
              <dd className="m-0 tabular-nums">{f.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {props.rows.length ? (
        <ul className="m-0 flex list-none flex-col gap-2 p-0 pt-3 text-[14px]" style={{ borderTop: props.items.length ? `1px solid ${LINE}` : undefined }}>
          {props.rows.map((r) => (
            <li key={r.key} className="flex items-start gap-2" data-pay-row={r.key}>
              {r.icon ? <Icon name={r.icon} size={18} /> : null}
              <span className="sr-only">{r.label}: </span>
              <span>{r.value}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

/** "Pago seguro con Stripe", with a lock. */
export function TrustRow(props: { label: string }) {
  return (
    <p className="flex items-center justify-center gap-2 text-[13px]" style={{ color: MUTED }} data-pay-trust="">
      <Icon name="lock" size={16} />
      {props.label}
    </p>
  );
}

/** One short policy line; "Ver política" opens the full text (native disclosure, works with no script). */
export function PolicyLine(props: { line: string; link: string; title: string; body: string; refunds: string }) {
  return (
    <details className="text-[14px]" style={{ color: MUTED }} data-pay-policy="">
      <summary className="flex min-h-[44px] cursor-pointer flex-wrap items-center gap-x-2">
        <span>{props.line}</span>
        <span style={{ color: INK, textDecoration: "underline", textUnderlineOffset: 3 }}>{props.link}</span>
      </summary>
      <div className="mt-1 flex flex-col gap-2 p-3" style={{ borderRadius: RADIUS, border: `1px solid ${LINE}`, background: RAISED, color: INK }}>
        <p className="m-0 font-semibold">{props.title}</p>
        <p className="m-0">{props.body}</p>
        <p className="m-0" style={{ color: MUTED }} data-refund-fees-note="">
          {props.refunds}
        </p>
      </div>
    </details>
  );
}

/** One "add to calendar" control: a native disclosure with the two ways in (works with no script). */
export function CalendarMenu(props: { label: string; icsLabel: string; googleLabel: string; icsHref: string; googleHref: string }) {
  return (
    <details data-pay-calendar-menu="" className="w-full">
      <summary
        className="flex cursor-pointer list-none items-center justify-center gap-2"
        style={{ ...ACTION_STYLE.secondary }}
      >
        <Icon name="calendar" size={18} />
        {props.label}
      </summary>
      <div className="mt-2 flex flex-col gap-1">
        <Action kind="link" href={props.icsHref} download="booking.ics" data-pay-calendar="ics">
          {props.icsLabel}
        </Action>
        <Action kind="link" href={props.googleHref} external data-pay-calendar="google">
          {props.googleLabel}
        </Action>
      </div>
    </details>
  );
}

/** The link's validity, in words, with a clock. */
export function ExpiryRow(props: { text: string; hint?: string | null }) {
  return (
    <p className="m-0 flex items-center gap-2 text-[14px]" style={{ color: MUTED }} data-pay-expiry="">
      <Icon name="clock" size={18} />
      {props.text}
      {props.hint ? (
        <span title={props.hint} role="img" aria-label={props.hint} data-pay-hint="" className="inline-flex">
          <Icon name="info" size={16} />
        </span>
      ) : null}
    </p>
  );
}
