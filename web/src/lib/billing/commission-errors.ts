/** Errors the commission resolver throws (kept in its own module so the
 *  processing helpers can throw them without a circular import). */
export class CommissionResolutionError extends Error {
  constructor(public code:
    | "negative_line_item"
    | "talent_cost_exceeds_price"
    | "no_line_items"
    | "currency_invalid"
    | "platform_take_out_of_range"
    | "lanes_do_not_sum"
    | "processing_rates_missing"
  ) {
    super(code);
    this.name = "CommissionResolutionError";
  }
}
