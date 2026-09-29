/** Convert Playwright storageState JSON → Netscape cookies for legacy DoD scripts. */
import fs from "node:fs";

const [,, statePath, outPath, urlHost = "127.0.0.1"] = process.argv;
if (!statePath || !outPath) {
  console.error("usage: _auth-to-cookies.mts <storageState.json> <cookies.txt> [host]");
  process.exit(1);
}
const state = JSON.parse(fs.readFileSync(statePath, "utf8")) as {
  cookies: Array<{ name: string; value: string; domain: string; path: string; expires: number; httpOnly: boolean; secure: boolean }>;
};
const lines = ["# Netscape HTTP Cookie File"];
for (const c of state.cookies || []) {
  const domain = c.domain?.startsWith(".") ? c.domain : `.${c.domain || urlHost}`;
  const includeSub = "TRUE";
  const path = c.path || "/";
  const secure = c.secure ? "TRUE" : "FALSE";
  const expires = c.expires > 0 ? Math.floor(c.expires) : 0;
  lines.push([domain, includeSub, path, secure, String(expires), c.name, c.value].join("\t"));
}
fs.writeFileSync(outPath, lines.join("\n") + "\n");
console.log("wrote", outPath, "cookies", (state.cookies || []).length);
