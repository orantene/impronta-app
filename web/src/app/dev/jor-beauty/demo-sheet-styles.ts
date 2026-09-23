/**
 * Styles for the prototype booking sheet (DemoBookingSheet).
 *
 * Deliberately NOT in the template's own stylesheet: the real profile does not
 * render this sheet, and nothing here should be mistaken for template CSS.
 * Namespaced `.jb-`, and it borrows the Maison palette so the sheet reads as
 * part of the same page.
 *
 * Mobile: a bottom sheet with a scrollable body and a fixed action area, so a
 * long option list never pushes the total or the CTA off screen, and the
 * safe-area inset keeps the button clear of the home indicator.
 * Desktop: the same sheet, centred as a dialog.
 */

export const DEMO_SHEET_CSS = `
.jb-back {
  position: fixed; inset: 0; z-index: 120; background: rgba(36,33,38,0.42);
  backdrop-filter: blur(3px); display: flex; align-items: flex-end; justify-content: center;
  animation: jb-fade 200ms cubic-bezier(0.22,1,0.36,1);
}
@keyframes jb-fade { from { opacity: 0 } to { opacity: 1 } }
.jb-sheet {
  width: 100%; max-width: 560px; max-height: 92vh; display: flex; flex-direction: column;
  background: #fff; color: #242126; border-radius: 22px 22px 0 0;
  font-family: var(--font-inter-body), Inter, system-ui, sans-serif;
  box-shadow: 0 -24px 60px -28px rgba(36,33,38,0.45);
  animation: jb-rise 300ms cubic-bezier(0.22,1,0.36,1);
}
@keyframes jb-rise { from { transform: translateY(28px); opacity: .5 } to { transform: none; opacity: 1 } }
@media (prefers-reduced-motion: reduce) { .jb-sheet, .jb-back { animation: none } }

.jb-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; padding: 20px 20px 16px; border-bottom: 1px solid #ECE8EB; }
.jb-head h2 { margin: 5px 0 0; font-family: var(--font-fraunces), Georgia, serif; font-weight: 400; font-size: 1.5rem; letter-spacing: -0.02em; line-height: 1.1; }
.jb-kicker { margin: 0; font-size: 0.6875rem; letter-spacing: 0.14em; text-transform: uppercase; font-weight: 600; color: #A82458; }
.jb-x { appearance: none; border: 0; background: #F7F4F6; width: 40px; height: 40px; border-radius: 99px; font-size: 1rem; cursor: pointer; color: #242126; flex: 0 0 auto; }

.jb-body { padding: 18px 20px 22px; overflow-y: auto; -webkit-overflow-scrolling: touch; }

.jb-summary { background: #FFF5F8; border-radius: 14px; padding: 14px 16px; margin-bottom: 20px; }
.jb-summary > div { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.jb-summary span { font-size: 0.8125rem; color: #66616B; }
.jb-summary strong { font-size: 1.25rem; font-variant-numeric: tabular-nums; }
.jb-incl { margin: 10px 0 0; font-size: 0.875rem; color: #A82458; }
.jb-fixture { margin: 10px 0 0; font-size: 0.8125rem; line-height: 1.5; color: #66616B; }

.jb-group { border: 0; margin: 0 0 22px; padding: 0; display: grid; gap: 8px; }
.jb-group legend { padding: 0 0 10px; font-size: 0.9375rem; font-weight: 600; display: flex; align-items: center; gap: 8px; }
.jb-req, .jb-opt-tag { font-size: 0.6875rem; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; padding: 3px 8px; border-radius: 99px; }
.jb-req { background: #A82458; color: #fff; }
.jb-opt-tag { background: #F4D7E2; color: #66616B; }
.jb-opt { display: flex; align-items: center; gap: 12px; min-height: 54px; padding: 0 15px; background: #fff; border: 1px solid #DAD4D9; border-radius: 10px; cursor: pointer; font-size: 0.9375rem; transition: border-color 160ms ease, background-color 160ms ease; }
.jb-opt[data-on="true"] { border-color: #A82458; background: #FFF5F8; }
.jb-opt span { flex: 1; min-width: 0; }
.jb-opt b { font-variant-numeric: tabular-nums; }
.jb-opt input { accent-color: #A82458; width: 18px; height: 18px; }

.jb-lines { border-top: 1px solid #ECE8EB; padding-top: 14px; display: grid; gap: 8px; }
.jb-lines > div { display: flex; justify-content: space-between; gap: 16px; font-size: 0.9375rem; color: #66616B; }
.jb-lines > div span:last-child { font-variant-numeric: tabular-nums; color: #242126; }

.jb-back-link { appearance: none; border: 0; background: none; padding: 0 0 16px; cursor: pointer; font-family: inherit; font-size: 0.875rem; color: #A82458; font-weight: 600; min-height: 40px; }
.jb-recap { margin: 0 0 18px; font-size: 0.9375rem; color: #66616B; }

.jb-days { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 10px; }
.jb-day { flex: 0 0 auto; width: 64px; min-height: 76px; border-radius: 12px; cursor: pointer; background: #fff; border: 1px solid #DAD4D9; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; font-family: inherit; color: #242126; }
.jb-day[data-on="true"] { background: #242126; border-color: #242126; color: #fff; }
.jb-day:disabled { opacity: 0.32; cursor: not-allowed; }
.jb-day span { font-size: 0.625rem; text-transform: uppercase; letter-spacing: 0.08em; opacity: .7 }
.jb-day b { font-size: 1.125rem }
.jb-day small { font-size: 0.625rem; opacity: .7 }

.jb-times { display: grid; grid-template-columns: repeat(auto-fill, minmax(86px, 1fr)); gap: 8px; margin-top: 16px; }
.jb-time { min-height: 48px; border-radius: 10px; background: #fff; border: 1px solid #DAD4D9; cursor: pointer; font-family: inherit; font-size: 0.9375rem; color: #242126; }
.jb-time[data-on="true"] { background: #242126; border-color: #242126; color: #fff; }

.jb-empty { margin-top: 18px; border: 1px dashed #DAD4D9; border-radius: 14px; padding: 22px; text-align: center; }
.jb-empty strong { display: block; margin-bottom: 6px; font-size: 0.9375rem; }
.jb-empty p { margin: 0; font-size: 0.875rem; color: #66616B; line-height: 1.55; }

.jb-field { display: grid; gap: 6px; margin-bottom: 16px; }
.jb-field span { font-size: 0.875rem; font-weight: 600; display: flex; align-items: center; gap: 8px; }
.jb-field span i { font-style: normal; font-size: 0.6875rem; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: #66616B; background: #F4D7E2; border-radius: 99px; padding: 3px 8px; }
.jb-ask { appearance: none; border: 0; background: none; padding: 14px 0 0; cursor: pointer; font-family: inherit; font-size: 0.875rem; font-weight: 600; color: #A82458; text-align: left; min-height: 44px; }
.jb-ask:hover { text-decoration: underline; text-underline-offset: 3px; }
.jb-field input { min-height: 52px; border-radius: 10px; border: 1px solid #DAD4D9; background: #fff; padding: 0 14px; font-family: inherit; font-size: 1rem; color: #242126; }
.jb-field input:focus-visible { outline: 2px solid #A82458; outline-offset: 1px; }
.jb-field input[aria-invalid="true"] { border-color: #A82458; background: #FFF5F8; }
.jb-field em { font-style: normal; font-size: 0.8125rem; color: #A82458; }
.jb-error { margin: 0 0 12px; font-size: 0.875rem; color: #A82458; }

.jb-done { text-align: center; padding: 8px 0 4px }
.jb-check { width: 60px; height: 60px; border-radius: 99px; background: #F4D7E2; color: #A82458; display: grid; place-items: center; font-size: 1.5rem; margin: 0 auto 16px }
.jb-done h3 { margin: 0 0 8px; font-family: var(--font-fraunces), Georgia, serif; font-weight: 400; font-size: 1.375rem; letter-spacing: -0.02em }
.jb-done > p { margin: 0 0 8px; font-size: 0.9375rem; color: #66616B }
.jb-demo { margin: 16px 0 0; font-size: 0.8125rem; line-height: 1.5; color: #66616B; background: #FFF5F8; border-radius: 12px; padding: 12px 14px }

.jb-foot { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 14px 20px calc(14px + env(safe-area-inset-bottom)); border-top: 1px solid #ECE8EB; background: #fff; }
.jb-total { display: grid }
.jb-total span { font-size: 0.6875rem; letter-spacing: 0.12em; text-transform: uppercase; color: #66616B }
.jb-total b { font-size: 1.1875rem; font-variant-numeric: tabular-nums }
.jb-cta { appearance: none; border: 0; cursor: pointer; min-height: 52px; padding: 0 24px; border-radius: 10px; background: #A82458; color: #fff; font-family: inherit; font-size: 0.9375rem; font-weight: 600; transition: background-color 160ms ease }
.jb-cta:hover:not(:disabled) { background: #8C1B48 }
.jb-cta:disabled { background: #DAD4D9; color: #fff; cursor: not-allowed }

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

  .jb-back { align-items: center }
  .jb-sheet { border-radius: 20px; max-height: 86vh }
  .jb-foot { border-radius: 0 0 20px 20px }
}
`;
