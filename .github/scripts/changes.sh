#!/bin/sh
# Decide which CI jobs a change needs.
#
# Reads changed paths, one per line, from stdin and prints
#   extension=true|false
#   javascript=true|false     (CodeQL's javascript-typescript analysis)
#
# Classification (the first matching rule wins for each path):
#   docs only, run nothing:
#     markdown in the repository root, LICENSE, .devcontainer/**,
#     extension/store/**, extension/**/*.md (none of these are in the zip)
#   everything else (extension/**, shared/**, Makefile, .github/**, ...) runs
#   the extension and javascript jobs.
# An empty list runs everything, so an odd diff can never silently skip checks.
set -eu

ext=false
js=false
seen=false

while IFS= read -r p || [ -n "$p" ]; do
	[ -n "$p" ] || continue
	seen=true
	case $p in
	extension/store/* | extension/*.md | .devcontainer/*) continue ;;
	*/*) ;;
	*.md | LICENSE) continue ;;
	esac
	ext=true
	js=true
done

if [ "$seen" = false ]; then
	ext=true
	js=true
fi
printf 'extension=%s\njavascript=%s\n' "$ext" "$js"
