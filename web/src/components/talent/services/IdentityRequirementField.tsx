"use client";

/**
 * Ported from the retired TalentOfferingsManager (TUL-1270 #10 review): the
 * "needs the buyer's name" requirement and its reason. Same fields, same
 * defaults ("attendee_names" when ticked, both cleared when unticked) and the
 * same validation (validateOffering refuses a missing reason). Identity is a
 * property of the item, not of the money: ticking it is the only thing that
 * makes a sale refuse for want of a name, so the reason is asked in the same
 * breath and never stored on its own.
 */
import { useDashboardText } from "@/components/admin/shell/internal/dashboard-i18n";
import { IDENTITY_REASONS, type IdentityReason, type TalentOffering } from "@/lib/talent/offerings-types";

const COPY = {
  en: {
    label: "Needs the buyer's name (email or phone), whatever it costs",
    why: "Why",
    reasons: {
      attendee_names: "Every attendee has to be named",
      delivery: "It has to be delivered to someone",
      entitlement: "It issues credit spent later",
    },
  },
  es: {
    label: "Necesita el nombre del comprador (correo o teléfono), cueste lo que cueste",
    why: "Por qué",
    reasons: {
      attendee_names: "Cada asistente debe tener nombre",
      delivery: "Hay que entregarlo a alguien",
      entitlement: "Genera un crédito que se usa después",
    },
  },
} as const;

export function IdentityRequirementField({
  item,
  patch,
}: {
  item: TalentOffering;
  patch: (partial: Partial<TalentOffering>) => void;
}) {
  const copy = useDashboardText();
  const t = copy.isSpanish ? COPY.es : COPY.en;
  return (
    <div className="space-y-2" data-identity-requirement>
      <label className="flex items-start gap-2 text-[13.5px] text-admin-ink">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4"
          checked={item.requiresIdentity}
          onChange={(e) =>
            patch(
              e.target.checked
                ? { requiresIdentity: true, identityReason: item.identityReason ?? "attendee_names" }
                : { requiresIdentity: false, identityReason: null },
            )
          }
        />
        <span>{t.label}</span>
      </label>
      {item.requiresIdentity ? (
        <label className="flex items-center gap-2 pl-6 text-[13px] text-admin-ink-dim">
          {t.why}
          <select
            className="rounded-lg border border-admin-border-soft bg-white px-2 py-1.5 text-[13.5px] text-admin-ink"
            value={item.identityReason ?? "attendee_names"}
            onChange={(e) => patch({ identityReason: e.target.value as IdentityReason })}
          >
            {IDENTITY_REASONS.map((reason) => (
              <option key={reason} value={reason}>
                {t.reasons[reason]}
              </option>
            ))}
          </select>
        </label>
      ) : null}
    </div>
  );
}
