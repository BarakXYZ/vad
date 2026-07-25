import { assert } from "@esm-bundle/chai"
import type { Model } from "../src/index"
import {
  DEFAULT_MODEL,
  MicVAD,
  Resampler,
  SileroV6,
  SileroV6Runtime,
} from "../src/index"

it("defaults to the current Silero model artifact", function () {
  assert.equal(DEFAULT_MODEL, "v6")
})

it("exports the streaming v6 model and resampler primitives", function () {
  assert.isFunction(SileroV6)
  assert.isFunction(SileroV6Runtime)
  assert.isFunction(Resampler)
})

it("should export MicVAD", async function () {
  this.timeout(5000)
  const vad = await MicVAD.new({
    modelFactory: async () => createTestModel(),
    startOnLoad: false,
  })
  assert.isFalse(vad.listening)
  await vad.destroy()
})

it("should toggle listening state on start and pause", async function () {
  this.timeout(5000)
  const vad = await MicVAD.new({
    modelFactory: async () => createTestModel(),
    processorType: "ScriptProcessor",
    startOnLoad: false,
  })
  assert.isFalse(vad.listening)
  await vad.start()
  console.log("started")
  assert.isTrue(vad.listening)
  await vad.pause()
  console.log("paused")
  assert.isFalse(vad.listening)
  await vad.destroy()
})

function createTestModel(): Model {
  return {
    reset_state: () => {},
    process: async () => ({ isSpeech: 0, notSpeech: 1 }),
    release: async () => {},
  }
}
