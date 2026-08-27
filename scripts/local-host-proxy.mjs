import http from "node:http";
import net from "node:net";

const [, , portArg, hostArg, upstreamPortArg] = process.argv;
const port = Number(portArg);
const hostHeader = hostArg;

if (!port || !hostHeader) {
  console.error(
    "usage: node scripts/local-host-proxy.mjs <listen-port> <host-header> [upstream-port=3000]",
  );
  process.exit(2);
}

const UPSTREAM_HOST = "127.0.0.1";
const UPSTREAM_PORT = Number(upstreamPortArg) || 3000;

// A Turbopack dev page fires ~60 parallel chunk requests. The default agent
// starves under that, and every starved socket surfaced to the browser as a
// 502 on a JS chunk — which is indistinguishable from a broken build.
//
// keepAlive is deliberately OFF. Pooled sockets that the dev server has since
// closed come back as `read ECONNRESET` on the next request, and a retry is
// only safe for a bodyless GET/HEAD — RSC server-action POSTs have already
// streamed their body, so they surfaced as hard 502s and whole client subtrees
// (floating launchers, dialogs) silently never mounted. A fresh socket per
// request costs a loopback handshake and is worth it here.
const agent = new http.Agent({ keepAlive: false, maxSockets: 512 });

const server = http.createServer((clientReq, clientRes) => {
  // Rewrite Host, Origin and Referer so Next.js Server Actions CSRF check
  // sees a consistent origin. Without this the dev request comes in with
  // Host: hostHeader but Origin: http://localhost:<proxyPort>, which
  // triggers "Invalid Server Actions request" (500) on every form POST.
  const proxyProto = "http";
  const hdrs = { ...clientReq.headers, host: hostHeader };
  if (hdrs.origin) hdrs.origin = `${proxyProto}://${hostHeader}`;
  if (hdrs.referer) {
    try {
      const r = new URL(hdrs.referer);
      r.host = hostHeader;
      r.protocol = `${proxyProto}:`;
      hdrs.referer = r.toString();
    } catch {
      // leave referer as-is if unparseable
    }
  }
  const headers = hdrs;
  const proxy = http.request(
    {
      host: UPSTREAM_HOST,
      port: UPSTREAM_PORT,
      method: clientReq.method,
      path: clientReq.url,
      headers,
      agent,
    },
    (upRes) => {
      clientRes.writeHead(upRes.statusCode ?? 502, upRes.headers);
      upRes.pipe(clientRes);
    },
  );
  proxy.on("error", (err) => {
    clientRes.writeHead(502, { "content-type": "text/plain" });
    clientRes.end(`proxy error: ${err.message}`);
  });
  clientReq.pipe(proxy);
});

// Forward WebSocket upgrades (Next.js / Turbopack dev HMR runs over a WS).
// Without this the dev client never connects, the Turbopack runtime fails to
// bootstrap, and the page renders but NEVER HYDRATES — every button is inert
// and nothing client-only (floating launchers, dropdowns, modals) is ever in
// the DOM. There is no error banner; the page just looks finished and dead.
// Check with, in the page console:
//   Object.keys(document.querySelector("body>*"))
//     .filter((k) => k.startsWith("__react")).length
// 0 = never hydrated, 2 = healthy.
//
// TWO things are load-bearing here, and both were wrong before:
//
//   1. This MUST be a raw net.connect tunnel. Node's HTTP *client* parser
//      rejects the dev server's 101 with "Parse Error: Expected HTTP/, RTSP/
//      or ICE/", so http.request() cannot carry this handshake at all.
//      `agent: false` does not help. Write the request line by hand.
//   2. The upgrade MUST carry the UPSTREAM host, not `hostHeader`. HMR needs
//      no tenant context, and Turbopack's dev WS refuses a host/origin that is
//      not where it is listening, so the browser retries the socket forever.
//      Rewriting the host is correct on the plain-HTTP path above and wrong
//      here.
server.on("upgrade", (req, clientSocket, head) => {
  const hdrs = { ...req.headers, host: `${UPSTREAM_HOST}:${UPSTREAM_PORT}` };
  if (hdrs.origin) hdrs.origin = `http://${UPSTREAM_HOST}:${UPSTREAM_PORT}`;

  const lines = [`${req.method} ${req.url} HTTP/1.1`];
  for (const [k, v] of Object.entries(hdrs)) {
    for (const one of Array.isArray(v) ? v : [v]) lines.push(`${k}: ${one}`);
  }

  const upstream = net.connect(UPSTREAM_PORT, UPSTREAM_HOST, () => {
    upstream.write(lines.join("\r\n") + "\r\n\r\n");
    if (head && head.length) upstream.write(head);
    upstream.pipe(clientSocket);
    clientSocket.pipe(upstream);
  });

  const drop = () => {
    upstream.destroy();
    clientSocket.destroy();
  };
  upstream.on("error", drop);
  clientSocket.on("error", drop);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`[host-proxy] :${port} → Host: ${hostHeader} → :${UPSTREAM_PORT}`);
});
