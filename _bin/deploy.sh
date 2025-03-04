#!/bin/bash
source .env

echo Compiling TypeScript ...
tsc -p ts/tsconfig.json

echo Minifying JavaScript ...
esbuild static/js/game.js --tsconfig=ts/tsconfig.json --minify --outfile=static/js/game.min.js

FILELIST=$(mktemp)

cat > $FILELIST << EOF
index.html
service-worker.js
manifest.json
static/js/game.min.js
static/images/favicon-1024x1024.png
static/images/favicon-120x120.png
static/images/favicon-128x128.png
static/images/favicon-152x152.png
static/images/favicon-167x167.png
static/images/favicon-180x180.png
static/images/favicon-192x192.png
static/images/favicon-256x256.png
static/images/favicon-32x32.png
static/images/favicon-384x384.png
static/images/favicon-48x48.png
static/images/favicon-512x512.png
static/images/favicon-64x64.png
static/images/favicon-96x96.png
static/images/favicon.png
static/fonts/RussoOne-Regular.ttf
static/sounds/alarm.mp3
static/sounds/countdown.mp3
static/sounds/step.mp3
static/sounds/tada.mp3
demo/random-walk.html
demo/weighted-random-walk.html
EOF

rsync -av --progress --files-from=$FILELIST . ${DEST}

rm $FILELIST
