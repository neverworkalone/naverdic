# NaverDic PR Review Guidelines

Scope: PR reviews for `neverworkalone/naverdic`.

These rules apply only when the user explicitly requests a review of an existing PR.

Creating or updating a PR during an implementation task does NOT activate this review workflow and does NOT authorize self-review or merge.

DO NOT self-review or merge a PR that you created or updated as part of the current implementation task unless the user separately asks you to review or merge it.

## Review Scope

* Always review the latest PR head.
* Review the entire PR diff against the merge base, not only the latest commits.
* Inspect every changed file and relevant surrounding code.
* Report all substantiated blocking findings visible in the first pass whenever possible.
* Check:
  * reproduction evidence
  * connection between cause and fix
  * regressions in existing dictionary behavior
  * browser interaction and popup behavior
  * settings and storage compatibility
  * cleanup and lifecycle behavior
  * validation coverage
* **Fix causes, not symptoms.** Treat workarounds that leave the causal path unchanged as suspect.
* When the approach is flawed, explain why, recommend a safer direction, and define how it should be validated.
* Clearly distinguish code-based expectations, mocked results, and actual browser observations.

## PR Selection

* If the user specifies a PR number, review that PR.
* If the user requests a review without specifying a PR, find the currently open PR and review the latest relevant one.
* Before reviewing, verify that the target PR is still open.
* DO NOT continue reviewing a previously discussed PR after it has been merged or closed unless the user explicitly requests a post-merge or historical review.
* If the previously reviewed PR has been merged or closed and a newer open PR exists, review the newer open PR.
* If multiple open PRs make the target genuinely ambiguous, identify the candidates and ask the user which one to review.

## Review Judgment

* Preserve existing user-facing behavior unless the task explicitly changes it.
* Pay particular attention to regressions in:
  * double-click and drag lookup
  * trigger keys and page interaction
  * popup open/close, focus, scrolling, and positioning
  * existing stored settings and migrations
  * dictionary lookup when translation providers fail
* DO NOT block on speculative edge cases that are not reachable under supported usage.
* Read existing review threads and author replies before commenting.
* DO NOT repeat resolved or convincingly rebutted findings without new evidence.
* Consolidate related findings and avoid duplicate comments.

## Approval and Merge

* DO NOT approve a fix as confirmed if the reported symptom was not revalidated.
* Post confirmed blocking findings with supporting evidence and hold the merge.
* When a new revision is pushed, review the latest head again.
* DO NOT merge draft PRs or PRs explicitly marked do-not-merge.
* If the user explicitly requested a PR review and did not prohibit merging, merge the PR once all blockers are resolved and required validation is confirmed.
* Before merging, verify that the PR head still matches the reviewed and validated commit.
* Require regression coverage for blocking findings when the failure is automatable.
* Keep site-specific or bug-specific rules in code and regression tests rather than accumulating them in this document.
