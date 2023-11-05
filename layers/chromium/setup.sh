#!/bin/bash
set -eo pipefail
rm -rf nodejs node_modules
mkdir nodejs
npm install --omit=dev
mv node_modules nodejs/node_modules
cp package.json nodejs/