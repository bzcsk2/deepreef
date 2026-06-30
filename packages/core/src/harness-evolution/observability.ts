/**
 * Harness observability event names and helpers.
 * Used to emit structured events for the harness evolution lifecycle.
 */

export const HARNESS_EVENTS = {
  PACKET_CREATED: "harness.packet.created",
  PACKET_ISSUE: "harness.packet.issue",
  GUARD_ALLOW: "harness.guard.allow",
  GUARD_REVIEW: "harness.guard.review",
  GUARD_BLOCK: "harness.guard.block",
  CERTIFICATE_CREATED: "harness.certificate.created",
  REPAIR_ROUND_START: "harness.repair.round.start",
  REPAIR_ROUND_DONE: "harness.repair.round.done",
  SELF_MINE_DONE: "harness.self.mine.done",
  SELF_PATCH_PROPOSED: "harness.self.patch.proposed",
  SELF_PATCH_VALIDATED: "harness.self.patch.validated",
  SELF_PATCH_PROMOTED: "harness.self.patch.promoted",
  SELF_PATCH_REJECTED: "harness.self.patch.rejected",
} as const;

export type HarnessEventName = (typeof HARNESS_EVENTS)[keyof typeof HARNESS_EVENTS];

/**
 * Helper to build harness event metadata.
 */
export function buildHarnessEventData(
  event: HarnessEventName,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    event,
    ts: new Date().toISOString(),
    ...extra,
  };
}
