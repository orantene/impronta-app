/**
 * Thin alias: TUL-391 settlement lives in failed-refund-settlement (ONE stamper
 * after #2909 / TUL-144 landed). Kept so older static asserts / imports resolve.
 */
export { handleFailedRefundWebhookAction as processRefundSettlement } from "@/lib/payments/failed-refund-settlement";
