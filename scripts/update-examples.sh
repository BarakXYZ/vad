#!/usr/bin/env bash

set +x

(
    cd examples/bundler
    corepack pnpm remove @ricky0123/vad-web
    corepack pnpm add @ricky0123/vad-web@latest
    corepack pnpm run clean
    corepack pnpm run build
)

(
    cd examples/react-bundler
    corepack pnpm remove @ricky0123/vad-react
    corepack pnpm add @ricky0123/vad-react@latest
    corepack pnpm run clean
    corepack pnpm run build
)

(
    cd examples/nextjs
    corepack pnpm remove @ricky0123/vad-react
    corepack pnpm add @ricky0123/vad-react@latest
    corepack pnpm run build
)

(
    cd examples/script-tags
    latest_version=$(wget -O - https://cdn.jsdelivr.net/npm/@ricky0123/vad-web/ \
        | grep -oP "@ricky0123/vad-web@\d+\.\d+\.\d+" \
        | head -1 \
        | grep -oP "\d+\.\d+\.\d+"
    )
    sed -i "s/@ricky0123\/vad-web@[[:digit:]]\+\.[[:digit:]]\+\.[[:digit:]]\+/@ricky0123\/vad-web@$latest_version/g" \
        index.html
)
