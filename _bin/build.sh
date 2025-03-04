#!/bin/bash

tsc -p ts/tsconfig.json
esbuild static/js/game.js --minify --outfile=static/js/game.min.js
