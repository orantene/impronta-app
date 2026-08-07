"use client";

/**
 * Phase 6C / 6D — structured link editor. Emits a `LinkRef` object
 * (kind + value + flags) instead of the flat href string the legacy
 * `LinkPicker` produces. This is what lets the operator express link
 * INTENT (tenant page vs platform auth vs external …) so `resolveLinkRef`
 * can route correctly per host/path/domain/auth — the editor half of the
 * Finding-B-class fix.
 *
 * Drop-in for string fields: an incoming legacy string is adopted via
 * `coerceLegacyHref`, so wiring a section to this picker never loses
 * existing data. Self-contained: no server-action coupling (the richer
 * page/talent/asset *browsers* from LinkPicker can be layered on later;
 * intentionally out of scope for this primitive so it ships clean).
 */

import { useMemo } from "react";
import {
  coerceLegacyHref,
  type LinkKind,
  type LinkRef,
} from "@/lib/site-admin/links/link-ref";
import { useSectionT } from "./section-editor-i18n";

interface Props {
  value: LinkRef | string | null | undefined;
  onChange: (next: LinkRef) => void;
  className?: string;
  /** Reserved for future page/talent/asset browsers (LinkPicker parity). */
  tenantId?: string;
}

const KIND_GROUPS: ReadonlyArray<{
  group: string;
  kinds: ReadonlyArray<{ kind: LinkKind; label: string }>;
}> = [
  {
    group: "This site",
    kinds: [
      { kind: "tenant-page", label: "Page" },
      { kind: "tenant-directory", label: "Talent directory" },
      { kind: "talent-profile", label: "Talent profile" },
      { kind: "inquiry-start", label: "Start an inquiry" },
      { kind: "anchor", label: "Anchor (#section)" },
    ],
  },
  {
    group: "Platform",
    kinds: [
      { kind: "platform-auth-login", label: "Log in" },
      { kind: "platform-auth-register", label: "Sign up / Apply" },
      { kind: "app-dashboard", label: "App dashboard" },
    ],
  },
  {
    group: "Contact & external",
    kinds: [
      { kind: "external-url", label: "External URL" },
      { kind: "mailto", label: "Email" },
      { kind: "tel", label: "Phone" },
      { kind: "whatsapp", label: "WhatsApp" },
      { kind: "media", label: "File / download" },
    ],
  },
];

/** Per-kind value input config: placeholder + whether a value applies. */
const VALUE_HINT: Record<LinkKind, { ph: string; help?: string } | null> = {
  "tenant-page": { ph: "/about", help: "Path on this site (tenant-prefixed automatically)." },
  "tenant-directory": { ph: "city=tulum", help: "Optional filter (querystring). Blank = full directory." },
  "talent-profile": { ph: "profile-code", help: "Public profile code or slug." },
  "inquiry-start": { ph: "type=event", help: "Optional prefill (querystring). Resolves to the inquiry page." },
  "platform-auth-login": null,
  "platform-auth-register": null, // role handled by a dedicated select
  "app-dashboard": { ph: "/admin", help: "Path on the canonical app host (absolute, new tab)." },
  "external-url": { ph: "https://example.com", help: "Absolute URL. Opens in a new tab." },
  mailto: { ph: "hello@brand.com" },
  tel: { ph: "+52 984 000 0000" },
  whatsapp: { ph: "+52 984 000 0000", help: "Number or wa.me URL." },
  anchor: { ph: "#contact", help: "Same-page section id." },
  media: { ph: "https://…/file.pdf", help: "Asset URL to download/open." },
};

const INPUT =
  "w-full rounded-md border border-border/60 bg-background px-2 py-1.5 text-sm";
const HELP = "text-[11px] leading-snug text-muted-foreground";

function normalize(v: Props["value"]): LinkRef {
  if (v && typeof v === "object") return v;
  if (typeof v === "string") return coerceLegacyHref(v);
  return { kind: "tenant-page", value: "/" };
}

export function LinkKindPicker({ value, onChange, className, tenantId }: Props) {
  const t = useSectionT();
  void tenantId;
  const ref = useMemo(() => normalize(value), [value]);
  const hint = VALUE_HINT[ref.kind];
  const showValue = hint !== null && ref.kind !== "platform-auth-register";
  const showOpenInNew =
    ref.kind === "tenant-page" ||
    ref.kind === "tenant-directory" ||
    ref.kind === "talent-profile" ||
    ref.kind === "media";

  const patch = (next: Partial<LinkRef>) => onChange({ ...ref, ...next });

  return (
    <div className={`flex flex-col gap-1.5 ${className ?? ""}`}>
      <select
        className={INPUT}
        value={ref.kind}
        onChange={(e) => {
          // Kind change clears the value (each kind interprets it
          // differently) but keeps label/flags.
          onChange({
            kind: e.target.value as LinkKind,
            label: ref.label,
          });
        }}
        aria-label={t("Link kind")}
      >
        {KIND_GROUPS.map((g) => (
          <optgroup key={g.group} label={t(g.group)}>
            {g.kinds.map((k) => (
              <option key={k.kind} value={k.kind}>
                {t(k.label)}
              </option>
            ))}
          </optgroup>
        ))}
      </select>

      {ref.kind === "platform-auth-register" ? (
        <select
          className={INPUT}
          value={ref.value ?? ""}
          onChange={(e) => patch({ value: e.target.value })}
          aria-label={t("Sign-up role")}
        >
          <option value="">{t("No specific role")}</option>
          <option value="talent">{t("Talent")}</option>
          <option value="client">{t("Client")}</option>
        </select>
      ) : showValue ? (
        <input
          className={INPUT}
          type={ref.kind === "mailto" ? "email" : ref.kind === "tel" ? "tel" : "text"}
          value={ref.value ?? ""}
          placeholder={hint?.ph}
          onChange={(e) => patch({ value: e.target.value })}
          aria-label={t("Link value")}
        />
      ) : (
        <p className={HELP}>
          {ref.kind === "platform-auth-login"
            ? t("Goes to the platform login: no value needed.")
            : t("Goes to the platform page: no value needed.")}
        </p>
      )}

      {hint?.help ? <p className={HELP}>{t(hint.help)}</p> : null}

      {showOpenInNew ? (
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={ref.openInNew ?? false}
            onChange={(e) =>
              patch({ openInNew: e.target.checked ? true : undefined })
            }
          />
          {t("Open in a new tab")}
        </label>
      ) : null}
    </div>
  );
}
