import { expect, test } from "bun:test"
import { addFixedMatchedBus } from "tests/fixtures/fixed-matched-bus"
import { getTestFixture } from "tests/fixtures/get-test-fixture"

test("absolute bus target bounds cannot omit fixed members either", async () => {
  const { circuit } = getTestFixture()
  let phaseStarts = 0
  circuit.on("autorouting:start", () => phaseStarts++)
  addFixedMatchedBus(circuit, {
    matched: false,
    targetLength: 28,
    lengthTolerance: 0.1,
    explanation: "A targetLength-only bus still constrains every member",
  })
  await circuit.renderUntilSettled()
  expect(phaseStarts).toBe(0)
  expect(circuit.db.pcb_autorouting_error.list()).toMatchObject([
    {
      message: expect.stringContaining(
        "even with targetLength and lengthTolerance",
      ),
    },
  ])
  expect(circuit.db.pcb_trace.list()).toHaveLength(1)
  expect(circuit.db.source_bus.list()[0].source_trace_ids).toHaveLength(2)
  await expect(circuit).toMatchPcbSnapshot(import.meta.path)
})
