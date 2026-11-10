# Web Store submission checklist for Browsing History Timeline

Status: the extension is live on the [Chrome Web Store](https://chromewebstore.google.com/detail/ffclondmobadghahcmljicbjofpmmjhb) (version 0.5.0 accepted; later releases are uploaded by hand until upload automation is switched on). The items below are kept as a record and for future submissions.

Release note for 0.6.0: the CSV export's first column header is now `time_utc` (was `time`) and the file starts with a UTF-8 BOM; scripts reading the old `time` column must be updated.

## Done in this repository
- [x] Manifest V3, minimal permissions (`history`, `storage`), no host permissions, no remote code, strict CSP.
- [x] Reproducible zip: `make extension-zip` (allowlist; excludes tests, scripts, store assets, fixtures; fixture mode is not in the zip).
- [x] Manifest lint (`make extension-lint`), also run by the zip build.
- [x] Icons 16/32/48/128 (original artwork, `icon.svg`).
- [x] 5 screenshots at 1280x800 from synthetic fixture data (`screenshots/`).
- [x] Privacy policy text (`PRIVACY.md`) consistent with the CSP and permissions.
- [x] Listing text, single-purpose statement and permission justifications (`LISTING.md`).
- [x] Shared UI helper sync check (`make ui-check`) and an advisory `extension-browser` CI job for the Playwright checks.
- [x] Release workflow attaches the zip and checksum to the draft release.

## Submission steps (done for 0.5.0)
- [x] Register a Chrome Web Store developer account and pay the one-time registration fee (check the current amount in the dashboard); verify the account (2-step verification is required).
- [x] Publish `PRIVACY.md` at a public URL (for example its GitHub page on the default branch once merged) and enter that URL in the dashboard's Privacy tab. The store requires a URL, not a file.
- [x] Decide the publisher identity (individual or group) and the support contact shown on the listing. No personal names or emails are in this repository; add them in the dashboard only if you choose to.
- [x] Upload the zip from the release (check `sha256sum -c`), fill the Store listing and Privacy practices tabs from `LISTING.md`, upload icons/screenshots (store icon is `icons/icon-128.png`; the optional small promo tile 440x280 is `extension/store/promo-tile-440x280.png` and the marquee 1400x560 is `promo-marquee-1400x560.png`, both built by `make-promo-tile.py`).
- [x] Choose visibility (public, unlisted or private), regions and pricing (free).
- [x] Submit for review. Review of an extension that requests `history` can take longer and may ask questions; answer with the justification above. Expect to resubmit with a higher version number after any change (the manifest `version` must increase for each upload).
- [ ] Test the uploaded package from the store (or the zip) on a real, branded Chrome profile and on ChromeOS if you want to claim it works there; only Chromium via automation has been tested so far.

## Not done / known gaps
- The small promo tile and marquee exist as images only; they are not part of the extension zip.
- Not tested in branded Google Chrome (it ignores `--load-extension` automation); tested in Playwright's Chromium and by loading the unpacked zip contents.
- Chromebook/ChromeOS behaviour and managed-device policy blocking are untested.
- No Firefox/Edge listing; Edge accepts Chrome extensions via its own add-ons portal, not covered here.

## Optional: automatic upload from the release workflow
One-time setup, after the first manual upload (the item must already exist):
- [ ] In Google Cloud, create or pick a project, enable the **Chrome Web Store API**, configure the OAuth consent screen (add your Google account as a test user, or publish the app) and create an OAuth client ID of type **Desktop app**. This gives `CWS_CLIENT_ID` and `CWS_CLIENT_SECRET`.
- [ ] Get a refresh token for the scope `https://www.googleapis.com/auth/chromewebstore` while signed in as the account that owns the item (for example with the OAuth 2.0 Playground using your own client ID and secret, or a one-off consent flow). This is `CWS_REFRESH_TOKEN`.
- [ ] `CWS_EXTENSION_ID` is the 32-character item ID in the dashboard URL; `CWS_PUBLISHER_ID` is shown in the dashboard under Account.
- [ ] In GitHub, Settings, Environments, create `chrome-web-store`; add the five secrets above there (not as repository secrets); under Deployment protection rules enable **Required reviewers** and add yourself; restrict deployment to tags `v*`.
- [ ] Set the repository variable `CWS_PUBLISH` to `true` (Settings, Secrets and variables, Actions, Variables). Unset it to switch the job off.
- Not tested without real credentials: the first tagged release after setup is the real test. Use the manual run with **submit** unticked first to check upload-only.
