export function WhatsAppIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <path
        d="M12 3.2c-4.8 0-8.7 3.9-8.7 8.7 0 1.5.4 3 1.1 4.3L3 21l4.9-1.3c1.3.7 2.7 1.1 4.1 1.1 4.8 0 8.7-3.9 8.7-8.7S16.8 3.2 12 3.2Z"
        className="stroke-current"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M9.2 8.8c.2-.4.4-.4.7-.4h.6c.2 0 .4 0 .5.3l.9 2.1c.1.3 0 .5-.2.7l-.5.5c-.1.1-.1.3 0 .5.4.7 1.1 1.4 1.9 1.8.2.1.4.1.5 0l.7-.5c.2-.2.5-.1.7.1l1.7 1.4c.2.2.3.5.1.7-.3.5-1.2 1.1-2.2.8-1.4-.4-3.1-1.5-4.3-3.1-1.1-1.5-1.6-3.1-1.5-4.4.1-.7.6-1.2 1.1-1.5Z"
        className="fill-current"
      />
    </svg>
  );
}
