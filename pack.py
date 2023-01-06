import json
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MANIFEST_PATH = os.path.join(BASE_DIR, 'public/manifest.json')

manifest = json.loads(open(os.path.join(MANIFEST_PATH, MANIFEST_PATH)).read())

print("%s_%s.zip" % (os.path.basename(BASE_DIR), manifest.get('version')))
