#!/usr/bin/env bash
# Builds react-demo-app into dist/demo/react for the CDN. Run after `npm run build`:
# the demo consumes the SDK via `file:..`, so dist/ must already exist.
set -euo pipefail

cd "$(dirname "$0")/.."

npm --prefix react-demo-app ci --registry=https://registry.npmjs.org
npm --prefix react-demo-app run build

rm -rf dist/demo/react
mkdir -p dist/demo
cp -r react-demo-app/dist dist/demo/react
echo "React demo app built to dist/demo/react"
