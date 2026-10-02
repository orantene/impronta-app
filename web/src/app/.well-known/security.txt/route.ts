/**
 * RFC 9116 security.txt. Expires is computed one year ahead on each request so
 * the file never silently goes stale.
 */
export async function GET() {
  const expires = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
  const body = [
    "Contact: mailto:security@tulala.digital",
    `Expires: ${expires}`,
    "Preferred-Languages: en, es",
    "Canonical: https://tulala.digital/.well-known/security.txt",
    "",
  ].join("\n");
  return new Response(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
}
