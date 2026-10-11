import type { PcbPath } from "@tscircuit/props"
import { expect, test } from "bun:test"
import { getTestFixture } from "tests/fixtures/get-test-fixture"

test("pcbPaths rejects invalid copper without dropping another valid path", async () => {
  const invalidPath: PcbPath = [
    "R1.pin2",
    { x: 3, y: -2 },
    { x: 3, y: -2, via: true, fromLayer: "bottom", toLayer: "inner2" },
    { x: 3, y: -2 },
    { x: 5, y: -2 },
    { x: 5, y: -2, via: true, fromLayer: "inner2", toLayer: "top" },
    { x: 5, y: -2 },
    "R2.pin1",
  ]
  const validPath: PcbPath = [
    "R1.pin2",
    { x: 3, y: 2 },
    { x: 3, y: 2, via: true, fromLayer: "top", toLayer: "inner2" },
    { x: 3, y: 2 },
    { x: 5, y: 2 },
    { x: 5, y: 2, via: true, fromLayer: "inner2", toLayer: "top" },
    { x: 5, y: 2 },
    "R2.pin1",
  ]
  for (const invalidFirst of [true, false]) {
    const { circuit } = getTestFixture()
    circuit.schematicDisabled = true
    circuit.add(
      <board
        width={20}
        height={12}
        layers={4}
        routeRemaining={false}
        allowBlindAndBuriedVias
      >
        <resistor name="R1" resistance="1k" footprint="0402" pcbX={-4} />
        <resistor name="R2" resistance="1k" footprint="0402" pcbX={4} />
        <trace
          from="R1.pin2"
          to="R2.pin1"
          pcbPathRelativeTo="R1.pin2"
          pcbPaths={
            invalidFirst ? [invalidPath, validPath] : [validPath, invalidPath]
          }
        />
      </board>,
    )
    await circuit.renderUntilSettled()
    expect(circuit.db.pcb_trace_error.list()).toHaveLength(1)
    expect(circuit.db.pcb_trace_error.list()[0]!.message).toContain(
      "does not reach incoming top",
    )
    expect(circuit.db.pcb_trace.list()).toHaveLength(1)
    expect(circuit.db.pcb_via.list().map((via) => via.y)).toEqual([2, 2])
  }
})
