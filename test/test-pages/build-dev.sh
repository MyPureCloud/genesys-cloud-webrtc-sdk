pushd test/test-pages/

echo "Building dev sample..."
cp -r common dev/
cp index-template.html dev/index.html
npx webpack --config dev/webpack.config.js --entry ./dev/common/main.js -o ./dev/sdk-sample.js --watch
rm -rf dev/common
printf "Dev sample built successfully\n\n"

popd
