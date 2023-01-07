./node_modules/.bin/esbuild --bundle src/background.js --minify --format=esm --outfile=dist/background.js
./node_modules/.bin/esbuild --bundle src/content.js --minify --format=esm --outfile=dist/content.js
./node_modules/.bin/esbuild --bundle src/content.css --minify --outfile=dist/content.css

filename=`python3 pack.py`
cd dist
zip -r ~/Downloads/$filename *
cd ..
