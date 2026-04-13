/** Align with DB numeric(12,2) — two decimal places for money fields. */
export function roundMoney(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
}

export function computeBookingTalentRowTotals(
  units: number,
  talentCostRate: number,
  clientChargeRate: number,
): {
  talent_cost_total: number;
  client_charge_total: number;
  gross_profit: number;
} {
  const u = Number.isFinite(units) && units >= 0 ? units : 0;
  const cr = Number.isFinite(talentCostRate) ? talentCostRate : 0;
  const ch = Number.isFinite(clientChargeRate) ? clientChargeRate : 0;
  const talent_cost_total = roundMoney(u * cr);
  const client_charge_total = roundMoney(u * ch);
  const gross_profit = roundMoney(client_charge_total - talent_cost_total);
  return { talent_cost_total, client_charge_total, gross_profit };
}

export function sumBookingHeaderFromRows(
  rows: { talent_cost_total: number; client_charge_total: number; gross_profit: number }[],
): {
  total_talent_cost: number;
  total_client_revenue: number;
  gross_profit: number;
} {
  let total_talent_cost = 0;
  let total_client_revenue = 0;
  let gross_profit = 0;
  for (const r of rows) {
    total_talent_cost += r.talent_cost_total;
    total_client_revenue += r.client_charge_total;
    gross_profit += r.gross_profit;
  }
  return {
    total_talent_cost: roundMoney(total_talent_cost),
    total_client_revenue: roundMoney(total_client_revenue),
    gross_profit: roundMoney(gross_profit),
  };
}
