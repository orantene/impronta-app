"use client";

/**
 * Production-tier web platform features that the prototype exposes as
 * proof-of-concept cards. Both use the real browser APIs; both fall back
 * gracefully when the API isn't available (older browsers, http://, etc.).
 *
 *  - PasskeysCard   — WebAuthn `navigator.credentials.create()` + `.get()`
 *                     for a Sign in with Passkey demo. The credential is
 *                     stored in localStorage (rawId only) so the prototype
 *                     can mock the verify step without a backend. In
 *                     production, the rawId would round-trip a server
 *                     challenge.
 *
 *  - GalleryFxCard  — WebGPU shader effect that renders a moving
 *                     plasma-style gradient onto a canvas. Falls back to
 *                     a static CSS gradient when WebGPU isn't available
 *                     (Safari < 26, http://, headless QA, etc.).
 *
 * Both are guarded by feature-detection and isolated to one file so the
 * larger admin-shell tree stays simple.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { COLORS, FONTS, RADIUS } from "./_state";

const PASSKEY_STORAGE_KEY = "tulala_prototype_passkey_credentialId";

// ────────────────────────────────────────────────────────────────────
// PasskeysCard — WebAuthn proof of concept
// ────────────────────────────────────────────────────────────────────

type PasskeyState =
  | { kind: "none" }
  | { kind: "registered"; credentialId: string; createdAt: string }
  | { kind: "verified"; credentialId: string; createdAt: string; verifiedAt: string };

function readPasskeyState(): PasskeyState {
  if (typeof window === "undefined") return { kind: "none" };
  try {
    const raw = window.localStorage.getItem(PASSKEY_STORAGE_KEY);
    if (!raw) return { kind: "none" };
    return JSON.parse(raw) as PasskeyState;
  } catch {
    return { kind: "none" };
  }
}

function writePasskeyState(s: PasskeyState) {
  try {
    window.localStorage.setItem(PASSKEY_STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* private mode */
  }
}

function bufToBase64Url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBuf(b64url: string): ArrayBuffer {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((b64url.length + 3) % 4);
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

export function PasskeysCard({ userName, userId }: { userName: string; userId: string }) {
  const [state, setState] = useState<PasskeyState>({ kind: "none" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Hydrate from localStorage on mount (avoids SSR mismatch).
  useEffect(() => {
    setState(readPasskeyState());
  }, []);

  const supported =
    typeof window !== "undefined" &&
    typeof window.PublicKeyCredential !== "undefined";

  const register = useCallback(async () => {
    if (!supported) return;
    setBusy(true);
    setErr(null);
    try {
      // Random challenge — in production this comes from the server.
      const challenge = crypto.getRandomValues(new Uint8Array(32));
      const userIdBuf = new TextEncoder().encode(userId);
      const cred = (await navigator.credentials.create({
        publicKey: {
          challenge,
          rp: { name: "Tulala" },
          user: { id: userIdBuf, name: userName, displayName: userName },
          pubKeyCredParams: [
            { type: "public-key", alg: -7 },   // ES256
            { type: "public-key", alg: -257 }, // RS256
          ],
          authenticatorSelection: {
            authenticatorAttachment: "platform",
            userVerification: "preferred",
            residentKey: "preferred",
          },
          timeout: 60000,
          attestation: "none",
        },
      })) as PublicKeyCredential | null;
      if (!cred) throw new Error("Registration was cancelled");
      const credentialId = bufToBase64Url(cred.rawId);
      const next: PasskeyState = {
        kind: "registered",
        credentialId,
        createdAt: new Date().toISOString(),
      };
      writePasskeyState(next);
      setState(next);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Registration failed");
    } finally {
      setBusy(false);
    }
  }, [supported, userId, userName]);

  const verify = useCallback(async () => {
    if (!supported || state.kind === "none") return;
    setBusy(true);
    setErr(null);
    try {
      const challenge = crypto.getRandomValues(new Uint8Array(32));
      const cred = (await navigator.credentials.get({
        publicKey: {
          challenge,
          allowCredentials: [
            {
              type: "public-key",
              id: base64UrlToBuf(state.credentialId),
              transports: ["internal", "hybrid"],
            },
          ],
          userVerification: "preferred",
          timeout: 60000,
        },
      })) as PublicKeyCredential | null;
      if (!cred) throw new Error("Sign-in was cancelled");
      const next: PasskeyState = {
        kind: "verified",
        credentialId: state.credentialId,
        createdAt: state.kind === "verified" ? state.createdAt : state.createdAt,
        verifiedAt: new Date().toISOString(),
      };
      writePasskeyState(next);
      setState(next);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  }, [supported, state]);

  const remove = useCallback(() => {
    try { window.localStorage.removeItem(PASSKEY_STORAGE_KEY); } catch {}
    setState({ kind: "none" });
    setErr(null);
  }, []);

  return (
    <div style={{
      padding: 16,
      background: "#fff",
      border: `1px solid ${COLORS.borderSoft}`,
      borderRadius: RADIUS.lg,
      fontFamily: FONTS.body,
      marginBottom: 16,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <span aria-hidden style={{
          width: 28, height: 28, borderRadius: 7,
          background: COLORS.royalSoft, color: COLORS.royalDeep,
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          fontSize: 14, fontWeight: 700,
        }}>🔑</span>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: COLORS.ink, margin: 0, letterSpacing: -0.1 }}>
          Sign in with passkey
        </h3>
        {state.kind !== "none" && (
          <span style={{
            fontSize: 10.5, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase",
            color: COLORS.successDeep, background: COLORS.successSoft,
            padding: "2px 8px", borderRadius: 999,
          }}>
            {state.kind === "verified" ? "Active" : "Set up"}
          </span>
        )}
      </div>
      <p style={{ fontSize: 12.5, color: COLORS.inkMuted, lineHeight: 1.5, margin: "4px 0 12px" }}>
        Use Touch ID, Face ID, or your phone&apos;s biometrics instead of a password. Passkeys are phishing-resistant and never stored on Tulala&apos;s servers.
      </p>

      {!supported ? (
        <div style={{
          padding: "9px 11px", borderRadius: 8,
          background: COLORS.surfaceAlt, fontSize: 11.5, color: COLORS.inkMuted,
        }}>
          Your browser doesn&apos;t support passkeys. Try Safari 16+, Chrome 108+, or Firefox 120+.
        </div>
      ) : state.kind === "none" ? (
        <button type="button" onClick={register} disabled={busy} style={{
          padding: "9px 14px", borderRadius: RADIUS.md, border: "none",
          background: busy ? COLORS.inkDim : COLORS.fill, color: "#fff",
          fontSize: 12.5, fontWeight: 600, cursor: busy ? "default" : "pointer",
          fontFamily: FONTS.body,
        }}>
          {busy ? "Waiting for biometrics…" : "Set up a passkey"}
        </button>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <button type="button" onClick={verify} disabled={busy} style={{
            padding: "9px 14px", borderRadius: RADIUS.md, border: "none",
            background: busy ? COLORS.inkDim : COLORS.fill, color: "#fff",
            fontSize: 12.5, fontWeight: 600, cursor: busy ? "default" : "pointer",
            fontFamily: FONTS.body,
          }}>
            {busy ? "Waiting…" : "Sign in to test"}
          </button>
          <button type="button" onClick={remove} style={{
            padding: "9px 12px", borderRadius: RADIUS.md,
            background: "transparent", border: `1px solid ${COLORS.borderSoft}`,
            color: COLORS.inkMuted, fontSize: 11.5, fontWeight: 500, cursor: "pointer",
            fontFamily: FONTS.body,
          }}>
            Remove passkey
          </button>
          <span style={{ fontSize: 11, color: COLORS.inkDim, marginLeft: "auto" }}>
            {state.kind === "verified"
              ? `Verified ${new Date(state.verifiedAt).toLocaleTimeString()}`
              : `Set up ${new Date(state.createdAt).toLocaleString()}`}
          </span>
        </div>
      )}

      {err && (
        <div style={{
          marginTop: 10, padding: "8px 11px", borderRadius: 8,
          background: COLORS.criticalSoft, color: COLORS.criticalDeep,
          fontSize: 11.5, lineHeight: 1.45,
        }}>
          {err}
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// GalleryFxCard — WebGPU shader proof of concept
// ────────────────────────────────────────────────────────────────────

const FRAGMENT_WGSL = /* wgsl */`
struct Uniforms { time: f32, _pad0: f32, _pad1: f32, _pad2: f32 };
@group(0) @binding(0) var<uniform> u : Uniforms;

@vertex
fn vmain(@builtin(vertex_index) i : u32) -> @builtin(position) vec4f {
  // Two triangles covering the viewport
  var p = array<vec2f, 6>(
    vec2f(-1.0, -1.0), vec2f( 1.0, -1.0), vec2f(-1.0,  1.0),
    vec2f(-1.0,  1.0), vec2f( 1.0, -1.0), vec2f( 1.0,  1.0),
  );
  return vec4f(p[i], 0.0, 1.0);
}

@fragment
fn fmain(@builtin(position) frag : vec4f) -> @location(0) vec4f {
  // Plasma — built from layered sin waves; deep forest base with
  // soft warm highlights. Tuned to feel premium, not arcade.
  let uv = (frag.xy / vec2f(640.0, 360.0)) * 2.0 - vec2f(1.0, 1.0);
  let t  = u.time * 0.2;
  let v1 = sin(uv.x * 3.0 + t);
  let v2 = sin(uv.y * 4.0 + t * 1.3);
  let v3 = sin((uv.x + uv.y) * 2.0 + t * 0.7);
  let v4 = sin(length(uv) * 6.0 - t * 1.1);
  let v  = (v1 + v2 + v3 + v4) * 0.25;
  let r  = 0.06 + v * 0.18;
  let g  = 0.31 + v * 0.22;
  let b  = 0.24 + v * 0.16;
  return vec4f(r, g, b, 1.0);
}
`;

type Status = "init" | "running" | "unsupported" | "error";

export function GalleryFxCard() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [status, setStatus] = useState<Status>("init");
  const [errMsg, setErrMsg] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    type GpuNav = Navigator & { gpu?: { requestAdapter: () => Promise<unknown> } };
    const nav = navigator as GpuNav;
    if (!("gpu" in nav) || !nav.gpu) {
      setStatus("unsupported");
      return;
    }

    let raf = 0;
    let cancelled = false;
    let device: { destroy: () => void } | null = null;
    type WGPU = {
      requestAdapter: () => Promise<{ requestDevice: () => Promise<unknown> } | null>;
      getPreferredCanvasFormat: () => string;
    };

    (async () => {
      try {
        const gpu = nav.gpu as unknown as WGPU;
        const adapter = await gpu.requestAdapter();
        if (!adapter) throw new Error("No GPU adapter");
        const dev = (await adapter.requestDevice()) as unknown as {
          createShaderModule: (d: { code: string }) => unknown;
          createBuffer: (d: { size: number; usage: number }) => unknown;
          createBindGroupLayout: (d: unknown) => unknown;
          createPipelineLayout: (d: unknown) => unknown;
          createRenderPipeline: (d: unknown) => unknown;
          createBindGroup: (d: unknown) => unknown;
          queue: { writeBuffer: (b: unknown, off: number, data: ArrayBuffer) => void; submit: (cmds: unknown[]) => void };
          createCommandEncoder: () => {
            beginRenderPass: (d: unknown) => { setPipeline: (p: unknown) => void; setBindGroup: (i: number, g: unknown) => void; draw: (n: number) => void; end: () => void };
            finish: () => unknown;
          };
          destroy: () => void;
        };
        device = dev;

        const ctx = canvas.getContext("webgpu") as unknown as { configure: (c: unknown) => void; getCurrentTexture: () => { createView: () => unknown } } | null;
        if (!ctx) throw new Error("Canvas does not support WebGPU");
        const format = gpu.getPreferredCanvasFormat();
        ctx.configure({ device: dev, format, alphaMode: "premultiplied" });

        // Note: avoid `module` as a variable name — Next.js lint rule
        // forbids assigning to it because it shadows Node's `module`.
        const shaderModule = dev.createShaderModule({ code: FRAGMENT_WGSL });
        const uniformBuffer = dev.createBuffer({ size: 16, usage: 0x40 | 0x8 }); // UNIFORM | COPY_DST
        const layout = dev.createBindGroupLayout({
          entries: [{ binding: 0, visibility: 0x1 | 0x2, buffer: { type: "uniform" } }],
        });
        const bindGroup = dev.createBindGroup({
          layout,
          entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
        });
        const pipelineLayout = dev.createPipelineLayout({ bindGroupLayouts: [layout] });
        const pipeline = dev.createRenderPipeline({
          layout: pipelineLayout,
          vertex:   { module: shaderModule, entryPoint: "vmain" },
          fragment: { module: shaderModule, entryPoint: "fmain", targets: [{ format }] },
          primitive: { topology: "triangle-list" },
        });

        const start = performance.now();
        if (cancelled) return;
        setStatus("running");

        const draw = () => {
          if (cancelled) return;
          const t = (performance.now() - start) / 1000;
          dev.queue.writeBuffer(uniformBuffer, 0, new Float32Array([t, 0, 0, 0]).buffer);
          const enc = dev.createCommandEncoder();
          const view = ctx.getCurrentTexture().createView();
          const pass = enc.beginRenderPass({
            colorAttachments: [{ view, loadOp: "clear", storeOp: "store", clearValue: { r: 0, g: 0, b: 0, a: 1 } }],
          });
          pass.setPipeline(pipeline);
          pass.setBindGroup(0, bindGroup);
          pass.draw(6);
          pass.end();
          dev.queue.submit([enc.finish()]);
          raf = requestAnimationFrame(draw);
        };
        draw();
      } catch (e) {
        if (cancelled) return;
        setStatus("error");
        setErrMsg(e instanceof Error ? e.message : "WebGPU init failed");
      }
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      try { device?.destroy(); } catch { /* ignore */ }
    };
  }, []);

  return (
    <div style={{
      padding: 16,
      background: "#fff",
      border: `1px solid ${COLORS.borderSoft}`,
      borderRadius: RADIUS.lg,
      fontFamily: FONTS.body,
      marginBottom: 16,
    }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: COLORS.ink, margin: 0, letterSpacing: -0.1 }}>
          Animated cover · WebGPU
        </h3>
        <span style={{
          fontSize: 10, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase",
          color: status === "running" ? COLORS.successDeep
               : status === "unsupported" ? COLORS.inkDim
               : status === "error" ? COLORS.criticalDeep
               : COLORS.inkMuted,
        }}>
          {status === "running" ? "Live" : status === "unsupported" ? "Fallback" : status === "error" ? "Error" : "Loading…"}
        </span>
      </div>
      <p style={{ fontSize: 12, color: COLORS.inkMuted, lineHeight: 1.5, margin: "0 0 12px" }}>
        Renders directly on the GPU via a fragment shader. Falls back to a static gradient when WebGPU isn&apos;t available.
      </p>
      <div style={{
        position: "relative",
        width: "100%", aspectRatio: "16 / 9",
        borderRadius: RADIUS.md, overflow: "hidden",
        background: `linear-gradient(135deg, ${COLORS.accent}, ${COLORS.accentDeep})`,
      }}>
        <canvas
          ref={canvasRef}
          width={640}
          height={360}
          style={{
            display: status === "running" ? "block" : "none",
            width: "100%", height: "100%",
          }}
          aria-hidden
        />
        {status !== "running" && (
          <div style={{
            position: "absolute", inset: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#fff", fontSize: 12.5, fontWeight: 500, letterSpacing: 0.2,
            textShadow: "0 1px 2px rgba(0,0,0,0.4)",
          }}>
            {status === "unsupported" ? "WebGPU not available — using CSS gradient"
             : status === "error" ? `Couldn't init WebGPU: ${errMsg}`
             : "Initialising shader…"}
          </div>
        )}
      </div>
    </div>
  );
}
