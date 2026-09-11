#!/usr/bin/env node
// A reverse proxy that presents a registered tenant host to a local `next dev`
// AND forwards the HMR websocket upgrade, which the scratchpad's
// local-host-proxy.mjs does not: without it the dev client's HMR socket fails,
// it reloads the page every ~45s, and the admin shell (a large dev bundle on a
// loaded machine) never finishes hydrating before the next reload.
// Usage: node host-proxy-ws.mjs <listenPort> <hostToPresent> <upstreamPort>
import http from "node:http";
import net from "node:net";
const [, , lp, host, up] = process.argv;
const listenPort = Number(lp), upstreamPort = Number(up);
const server = http.createServer((req, res) => {
  // Server Actions refuse a POST whose `origin` does not match the host the
  // app sees, so the browser's localhost origin is rewritten too.
  const headers = { ...req.headers, host };
  if (headers.origin) headers.origin = `http://${host}`;
  if (headers.referer) headers.referer = headers.referer.replace(/^http:\/\/localhost:\d+/, `http://${host}`);
  const pr = http.request({ host: "127.0.0.1", port: upstreamPort, path: req.url, method: req.method, headers }, (r) => {
    res.writeHead(r.statusCode ?? 502, r.headers);
    r.pipe(res, { end: true });
  });
  pr.on("error", (e) => { res.writeHead(502); res.end("proxy error: " + e.message); });
  req.pipe(pr, { end: true });
});
server.on("upgrade", (req, socket, head) => {
  const upstream = net.connect(upstreamPort, "127.0.0.1", () => {
    const lines = [`${req.method} ${req.url} HTTP/1.1`];
    const h = { ...req.headers, host };
    for (const [k, v] of Object.entries(h)) lines.push(`${k}: ${Array.isArray(v) ? v.join(", ") : v}`);
    upstream.write(lines.join("\r\n") + "\r\n\r\n");
    if (head.length) upstream.write(head);
    upstream.pipe(socket);
    socket.pipe(upstream);
  });
  upstream.on("error", () => socket.destroy());
  socket.on("error", () => upstream.destroy());
});
server.listen(listenPort, () => console.log(`host-proxy-ws :${listenPort} -> host=${host} -> 127.0.0.1:${upstreamPort}`));
