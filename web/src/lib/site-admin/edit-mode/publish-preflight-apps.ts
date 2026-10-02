/**
 * Publish preflight for Apps (interactive mini-tools such as the Nail Designer).
 *
 * The Nail Designer is a zero-config drop-in (the whole design is always
 * offered), so no app currently has anything to warn about. The collector is
 * kept so both preflight paths keep one stable import and a future app with
 * required setup can add its check here.
 */

export interface AppPreflightIssue {
  severity: "warn";
  category: "app_config";
  nodeId: string;
  message: string;
}

export function collectAppPreflightIssues(nodes: unknown): AppPreflightIssue[] {
  void nodes;
  return [];
}
