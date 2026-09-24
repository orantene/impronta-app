import { CATALOG_BOOKING_CSS } from "@/components/public-booking/catalog-booking-styles";

const ASK_CSS = `
.ask-back { position: fixed; inset: 0; z-index: 130; background: rgba(36,33,38,0.42); backdrop-filter: blur(3px); display: flex; align-items: flex-end; justify-content: flex-end; padding: 0; }
.ask-panel { width: 100%; max-width: 420px; max-height: 88vh; display: flex; flex-direction: column; background: #fff; border-radius: 22px 22px 0 0; font-family: var(--font-inter-body), Inter, system-ui, sans-serif; box-shadow: 0 -24px 60px -28px rgba(36,33,38,0.45); }
.ask-panel header { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; padding: 20px 20px 16px; border-bottom: 1px solid #ECE8EB; }
.ask-panel header p { margin: 0; font-size: 0.6875rem; letter-spacing: 0.14em; text-transform: uppercase; font-weight: 600; color: #A82458; }
.ask-panel header h2 { margin: 5px 0 0; font-family: var(--font-fraunces), Georgia, serif; font-weight: 400; font-size: 1.375rem; letter-spacing: -0.02em; }
.ask-panel header button { appearance: none; border: 0; background: #F7F4F6; width: 40px; height: 40px; border-radius: 99px; cursor: pointer; color: #242126; flex: 0 0 auto; }
.ask-body { padding: 18px 20px 22px; overflow-y: auto; display: grid; gap: 14px; }
.ask-bubble { background: #FFF5F8; border-radius: 16px 16px 16px 4px; padding: 14px 16px; font-size: 0.9375rem; line-height: 1.55; color: #242126; }
.ask-chip { justify-self: start; background: #F4D7E2; color: #242126; border-radius: 99px; padding: 6px 13px; font-size: 0.8125rem; font-weight: 600; }
.ask-field { display: grid; gap: 6px; }
.ask-field span { font-size: 0.875rem; font-weight: 600; }
.ask-field textarea { border-radius: 12px; border: 1px solid #DAD4D9; padding: 12px 14px; font-family: inherit; font-size: 0.9375rem; resize: vertical; }
.ask-note { margin: 0; font-size: 0.8125rem; line-height: 1.5; color: #66616B; background: #FFF5F8; border-radius: 12px; padding: 12px 14px; }
.ask-payload summary { cursor: pointer; font-size: 0.8125rem; font-weight: 600; color: #A82458; min-height: 40px; display: flex; align-items: center; }
.ask-payload pre { margin: 6px 0 0; background: #F7F4F6; border-radius: 10px; padding: 12px; font-size: 0.75rem; overflow-x: auto; }
@media (min-width: 720px) {
  .ask-back { align-items: center; justify-content: center; padding: 20px; }
  .ask-panel { border-radius: 20px; }
}
`;

export const DEMO_SHEET_CSS = `${CATALOG_BOOKING_CSS}${ASK_CSS}`;
