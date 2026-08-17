# Public Pin images and Pinterest bulk upload

The public image route and Pinterest-native CSV are deliberately allowlisted. The server does not browse a Drive folder and cannot proxy arbitrary URLs. Only routes committed to `config/pin-image-history.json` can be fetched; canonical publishing identities in `config/pin-images.json` must match that ledger.

## Image manifest

The manifest schema is:

```json
{
  "schemaVersion": 2,
  "images": [
    {
      "pinId": "pin_006",
      "sourceConceptId": 1,
      "canonicalTitle": "Land in Manila Connected",
      "campaign": "philippines",
      "filename": "land-in-manila-connected-v2.png",
      "sourceFilename": "Land in Manila Connected.png",
      "driveFileId": "GOOGLE_DRIVE_FILE_ID",
      "sha256": "EXPECTED_64_CHARACTER_SHA256",
      "altText": "Traveler arriving in Manila with a connected phone ready for maps and pickup messages."
    }
  ]
}
```

For this campaign the entry is the canonical identity record. The generator resolves `sourceConceptId`, then requires the generated title, versioned public filename, Media URL, publishing metadata, expected SHA-256, and `utm_content` to agree with `pinId`. It does not infer identity from list position or filename. ALT text remains in the manual/API-oriented exports because Pinterest's native bulk CSV has no supported ALT-text column.

### Immutable-route rule

Public Pin URLs use one-year immutable caching. Once a filename appears in `config/pin-image-history.json`, it permanently belongs to its first Drive file ID and SHA-256. Never edit, redirect, alias, or reuse that route for different bytes. Corrected artwork requires a new versioned filename such as `canonical-slug-v2.png`. Build/export rejects canonical mappings that disagree with the ledger, and the server rejects upstream bytes that disagree with the locked SHA-256.

The ledger preserves older and contaminated routes at their earliest deployed byte identity. They remain available for existing consumers but must not appear in a replacement CSV.

`sourceUrl` may be used instead of `driveFileId`, but it must be an HTTPS Google Drive file or direct-download URL from which a file ID can be extracted. Arbitrary hosts are rejected. Do not put access tokens, cookies, credentials, or private URLs in the manifest.

For each new image:

1. Upload the finished image to the approved Google Drive folder using the deterministic filename from `output/manual-posting.csv`.
2. Set the individual file to **Anyone with the link can view**. Folder visibility alone should not be assumed; verify the file itself from a signed-out browser.
3. Add one complete canonical entry using a new versioned filename and expected SHA-256. Append the identical filename, Drive ID, and hash to the immutable history ledger. Never assign artwork by array position alone.
4. Commit and deploy the manifest change.
5. Verify raw bytes and the diagnostic:

```bash
curl -I https://travel.stampdup.com/pins/philippines/manila-airport-to-your-hotel-know-your-options.png
curl https://travel.stampdup.com/health/pins/philippines/manila-airport-to-your-hotel-know-your-options.png
```

The image response must be `200` with an `image/*` content type—not HTML. Successful responses include a strong ETag and `Cache-Control: public, max-age=31536000, immutable`. Unknown mappings return 404. Unavailable, private, oversized, or non-image upstream files return a controlled 502 without exposing the Drive source.

Treat a mapped image as immutable. If artwork changes, upload it as a new Drive file and use a new filename or mapping rather than replacing bytes behind an already cached public URL.

No Railway variable is required when using the committed manifest and publicly shared files. `PIN_IMAGE_MANIFEST_PATH` is an optional advanced override for a different manifest file already present in the Railway container; it is not a credential and is not needed for the standard workflow.

## Pinterest bulk-upload export

The campaign config contains:

```json
{
  "publicImageCampaignSlug": "philippines",
  "pinterestBulkSchedule": {
    "startDate": "2026-08-22",
    "timezone": "America/Chicago",
    "dailyTimes": ["08:00", "11:00", "14:00", "17:00", "20:00"],
    "pinsPerDay": 5,
    "includePinIds": ["pin_006", "...", "pin_025"]
  }
}
```

Generate every existing export plus the identity-checked bulk files:

```bash
npm run campaign:export
```

The two bulk CSVs contain identical cache-safe v2 rows:

- `output/pinterest-bulk-upload.csv`
- `output/stampdup-philippines-pinterest-v2-schedule.csv`

After Railway deploys, run `npm run campaign:verify:v2`. It makes cold unauthenticated production requests, fetches approved Drive bytes directly, requires exact hash and byte equality, and writes `output/stampdup-philippines-v2-preflight.md` plus the live-byte contact sheet. Do not upload until all 20 rows pass.

Override the schedule without editing campaign configuration:

```bash
npm run campaign:export -- \
  --bulk-start-date 2026-08-22 \
  --bulk-timezone America/Chicago \
  --bulk-times 08:00,11:00,14:00,17:00,20:00 \
  --bulk-pins-per-day 5
```

When `includePinIds` is present, only those Pins are exported in the listed order. The current campaign selects `pin_006` through `pin_025`, producing exactly 20 rows over four full five-Pin days. Pins #1–#5 are excluded; Pins #2–#5 remain in the image manifest because their manually scheduled Pins still need public media URLs. Without `includePinIds`, the fallback remains non-reserve Pins whose publication status is `planned`.

Local wall-clock times are converted using the configured IANA timezone and its daylight-saving rules. Pinterest requires UTC for a specific publish time, so `2026-08-22 08:00` in `America/Chicago` becomes `2026-08-22T13:00:00` in the CSV. The timestamp intentionally omits a trailing `Z` to match Pinterest’s documented example while the value itself is UTC.

The exporter enforces exact headers, HTTPS media and destination URLs, nonempty boards, unique image filenames and media URLs, title and description limits, chronological slots, and the 200-row maximum. `Link` retains each Pin’s unique campaign UTM URL. Image rows leave `Thumbnail` blank.

Before uploading, confirm every Media URL returns a public raw image. In Pinterest Business:

1. Open **Settings**.
2. Select **Import content**.
3. Upload `output/stampdup-philippines-pinterest-v2-schedule.csv` only after production verification passes.
4. Review Pinterest’s import result and correct any reported row before treating it as scheduled.

Pinterest documents the current headers, limits, raw Media URL requirement, UTC timestamp behavior, and Import content workflow in [Bulk upload Pins](https://help.pinterest.com/en/business/article/bulk-upload-video-pins). Uploading remains a manual account action; this repository does not sign in or publish on the user’s behalf.
