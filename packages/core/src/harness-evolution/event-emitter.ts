import { HARNESS_EVENTS, type HarnessEventName } from "./observability";
import type { RuntimeLogger } from "../runtime-logger";

export interface HarnessEventOptions {
  logger?: RuntimeLogger;
  packetStore?: import("../harness-evolution/packets/packet-store").PacketStore;
}

/**
 * Emit a harness observability event to all configured sinks.
 * - Writes to PacketStore events.jsonl (if packetStore provided)
 * - Logs to RuntimeLogger (if logger provided)
 */
export async function emitHarnessEvent(
  event: HarnessEventName,
  data: Record<string, unknown> = {},
  options: HarnessEventOptions = {},
): Promise<void> {
  const eventData = {
    event,
    ts: new Date().toISOString(),
    ...data,
  };

  // Write to PacketStore events.jsonl
  if (options.packetStore) {
    try {
      await options.packetStore.writeEvent(event, data);
    } catch {
      // Best-effort
    }
  }

  // Log to RuntimeLogger
  if (options.logger) {
    const level = event.includes("block") || event.includes("rejected") || event.includes("issue")
      ? "warn"
      : event.includes("created") || event.includes("allow") || event.includes("promoted") || event.includes("done")
        ? "info"
        : "debug";
    options.logger.info(event, data);
  }
}

/**
 * Convenience: emit harness.guard.* event.
 */
export async function emitGuardEvent(
  disposition: "allow" | "review" | "block",
  data: Record<string, unknown> = {},
  options: HarnessEventOptions = {},
): Promise<void> {
  const eventMap: Record<string, HarnessEventName> = {
    allow: HARNESS_EVENTS.GUARD_ALLOW,
    review: HARNESS_EVENTS.GUARD_REVIEW,
    block: HARNESS_EVENTS.GUARD_BLOCK,
  };
  await emitHarnessEvent(eventMap[disposition], data, options);
}
