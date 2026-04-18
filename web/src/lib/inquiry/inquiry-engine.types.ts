import type { TransitionBlockReason } from "./inquiry-lifecycle";

export type EngineOk<T = unknown> = {
  success: true;
  data?: T;
  already?: boolean;
  notificationErrors?: Error[];
};

export type EngineErr = {
  success: false;
  reason?: TransitionBlockReason;
  forbidden?: boolean;
  conflict?: boolean;
  rateLimited?: boolean;
  retryAfterMs?: number;
  error?: string;
  /**
   * M2.3: populated by `convertToBooking` when `reason === "requirement_groups_unfulfilled"`.
   * Array of per-group shortfall rows keyed by `group_id`. UI should render
   * this as a drill-down list and optionally expose the admin override dialog.
   */
  shortfall?: Array<{
    group_id: string;
    role_key: string;
    quantity_required: number;
    approved_count: number;
    shortfall: number;
  }>;
};

export type EngineResult<T = unknown> = EngineOk<T> | EngineErr;
