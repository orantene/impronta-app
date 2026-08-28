"use client";

/**
 * Tulala admin-shell prototype primitives.
 *
 * As of Phase 1f (remediation-plan-2026-05-19 §4 Phase 1f), the body of
 * this file has been decomposed into ./primitives/*.tsx modules. This
 * file is now a thin barrel that re-exports the byte-stable public
 * surface so external importers (`from "./primitives"`) continue to work
 * unchanged. The 10 known external importers (admin-shell-client +
 * pitch-compose, talent-drawers, workspace, drawers, wave2, media-page,
 * client, talent, platform) verify byte-for-byte against the BASE
 * commit's `git grep -E "^export "` of this file.
 *
 * ─── data-tulala-* selector convention (WS-0.11) ─────────────────────
 *
 * Every interactive container in the admin-shell prototype carries a
 * stable `data-tulala-<name>` attribute so QA / e2e tests / future
 * preview tools can target it without depending on classnames or DOM
 * shape.
 *
 * Naming rules:
 *   - lowercase, dash-separated, prefix is always `data-tulala-`
 *   - the suffix names the THING, not the variant: `data-tulala-card`
 *     not `data-tulala-primary-card`
 *   - variant goes in the value: `data-tulala-card="primary"`
 *   - one attribute per element; if you need multiple, create a
 *     compound id (`data-tulala-drawer-help-panel`, not two attrs)
 *
 * Existing reserved names — DO NOT reuse for new components:
 *   data-tulala-drawer-panel        — drawer outer aside
 *   data-tulala-drawer-overlay      — drawer backdrop
 *   data-tulala-drawer-body         — drawer scrollable body
 *   data-tulala-drawer-footer       — drawer footer
 *   data-tulala-drawer-size-toolbar — compact/half/full size group
 *   data-tulala-drawer-help-panel   — slide-down help region
 *   data-tulala-help-btn            — drawer toolbar ⓘ button
 *   data-tulala-help-dot            — "unread help" pulse indicator
 *   data-tulala-mobile-bottom-nav   — fixed mobile bottom navigation
 *   data-tulala-page-back           — page-level back button
 *   data-tulala-card                — card primitive (variant in value)
 *   data-tulala-empty-state         — empty-state primitive
 *   data-tulala-skeleton            — skeleton shimmer
 *   data-tulala-confirm-dialog      — confirmation dialog modal
 *   data-tulala-identity-bar        — top-of-page identity bar
 *   data-tulala-modal-popover       — ModalPopover overlay (WS-4)
 *   data-tulala-modal-popover-body  — ModalPopover scrollable body (WS-4)
 *   data-tulala-stale-pill          — stale-data refresh pill (WS-6.6)
 *   data-tulala-conflict-dialog     — conflict-resolution dialog (WS-6.8)
 *   data-tulala-guided-tour         — GuidedTour spotlight (WS-9.7)
 *   data-tulala-support-launcher    — Support Center docked launcher tab
 *   data-tulala-support-panel       — Support Center chat panel
 *   data-tulala-support-composer    — Support Center message composer
 *   data-tulala-support-ticket-row  — Support Center ticket list row
 *   data-tulala-support-hq-queue    — HQ support queue table
 *
 * When adding a new interactive container, add the attribute AND
 * append it to this list. Never silently rename — downstream tests
 * may depend on the existing name.
 *
 * See ROADMAP.md §7.2 for the full engineer convention list.
 */

import { Icon, type AdminShellIconName } from "./primitives/icons";
export { Icon, type AdminShellIconName };
import { H1, H2, H3, Eyebrow, Caption } from "./primitives/typography";
export { H1, H2, H3, Eyebrow, Caption };
import { useViewport, viewportAtLeast, useFeatureFlag, setFeatureFlag, type Viewport } from "./primitives/hooks";
export { useViewport, viewportAtLeast, useFeatureFlag, setFeatureFlag, type Viewport };
import { Card, type CardKind } from "./primitives/card-kind";
export { Card, type CardKind };
import { ConfirmDialog } from "./primitives/confirm-dialog";
export { ConfirmDialog };
import {
  CapsLabel,
  Bullet,
  StatDot,
  StatusPill,
  PlanChip,
  RoleChip,
  EntityChip,
  PayoutStatusChip,
  PaymentStatusChip,
  RepresentationChip,
  ClientTrustChip,
  ClientTrustBadge,
  TrustBoostBanner,
  ReadOnlyChip,
  StateChip,
  IconChip,
  Affordance,
  type StatusPillTone,
} from "./primitives/chips";
export {
  CapsLabel,
  Bullet,
  StatDot,
  StatusPill,
  PlanChip,
  RoleChip,
  EntityChip,
  PayoutStatusChip,
  PaymentStatusChip,
  RepresentationChip,
  ClientTrustChip,
  ClientTrustBadge,
  TrustBoostBanner,
  ReadOnlyChip,
  StateChip,
  IconChip,
  Affordance,
  type StatusPillTone,
};
import {
  PrimaryCard,
  SecondaryCard,
  StatusStrip,
  PlanLockPill,
  TrustBadge,
  ProfileClaimStatusChip,
  ProfilePhotoBadgeOverlay,
  RiskScorePill,
  TrustBadgeGroup,
  StatusCard,
  LockedCard,
  CompactLockedCard,
  StarterCard,
  CapNudge,
  EmptyState,
  CelebrationBanner,
  DatePicker,
  RowSkeleton,
  MoreWithSection,
  type CardClickHandler,
  type StatusStripItem,
} from "./primitives/cards";
export {
  PrimaryCard,
  SecondaryCard,
  StatusStrip,
  PlanLockPill,
  TrustBadge,
  ProfileClaimStatusChip,
  ProfilePhotoBadgeOverlay,
  RiskScorePill,
  TrustBadgeGroup,
  StatusCard,
  LockedCard,
  CompactLockedCard,
  StarterCard,
  CapNudge,
  EmptyState,
  CelebrationBanner,
  DatePicker,
  RowSkeleton,
  MoreWithSection,
  type CardClickHandler,
  type StatusStripItem,
};
import { PrimaryButton, SecondaryButton, GhostButton } from "./primitives/buttons";
export { PrimaryButton, SecondaryButton, GhostButton };
import {
  DrawerShell,
  ModalShell,
  SizeIcon,
  DRAWER_SIZE_PX,
  type DrawerSize,
} from "./primitives/drawer";
export { DrawerShell, ModalShell, SizeIcon, DRAWER_SIZE_PX, type DrawerSize };
import {
  ChannelVisibilityStrip,
  FieldRow,
  TextInput,
  TextArea,
  Toggle,
  Divider,
  type FieldChannel,
  type FieldVisibility,
} from "./primitives/forms";
export {
  ChannelVisibilityStrip,
  FieldRow,
  TextInput,
  TextArea,
  Toggle,
  Divider,
  type FieldChannel,
  type FieldVisibility,
};
import { ToastHost, type ToastTone } from "./primitives/toast";
export { ToastHost, type ToastTone };
import { Avatar } from "./primitives/avatar";
export { Avatar };
import {
  SwipeableRow,
  BackToTop,
  Skeleton,
  useKeyboardListNav,
  useRovingTabindex,
  BulkSelectBar,
  BulkRowCheckbox,
} from "./primitives/interactions";
export {
  SwipeableRow,
  BackToTop,
  Skeleton,
  useKeyboardListNav,
  useRovingTabindex,
  BulkSelectBar,
  BulkRowCheckbox,
};
import {
  Popover,
  OfflineBanner,
  ConfirmModal,
  ShortcutsModal,
  ModalPopover,
  type ModalPopoverSize,
} from "./primitives/overlays";
export {
  Popover,
  OfflineBanner,
  ConfirmModal,
  ShortcutsModal,
  ModalPopover,
  type ModalPopoverSize,
};
import {
  AutoSaveIndicator,
  FloatingFab,
  FabHost,
  useFab,
  type FabAction,
} from "./primitives/fab";
export { AutoSaveIndicator, FloatingFab, FabHost, useFab, type FabAction };
import {
  StickyDrawerSaveBar,
  FieldError,
  UnsavedChangesGuard,
} from "./primitives/forms-extras";
export { StickyDrawerSaveBar, FieldError, UnsavedChangesGuard };
import { RetryCard } from "./primitives/retry-card";
export { RetryCard };
import { PageSkeleton } from "./primitives/page-skeleton";
export { PageSkeleton };
import {
  useOptimisticMutation,
  useOnlineStatus,
  AsyncButton,
  type OptimisticStatus,
} from "./primitives/async-helpers";
export { useOptimisticMutation, useOnlineStatus, AsyncButton, type OptimisticStatus };
import { GuidedTour, type TourStep } from "./primitives/guided-tour";
export { GuidedTour, type TourStep };
import {
  useStaleDetection,
  StaleDataPill,
  type StaleInfo,
} from "./primitives/stale-data";
export { useStaleDetection, StaleDataPill, type StaleInfo };
import { ConflictDialog } from "./primitives/conflict-dialog";
export { ConflictDialog };
import {
  InboxEmptyState,
  InquiriesEmptyState,
  BookingsEmptyState,
  TalentRosterEmptyState,
  ClientsEmptyState,
  ShortlistsEmptyState,
  CalendarEmptyState,
  MessagesEmptyState,
  FilesEmptyState,
  SearchEmptyState,
  NotificationsEmptyState,
  AgenciesEmptyState,
} from "./primitives/empty-states";
export {
  InboxEmptyState,
  InquiriesEmptyState,
  BookingsEmptyState,
  TalentRosterEmptyState,
  ClientsEmptyState,
  ShortlistsEmptyState,
  CalendarEmptyState,
  MessagesEmptyState,
  FilesEmptyState,
  SearchEmptyState,
  NotificationsEmptyState,
  AgenciesEmptyState,
};
import {
  InboxSkeleton,
  InquiriesSkeleton,
  TalentRosterSkeleton,
  DrawerDetailSkeleton,
  CalendarSkeleton,
  OverviewSkeleton,
  TalentTodaySkeleton,
  DiscoverSkeleton,
} from "./primitives/skeletons";
export {
  InboxSkeleton,
  InquiriesSkeleton,
  TalentRosterSkeleton,
  DrawerDetailSkeleton,
  CalendarSkeleton,
  OverviewSkeleton,
  TalentTodaySkeleton,
  DiscoverSkeleton,
};
import {
  InlineFilePreview,
  AttachmentStrip,
  type Attachment,
  type AttachmentKind,
} from "./primitives/attachments";
export { InlineFilePreview, AttachmentStrip, type Attachment, type AttachmentKind };
import { useReducedMotion, scrollBehavior } from "./primitives/a11y";
export { useReducedMotion, scrollBehavior };
import {
  ActivityFeedItem,
  ActivityFeed,
  type ActivityEntry,
} from "./primitives/activity-feed";
export { ActivityFeedItem, ActivityFeed, type ActivityEntry };

