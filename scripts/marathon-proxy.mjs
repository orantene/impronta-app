import http from "node:http";

const [, , portArg, hostArg, upstreamArg] = process.argv;
const port = Number(portArg);
const hostHeader = hostArg;
const UPSTREAM_PORT = Number(upstreamArg) || 3200;

if (!port || !hostHeader) {
  console.error("usage: node scripts/marathon-proxy.mjs <listen-port> <host-header> [upstream-port]");
  process.exit(1);
}

const server = http.createServer((req, res) => {
  const options = {
    hostname: "127.0.0.1",
    port: UPSTREAM_PORT,
    path: req.url,
    method: req.method,
    headers: { ...req.headers, host: hostHeader },
  };
  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });
  proxyReq.on("error", (err) => {
    res.writeHead(502, { "content-type": "text/plain" });
    res.end(`proxy upstream error: ${err.message}`);
  });
  req.pipe(proxyReq, { end: true });
});

server.listen(port, () => {
  console.log(`marathon-proxy: http://localhost:${port} -> :${UPSTREAM_PORT} as Host: ${hostHeader}`);
});
