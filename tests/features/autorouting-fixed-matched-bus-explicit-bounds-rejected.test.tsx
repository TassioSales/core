import { expect, test } from "bun:test"
import { addFixedMatchedBus } from "tests/fixtures/fixed-matched-bus"
import { getTestFixture } from "tests/fixtures/get-test-fixture"

test("explicit bounds cannot silently admit omitted fixed bus members", async () => {
  const { circuit } = getTestFixture()
  const { circuit: manualBaseline } = getTestFixture()
  manualBaseline.pcbRoutingDisabled = true
  let phaseStarts = 0
  circuit.on("autorouting:start", () => phaseStarts++)
  const options = {
    targetLength: 28.025,
    lengthTolerance: 0.075,
    extraFixedLength: 28.05,
    explanation: "Explicit bounds still reject fixed + pending matching",
  }
  addFixedMatchedBus(circuit, options)
  addFixedMatchedBus(manualBaseline, options)
  await manualBaseline.renderUntilSettled()
  await circuit.renderUntilSettled()
  expect(phaseStarts).toBe(0)
  expect(circuit.db.pcb_autorouting_error.list()).toMatchObject([
    {
      message: expect.stringContaining('pre-routed members "DATA0", "DATA2"'),
    },
  ])
  const fixedTraces = circuit.db.pcb_trace.list()
  expect(fixedTraces).toHaveLength(2)
  expect(fixedTraces).toEqual(manualBaseline.db.pcb_trace.list())
  expect(circuit.db.source_bus.list()[0].source_trace_ids).toHaveLength(3)
  await expect(circuit).toMatchPcbSnapshot(import.meta.path)
})
