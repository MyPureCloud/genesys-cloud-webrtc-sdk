pushd test/test-pages/

echo "Building CDN sample..."
cp index-template.html cdn/index.html
cp -r common cdn/
npx webpack --config webpack/webpack.config.js --entry ./cdn/common/main.js -o ./cdn/sdk-sample.js
rm -rf cdn/common
printf "CDN sample built successfully\n\n"

echo "Building webpack sample..."
cp -r common webpack/
cp index-template.html webpack/index.html
npx webpack --config webpack/webpack.config.js --entry ./webpack/common/main.js -o ./webpack/sdk-sample.js
rm -rf webpack/common
printf "Webpack sample built successfully\n\n"

popd

cp -r test/test-pages dist/demo
