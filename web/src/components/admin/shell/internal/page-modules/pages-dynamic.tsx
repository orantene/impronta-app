"use client";

import dynamic from "next/dynamic";

export const TalentSurface = dynamic(() => import("../talent").then((m) => ({ default: m.TalentSurface })), { ssr: false });
export const ClientSurface = dynamic(() => import("../client").then((m) => ({ default: m.ClientSurface })), { ssr: false });
export const PlatformSurface = dynamic(() => import("../platform").then((m) => ({ default: m.PlatformSurface })), { ssr: false });
export const MessagesShell = dynamic(() => import("../messages").then(m => m.MessagesShell), { ssr: false });
