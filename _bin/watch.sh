#!/bin/bash

tsc -p ts/tsconfig.json --watch &
echo "TypeScript compiler running in background with PID: $!"
esbuild js/game.js --watch --minify --outfile=static/js/game.min.js &
echo "esbuild running in background with PID: $!"
