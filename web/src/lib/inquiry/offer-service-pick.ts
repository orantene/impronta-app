/**
 * offer-service-pick.ts — what "Prefill from services" does to an offer draft
 * line, currency included (TUL-274). Pure: the editor applies the plan.
 */
import { decideServicePreload } from "./offer-currency";

type PickLine = { id: string; label: string | null; unitPrice: number };
type PickService = {
  id: string;
  name: string;
  pricingType: string;
  amountCents: number | null;
  currency: string;
};

export type ServicePickPlan = {
  /** Set when the preload is refused: the amount would cross currencies. */
  blocked?: { service: string; offer: string };
  /** Set when the (still unpriced) draft takes the service's currency. */
  switchCurrency?: string;
  /** Line fields to write. Empty when blocked. */
  patch: {
    label?: string | null;
    pricingUnit?: string;
    unitPrice?: number;
    sourceServiceId?: string;
  };
};

export function planServicePick(input: {
  offerCurrency: string;
  lines: ReadonlyArray<PickLine>;
  lineId: string;
  labelTouched: boolean;
  service: PickService;
}): ServicePickPlan {
  const line = input.lines.find((l) => l.id === input.lineId);
  const decision = decideServicePreload({
    offerCurrency: input.offerCurrency,
    serviceCurrency: input.service.currency,
    serviceAmountCents: input.service.amountCents,
    hasOtherPricedLines: input.lines.some((l) => l.id !== input.lineId && (Number(l.unitPrice) || 0) > 0),
  });
  if (decision.action === "block") {
    return { blocked: { service: decision.serviceCurrency, offer: decision.offerCurrency }, patch: {} };
  }
  const svc = input.service;
  return {
    switchCurrency: decision.action === "switch" ? decision.currency : undefined,
    patch: {
      label: input.labelTouched ? (line?.label ?? null) : svc.name,
      pricingUnit: svc.pricingType,
      unitPrice: svc.amountCents != null ? svc.amountCents / 100 : (line?.unitPrice ?? 0),
      sourceServiceId: svc.id,
    },
  };
}
