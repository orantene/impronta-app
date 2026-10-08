import assert from "node:assert/strict";
import { test } from "node:test";

import {
  BUILDER_NODE_ISSUE_TEXTS,
  UNKNOWN_BUILDER_NODE_ISSUE_TEXT,
  classifyBuilderNodeIssue,
  describeBuilderNodeIssue,
  describeBuilderNodeIssues,
  type BuilderNodeIssueKind,
} from "./mutation-issue-detail";

// One real sample per kind, copied from operations.ts and validate.ts.
const SAMPLES: Record<BuilderNodeIssueKind, { path: string; message: string }> = {
  NODE_MISSING: { path: "source.nodeId", message: 'Missing node id "n_abc123". Refresh and retry.' },
  NODE_DUPLICATE_ID: { path: "source.nodeId", message: "This block can't be deleted safely because the page has a duplicated block id. Reload the page and try again." },
  PARENT_MISSING: { path: "target.parentId", message: 'Missing parent id "p_xyz". Refresh and retry.' },
  PARENT_NO_NESTING: { path: "target.parent", message: 'Parent kind "heading" does not allow nested blocks.' },
  PARENT_LIMITED_KINDS: { path: "target.parent", message: "Allowed child kinds: heading, paragraph." },
  PARENT_NEEDS_CONTAINER: { path: "target.parent", message: "Choose a section/container/accordion/tabs node as parent." },
  ROOT_NEEDS_SECTION: { path: "target.root", message: "Drop this block into a section/container instead of page root." },
  SOURCE_PARENT_UNRESOLVED: { path: "source.parent", message: "The source parent could not be resolved. Refresh and retry." },
  GROUP_KEEP_ONE_REMOVE: { path: "source.group", message: "Add another item to this accordion/tabs group before removing this one." },
  GROUP_KEEP_ONE_MOVE: { path: "source.group", message: "Add another item to this accordion/tabs group before moving this one out." },
  MOVE_PICK_OTHER_PARENT: { path: "target.parentId", message: "Choose a different destination parent." },
  MOVE_TO_SIBLING_OR_ANCESTOR: { path: "target.parentId", message: "Move the block to a sibling container or to one of its ancestors instead." },
  TEXT_NEEDS_HEADING_OR_PARAGRAPH: { path: "target.node", message: "Select a heading or paragraph block." },
  DESTINATION_POSITION: { path: "target.index", message: "Choose a different destination index." },
  EMPTY_UPDATE: { path: "target.patch", message: "Adjust at least one field before saving this update." },
  TREE_NOT_LIST: { path: "root", message: "Node tree must be an array." },
  TREE_TOO_DEEP: { path: "0.children.1", message: "Node depth exceeds max depth 8." },
  TREE_BAD_NODE: { path: "0", message: "Node must be an object." },
  TREE_MISSING_ID: { path: "0.id", message: "Node id must be a non-empty string." },
  TREE_DUPLICATE_ID: { path: "1.id", message: 'Duplicate node id "n_dup".' },
  TREE_UNKNOWN_KIND: { path: "0.kind", message: "Node kind is unknown." },
  TREE_ROOT_KIND: { path: "0", message: 'Root cannot contain node kind "paragraph".' },
  TREE_CHILD_KIND: { path: "0.children.0", message: 'Child kind "section" is not allowed under "heading".' },
  TREE_BAD_SETTINGS: { path: "0.props", message: "layout: Invalid enum value" },
  TREE_NO_CHILDREN: { path: "0.children", message: 'Node kind "heading" does not allow children.' },
  TREE_NEEDS_CHILDREN: { path: "0.children", message: 'Node kind "section" requires a children array.' },
  TREE_GENERIC: { path: "tree[0]", message: "Anything else" },
};

const KINDS = Object.keys(BUILDER_NODE_ISSUE_TEXTS) as BuilderNodeIssueKind[];
const RAW =
  /target\.|source\.|tree\[|n_abc123|p_xyz|n_dup|\.children|\.props|Refresh and retry|[A-Z]{3,}_[A-Z_]+/;

test("every kind has a sample and classifies back to itself", () => {
  for (const kind of KINDS) {
    assert.ok(SAMPLES[kind], `sample for ${kind}`);
    assert.equal(classifyBuilderNodeIssue(SAMPLES[kind]), kind);
  }
});

test("every kind has non-empty es and en text without em dashes", () => {
  for (const kind of KINDS) {
    for (const locale of ["en", "es"] as const) {
      const text = BUILDER_NODE_ISSUE_TEXTS[kind][locale];
      assert.ok(text.trim().length > 20, `${kind}.${locale}`);
      assert.ok(!text.includes("—"), `${kind}.${locale} has an em dash`);
    }
  }
});

test("no raw path, id, code or developer message leaks", () => {
  for (const kind of KINDS) {
    for (const locale of ["en", "es"] as const) {
      const line = describeBuilderNodeIssue(SAMPLES[kind], locale);
      assert.doesNotMatch(line, RAW, `${kind}.${locale}: ${line}`);
      assert.notEqual(line, SAMPLES[kind].message);
    }
  }
});

test("unknown issues fall back to a localized generic sentence", () => {
  const issue = { path: "weird.path", message: "SOMETHING_RAW_HAPPENED at n_secret" };
  assert.equal(classifyBuilderNodeIssue(issue), null);
  assert.equal(describeBuilderNodeIssue(issue, "en"), UNKNOWN_BUILDER_NODE_ISSUE_TEXT.en);
  assert.equal(describeBuilderNodeIssue(issue, "es"), UNKNOWN_BUILDER_NODE_ISSUE_TEXT.es);
  assert.doesNotMatch(describeBuilderNodeIssue(issue, "en"), /SOMETHING_RAW|n_secret/);
});

test("describeBuilderNodeIssues de-duplicates and caps at three", () => {
  assert.deepEqual(describeBuilderNodeIssues(undefined, "en"), []);
  assert.deepEqual(describeBuilderNodeIssues([], "es"), []);
  const dup = describeBuilderNodeIssues(
    [SAMPLES.PARENT_LIMITED_KINDS, SAMPLES.PARENT_LIMITED_KINDS],
    "en",
  );
  assert.equal(dup.length, 1);
  const many = describeBuilderNodeIssues(
    [SAMPLES.NODE_MISSING, SAMPLES.PARENT_MISSING, SAMPLES.ROOT_NEEDS_SECTION, SAMPLES.EMPTY_UPDATE],
    "es",
  );
  assert.equal(many.length, 3);
});
