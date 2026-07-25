import { OrtConfigurer } from "./common"

export * from "./common"
export { SileroLegacy } from "./legacy"
export { SileroV5 } from "./v5"
export { SileroV6 } from "./v6"
export { SileroV6Runtime } from "./v6-runtime"

export type OrtOptions = {
  ortConfig?: OrtConfigurer
}
