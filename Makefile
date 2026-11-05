# Extension development targets.


.PHONY: drift-check extension-test extension-sync extension-check ui-sync ui-check extension-lint extension-zip browser-check

# Chrome extension tests: Node >= 22 on the host, no dependencies (browser-check needs npm ci, below).
extension-test:
	cd extension && node --test "test/*.test.js"

# Compare the master fixture and rules with the downstream copies in Jubblin/history-timeline-app (needs network).
# DRIFT_REF=<branch|sha> pins the app repo revision (default: main).
drift-check:
	node extension/scripts/check-drift.mjs

# Generate extension/src/classify/rules.js from rules.json (source of truth).
extension-sync:
	node extension/scripts/sync-rules.mjs

# Fail if the extension's copy of the rules is out of date.
extension-check:
	node extension/scripts/sync-rules.mjs --check

# shared/ui-common.js is the source of truth for helpers copied into the extension.
ui-sync:
	node extension/scripts/sync-ui-common.mjs

ui-check:
	node extension/scripts/sync-ui-common.mjs --check

# Validate the extension manifest (permissions, CSP, icons, version format).
extension-lint:
	node extension/scripts/build-zip.mjs --lint

# Reproducible Web Store / release zip in dist/ (allowlist; no tests, scripts or fixtures).
# Pass TAG=vX.Y.Z to require the manifest version to match.
extension-zip: extension-check ui-check extension-lint
	node extension/scripts/build-zip.mjs --out dist $(if $(TAG),--tag "$$TAG",)

# Playwright browser checks (need `cd extension && npm ci` and
# `npx playwright-core install --with-deps chromium`). Synthetic data only.
browser-check: extension-zip
	cd extension && node scripts/chrome-check.cjs
	cd extension && node scripts/ui-check.cjs
	cd extension && node scripts/zip-check.cjs "$$(ls ../dist/history-timeline-extension_v*.zip | head -n 1)"
