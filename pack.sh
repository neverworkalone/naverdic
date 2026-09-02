#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
DIST_DIR="$PROJECT_ROOT/dist"
VITE_BIN="$PROJECT_ROOT/node_modules/.bin/vite"
ESBUILD_BIN="$PROJECT_ROOT/node_modules/.bin/esbuild"
MINIFY=false

for argument in "$@"; do
  case "$argument" in
    --minify)
      MINIFY=true
      ;;
    *)
      echo "Unknown option: $argument" >&2
      echo "Usage: $0 [--minify]" >&2
      exit 2
      ;;
  esac
done

if [[ ! -x "$VITE_BIN" || ( "$MINIFY" == true && ! -x "$ESBUILD_BIN" ) ]]; then
  echo "Missing local build dependencies. Run yarn install first." >&2
  exit 1
fi

cd "$PROJECT_ROOT"
"$VITE_BIN" build

# Vite copies the raw service/content modules for development. The optional
# release minification keeps the static modules declared by the manifest for
# unpacked/content-script compatibility.
if [[ "$MINIFY" == true ]]; then
  "$ESBUILD_BIN" --bundle src/background.js --minify --format=esm --outfile="$DIST_DIR/background.js"
  "$ESBUILD_BIN" --bundle src/content.js --minify --format=esm --outfile="$DIST_DIR/content.js"
  "$ESBUILD_BIN" --bundle src/content.css --minify --outfile="$DIST_DIR/content.css"
fi

# index.html and its index-* chunks are the repository's development demo, not
# extension entry points. The demo HTML and favicon are not needed by Chrome.
rm -f \
  "$DIST_DIR/index.html" \
  "$DIST_DIR/favicon.ico"
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
