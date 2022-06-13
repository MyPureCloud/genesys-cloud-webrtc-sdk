pushd test/test-pages/

echo "Building dev sample..."
npx webpack --config gcba/webpack.config.js --entry ./gcba/main.ts -o ./gcba/sdk-sample.js --watch
printf "Dev sample built successfully\n\n"

popd
