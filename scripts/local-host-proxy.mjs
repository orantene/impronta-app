import http from "node:http";

const [, , portArg, hostArg] = process.argv;
const port = Number(portArg);
const hostHeader = hostArg;

if (!port || !hostHeader) {
  console.error("usage: node scripts/local-host-proxy.mjs <listen-port> <host-header>");
  process.exit(2);
}

const UPSTREAM_HOST = "127.0.0.1";
const UPSTREAM_PORT = 3000;

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

server.listen(port, "127.0.0.1", () => {
  console.log(`[host-proxy] :${port} → Host: ${hostHeader} → :${UPSTREAM_PORT}`);
});
