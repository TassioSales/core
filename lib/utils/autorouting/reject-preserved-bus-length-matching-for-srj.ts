import type { SourceTrace } from "circuit-json"
import type { Bus } from "lib/components/primitive-components/Bus"
import { RoutingPhasePreparationError } from "./routing-phase-preparation-error"

// circuit-json currently exports the canonical interface but no ID alias.
type SourceTraceId = SourceTrace["source_trace_id"]

/** Rejects length constraints whose fixed members are absent from the SRJ bus. */
export const rejectPreservedBusLengthMatchingForSrjOrThrow = ({
  bus,
  preservedSourceTraceIds,
}: {
  bus: Bus
  preservedSourceTraceIds: ReadonlySet<SourceTraceId>
}): void => {
  if (
    preservedSourceTraceIds.size === 0 ||
    (bus._parsedProps.maxLengthSkew === undefined &&
      bus._parsedProps.targetLength === undefined)
  ) {
    return
  }

  const { db } = bus.root!
  const busName = bus.name || "unnamed bus"
  const fixedMemberNames = [...preservedSourceTraceIds].map(
    (sourceTraceId) =>
      db.source_trace.get(sourceTraceId)?.name || "unnamed trace",
  )
  const members = fixedMemberNames.map((name) => `"${name}"`).join(", ")
  throw new RoutingPhasePreparationError(
    `Length-matched bus "${busName}" has pre-routed ${fixedMemberNames.length === 1 ? "member" : "members"} ${members} and pending members. Core cannot guarantee matching between fixed and pending copper, even with targetLength and lengthTolerance. Remove the fixed bus routes and route the complete bus together.`,
  )
}
