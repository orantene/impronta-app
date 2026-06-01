import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { extname, join, resolve, sep } from "node:path";

/**
 * Localhost static server for the fidelity capture.
 *
 * The renderer's image guard accepts only `http(s)` / root-relative `/…` srcs
 * (it drops `file://` and `data:`), so real photos can't be painted from a
 * `file://` page. This server lets `capture.ts` load the generated HTML over
 * http and resolve:
 *   - `/_fidelity/<design>/<file>.html`  → the written capture HTML (web/fidelity)
 *   - `/_fidelity-fonts/<file>.woff2`    → committed bundled fonts
 *   - `/marketing/…`, `/talent-templates/…`, … → web/public (real photos)
 * Everything stays offline + deterministic; the renderer guard is untouched.
 */

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8",
  ".woff2": "font/woff2",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".avif": "image/avif",
  ".gif": "image/gif",
};

export interface FidelityServer {
  origin: string;
  fontsBaseUrl: string;
  close: () => Promise<void>;
}

export interface FidelityServerRoots {
  /** web/public — real photos served root-relative. */
  publicDir: string;
  /** web/fidelity — generated capture HTML, served under /_fidelity/. */
  outputDir: string;
  /** scripts/fidelity/fonts — bundled woff2, served under /_fidelity-fonts/. */
  fontsDir: string;
}

/** Resolve a request path inside a root, refusing path traversal. */
function safeResolve(root: string, relative: string): string | null {
  const target = resolve(root, relative.replace(/^\/+/, ""));
  const prefix = root.endsWith(sep) ? root : root + sep;
  if (target !== root && !target.startsWith(prefix)) return null;
  return target;
}

export async function startFidelityServer(
  roots: FidelityServerRoots,
): Promise<FidelityServer> {
  const server: Server = createServer((req, res) => {
    let pathname = "/";
    try {
      pathname = decodeURIComponent(new URL(req.url ?? "/", "http://localhost").pathname);
    } catch {
      res.statusCode = 400;
      res.end("bad request");
      return;
    }

    let absolute: string | null = null;
    if (pathname.startsWith("/_fidelity-fonts/")) {
      absolute = safeResolve(roots.fontsDir, pathname.slice("/_fidelity-fonts/".length));
    } else if (pathname.startsWith("/_fidelity/")) {
      absolute = safeResolve(roots.outputDir, pathname.slice("/_fidelity/".length));
    } else {
      absolute = safeResolve(roots.publicDir, pathname);
    }

    if (!absolute || !existsSync(absolute) || !statSync(absolute).isFile()) {
      res.statusCode = 404;
      res.end("not found");
      return;
    }
    res.setHeader("content-type", CONTENT_TYPES[extname(absolute).toLowerCase()] ?? "application/octet-stream");
    createReadStream(absolute).pipe(res);
  });

  await new Promise<void>((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("fidelity server: failed to bind an ephemeral port");
  }
  const origin = `http://127.0.0.1:${address.port}`;
  return {
    origin,
    fontsBaseUrl: `${origin}/_fidelity-fonts/`,
    close: () => new Promise<void>((resolveClose) => server.close(() => resolveClose())),
  };
}

/** Map an absolute HTML file path under outputDir to its served URL. */
export function fidelityHtmlUrl(origin: string, outputDir: string, htmlPath: string): string {
  const relative = resolve(htmlPath).slice(resolve(outputDir).length).replace(/^\/+/, "");
  return `${origin}/_fidelity/${relative.split(sep).join("/")}`;
}

export const FIDELITY_SERVE_HINT = join("scripts", "fidelity", "server.ts");
