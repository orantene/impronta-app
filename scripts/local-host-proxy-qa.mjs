import http from "node:http";

// QA host-proxy: rewrites Host (so Next server-actions CSRF is consistent) and
// forwards to a configurable upstream port. Usage:
//   node scripts/local-host-proxy-qa.mjs <listen-port> <host-header> [upstream-port]
const [, , portArg, hostArg, upstreamArg] = process.argv;
const port = Number(portArg);
const hostHeader = hostArg;
if (!port || !hostHeader) {
  console.error("usage: node scripts/local-host-proxy-qa.mjs <listen-port> <host-header> [upstream-port]");
  process.exit(2);
}
const UPSTREAM_HOST = "127.0.0.1";
const UPSTREAM_PORT = Number(upstreamArg) || 3000;

const server = http.createServer((clientReq, clientRes) => {
  const hdrs = { ...clientReq.headers, host: hostHeader };
  if (hdrs.origin) hdrs.origin = `http://${hostHeader}`;
  if (hdrs.referer) {
    try { const r = new URL(hdrs.referer); r.host = hostHeader; r.protocol = "http:"; hdrs.referer = r.toString(); } catch {}
  }
  const proxy = http.request(
    { host: UPSTREAM_HOST, port: UPSTREAM_PORT, method: clientReq.method, path: clientReq.url, headers: hdrs },
    (upRes) => { clientRes.writeHead(upRes.statusCode ?? 502, upRes.headers); upRes.pipe(clientRes); },
  );
  proxy.on("error", (err) => { clientRes.writeHead(502, { "content-type": "text/plain" }); clientRes.end(`proxy error: ${err.message}`); });
  clientReq.pipe(proxy);
});

server.on("upgrade", (req, clientSocket, head) => {
  const hdrs = { ...req.headers, host: hostHeader };
  if (hdrs.origin) hdrs.origin = `http://${hostHeader}`;
  const proxyReq = http.request({ host: UPSTREAM_HOST, port: UPSTREAM_PORT, method: req.method, path: req.url, headers: hdrs });
  proxyReq.on("upgrade", (proxyRes, proxySocket, proxyHead) => {
    clientSocket.write(`HTTP/1.1 ${proxyRes.statusCode} ${proxyRes.statusMessage}\r\n` +
      Object.entries(proxyRes.headers).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`).join("\r\n") + "\r\n\r\n");
    if (proxyHead && proxyHead.length) proxySocket.unshift(proxyHead);
    proxySocket.pipe(clientSocket); clientSocket.pipe(proxySocket);
    const drop = () => { proxySocket.destroy(); clientSocket.destroy(); };
    proxySocket.on("error", drop); clientSocket.on("error", drop);
  });
  proxyReq.on("error", () => clientSocket.destroy());
  if (head && head.length) proxyReq.write(head);
  proxyReq.end();
});

server.listen(port, "127.0.0.1", () => console.log(`[qa-proxy] :${port} -> Host: ${hostHeader} -> :${UPSTREAM_PORT}`));
