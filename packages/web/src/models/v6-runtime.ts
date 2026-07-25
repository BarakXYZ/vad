import * as ort from "onnxruntime-web/wasm"
import { Model, ModelFetcher, OrtModule, SpeechProbabilities } from "./common"

const CONTEXT_SIZE = 64
const STATE_SIZE = 2 * 128

type SileroV6Inputs = {
  input: ort.Tensor
  state: ort.Tensor
  sr: ort.Tensor
}

type SessionRunner = (
  inputs: SileroV6Inputs
) => ReturnType<ort.InferenceSession["run"]>

type StreamLifecycle = "active" | "releasing" | "released"
type RuntimeLifecycle = "ready" | "disposing" | "disposed"

export class SileroV6Runtime {
  private readonly streams = new Set<SileroV6Stream>()
  private readonly inFlightRuns = new Set<Promise<unknown>>()
  private lifecycle: RuntimeLifecycle = "ready"
  private releasePromise: Promise<void> | undefined

  private constructor(
    private readonly session: ort.InferenceSession,
    private readonly ortInstance: OrtModule
  ) {}

  static async new(
    ortInstance: OrtModule,
    modelFetcher: ModelFetcher
  ): Promise<SileroV6Runtime> {
    const modelArrayBuffer = await modelFetcher()
    const session = await ortInstance.InferenceSession.create(modelArrayBuffer)
    return new SileroV6Runtime(session, ortInstance)
  }

  get activeStreamCount(): number {
    return this.streams.size
  }

  get inFlightRunCount(): number {
    return this.inFlightRuns.size
  }

  createStream(): Model {
    if (this.lifecycle !== "ready") {
      throw new Error("Cannot create a Silero stream after runtime disposal")
    }

    const state = createState(this.ortInstance)
    let sampleRate: ort.Tensor
    try {
      sampleRate = createSampleRate(this.ortInstance)
    } catch (error) {
      state.dispose()
      throw error
    }
    const stream = new SileroV6Stream(
      (inputs) => this.run(inputs),
      state,
      sampleRate,
      this.ortInstance,
      () => {
        this.streams.delete(stream)
      }
    )
    this.streams.add(stream)
    return stream
  }

  release(): Promise<void> {
    if (this.releasePromise !== undefined) {
      return this.releasePromise
    }

    this.lifecycle = "disposing"
    const streams = Array.from(this.streams)
    this.releasePromise = (async () => {
      const errors: unknown[] = []
      const streamResults = await Promise.allSettled(
        streams.map((stream) => stream.release())
      )
      for (const result of streamResults) {
        if (result.status === "rejected") {
          errors.push(result.reason)
        }
      }
      await Promise.allSettled(this.inFlightRuns)
      try {
        await this.session.release()
      } catch (error) {
        errors.push(error)
      }
      this.lifecycle = "disposed"
      if (errors.length > 0) {
        throw new Error("Failed to release Silero runtime", {
          cause: errors[0],
        })
      }
    })()
    return this.releasePromise
  }

  private async run(
    inputs: SileroV6Inputs
  ): ReturnType<ort.InferenceSession["run"]> {
    if (this.lifecycle === "disposed") {
      throw new Error("Cannot run inference after Silero runtime disposal")
    }

    const operation = this.session.run(inputs)
    this.inFlightRuns.add(operation)
    try {
      return await operation
    } finally {
      this.inFlightRuns.delete(operation)
    }
  }
}

export class SileroV6Stream implements Model {
  private context = createContext()
  private operation: Promise<void> = Promise.resolve()
  private lifecycle: StreamLifecycle = "active"
  private releasePromise: Promise<void> | undefined

  constructor(
    private readonly runSession: SessionRunner,
    private state: ort.Tensor,
    private readonly sampleRate: ort.Tensor,
    private readonly ortInstance: OrtModule,
    private readonly onReleased: () => void = () => {}
  ) {}

  reset_state = (): void => {
    this.assertActive()
    const nextState = createState(this.ortInstance)
    const nextContext = createContext()
    const operation = this.enqueue(async () => {
      const previousState = this.state
      previousState.dispose()
      this.state = nextState
      this.context = nextContext
    })
    void operation.catch(() => {
      nextState.dispose()
    })
  }

  process = (audioFrame: Float32Array): Promise<SpeechProbabilities> => {
    if (this.lifecycle !== "active") {
      return Promise.reject(
        new Error("Cannot process audio after Silero stream disposal")
      )
    }
    return this.enqueue(() => this.processFrame(audioFrame))
  }

  release = (): Promise<void> => {
    if (this.releasePromise !== undefined) {
      return this.releasePromise
    }

    this.lifecycle = "releasing"
    this.releasePromise = this.enqueue(async () => {
      this.state.dispose()
      this.sampleRate.dispose()
      this.lifecycle = "released"
      this.onReleased()
    })
    return this.releasePromise
  }

  private async processFrame(
    audioFrame: Float32Array
  ): Promise<SpeechProbabilities> {
    const inputWithContext = new Float32Array(CONTEXT_SIZE + audioFrame.length)
    inputWithContext.set(this.context, 0)
    inputWithContext.set(audioFrame, CONTEXT_SIZE)

    const input = new this.ortInstance.Tensor("float32", inputWithContext, [
      1,
      inputWithContext.length,
    ])
    const previousState = this.state
    let outputState: ort.Tensor | undefined
    let outputProbability: ort.Tensor | undefined

    try {
      const outputs = await this.runSession({
        input,
        state: previousState,
        sr: this.sampleRate,
      })
      outputState = outputs["stateN"]
      outputProbability = outputs["output"]
      if (outputState === undefined) {
        throw new Error("No state from model")
      }
      if (outputProbability?.data === undefined) {
        throw new Error("No output from model")
      }

      const isSpeech = outputProbability.data[0]
      if (typeof isSpeech !== "number") {
        throw new Error("Weird output data")
      }

      this.state = outputState
      outputState = undefined
      this.context = inputWithContext.slice(-CONTEXT_SIZE)
      previousState.dispose()

      return { notSpeech: 1 - isSpeech, isSpeech }
    } finally {
      input.dispose()
      outputState?.dispose()
      outputProbability?.dispose()
    }
  }

  private assertActive(): void {
    if (this.lifecycle !== "active") {
      throw new Error("Cannot reset state after Silero stream disposal")
    }
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const result = this.operation.then(task, task)
    this.operation = result.then(
      () => undefined,
      () => undefined
    )
    return result
  }
}

export function createSileroV6Stream(
  session: ort.InferenceSession,
  state: ort.Tensor,
  sampleRate: ort.Tensor,
  ortInstance: OrtModule
): SileroV6Stream {
  return new SileroV6Stream(
    (inputs) => session.run(inputs),
    state,
    sampleRate,
    ortInstance
  )
}

export function createState(ortInstance: OrtModule): ort.Tensor {
  return new ortInstance.Tensor(
    "float32",
    new Float32Array(STATE_SIZE),
    [2, 1, 128]
  )
}

export function createSampleRate(ortInstance: OrtModule): ort.Tensor {
  return new ortInstance.Tensor("int64", [16000n])
}

function createContext(): Float32Array {
  return new Float32Array(CONTEXT_SIZE)
}
