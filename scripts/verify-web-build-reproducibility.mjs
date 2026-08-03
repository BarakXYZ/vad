import { spawn } from "node:child_process"
import { createHash } from "node:crypto"
import { readFile, readdir } from "node:fs/promises"
import { dirname, join, relative } from "node:path"
import { fileURLToPath } from "node:url"

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..")
const webRoot = join(repoRoot, "packages", "web")
const distRoot = join(webRoot, "dist")
const buildScript = join(webRoot, "scripts", "build.mjs")

async function runBuild() {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [buildScript], {
      cwd: repoRoot,
      stdio: "inherit",
    })
    child.on("error", reject)
    child.on("exit", (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`VAD web build exited with ${code}`))
      }
    })
  })
}

async function fingerprintDirectory(root) {
  const files = await listFiles(root)
  const hash = createHash("sha256")
  hash.update("vad-web-dist-v1\0")
  for (const file of files) {
    hash.update(relative(root, file).replaceAll("\\", "/"))
    hash.update("\0")
    hash.update(await readFile(file))
    hash.update("\0")
  }
  return hash.digest("hex")
}

async function listFiles(root) {
  const entries = await readdir(root, { withFileTypes: true })
  const files = []
  for (const entry of entries.sort((left, right) =>
    left.name.localeCompare(right.name)
  )) {
    const path = join(root, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await listFiles(path)))
    } else if (entry.isFile()) {
      files.push(path)
    }
  }
  return files
}

await runBuild()
const first = await fingerprintDirectory(distRoot)
await runBuild()
const second = await fingerprintDirectory(distRoot)

if (first !== second) {
  throw new Error(`VAD web build is not reproducible: ${first} != ${second}`)
}

console.log(`VAD web build is reproducible (${second}).`)
