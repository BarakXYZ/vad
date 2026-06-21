#!/usr/bin/env bash

rm -rf dist
mkdir dist
corepack pnpm exec tsgo -p tsconfig.json
cp \
    ../../silero_vad_legacy.onnx \
    ../../silero_vad_v5.onnx \
    ../../silero_vad_v6.onnx \
    dist
corepack pnpm exec webpack -c webpack.config.worklet.js
corepack pnpm exec webpack -c webpack.config.index.js
