// QA host proxy — forwards :3310 → :3300 with the registered impronta host
// header so middleware host-gating passes in the preview browser.
import http from "node:http";
const UPSTREAM = { host: "127.0.0.1", port: 3300 };
http.createServer((req, res) => {
  const p = http.request(
    { ...UPSTREAM, path: req.url, method: req.method,
      headers: { ...req.headers, host: "improntamodels.com" } },
    (u) => { res.writeHead(u.statusCode ?? 502, u.headers); u.pipe(res); },
  );
  p.on("error", () => { res.writeHead(502); res.end("upstream down"); });
  req.pipe(p);
}).listen(3310, () => console.log("proxy 3310 → 3300 (Host: improntamodels.com)"));
