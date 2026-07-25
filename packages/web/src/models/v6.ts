import * as ort from "onnxruntime-web/wasm"
import { ModelFactory, ModelFetcher, SpeechProbabilities } from "./common"
import {
  createSampleRate,
  createSileroV6Stream,
  createState,
  SileroV6Stream,
} from "./v6-runtime"

export class SileroV6 {
  private readonly stream: SileroV6Stream
  private releasePromise: Promise<void> | undefined

  constructor(
    private _session: ort.InferenceSession,
    state: ort.Tensor,
    sampleRate: ort.Tensor,
    ortInstance: typeof ort
  ) {
    this.stream = createSileroV6Stream(_session, state, sampleRate, ortInstance)
  }

  static new: ModelFactory = async (
    ortInstance: typeof ort,
    modelFetcher: ModelFetcher
  ) => {
    const modelArrayBuffer = await modelFetcher()
    const _session = await ortInstance.InferenceSession.create(modelArrayBuffer)

    let state: ort.Tensor | undefined
    let sampleRate: ort.Tensor | undefined
    try {
      state = createState(ortInstance)
      sampleRate = createSampleRate(ortInstance)
      return new SileroV6(_session, state, sampleRate, ortInstance)
    } catch (error) {
      state?.dispose()
      sampleRate?.dispose()
      await _session.release()
      throw error
    }
  }

  reset_state = () => {
    this.stream.reset_state()
  }

  process = async (audioFrame: Float32Array): Promise<SpeechProbabilities> => {
    return this.stream.process(audioFrame)
  }

  release = async () => {
    this.releasePromise ??= (async () => {
      const errors: unknown[] = []
      try {
        await this.stream.release()
      } catch (error) {
        errors.push(error)
      }
      try {
        await this._session.release()
      } catch (error) {
        errors.push(error)
      }
      if (errors.length > 0) {
        throw new Error("Failed to release Silero model", {
          cause: errors[0],
        })
      }
    })()
    return this.releasePromise
  }
}
