import type { IncomingMessage, ServerResponse } from "node:http";

import { getWhatsAppPage } from "./whatsapp-client.js";

type CdpSession = {
  send: (method: string, params?: Record<string, unknown>) => Promise<unknown>;
  on: (event: string, handler: (payload: ScreencastFrame) => void) => void;
  off?: (event: string, handler: (payload: ScreencastFrame) => void) => void;
};

type ScreencastFrame = {
  data?: string;
  sessionId?: number;
};

type MouseInput = {
  type: "mouse";
  event: "down" | "up" | "move" | "wheel";
  x: number;
  y: number;
  button?: string;
  deltaY?: number;
};

type KeyInput = {
  type: "key";
  event: "down" | "up";
  key: string;
  code: string;
  text?: string;
  modifiers?: number;
};

export function isLocalViewer(req: IncomingMessage): boolean {
  const host = (req.headers.host ?? "").split(":")[0]?.toLowerCase() ?? "";
  const hostOk = host === "127.0.0.1" || host === "localhost" || host === "[::1]";
  const remote = req.socket.remoteAddress ?? "";
  const remoteOk = remote === "127.0.0.1" || remote === "::1" || remote === ":ffff:127.0.0.1";
  return hostOk && remoteOk;
}

export function tenantFromUrl(url: URL): string {
  return (url.searchParams.get("tenant") ?? "").trim();
}

export function serveWhatsAppView(res: ServerResponse, tenantId: string): void {
  res.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(VIEW_HTML.replaceAll("__TENANT__", encodeURIComponent(tenantId)));
}

export async function serveScreencast(req: IncomingMessage, res: ServerResponse, tenantId: string): Promise<void> {
  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive",
  });

  const send = (payload: Record<string, unknown>) => {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  let page = getWhatsAppPage(tenantId);
  while (!page && !req.destroyed) {
    send({ waiting: true });
    await sleep(1500);
    page = getWhatsAppPage(tenantId);
  }
  if (!page || req.destroyed) {
    res.end();
    return;
  }

  const cdp = (await page.createCDPSession()) as CdpSession;
  const onFrame = (payload: ScreencastFrame) => {
    if (payload.data) send({ image: payload.data });
    if (payload.sessionId !== undefined) {
      void cdp.send("Page.screencastFrameAck", { sessionId: payload.sessionId });
    }
  };
  cdp.on("Page.screencastFrame", onFrame);
  await cdp.send("Page.startScreencast", {
    format: "jpeg",
    quality: 55,
    maxWidth: 1200,
    maxHeight: 1100,
    everyNthFrame: 1,
  });

  const stop = () => {
    cdp.off?.("Page.screencastFrame", onFrame);
    void cdp.send("Page.stopScreencast").catch(() => undefined);
    res.end();
  };
  req.on("close", stop);
}

const inputSessions = new Map<string, CdpSession>();

async function inputSession(tenantId: string): Promise<CdpSession | null> {
  const existing = inputSessions.get(tenantId);
  if (existing) return existing;
  const page = getWhatsAppPage(tenantId);
  if (!page) return null;
  const cdp = (await page.createCDPSession()) as CdpSession;
  inputSessions.set(tenantId, cdp);
  return cdp;
}

export async function applyViewInput(tenantId: string, body: unknown): Promise<boolean> {
  const cdp = await inputSession(tenantId);
  if (!cdp) return false;
  if (!body || typeof body !== "object") return false;
  const input = body as MouseInput | KeyInput;
  if (input.type === "mouse") {
    await dispatchMouse(cdp, input);
    return true;
  }
  if (input.type === "key") {
    await dispatchKey(cdp, input);
    return true;
  }
  return false;
}

async function dispatchMouse(cdp: CdpSession, input: MouseInput): Promise<void> {
  const x = Math.round(input.x);
  const y = Math.round(input.y);
  const button = input.button === "right" ? "right" : input.button === "middle" ? "middle" : "left";
  if (input.event === "wheel") {
    await cdp.send("Input.dispatchMouseEvent", {
      type: "mouseWheel",
      x,
      y,
      deltaX: 0,
      deltaY: input.deltaY ?? 0,
    });
    return;
  }
  const type =
    input.event === "down" ? "mousePressed" : input.event === "up" ? "mouseReleased" : "mouseMoved";
  await cdp.send("Input.dispatchMouseEvent", {
    type,
    x,
    y,
    button,
    clickCount: input.event === "down" || input.event === "up" ? 1 : 0,
  });
}

async function dispatchKey(cdp: CdpSession, input: KeyInput): Promise<void> {
  const type = input.event === "up" ? "keyUp" : "keyDown";
  const params: Record<string, unknown> = {
    type,
    key: input.key,
    code: input.code,
    modifiers: input.modifiers ?? 0,
  };
  if (input.event === "down" && input.text) params.text = input.text;
  await cdp.send("Input.dispatchKeyEvent", params);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const VIEW_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>WhatsApp Web</title>
  <style>
    html, body { margin: 0; height: 100%; background: #111b21; color: #8696a0; font-family: system-ui, sans-serif; }
    #wrap { position: relative; height: 100%; display: flex; align-items: center; justify-content: center; }
    #frame { max-width: 100%; max-height: 100%; width: 100%; height: 100%; object-fit: contain; background: #111b21; }
    #wait { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; padding: 24px; text-align: center; }
    #wait[hidden] { display: none; }
  </style>
</head>
<body>
  <div id="wrap">
    <p id="wait">Waiting for WhatsApp Web…</p>
    <img id="frame" alt="WhatsApp Web" hidden />
  </div>
  <script>
    const tenant = "__TENANT__";
    const img = document.getElementById("frame");
    const wait = document.getElementById("wait");
    const src = new EventSource("/screencast?tenant=" + tenant);
    src.onmessage = (event) => {
      const payload = JSON.parse(event.data);
      if (payload.waiting) return;
      if (!payload.image) return;
      img.src = "data:image/jpeg;base64," + payload.image;
      img.hidden = false;
      wait.hidden = true;
    };
    function point(event) {
      const rect = img.getBoundingClientRect();
      const w = img.naturalWidth || rect.width;
      const h = img.naturalHeight || rect.height;
      return {
        x: ((event.clientX - rect.left) / rect.width) * w,
        y: ((event.clientY - rect.top) / rect.height) * h,
      };
    }
    function send(body) {
      fetch("/input?tenant=" + tenant, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }).catch(() => {});
    }
    img.addEventListener("mousedown", (event) => {
      event.preventDefault();
      const p = point(event);
      send({ type: "mouse", event: "down", button: event.button === 2 ? "right" : "left", ...p });
    });
    img.addEventListener("mouseup", (event) => {
      event.preventDefault();
      const p = point(event);
      send({ type: "mouse", event: "up", button: event.button === 2 ? "right" : "left", ...p });
    });
    img.addEventListener("wheel", (event) => {
      event.preventDefault();
      send({ type: "mouse", event: "wheel", deltaY: event.deltaY, ...point(event) });
    }, { passive: false });
    window.addEventListener("keydown", (event) => {
      send({
        type: "key",
        event: "down",
        key: event.key,
        code: event.code,
        text: event.key.length === 1 ? event.key : undefined,
        modifiers: (event.altKey ? 1 : 0) + (event.ctrlKey ? 2 : 0) + (event.metaKey ? 4 : 0) + (event.shiftKey ? 8 : 0),
      });
    });
    window.addEventListener("keyup", (event) => {
      send({ type: "key", event: "up", key: event.key, code: event.code });
    });
  </script>
</body>
</html>
`;
