#!/usr/bin/env fish
# Using fish because that's where I have mise confiugred.
# And since I'm using mise to configure language/tool versions and such, it'd be good

# Build and copy streaming-client to SDK
# cd /Users/jon.hjelle/Development/stream/streaming-client/STREAM-155
# npm run build
# 2025-06-19 It could be wise to delete the destination first in case files are removed,
# But at the moment I think it's fine.
# cp -R /Users/jon.hjelle/Development/stream/streaming-client/STREAM-155/dist /Users/jon.hjelle/Development/stream/sdk/STREAM-155/node_modules/genesys-cloud-streaming-client

# Build SDK
cd /Users/jon.hjelle/Development/stream/sdk/STREAM-151
npm run build

# Run Demo app with changes
cd /Users/jon.hjelle/Development/stream/sdk/STREAM-151/react-demo-app
npx vite --force
