# Task6 verification — v6.6 Stage 1 candidate

## Automated result

- `yarn test`: passed, 36 tests.
- `yarn build`: passed as a one-shot Vite production build.
- `yarn package` / `NAVERDIC_ZIP_DIR=/tmp/naverdic-task6-package bash pack.sh`: passed.
- Artifact: `naverdic_6.6.zip`.
- Package validator: 28 unpacked files and 28 ZIP files; manifest and raw content imports resolved; no development files; manifest/package version is consistent.
- ZIP extraction compared with `dist/`: identical file set and contents.
- `esbuild` background/content bundles: passed as part of `pack.sh`.

## Chrome regression checklist

Status is recorded explicitly because the Codex Chrome bridge was unavailable in this environment. Google Chrome 151.0.7922.138 was installed and running, but the Codex browser extension and native host were not installed, so no browser UI action was claimed as verified.

| Scenario | Status | Evidence or follow-up |
| --- | --- | --- |
| Clean-profile unpacked install | Blocked | Load `dist/` after enabling the Codex Chrome bridge. |
| Update an existing install and preserve settings | Blocked | Save settings, replace unpacked directory, reload extension, verify values. |
| Double-click word search | Blocked | Smoke test in a normal page. |
| Horizontal and vertical sentence drag | Blocked | Verify dictionary/translation routing. |
| Ctrl, Command, Alt, and combined triggers | Automated | Trigger matching is covered by `tests/content-interaction.test.mjs`; real browser gesture remains blocked. |
| Deny-list exact host and subdomain | Automated | Host boundary behavior is covered by unit tests; real navigation remains blocked. |
| Selection inside an iframe | Blocked | Verify with an iframe page after Chrome bridge setup. |
| Settings change does not duplicate events | Automated | Lifecycle registration/removal and change handling are unit-tested; real page update remains blocked. |
| Headword, meanings, phonetic symbol, and audio | Automated/blocked | Parser/normalizer tests pass; real audio and popup rendering need Chrome. |
| DeepL success and major error response | Automated/blocked | Message contract/error tests pass; real API interaction needs a configured key and Chrome. |
| Popup position, removal, and recall | Blocked | Verify on page edges and repeated selections. |
| Background message failure and recovery | Automated/blocked | Failure/timeout/response tests pass; real extension recovery needs Chrome. |
| ZIP install | Blocked | ZIP contents are validated; install-only confirmation needs Chrome. |

## Known limitations and final smoke test

No packaging blocker remains. The remaining risk is environmental: Chrome extension installation and real user gestures were not executed by Codex. Before merging the final Stage 1 candidate, perform this smoke test in Chrome:

1. Load `dist/` as an unpacked extension and confirm the popup opens.
2. Search `hello`; confirm headword, meanings, pronunciation, and audio render.
3. Double-click an English word, drag a short sentence horizontally and vertically, and try the configured Ctrl/Command/Alt combinations.
4. Change a setting, reload the extension, and verify the page updates once without duplicate popups.
5. Check deny-list exact host/subdomain behavior and a selection inside an iframe.
6. Configure a DeepL key, verify one successful translation, then verify a failed request recovers without an uncaught error.
7. Replace the unpacked install with the contents of `naverdic_6.6.zip` and repeat the popup/search smoke test.

Unverified browser items are environment-blocked, not treated as passed. No unrelated improvements were added.
