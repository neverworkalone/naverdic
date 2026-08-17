#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
DIST_DIR="$PROJECT_ROOT/dist"
VITE_BIN="$PROJECT_ROOT/node_modules/.bin/vite"
ESBUILD_BIN="$PROJECT_ROOT/node_modules/.bin/esbuild"

if [[ ! -x "$VITE_BIN" || ! -x "$ESBUILD_BIN" ]]; then
  echo "Missing local build dependencies. Run yarn install first." >&2
  exit 1
fi

cd "$PROJECT_ROOT"
"$VITE_BIN" build

# Vite copies the raw service/content modules for development. The release
# package uses minified bundles while retaining the static modules declared by
# the manifest for unpacked/content-script compatibility.
"$ESBUILD_BIN" --bundle src/background.js --minify --format=esm --outfile="$DIST_DIR/background.js"
"$ESBUILD_BIN" --bundle src/content.js --minify --format=esm --outfile="$DIST_DIR/content.js"
"$ESBUILD_BIN" --bundle src/content.css --minify --outfile="$DIST_DIR/content.css"

# index.html and its index-* chunks are the repository's development demo, not
# extension entry points. These public demo assets are not needed by Chrome.
rm -f \
  "$DIST_DIR/index.html" \
  "$DIST_DIR/favicon.ico" \
  "$DIST_DIR/logo.png" \
  "$DIST_DIR/icon.png"
for index_asset in "$DIST_DIR"/assets/index-*; do
  if [[ -f "$index_asset" ]]; then
    rm -f "$index_asset"
  fi
done

ZIP_NAME="$(python3 "$PROJECT_ROOT/pack.py")"
ZIP_DIR="${NAVERDIC_ZIP_DIR:-${HOME:-$PROJECT_ROOT}/Downloads}"
mkdir -p "$ZIP_DIR"
ZIP_DIR="$(cd -- "$ZIP_DIR" && pwd)"
ZIP_PATH="$ZIP_DIR/$ZIP_NAME"
TEMP_ZIP="$ZIP_PATH.tmp.$$"
trap 'rm -f "$TEMP_ZIP"' EXIT

(
  cd "$DIST_DIR"
  zip -qr "$TEMP_ZIP" .
)
mv -f "$TEMP_ZIP" "$ZIP_PATH"

node "$PROJECT_ROOT/scripts/validate-package.mjs" \
  --project-root "$PROJECT_ROOT" \
  --dir "$DIST_DIR" \
  --zip "$ZIP_PATH"

printf 'Created %s\n' "$ZIP_PATH"
