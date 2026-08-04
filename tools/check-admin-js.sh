#!/bin/bash

set -euo pipefail

paths=(management/assets management/templates)
patterns=(
	'\$\('
	'\$\.'
	'\bjQuery\b'
	'jquery\.min\.js'
	'bootstrap(/js|\.min\.js)'
	'on(click|change|submit|load|keyup|keydown)='
	'data-(toggle|target|dismiss)='
	'innerHTML'
)

failed=0
for pattern in "${patterns[@]}"; do
	if rg -n --pcre2 "$pattern" "${paths[@]}"; then
		failed=1
	fi
done

if rg -n --pcre2 '\bjQuery\b|jquery\.min\.js|bootstrap(/js|\.min\.js)' setup/management.sh; then
	failed=1
fi

if rg -n '<script' management/templates | rg -v '<script type="module" src="/admin/assets/app\.js"></script>'; then
	failed=1
fi

if [ "$failed" -ne 0 ]; then
	echo "Management JavaScript source guard failed." >&2
	exit 1
fi
