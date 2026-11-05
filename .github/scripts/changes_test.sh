#!/bin/sh
# Tests for changes.sh. Run: sh .github/scripts/changes_test.sh
set -eu
here=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
fail=0

# check NAME EXT JS PATHS...   (PATHS are joined with newlines)
check() {
	name=$1 want="extension=$2 javascript=$3"
	shift 3
	got=$(
		if [ $# -gt 0 ]; then printf '%s\n' "$@"; fi | sh "$here/changes.sh" | tr '\n' ' ' | sed 's/ $//'
	)
	if [ "$got" = "$want" ]; then
		echo "ok   $name"
	else
		echo "FAIL $name: got '$got' want '$want'"
		fail=1
	fi
}

check "README only" false false README.md
check "root docs and license" false false CONTRIBUTING.md SECURITY.md LICENSE
check "devcontainer only" false false .devcontainer/devcontainer.json
check "extension src only" true true extension/src/background.js
check "extension manifest" true true extension/manifest.json
check "extension store only" false false extension/store/listing.txt
check "extension readme only" false false extension/README.md
check "nested extension markdown" false false extension/docs/guide.md
check "shared ui" true true shared/ui-common.js
check "Makefile" true true Makefile
check ".gitattributes" true true .gitattributes
check "workflow" true true .github/workflows/ci.yml
check "renovate config" true true renovate.json
check "mix docs and extension store" false false README.md extension/store/a.png
check "mix docs and extension" true true README.md extension/src/a.js
check "empty list runs everything" true true
check "unknown file runs everything" true true .eslintrc.yml
check "docs path with spaces" false false "extension/store/a b.png"
check "path with dollar and quote chars" true true "extension/src/\$x'y.js"
check "blank lines ignored" false false "" README.md ""

exit $fail
