/** rrweb mask / block config. Never record Stripe Connect or privacy-marked nodes. */

export const STRIPE_CONNECT_PRIVACY_ATTR = 'data-tulala-privacy="block"' as const;

export const SUPPORT_REPLAY_MASK = {
  maskAllInputs: true,
  maskInputOptions: {
    color: true,
    date: true,
    "datetime-local": true,
    email: true,
    month: true,
    number: true,
    range: true,
    search: true,
    tel: true,
    text: true,
    time: true,
    url: true,
    week: true,
    textarea: true,
    select: true,
    password: true,
  },
  maskTextSelector: '[data-tulala-privacy="mask"]',
  blockSelector: '[data-tulala-privacy="block"]',
  recordCanvas: false,
  collectFonts: false,
  sampling: {
    mousemove: 50,
    scroll: 100,
    input: "last" as const,
  },
} as const;
