#!/usr/bin/env bash
# Runs the end-to-end tests in a visible Chrome window, one module after the other, slowed down so every step can be watched.
# Usage (from web/): E2E_SLOWMO=350 bash e2e/run-visible.sh [module numbers...]    e.g. bash e2e/run-visible.sh 2 5
# Before each module the saved sign-in is renewed (see docs/TESTING.md, "Keeping a long run signed in"). The sign-out test (99) is not part
# of it, because signing out ends the saved session.
# This run is LIVE: E2E_SEND=1 makes the quotation tests issue real quotations (each uses up a real quotation number) and e-mail them to
# E2E_MAIL_TO (default jimmyptl46@gmail.com) through the real Gmail SMTP login, every time it runs. Set E2E_SEND=0 for a run without mail.
set -u
export E2E_SLOWMO="${E2E_SLOWMO:-100}"
export E2E_SEND="${E2E_SEND:-1}"
export E2E_MAIL_TO="${E2E_MAIL_TO:-jimmyptl46@gmail.com}"
names=("Public pages" "Dashboard and navigation" "Buyers" "Inquiries" "Quotations" "Products, grades and daily rates" "Partners and suppliers" "Clickable summary tiles" "Phone, tablet and accessibility" "Roles and permissions" "Quotation lifecycle (API, sends mail)")
files=("public" "01-navigation 06-dollar-rate" "02-buyers" "03-inquiries" "04-quotations 07-quote-calculation 08-preview-send" "05-products-settings 10-grades 14-daily-rates" "11-partners" "15-clickable-tiles" "12-responsive 13-accessibility" "09-roles" "quote-lifecycle")
projects=("--project=public" "--project=app" "--project=app" "--project=app" "--project=app" "--project=app" "--project=app" "--project=app" "--project=app" "--project=app" "--project=api")
pick=("$@"); if [ ${#pick[@]} -eq 0 ]; then pick=(1 2 3 4 5 6 7 8 9 10 11); fi
for n in "${pick[@]}"; do
  i=$((n - 1))
  echo "=================== Module $n: ${names[$i]}"
  node e2e/refresh-session.mjs >/dev/null 2>&1 || echo "(session refresh skipped)"
  # shellcheck disable=SC2086
  npx playwright test --headed ${projects[$i]} --no-deps --workers=1 --timeout=120000 --output=e2e-results-live --reporter=list ${files[$i]} 2>&1 | grep -v "DEP0205\|trace-deprecation\|E2E seed"
done
echo "=================== done"
