# Browsing History Timeline

[![CI](https://github.com/Jubblin/history-timeline/actions/workflows/ci.yml/badge.svg)](https://github.com/Jubblin/history-timeline/actions/workflows/ci.yml)
[![Security](https://github.com/Jubblin/history-timeline/actions/workflows/security.yml/badge.svg)](https://github.com/Jubblin/history-timeline/actions/workflows/security.yml)

A local, read-only browsing history audit tool: a Chrome extension that shows a timeline of your browser history and flags sensitive visits. No data leaves your machine.

> **The standalone Go app has moved.** The command-line binary with the embedded web UI now lives in its own repository: [Jubblin/history-timeline-app](https://github.com/Jubblin/history-timeline-app). This repository contains only the Chrome extension. It is the source of truth for the classifier rules (`extension/src/classify/rules.json`) and `shared/ui-common.js`; the Go repository keeps hand-synced copies of both and of the shared test fixtures (`extension/test/vectors.json`, `extension/test/filter-cases.json`).

## Browser extension

The `extension/` folder is a Manifest V3 browser extension, Browsing History Timeline, that shows the same kind of audit timeline (days and sessions, activity chart, top sites, filters, sensitive-category flags with a hide toggle, CSV export) for the Chrome profile it is installed in. It reads history with Chrome's `history` permission, makes no network requests (strict CSP, no host permissions) and stores only your optional custom rules in `chrome.storage.local`. Privacy policy: [`extension/store/PRIVACY.md`](extension/store/PRIVACY.md). It is available on the [Chrome Web Store](https://chromewebstore.google.com/detail/ffclondmobadghahcmljicbjofpmmjhb).

**Install from the Chrome Web Store (recommended):** open the [listing](https://chromewebstore.google.com/detail/ffclondmobadghahcmljicbjofpmmjhb) and choose **Add to Chrome**. Store installs update automatically.

**Alternative, install unpacked from a release zip:** step-by-step guide, with checksum verification, updating and troubleshooting: [`docs/INSTALL-EXTENSION.md`](docs/INSTALL-EXTENSION.md). In short: download and verify the release zip, unzip it into a new, EMPTY, permanent folder, then in `chrome://extensions` turn on Developer mode and choose **Load unpacked**. (From a checkout, `make extension-zip` builds the same zip.)

**ChromeOS:** this is the way to audit ChromeOS's own Chrome, which the Linux app cannot reach. Load it as above in ChromeOS Chrome (the Developer mode toggle in `chrome://extensions` is a browser setting, unrelated to ChromeOS's own "Developer mode" device setting, which is not needed and should not be turned on for this).

**Limits:**
- Current profile only (install it in each profile you want to audit); incognito visits are not recorded by Chrome and the extension does not run in incognito.
- No visit durations (Chrome's API does not provide them); days use your local time zone.
- Managed devices (school or work policies) may block unpacked, unlisted or Web Store extensions, or the `history` permission.
- Not tested on a Chromebook; automated checks run in Playwright's Chromium.
- Large histories load progressively; the first screen appears quickly and totals fill in as loading finishes.

## Sensitive-site flags

Visits are tagged locally with up to six categories: `adult`, `gambling`, `health`, `finance`, `privacy` (VPN, proxy and Tor sites; not incognito mode, which Chrome does not record) and `news_politics`. This is a **heuristic**: the bundled list (`extension/src/classify/rules.json`) favours precision over recall, so it misses many sites and can occasionally be wrong. Treat flags as hints, not a verdict. Classification uses only the URL, makes no network requests and logs no URLs. Custom `add` and `allow` rules can be entered in the extension; see [`extension/README.md`](extension/README.md).

## Licence

MIT. See [LICENSE](LICENSE). Contributions are welcome: see [CONTRIBUTING.md](CONTRIBUTING.md). To report a vulnerability, see [SECURITY.md](SECURITY.md).
