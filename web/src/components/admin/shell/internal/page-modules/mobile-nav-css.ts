"use client";

/**
 * The phone chrome's class sheet: the tab bar (MW00), the More sheet's rows
 * and chips, the workspace row and the foot. Split out of MobileBottomNav.tsx
 * so that file stays under the line cap; the component still renders it in
 * its own <style> element and the static test reads both files.
 */

import { TRANSITION, Z } from "../state";

export const MOBILE_NAV_CSS = `
          /* The fixed bar (MW00). display:none is the DESKTOP state; the
             shell's own mobile media query (admin-shell-client.tsx, "Show the
             mobile bottom tab bar") flips it to block with !important, so a
             plain class carries exactly as far as the inline style it
             replaced. */
          .tulala-mnav-bar {
            position: fixed;
            left: 0;
            right: 0;
            bottom: 0;
            background: var(--color-admin-surface);
            border-top: 1px solid var(--color-admin-border-soft);
            z-index: ${Z.topbar};
            display: none;
            padding-bottom: env(safe-area-inset-bottom, 0px);
            font-family: var(--font-admin-body);
          }
          .tulala-mnav-bar-row {
            display: flex;
            align-items: flex-start;
            height: 62px;
            padding: 8px 6px 0;
          }
          .tulala-mnav-tab {
            flex: 1;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 3px;
            padding: 0;
            border: none;
            background: transparent;
            cursor: pointer;
            color: var(--color-admin-ink-muted);
            font-family: var(--font-admin-body);
            font-size: 10.5px;
            font-weight: 500;
            line-height: 1.3;
            min-height: 44px;
          }
          .tulala-mnav-tab--active {
            color: var(--color-admin-brand);
            font-weight: 700;
          }
          .tulala-mnav-tab-icon {
            position: relative;
            width: 44px;
            height: 28px;
            border-radius: 999px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            background: transparent;
          }
          .tulala-mnav-tab--active .tulala-mnav-tab-icon {
            background: var(--color-admin-brand-soft);
          }
          .tulala-mnav-tab-label {
            display: block;
            max-width: 76px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }
          .tulala-mnav-tab-badge {
            position: absolute;
            top: -4px;
            right: 2px;
            min-width: 16px;
            height: 16px;
            padding: 0 4px;
            border-radius: 999px;
            background: var(--color-admin-coral);
            color: #fff;
            font-size: 9.5px;
            font-weight: 700;
            line-height: 1;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            font-variant-numeric: tabular-nums;
            box-shadow: 0 0 0 1.5px var(--color-admin-surface);
          }
          /* The workspace row at the head of the More sheet (MW00). */
          .tulala-mnav-switcher {
            display: flex;
            align-items: center;
            gap: 8px;
            width: 100%;
            padding: 10px 12px;
            border-radius: 12px;
            border: none;
            background: var(--color-admin-surface-alt);
            color: var(--color-admin-ink-dim);
            font-family: var(--font-admin-body);
            text-align: left;
            cursor: pointer;
          }
          .tulala-mnav-switcher-avatar {
            width: 30px;
            height: 30px;
            border-radius: 999px;
            background: var(--color-admin-brand);
            color: #fff;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            font-size: 11px;
            font-weight: 700;
            flex-shrink: 0;
          }
          .tulala-mnav-switcher-text {
            flex: 1;
            min-width: 0;
            display: flex;
            flex-direction: column;
          }
          .tulala-mnav-switcher-name {
            font-size: 13.5px;
            font-weight: 600;
            color: var(--color-admin-ink);
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }
          .tulala-mnav-role-chip {
            font-size: 11.5px;
            color: var(--color-admin-ink-muted);
          }
          .tulala-mnav-group-label {
            font-family: var(--font-admin-body);
            font-size: 11px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            color: var(--color-admin-ink-muted);
          }
          .tulala-mnav-chips {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
            margin-top: 6px;
          }
          /* A destination, drawn as the board's chip. */
          .tulala-mnav-row {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            min-height: 36px;
            padding: 8px 12px;
            border-radius: 10px;
            border: 1px solid var(--color-admin-border);
            background: var(--color-admin-card);
            cursor: pointer;
            font-family: var(--font-admin-body);
            font-size: 13px;
            font-weight: 500;
            color: var(--color-admin-ink);
            text-align: left;
            transition: background ${TRANSITION.sm};
          }
          .tulala-mnav-row--active {
            border-color: var(--color-admin-ink);
            background: var(--color-admin-ink);
            color: #fff;
            font-weight: 600;
          }
          .tulala-mnav-row--off {
            cursor: not-allowed;
            opacity: 0.5;
          }
          .tulala-mnav-row-label {
            min-width: 0;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }
          .tulala-mnav-foot {
            display: flex;
            flex-direction: column;
            gap: 2px;
            padding-top: 4px;
          }
          .tulala-mnav-foot-row {
            display: flex;
            align-items: center;
            gap: 8px;
            min-height: 40px;
            padding: 8px 0;
            border: none;
            background: transparent;
            font-family: var(--font-admin-body);
            font-size: 13px;
            color: var(--color-admin-ink-muted);
            text-align: left;
            cursor: pointer;
          }
          /* The feedback row carries its icon in a plain span instead of the
             Icon primitive. */
          .tulala-mnav-feedback {
            padding: 8px 0;
          }
          .tulala-mnav-feedback-icon {
            display: inline-flex;
          }
          .tulala-mnav-badge {
            min-width: 18px;
            height: 18px;
            padding: 0 5px;
            border-radius: 999px;
            background: var(--color-admin-coral);
            color: #fff;
            font-size: 11px;
            font-weight: 700;
            line-height: 18px;
            text-align: center;
            font-variant-numeric: tabular-nums;
          }
`;
