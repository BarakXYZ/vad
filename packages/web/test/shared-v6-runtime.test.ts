import { assert } from "@esm-bundle/chai"
import type { Model, OrtModule } from "../src/models/common"
import { SileroV6Runtime } from "../src/models/v6-runtime"
import { MicVAD } from "../src/real-time-vad"

it("shares one session while preserving independent stream state", async function () {
  const fixture = createRuntimeFixture()
  const runtime = await SileroV6Runtime.new(
    fixture.ort,
    async () => new ArrayBuffer(1)
  )
  const first = runtime.createStream()
  const second = runtime.createStream()

  const [firstInitial, secondInitial] = await Promise.all([
    first.process(frame(0.1)),
    second.process(frame(0.7)),
  ])
  const [firstNext, secondNext] = await Promise.all([
    first.process(frame(0.1)),
    second.process(frame(0.7)),
  ])

  assert.equal(fixture.createSessionCalls, 1)
  assert.closeTo(firstInitial.isSpeech, 0.1, 0.000001)
  assert.closeTo(secondInitial.isSpeech, 0.7, 0.000001)
  assert.closeTo(firstNext.isSpeech, 1.1, 0.000001)
  assert.closeTo(secondNext.isSpeech, 1.7, 0.000001)
  assert.equal(runtime.activeStreamCount, 2)

  await first.release()
  assert.equal(runtime.activeStreamCount, 1)
  assert.closeTo((await second.process(frame(0.7))).isSpeech, 2.7, 0.000001)

  await runtime.release()
  assert.equal(runtime.activeStreamCount, 0)
  assert.equal(fixture.releaseSessionCalls, 1)
  await expectRejection(second.process(frame(0.7)), /stream disposal/)
})

it("orders reset between in-flight and subsequent work", async function () {
  let resolveFirstRun: (() => void) | undefined
  const firstRunGate = new Promise<void>((resolve) => {
    resolveFirstRun = resolve
  })
  const fixture = createRuntimeFixture({
    beforeRun: async (runIndex) => {
      if (runIndex === 0) {
        await firstRunGate
      }
    },
  })
  const runtime = await SileroV6Runtime.new(
    fixture.ort,
    async () => new ArrayBuffer(1)
  )
  const stream = runtime.createStream()

  const beforeReset = stream.process(frame(0.2))
  stream.reset_state()
  const afterReset = stream.process(frame(0.4))
  await Promise.resolve()
  assert.equal(runtime.inFlightRunCount, 1)

  resolveFirstRun?.()
  assert.closeTo((await beforeReset).isSpeech, 0.2, 0.000001)
  assert.closeTo((await afterReset).isSpeech, 0.4, 0.000001)

  await runtime.release()
  assert.equal(fixture.releaseSessionCalls, 1)
  assert.isTrue(fixture.tensors.every((tensor) => tensor.disposeCalls === 1))
})

it("lets MicVAD use and release an injected model before audio initialization", async function () {
  let modelFactoryCalls = 0
  let releaseCalls = 0
  const model: Model = {
    reset_state: () => {},
    process: async () => ({ isSpeech: 0, notSpeech: 1 }),
    release: async () => {
      releaseCalls += 1
    },
  }

  const vad = await MicVAD.new({
    modelFactory: async () => {
      modelFactoryCalls += 1
      return model
    },
    startOnLoad: false,
  })
  await vad.destroy()

  assert.equal(modelFactoryCalls, 1)
  assert.equal(releaseCalls, 1)
})

type FakeTensor = {
  readonly data: Float32Array | readonly bigint[]
  readonly dims: readonly number[]
  disposeCalls: number
  dispose(): void
}

function createRuntimeFixture(options?: {
  beforeRun?: (runIndex: number) => Promise<void>
}) {
  const tensors: FakeTensor[] = []
  let createSessionCalls = 0
  let releaseSessionCalls = 0
  let runIndex = 0

  class Tensor implements FakeTensor {
    disposeCalls = 0

    constructor(
      _type: string,
      readonly data: Float32Array | readonly bigint[],
      readonly dims: readonly number[] = []
    ) {
      tensors.push(this)
    }

    dispose(): void {
      this.disposeCalls += 1
    }
  }

  const session = {
    run: async (inputs: {
      input: FakeTensor
      state: FakeTensor
      sr: FakeTensor
    }) => {
      const currentRun = runIndex
      runIndex += 1
      await options?.beforeRun?.(currentRun)
      const priorState = Number(inputs.state.data[0] ?? 0)
      const frameValue = Number(inputs.input.data[64] ?? 0)
      const nextState = new Float32Array(256)
      nextState[0] = priorState + 1
      return {
        output: new Tensor(
          "float32",
          new Float32Array([priorState + frameValue]),
          [1, 1]
        ),
        stateN: new Tensor("float32", nextState, [2, 1, 128]),
      }
    },
    release: async () => {
      releaseSessionCalls += 1
    },
  }
  const ort = {
    Tensor,
    InferenceSession: {
      create: async () => {
        createSessionCalls += 1
        return session
      },
    },
  } as unknown as OrtModule

  return {
    ort,
    tensors,
    get createSessionCalls() {
      return createSessionCalls
    },
    get releaseSessionCalls() {
      return releaseSessionCalls
    },
  }
}

function frame(value: number): Float32Array {
  const result = new Float32Array(512)
  result.fill(value)
  return result
}

async function expectRejection(
  operation: Promise<unknown>,
  pattern: RegExp
): Promise<void> {
  try {
    await operation
    assert.fail("Expected operation to reject")
  } catch (error) {
    assert.match(
      error instanceof Error ? error.message : String(error),
      pattern
    )
  }
}
