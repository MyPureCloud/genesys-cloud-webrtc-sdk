pushd test/test-pages/
echo "Building CDN sample..."
cp index-template.html cdn/index.html
cp -r common cdn/
npx webpack --config webpack.config.js --entry ./cdn/common/main.js -o ./cdn/sdk-sample.js
rm -rf cdn/common
printf "CDN sample built successfully\n\n"

echo "Building webpack sample..."
cp -r common webpack/
cp index-template.html webpack/index.html
npx webpack --config webpack.config.js --entry ./webpack/common/main.js -o ./webpack/sdk-sample.js
rm -rf webpack/common
printf "Webpack sample built successfully\n\n"


echo "Building browserify sample..."
cp -r common browserify/
cp index-template.html browserify/index.html
npx browserify browserify/common/main.js -o browserify/sdk-sample.js -t [ babelify --presets [ "babel-preset-env" ] ]
npx uglifyjs ./browserify/sdk-sample.js > ./browserify/sdk-sample.min.js
mv browserify/sdk-sample.min.js browserify/sdk-sample.js
rm -rf browserify/common
printf "Browserify sample built successfully\n\n"

echo "Building gulp sample...";
cp -r common gulp/
cp index-template.html gulp/index.html
pushd gulp/
npx gulp
popd
rm -rf gulp/common
echo "Gulp sample built successfully\n\n"

popd
