"use client";

/** Step 3 services list: name, minutes, price or "on quote". Phone-first, 16 px inputs. */

import { centsToInput, blankService, parsePriceToCents } from "@/lib/onboarding/setup";
import type { EssentialService } from "@/lib/onboarding/essentials";
import { MAX_ESSENTIAL_SERVICES } from "@/lib/onboarding/essentials";
import type { SetupCopy } from "@/lib/onboarding/setup-copy";

const field = { background: "var(--tl-surface-raised)", border: "1px solid var(--tl-hairline)", color: "var(--tl-ink)" } as const;

export function SetupServices({
  copy,
  currency,
  services,
  onChange,
}: {
  copy: SetupCopy;
  currency: string;
  services: EssentialService[];
  onChange: (next: EssentialService[]) => void;
}) {
  const patch = (i: number, p: Partial<EssentialService>) => onChange(services.map((s, j) => (j === i ? { ...s, ...p } : s)));
  return (
    <div className="flex flex-col gap-3" data-testid="onb-setup-services">
      {services.map((s, i) => (
        <div key={i} className="rounded-[18px] p-3" style={{ background: "var(--tl-surface)", border: "1px solid var(--tl-hairline)" }}>
          <div className="flex items-center gap-2">
            <input
              value={s.name}
              onChange={(e) => patch(i, { name: e.target.value })}
              aria-label={copy.serviceName}
              placeholder={copy.serviceName}
              autoComplete="off"
              data-testid={`onb-service-name-${i}`}
              className="h-12 min-w-0 flex-1 rounded-[12px] px-3 text-[1rem] outline-none"
              style={field}
            />
            <button type="button" onClick={() => onChange(services.filter((_, j) => j !== i))} aria-label={copy.remove} className="grid size-11 shrink-0 place-items-center rounded-full" style={{ color: "var(--tl-muted)", border: "1px solid var(--tl-hairline)" }}>
              <svg aria-hidden width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M2 2l10 10M12 2L2 12" /></svg>
            </button>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <label className="block">
              <span className="mb-1 block text-[0.6875rem] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--tl-muted)" }}>{copy.minutes}</span>
              <input
                inputMode="numeric"
                value={s.durationMin ?? ""}
                onChange={(e) => patch(i, { durationMin: Number(e.target.value.replace(/\D/g, "")) || null })}
                data-testid={`onb-service-min-${i}`}
                className="h-12 w-full rounded-[12px] px-3 text-[1rem] outline-none"
                style={field}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[0.6875rem] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--tl-muted)" }}>{copy.price} ({currency})</span>
              <input
                inputMode="decimal"
                disabled={s.quote}
                value={s.quote ? "" : centsToInput(s.priceCents)}
                placeholder={s.quote ? copy.quoteOn : "0"}
                onChange={(e) => patch(i, { priceCents: parsePriceToCents(e.target.value) })}
                data-testid={`onb-service-price-${i}`}
                className="h-12 w-full rounded-[12px] px-3 text-[1rem] outline-none disabled:opacity-60"
                style={field}
              />
            </label>
          </div>
          <label className="mt-2 flex min-h-11 items-center gap-2 text-[0.875rem]" style={{ color: "var(--tl-ink-soft)" }}>
            <input type="checkbox" checked={s.quote} onChange={(e) => patch(i, { quote: e.target.checked, priceCents: e.target.checked ? null : s.priceCents })} className="size-5" data-testid={`onb-service-quote-${i}`} />
            {copy.quote}
          </label>
        </div>
      ))}
      {services.length < MAX_ESSENTIAL_SERVICES ? (
        <button type="button" onClick={() => onChange([...services, blankService(currency)])} data-testid="onb-service-add" className="min-h-12 rounded-full px-4 text-[0.9375rem] font-semibold" style={{ border: "1.5px dashed var(--tl-hairline-strong)", color: "var(--tl-forest)" }}>
          + {copy.addService}
        </button>
      ) : null}
    </div>
  );
}
