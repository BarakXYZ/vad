import { copyFile, mkdir, rm } from "node:fs/promises"
import { dirname, join } from "node:path"
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"
import { spawn } from "node:child_process"

const require = createRequire(import.meta.url)
const scriptDir = dirname(fileURLToPath(import.meta.url))
const packageDir = join(scriptDir, "..")
const repoRoot = join(packageDir, "..", "..")
const distDir = join(packageDir, "dist")
const tsgoPackageJson = require.resolve("@typescript/native-preview/package.json")
const tsgoBin = join(dirname(tsgoPackageJson), "bin", "tsgo.js")
const webpackBin = require.resolve("webpack/bin/webpack.js")

async function run(command, args) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: packageDir,
      stdio: "inherit",
    })
    child.on("error", reject)
    child.on("exit", (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`${command} ${args.join(" ")} exited with ${code}`))
      }
    })
  })
}

await rm(distDir, { recursive: true, force: true })
await mkdir(distDir, { recursive: true })
await run(process.execPath, [tsgoBin])

for (const modelFile of [
  "silero_vad_legacy.onnx",
  "silero_vad_v5.onnx",
  "silero_vad_v6.onnx",
]) {
  await copyFile(join(repoRoot, modelFile), join(distDir, modelFile))
}

await run(process.execPath, [webpackBin, "-c", "webpack.config.worklet.js"])
await run(process.execPath, [webpackBin, "-c", "webpack.config.index.js"])
