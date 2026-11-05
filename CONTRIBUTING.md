# Contributing

Thanks for helping. Bug reports, fixes, UI improvements, documentation and better category lists are all welcome.

## Privacy first

This tool reads browser history, which is personal data. **Never paste real browser history, URLs, page titles, `History` files or profile directories into issues, pull requests, commits or test data.** Redact anything that came from a real profile.

To reproduce a problem or write a test, use synthetic data only (see `extension/scripts/make-fixture.js`).

## Reporting security issues

Do not open a public issue for a vulnerability. See [SECURITY.md](SECURITY.md) for how to report one privately.

## Reporting bugs

Open an issue with your OS, browser and version, how you ran the extension, what you expected and what happened. If a bug needs data to reproduce, describe it or generate synthetic data.

## Development setup

Install Node 22 or newer locally and run the commands below directly.

The standalone Go app lives in [Jubblin/history-timeline-app](https://github.com/Jubblin/history-timeline-app); Go changes belong there.

## Build, test and lint

### Chrome extension

The extension in `extension/` needs Node 22+ on the host. The shipped extension has no npm dependencies; the only devDependency is `playwright-core` (exact-pinned, lockfile committed) for the browser checks.

| Command | Purpose |
|---|---|
| `make extension-test` | unit tests (`node --test`), including manifest checks and the built-zip checks |
| `make extension-check` | fails if the generated `src/classify/rules.js` against `src/classify/rules.json` is stale (`make extension-sync` fixes it) |
| `make drift-check` | compares `extension/test/filter-cases.json` and `extension/src/classify/rules.json` (normalised JSON) with the copies on the `main` branch of Jubblin/history-timeline-app; needs network, `DRIFT_REF=<branch\|sha>` pins another revision. Advisory in CI (`drift` job, not part of `ci-ok`) |
| `make ui-check` | fails if `extension/ui/ui-common.js` differs from `shared/ui-common.js` (also a prerequisite of `make extension-zip`, and run in CI); `make ui-sync` regenerates it |
| `make extension-lint` | manifest lint |
| `make extension-zip` | reproducible zip in `dist/` |
| `make browser-check` | Playwright checks (`chrome-check`, `ui-check`, `zip-check`); needs `cd extension && npm ci && npx playwright-core install --with-deps chromium` first |

Browser checks (`extension/scripts/chrome-check.cjs`, `ui-check.cjs`, `zip-check.cjs`) need `playwright-core` and its full Chromium (branded Chrome ignores `--load-extension`); install with `npm ci` in `extension/` as above and see `extension/README.md`. They use synthetic fixture data only. Never put real history in extension tests or screenshots. Anything for tests (stub classifier, mock history, fixture page) lives in `extension/ui/test-support/`, which must never be shipped or imported from shipped code; the zip test enforces that.

### Which CI jobs run

A first job, `changes`, looks at the files a pull request (or a push to `main`) touches and skips work that cannot be affected. It uses job-level conditions rather than workflow `paths:` filters, so every workflow always reports its checks.

| Changed path | Extension job | CodeQL javascript-typescript |
|---|---|---|
| `extension/**`, `shared/**`, `Makefile`, `.gitattributes`, `.github/**` | yes | yes |
| root `*.md`, `LICENSE`, `.devcontainer/**`, `extension/store/**`, `extension/**/*.md` | no | no |
| anything else, or an empty or unknown diff | yes | yes |

Scheduled and manual runs, new branches and force pushes run everything. The release workflow (tags `v*`) always builds and tests everything.

`ci-ok` (in CI) and `security-ok` (in Security) always run and pass when every job they depend on passed or was skipped, so each is a single stable check name to require in branch protection. The rules live in `.github/scripts/changes.sh`; `.github/scripts/changes_test.sh` tests them (run `sh .github/scripts/changes_test.sh`) and CI runs it, so update both when you add a new kind of path.

## Project layout

- `extension/`: the Manifest V3 extension (see `extension/README.md`).
- `shared/ui-common.js`: source of truth for UI helpers; `make ui-sync` copies it to `extension/ui/`. Also hand-synced into the Go repo ([Jubblin/history-timeline-app](https://github.com/Jubblin/history-timeline-app), `web/static/ui-common.js`): after changing it here, copy it there.
- `extension/src/classify/rules.json`: source of truth for the bundled category rules; `make extension-sync` generates `rules.js` from it. The Go repo keeps a hand-synced copy (`internal/classify/rules.json`): after changing it here, copy it there and regenerate its vectors (`UPDATE_VECTORS=1 go test ./internal/classify -run TestVectorsFresh`), then copy `internal/classify/testdata/vectors.json` back to `extension/test/vectors.json`. `extension/test/filter-cases.json` is the master copy of a fixture shared with the Go repo: after changing it here, copy it to the Go repo's `internal/server/testdata/filter-cases.json` (never edit the Go copy first).

  **This repo is the source of truth** for both files; the Go repo copies are downstream. If `make drift-check` reports a mismatch, update the Go repo from this one, never the reverse. A fetch failure exits 2 (the check did not run), a real mismatch exits 1 and prints a diff.

  The CI `drift` job is advisory for now (`continue-on-error: true`, not in the `ci-ok` needs list). To make it blocking later, remove `continue-on-error` from the job and add `drift` to `ci-ok`'s `needs`.

## Design principles

- Read-only: never modify browser history. No external requests; keep the strict CSP (no inline script or style).
- Classification is offline and uses only the URL. Do not add network calls, and never log URLs, titles or paths.
- UI: render history data with `textContent` only (never `innerHTML`); history titles and URLs are untrusted input.
- JSON field names are camelCase.

## Improving the category lists

The bundled lists in `extension/src/classify/rules.json` are a heuristic that favours precision over recall.

- Propose well-known sites only, as registrable domains (they match subdomains).
- Prefer domain rules over keywords. Keywords are rarely worth the false positives.
- Do not list large shared platforms such as search engines, social networks, video sites, or cloud and CDN hosts.
- Keep each list sorted and free of duplicates, run `make extension-sync`, and add or update tests (and `test/vectors.json` if behaviour changes).
- Users can fix misclassifications themselves with `add` and `allow` rules, so a borderline entry is better left out.

## Releasing

Releases are cut from `main` by pushing a version tag. Before tagging:

1. Bump `version` in `extension/manifest.json` (the tag must equal it).
2. Update the version examples in `docs/INSTALL-EXTENSION.md`.
3. Run `make extension-zip TAG=vX.Y.Z` to check the zip builds.
4. Merge these changes to `main`, then tag:

```sh
git tag -a v1.2.3 -m "v1.2.3"
git push origin v1.2.3
```

The `Release` workflow (`.github/workflows/release.yml`) tests and builds the Chrome extension zip (`history-timeline-extension_vX.Y.Z.zip`; the tag must equal the manifest version), writes a `SHA256SUMS` file covering it too, adds build provenance attestations, and creates a **draft** GitHub Release with generated notes, which you publish by hand.

Once the workflow succeeds:

1. Open the draft under Releases and check that the extension zip and `SHA256SUMS` are attached and the generated notes read well.
2. Click **Publish release** in the GitHub UI, or run `gh release edit v1.2.3 --draft=false`.

Re-running the workflow for a tag whose release is still a draft replaces the draft's assets; if the release is already published the job fails with a clear message and changes nothing. Attestations are created at build time for the archives and `SHA256SUMS`, so the draft state does not affect them. Check a download with `sha256sum -c SHA256SUMS` or `gh attestation verify <file> --repo Jubblin/history-timeline`.

CI (`ci.yml`) and the security scans (`security.yml`) run on every pull request. Workflow actions are pinned to full commit SHAs and updated by Renovate.

## Pull requests

Before opening a pull request:

- [ ] `make extension-test`, `make extension-lint`, `make extension-check` and `make ui-check` pass
- [ ] new behaviour has tests
- [ ] README updated if behaviour changed
- [ ] no real browser data anywhere in the change
- [ ] small, focused commits with clear messages

By contributing you agree that your contributions are licensed under the MIT licence (see [LICENSE](LICENSE)).

#### Promoting the browser checks

The `extension-browser` CI job runs the Playwright checks and is **advisory**: it has `continue-on-error: true` and is not in the `ci-ok` `needs` list, so a failure shows on the pull request but cannot fail `ci-ok`. It follows the same path filter as the `extension` job, so docs-only changes skip it.

Promotion rule: once the job has **10 consecutive green runs on `main`** (count only runs where it actually executed, not skipped), make it blocking with two edits in `.github/workflows/ci.yml`:

1. Remove `continue-on-error: true` from the `extension-browser` job.
2. Add `extension-browser` to the `ci-ok` job's `needs` list. Its existing result loop then requires `success` or `skipped`, so no other change is needed.
