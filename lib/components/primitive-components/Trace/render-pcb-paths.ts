import type { PcbPath } from "@tscircuit/props"
import type { LayerRef, PcbTraceRoutePoint } from "circuit-json"
import { getViaSpanLayers } from "lib/utils/getViaSpanLayers"
import { getViaDiameterDefaults } from "../../../utils/pcbStyle/getViaDiameterDefaults"
import type { Port } from "../Port"
import { getRouteForPcbPath } from "./get-route-for-pcb-path"
import type { Trace } from "./Trace"
import { getTraceLength } from "./trace-utils/compute-trace-length"

interface RenderPcbPathsInput {
  trace: Trace
  paths: PcbPath[]
  ports: Port[]
  portsWithSelectors: Array<{ selector: string; port: Port }>
  width: number
}

/**
 * Materialize a manual route in right-handed board-world coordinates, in mm
 * (+X right, +Y up). Route entries are points, already transformed by the
 * path builder. Validate physical barrel contact before inserting any copper.
 */
export const renderPcbPathRoute = (
  trace: Trace,
  route: PcbTraceRoutePoint[],
  ports: Port[],
): void => {
  const { db } = trace.root!
  const subcircuit = trace.getSubcircuit()
  const routeVias = []
  let incomingLayer: LayerRef | undefined
  for (const point of route) {
    if (point.route_type === "wire") incomingLayer = point.layer
    if (point.route_type !== "via") continue
    const layers = getViaSpanLayers({
      fromLayer: point.from_layer,
      toLayer: point.to_layer,
      layerCount: subcircuit._getSubcircuitLayerCount(),
    })
    // from_layer is the logical transition, not the entire physical span:
    // a through barrel may contact incoming copper at an intermediate layer.
    if (incomingLayer && !layers.includes(incomingLayer)) {
      db.pcb_trace_error.insert({
        error_type: "pcb_trace_error",
        source_trace_id: trace.source_trace_id!,
        message: `Manual path via ${point.from_layer} → ${point.to_layer} does not reach incoming ${incomingLayer} copper (occupied layers: ${layers.join(", ")}) for ${trace.getDisplayName()}`,
        pcb_trace_id: trace.pcb_trace_id!,
        pcb_component_ids: [],
        pcb_port_ids: ports.map((port) => port.pcb_port_id!).filter(Boolean),
      })
      return
    }
    routeVias.push({ point, layers })
    incomingLayer = point.to_layer
  }

  const pcbTrace = db.pcb_trace.insert({
    route,
    is_antenna_trace: trace.isAntennaTrace,
    source_trace_id: trace.source_trace_id!,
    subcircuit_id: subcircuit.subcircuit_id ?? undefined,
    pcb_group_id: trace.getGroup()?.pcb_group_id ?? undefined,
    trace_length: getTraceLength(route),
  })
  trace.pcb_trace_id ??= pcbTrace.pcb_trace_id
  const pcbStyle = trace.getInheritedMergedProperty("pcbStyle")
  const { holeDiameter, padDiameter } = getViaDiameterDefaults(pcbStyle)
  const connectivityMapKey =
    trace.subcircuit_connectivity_map_key ??
    db.source_trace.get(trace.source_trace_id!)?.subcircuit_connectivity_map_key

  for (const { point, layers } of routeVias) {
    db.pcb_via.insert({
      pcb_trace_id: pcbTrace.pcb_trace_id,
      x: point.x,
      y: point.y,
      hole_diameter: holeDiameter,
      outer_diameter: padDiameter,
      layers,
      from_layer: point.from_layer,
      to_layer: point.to_layer,
      subcircuit_id: subcircuit.subcircuit_id ?? undefined,
      pcb_group_id: trace.getGroup()?.pcb_group_id ?? undefined,
      subcircuit_connectivity_map_key: connectivityMapKey,
    })
  }
  trace._insertErrorIfTraceIsOutsideBoard(route, ports)
  trace._portsRoutedOnPcb = ports
}

export const renderPcbPaths = ({
  trace,
  paths,
  ports,
  portsWithSelectors,
  width,
}: RenderPcbPathsInput): void => {
  const { db } = trace.root!
  const { pcbPathRelativeTo } = trace._parsedProps
  const subcircuit = trace.getSubcircuit()
  let anchorPort = pcbPathRelativeTo
    ? portsWithSelectors.find(({ selector }) => selector === pcbPathRelativeTo)
        ?.port
    : undefined
  if (!anchorPort && pcbPathRelativeTo) {
    anchorPort = subcircuit.selectOne(pcbPathRelativeTo, { type: "port" }) as
      | Port
      | undefined
  }
  anchorPort ??= ports[0]
  if (!anchorPort) {
    db.source_trace_not_connected_error.insert({
      error_type: "source_trace_not_connected_error",
      source_trace_id: trace.source_trace_id ?? undefined,
      subcircuit_id: subcircuit.subcircuit_id ?? undefined,
      message: "pcbPaths requires a connected port or pcbPathRelativeTo port",
    })
    return
  }

  for (const path of paths) {
    const route = getRouteForPcbPath({ trace, path, anchorPort, width })
    if (!route || route.length < 2) continue
    renderPcbPathRoute(trace, route, ports)
  }
}
