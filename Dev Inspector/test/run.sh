#!/bin/sh
# Every suite, from anywhere. Exits non-zero if any of them fail.
# Runs all .js here except the shared fixtures, so a new suite is picked up
# whatever it is called.
cd "$(dirname "$0")" || exit 1
fail=0
for f in *.js; do
  case "$f" in mock.js|domshim.js|harness.js) continue ;; esac
  printf '%-14s ' "${f%.js}"
  if out=$(node "$f" 2>&1); then echo "$out" | tail -1
  else fail=1; echo '*** FAILED ***'; echo "$out" | tail -12; fi
done
node --check ../code.js || fail=1
node -e 'new Function(require("fs").readFileSync(require("path").join(__dirname,"../ui.html"),"utf8").match(/<script>([\s\S]*)<\/script>/)[1])' || fail=1
[ $fail -eq 0 ] && printf '\nall suites green\n'
exit $fail
