# Split CI into separate jobs, clean the QA file and add a QA-before-staging rule

Date: 2026-10-25 13:01

## Summary

CI now runs as five parallel jobs, so the browser tests and the other checks each show as their own check on a pull request and in the Actions run graph. The Playwright run gets better reporting. The QA record is cut down to what is still open, and the repo rules gain a rule to run a QA review before staging.

## Changes

- **CI jobs** (`.github/workflows/ci.yml`)
  - The single `check` job is replaced by five: "Dependency audit", "Lint and types", "Unit tests (Vitest)", "Production build" and "Browser tests (Playwright)". Each has its own timeout and a readable `name`.
  - The browser job runs `npm ci` and `npm run build` for itself, because jobs do not share files. It uses the same Next.js build cache key as the build job.
  - A "Summarise results" step writes the Playwright passed, failed, flaky and skipped counts to the run summary page.
  - The Playwright HTML report uploads on every run (`playwright-report`, 7 days). Traces still upload only on failure.
  - Actions stay pinned by SHA, and permissions stay read-only.
- **Playwright reporting** (`playwright.config.ts`, `.gitignore`)
  - In CI the reporters are `github` (inline annotations), `html` (the report to upload) and `json` (totals for the summary). Local runs still use `list`.
  - `playwright-results.json` is ignored.
- **QA record** (`docs/qa/2026-10-24-2329-qa-review.md`)
  - Every fixed finding is removed. The file now holds the accepted trade-offs, advisories and unverified areas, and a short "what looks solid" section. The history of the fixes lives in `docs/changes/` and PRs #6, #7, #15 and #16.
  - Recorded that there are no open Critical, High, Medium or Low findings.
- **Repo rules** (`CLAUDE.md`): new "QA before staging" section. A `qa-reviewer` review in a fresh context runs on the uncommitted changes before anything is staged, findings are fixed or reported first, and the review is recorded in the change note. It is skipped only if the user says so.

## Tests

- No source or test files changed.
- `tsc` and ESLint are clean. `npm test` passes (13 files, 202 tests). `next build` succeeds.
- `CI=1 npx playwright test` passes (4 tests) after a build. It wrote the HTML report and the JSON totals, and the totals have the fields the summary step reads.
- Repository checks: there is no branch protection or ruleset on `main` yet, and a scan of the full git history for secrets found nothing.

## Caveats

- The new workflow has not run on GitHub. The summary step, the report upload and the five job names are untested until the pull request runs.
- The summary step and the report upload use `!cancelled()` rather than `always()`, so a run superseded by a newer push does not produce noise.
- The reviewer parsed the YAML (Ruby loader: five jobs) and ran the summary script locally against the real results file and with the file missing, and both worked.
- Build and e2e share a cache key and run at the same time, so the second to finish logs a harmless "unable to reserve cache" warning. The saving only shows from the second run on.
- With one retry, a test that fails then passes leaves a trace that is not uploaded, because the job is green. The flaky count in the summary and the HTML report still show it.
- The browser job repeats the install and build, so it costs some extra runner minutes. The caches cover most of it.
- QA review: a fresh-context `qa-reviewer` read the uncommitted changes and found no Critical or High issues. It raised two Medium doc-accuracy points (the QA file's CI bullet and its upload-artifact advisory were stale after the split) and a few Lows. Fixed: both Mediums, the Safari and Firefox caveat now lists the keyboard-versus-mouse focus split, the Dependabot line now says the owner switched it off, and `!cancelled()` replaces `always()`. Not changed: dropping `npm ci` from the audit job (untested saving of about 30 seconds) and the trace upload on flaky runs.
- Branch protection is not set up. The plan is to require the five new checks on `main` once they have run on a green pull request.
