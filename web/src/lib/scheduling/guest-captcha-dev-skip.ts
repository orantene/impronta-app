/**
 * Hostnames where guest captcha may be skipped when DEV surfaces are on.
 *
 * Browser proof often hits the vanity via `local-host-proxy.mjs`, so the
 * visible origin is `127.0.0.1:<proxy>` while `Host` / `x-forwarded-host` is
 * `<slug>.lvh.me:<proxy>`. Client skip and server skip must agree on both.
 * Production tulala.digital hosts are never included.
 */

export function isDevGuestCaptchaSkipHostname(hostHeaderOrHostname: string): boolean {
  const hostname = hostHeaderOrHostname.trim().toLowerCase().split(":")[0] ?? "";
  if (!hostname) return false;
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname.endsWith(".lvh.me") ||
    hostname.endsWith(".local")
  );
}
