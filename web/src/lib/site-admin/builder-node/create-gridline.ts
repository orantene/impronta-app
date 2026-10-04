import type { BuilderNode } from "./types";
import { makeId } from "./make-id";
import { SERVICES_CATALOG_DEFAULT_PROPS } from "./services-catalog-defaults";
import { PORTFOLIO_DEFAULT_PROPS } from "./portfolio-defaults";
import { REVIEWS_DEFAULT_PROPS } from "./reviews-defaults";
import { VISIT_DEFAULT_PROPS } from "./visit-defaults";
import { cloneContentsDefaultProps } from "./contents-defaults";
import { cloneMastheadDefaultProps } from "./masthead-defaults";
import { cloneStatementFooterDefaultProps } from "./statement-footer-defaults";
import { cloneCompCardDefaultProps } from "./comp-card-defaults";
import { cloneSpecTableDefaultProps } from "./spec-table-defaults";
import { cloneAlertBandDefaultProps, cloneUtilityBarDefaultProps } from "./utility-bar-defaults";
import { cloneTaskPickerDefaultProps } from "./task-picker-defaults";
import { NEXT_FREE_CHIP_DEFAULT_PROPS } from "./next-free-chip-defaults";

export type GridlineCreateKind =
  | "services_catalog"
  | "portfolio"
  | "reviews"
  | "visit"
  | "contents"
  | "masthead"
  | "statement_footer"
  | "utility_bar"
  | "alert_band"
  | "task_picker"
  | "spec_table"
  | "comp_card"
  | "next_free_chip"
;

/** Default-prop create cases split out of create.ts (max-lines). Same output per kind. */
export function createGridlineNode(kind: GridlineCreateKind): BuilderNode {
  switch (kind) {
    case "services_catalog":
      return { id: makeId("services_catalog"), kind: "services_catalog", props: { ...SERVICES_CATALOG_DEFAULT_PROPS } };
    case "portfolio":
      return { id: makeId("portfolio"), kind: "portfolio", props: { ...PORTFOLIO_DEFAULT_PROPS } };
    case "reviews":
      return { id: makeId("reviews"), kind: "reviews", props: { ...REVIEWS_DEFAULT_PROPS } };
    case "visit":
      return { id: makeId("visit"), kind: "visit", props: { ...VISIT_DEFAULT_PROPS } };
    case "contents":
      return { id: makeId("contents"), kind: "contents", props: cloneContentsDefaultProps() };
    case "masthead":
      return { id: makeId("masthead"), kind: "masthead", props: cloneMastheadDefaultProps() };
    case "statement_footer":
      return { id: makeId("statement_footer"), kind: "statement_footer", props: cloneStatementFooterDefaultProps() };
    case "utility_bar":
      return { id: makeId("utility_bar"), kind: "utility_bar", props: cloneUtilityBarDefaultProps() };
    case "alert_band":
      return { id: makeId("alert_band"), kind: "alert_band", props: cloneAlertBandDefaultProps() };
    case "task_picker":
      return { id: makeId("task_picker"), kind: "task_picker", props: cloneTaskPickerDefaultProps() };
    case "spec_table":
      return { id: makeId("spec_table"), kind: "spec_table", props: cloneSpecTableDefaultProps() };
    case "comp_card":
      return { id: makeId("comp_card"), kind: "comp_card", props: cloneCompCardDefaultProps() };
    case "next_free_chip":
      return { id: makeId("next_free_chip"), kind: "next_free_chip", props: { ...NEXT_FREE_CHIP_DEFAULT_PROPS } };
  }
}
