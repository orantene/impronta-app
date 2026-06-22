/**
 * QA tenant-host proxy (preview-tool friendly).
 *
 * Like scripts/local-host-proxy.mjs, but:
 *   - upstream port is configurable via UPSTREAM_PORT env (default 3000)
 *   - rewrites the RESPONSE `Location` + `Set-Cookie` so a cross-host redirect
 *     (e.g. /api/dev/signin → http://<tenant-host>/p/...) lands back on the
 *     proxy's own localhost:<port> origin and the auth cookie is host-only.
 *     The Claude preview browser is origin-pinned, so any off-origin redirect
 *     would otherwise bounce the navigation. This keeps the whole flow on
 *     localhost:<proxyPort> while the upstream still sees Host: <tenant-host>.
 *
 * usage: UPSTREAM_PORT=3008 node scripts/qa-tenant-proxy.mjs <listen-port> <host-header>
 */
import http from "node:http";

const [, , portArg, hostArg] = process.argv;
const port = Number(portArg);
const hostHeader = hostArg;
const UPSTREAM_HOST = "127.0.0.1";
const UPSTREAM_PORT = Number(process.env.UPSTREAM_PORT) || 3000;

if (!port || !hostHeader) {
  console.error("usage: UPSTREAM_PORT=3008 node scripts/qa-tenant-proxy.mjs <listen-port> <host-header>");
  process.exit(2);
}

const proxyOrigin = `http://localhost:${port}`;

/** Rewrite an upstream Location header back onto the proxy origin. */
function rewriteLocation(loc) {
  if (!loc) return loc;
  try {
    const u = new URL(loc, `http://${hostHeader}`);
    // Only rewrite redirects that point at the tenant host (or the upstream
    // localhost) — leave genuinely external redirects alone.
    if (u.host === hostHeader || u.hostname === "localhost" || u.hostname === "127.0.0.1") {
      return `${proxyOrigin}${u.pathname}${u.search}${u.hash}`;
    }
    return loc;
  } catch {
    return loc;
  }
}

/** Strip any Domain= attribute so Set-Cookie is accepted by a localhost browser. */
function rewriteSetCookie(sc) {
  const arr = Array.isArray(sc) ? sc : [sc];
  return arr.map((c) => c.replace(/;\s*Domain=[^;]+/i, ""));
}

const server = http.createServer((clientReq, clientRes) => {
  const hdrs = { ...clientReq.headers, host: hostHeader };
  if (hdrs.origin) hdrs.origin = `http://${hostHeader}`;
  if (hdrs.referer) {
    try {
      const r = new URL(hdrs.referer);
      r.host = hostHeader;
      r.protocol = "http:";
      hdrs.referer = r.toString();
    } catch {
      /* leave as-is */
    }
  }
  const proxy = http.request(
    { host: UPSTREAM_HOST, port: UPSTREAM_PORT, method: clientReq.method, path: clientReq.url, headers: hdrs },
    (upRes) => {
      const outHeaders = { ...upRes.headers };
      if (outHeaders.location) outHeaders.location = rewriteLocation(outHeaders.location);
      if (outHeaders["set-cookie"]) outHeaders["set-cookie"] = rewriteSetCookie(outHeaders["set-cookie"]);
      clientRes.writeHead(upRes.statusCode ?? 502, outHeaders);
      upRes.pipe(clientRes);
    },
  );
  proxy.on("error", (err) => {
    clientRes.writeHead(502, { "content-type": "text/plain" });
    clientRes.end(`proxy error: ${err.message}`);
  });
  clientReq.pipe(proxy);
});

// Forward WebSocket upgrades (Turbopack HMR).
server.on("upgrade", (req, clientSocket, head) => {
  const hdrs = { ...req.headers, host: hostHeader };
  if (hdrs.origin) hdrs.origin = `http://${hostHeader}`;
  const proxyReq = http.request({
    host: UPSTREAM_HOST, port: UPSTREAM_PORT, method: req.method, path: req.url, headers: hdrs,
  });
  proxyReq.on("upgrade", (proxyRes, proxySocket, proxyHead) => {
    const statusLine = `HTTP/1.1 ${proxyRes.statusCode} ${proxyRes.statusMessage}\r\n`;
    const headerLines = Object.entries(proxyRes.headers)
      .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
      .join("\r\n");
    clientSocket.write(statusLine + headerLines + "\r\n\r\n");
    if (proxyHead && proxyHead.length) proxySocket.unshift(proxyHead);
    proxySocket.pipe(clientSocket);
    clientSocket.pipe(proxySocket);
    const drop = () => { proxySocket.destroy(); clientSocket.destroy(); };
    proxySocket.on("error", drop);
    clientSocket.on("error", drop);
  });
  proxyReq.on("error", () => clientSocket.destroy());
  if (head && head.length) proxyReq.write(head);
  proxyReq.end();
});

server.listen(port, "127.0.0.1", () => {
  console.log(`[qa-tenant-proxy] :${port} → Host: ${hostHeader} → :${UPSTREAM_PORT} (Location/Set-Cookie rewritten to ${proxyOrigin})`);
});
