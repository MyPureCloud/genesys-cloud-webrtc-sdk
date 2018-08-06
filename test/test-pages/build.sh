pushd test/test-pages/
cp index-template.html cdn/index.html
cp -r common cdn/
npx webpack --config webpack.config.js --entry ./cdn/common/main.js -o ./cdn/sdk-sample.js
rm -rf cdn/common

cp -r common webpack/
cp index-template.html webpack/index.html
npx webpack --config webpack.config.js --entry ./webpack/common/main.js -o ./webpack/sdk-sample.js
rm -rf webpack/common
popd
