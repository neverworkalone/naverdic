# NaverDic Development Guidelines

Scope: implementation, bug fixes, and validation for `neverworkalone/naverdic`.

Core principle: **Preserve existing behavior. Reproduce failures before changing code, then verify the fix under the same conditions.**

## 1. Scope

* Confirm the target repository, branch/commit, requested scope, and current working changes before starting.
* DO NOT overwrite unfinished user work.
* Treat Translight as a separate product and repository. DO NOT automatically carry over its features, settings, or product decisions.
* Use current code and tests to establish existing behavior.
* Determine expected behavior from confirmed requirements and user-designated designs.
* If these conflict, identify the conflict rather than silently choosing one.
* Keep changes scoped to the confirmed cause or requested task.
* DO NOT mix unrelated refactoring, feature expansion, or dependency additions into the same change.

## 2. Bug Fixes and Validation

* Identify the actual symptom, expected behavior, and reproduction conditions.
* MUST confirm the failure against the pre-change code.
* A failure caused only by the environment or test harness is NOT a successful reproduction.
* Fix the confirmed cause with the smallest reasonable change.
* Re-run the same case with the same input, settings, environment, and pass criteria.
* MUST confirm a pre-change failure and post-change pass.
* Check the normal path and nearby regressions.
* Preserve automatable reproductions in the regression suite.

If the symptom cannot be reproduced:

* Separate confirmed facts from hypotheses.
* DO NOT make a speculative product change without approval.

If required validation cannot run:

* Report `validation blocked`.
* DO NOT report the issue as resolved.

DO NOT make a test pass by weakening expectations, removing reproduction conditions, deleting failing assertions, or changing the test to match broken behavior.

## 3. Browser and Product Safety

* Validate popup layout, double-click, drag selection, trigger keys, focus, scrolling, and other browser interaction issues in actual Chrome/Chromium when relevant.
* DO NOT treat DOM presence or mocked layout values as proof of correct browser behavior.
* Preserve the host page's original DOM, styles, events, selection, keyboard, drag, focus, and scroll behavior as much as possible.
* Prevent duplicate popups, event listeners, observers, timers, and repeated actions.
* Preserve existing user settings unless an explicit migration changes them.
* When changing settings or storage, verify existing values, fresh defaults, import/export, and reset behavior.
* Provider failures MUST NOT break ordinary dictionary lookup.
* DO NOT expose API keys or credentials in logs, exports, errors, or tests.

## 4. Test Integrity and Performance

* Tests MUST exercise production code.
* DO NOT reimplement the fix inside the test or mock the function under test into succeeding.
* Mock only required boundaries such as external providers, storage, time, or deterministic layout values.
* Avoid repeated global DOM scans, duplicate event handling, redundant rendering, and work that survives teardown.
* Use real browser profiling when the change directly concerns CPU spikes, hangs, frame drops, or excessive event processing.
* DO NOT delete or skip failing tests merely to make the suite pass.

## 5. Execution and Reporting

* Determine commands from the current `package.json` and test configuration.
* Run the narrow relevant tests first, then the repository's default full validation.
* If code changes after validation, rerun the affected checks.

For bug fixes, report briefly:

* **Reproduction:** confirmed pre-change failure
* **Fix:** confirmed cause and scope
* **Validation:** post-change result and nearby regressions checked
* **Unvalidated:** anything not executed and why

Clearly distinguish between:

* `patch prepared`
* `automated tests passed`
* `browser reproduction confirmed fixed`
* `validation blocked`

Passing the full automated test suite alone does NOT prove that a browser-visible issue is resolved.
