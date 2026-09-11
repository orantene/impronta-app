"use client";

/**
 * pos-mode-menu-context — how the POS rail's `MODE · Counter` chip gets its
 * menu (`M33_ModeSwitch`) without the frame knowing the shell.
 *
 * The chip lives in `PosFrame` (a presentational component with a render test
 * and no shell provider). The menu's model (which modes this person may use,
 * the remembered default, the navigation) lives in the workspace shell beside
 * the top bar's own switch. So the shell PROVIDES a renderer through this
 * context and the frame CALLS it: with no provider the chip is a plain label,
 * as the render test mounts it.
 *
 * `render` receives the open state the frame keeps and returns the menu
 * (or null while closed). The frame owns `open`; the menu owns everything
 * else.
 */

import { createContext, useContext, type ReactNode } from "react";

export type PosModeMenuRender = (props: {
  readonly open: boolean;
  readonly onClose: () => void;
  /** The chip's own `aria-controls` target: the menu must carry this id. */
  readonly menuId: string;
}) => ReactNode;

export const PosModeMenuContext = createContext<PosModeMenuRender | null>(null);

export function usePosModeMenuRender(): PosModeMenuRender | null {
  return useContext(PosModeMenuContext);
}
