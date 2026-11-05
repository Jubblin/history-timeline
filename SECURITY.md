# Security policy

history-timeline (the Chrome extension) reads browser history, which is personal data, so security and privacy reports are taken seriously.

## Reporting a vulnerability

Please report vulnerabilities privately using GitHub private vulnerability reporting: open the **Security** tab of [github.com/Jubblin/history-timeline](https://github.com/Jubblin/history-timeline) and choose **Report a vulnerability**.

- **Never open a public issue, pull request or discussion for a vulnerability.**
- **Never include real browsing history** in a report: no real URLs, page titles, `History` files, `Local State` files or profile directories. Reproduce the problem with synthetic data instead (see [CONTRIBUTING.md](CONTRIBUTING.md)) and describe the steps.
- Do include the commit you tested, your OS and browser, what you did, what you expected and what happened.

## Supported versions

There are no tagged releases yet. Only the latest commit on `main` is supported; please check that the problem still exists there before reporting.

## What to expect

This is a hobby project, so these are best-effort targets, not guarantees:

- acknowledgement within 7 days;
- a status update within 30 days;
- coordinated disclosure: please give us a reasonable chance to fix the problem before publishing details, and we will agree a disclosure date with you;
- credit in the fix or advisory if you would like it.

## Built-in protections

- The extension requests only `history` and `storage` (no host permissions) and makes no network requests; its pages use a strict CSP (`default-src 'none'`, no inline script, `connect-src 'none'`).
- History strings are rendered with `textContent` only.
- User rules text is size-limited.

## Automated scanning

- CodeQL analyses the JavaScript on every push, pull request and weekly; results appear in the repository's code scanning alerts.
- Renovate opens grouped minor/patch update pull requests for npm packages and GitHub Actions.
- Workflows use read-only permissions by default, pin actions to commit SHAs, use no secrets and never run untrusted pull request code with write access. Release zips carry build provenance attestations and a `SHA256SUMS` file.

## Scope

The standalone Go app is now in [Jubblin/history-timeline-app](https://github.com/Jubblin/history-timeline-app); report issues about it there.

In scope:

- rendering of untrusted history strings (URLs and titles) in the UI, for example cross-site scripting;
- CSV export, for example spreadsheet formula injection;

Chrome extension (`extension/`), in addition:

- cross-site scripting through history strings (titles, URLs, domains) in the extension pages, and any weakening of the extension-page CSP (`default-src 'none'`, no inline script, `connect-src 'none'`);
- anything that makes the extension send data off the device, load remote code, or request more permissions than `history` and `storage` (no host permissions);
- the user rules parser (`extension/src/classify`): size limit, prototype pollution, regular-expression denial of service;
- bypasses of "Hide sensitive details" in the page or the CSV export;
- the release zip: files that should not ship (test-only code, fixture mode) being reachable from it.

Out of scope:

- attacks that need local code execution or access to the same user account: the tool reads files that user can already read;
- findings in third-party dependencies without a demonstrated impact on this project (please report those upstream);
- inaccuracy of the heuristic category lists (missed or wrongly flagged sites). Ordinary bugs can be reported as public issues, and users can adjust the lists with `add` and `allow` rules (see `extension/README.md`).
