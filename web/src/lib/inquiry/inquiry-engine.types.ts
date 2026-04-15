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
};

export type EngineResult<T = unknown> = EngineOk<T> | EngineErr;
