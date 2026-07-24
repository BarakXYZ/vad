import { assert } from "@esm-bundle/chai"
import { DEFAULT_MODEL, MicVAD, Resampler, SileroV6 } from "../src/index"

it("defaults to the current Silero model artifact", function () {
  assert.equal(DEFAULT_MODEL, "v6")
})

it("exports the streaming v6 model and resampler primitives", function () {
  assert.isFunction(SileroV6)
  assert.isFunction(Resampler)
})

it("should export MicVAD", async function () {
  this.timeout(5000)
  const vad = await MicVAD.new({
    onnxWASMBasePath:
      "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/",
    baseAssetPath:
      "https://cdn.jsdelivr.net/npm/@ricky0123/vad-web@0.0.28/dist/",
    startOnLoad: false,
  })
  assert.isFalse(vad.listening)
})

it("should toggle listening state on start and pause", async function () {
  this.timeout(5000)
  const vad = await MicVAD.new({
    onnxWASMBasePath:
      "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/",
    baseAssetPath:
      "https://cdn.jsdelivr.net/npm/@ricky0123/vad-web@0.0.28/dist/",
    startOnLoad: false,
  })
  assert.isFalse(vad.listening)
  await vad.start()
  console.log("started")
  assert.isTrue(vad.listening)
  await vad.pause()
  console.log("paused")
  assert.isFalse(vad.listening)
})
