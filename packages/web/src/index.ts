export { baseAssetPath } from "./asset-path"
export { defaultModelFetcher } from "./default-model-fetcher"
export { FrameProcessor } from "./frame-processor"
export type { FrameProcessorOptions } from "./frame-processor"
export { Message } from "./messages"
export type {
  Model,
  ModelFactory,
  ModelFetcher,
  OrtModule,
  SpeechProbabilities,
} from "./models/common"
export { SileroV6 } from "./models/v6"
export { NonRealTimeVAD } from "./non-real-time-vad"
export type { NonRealTimeVADOptions } from "./non-real-time-vad"
export { Resampler } from "./resampler"
import {
  arrayBufferToBase64,
  audioFileToArray,
  encodeWAV,
  minFramesForTargetMS,
} from "./utils"

export const utils = {
  audioFileToArray,
  minFramesForTargetMS,
  arrayBufferToBase64,
  encodeWAV,
}

export {
  DEFAULT_MODEL,
  getDefaultRealTimeVADOptions,
  MicVAD,
} from "./real-time-vad"
export type { RealTimeVADOptions } from "./real-time-vad"
