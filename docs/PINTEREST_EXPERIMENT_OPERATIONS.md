# Philippines Arrival Kit experiment operations

This guide operates the four-week, 20-Pin learning sprint. The engine prepares files and reports; publishing and scheduling remain manual or externally managed. It does not connect to Pinterest, Buffer, Tailwind, or another publishing API.

## Experiment design

The experiment ID is `philippines_arrival_kit_4_week_2026_08`, and every record belongs to campaign `philippines_arrival_kit`. Pin IDs are stable values in the form `pin_###`. They identify a concept within this experiment and are also used as the UTM content value.

The active schedule uses five Pins per week. Adjacent slots deliberately vary topic and creative format.

| Week | Pin | Topic pillar | Creative format | Primary search phrase |
|---:|---|---|---|---|
| 1 | pin_001 | Phone/eSIM | Step-by-step infographic | Philippines eSIM setup |
| 1 | pin_002 | Airport/logistics | Comparison or decision | Manila airport transportation |
| 1 | pin_003 | Offline preparation | Saveable checklist | Philippines travel checklist |
| 1 | pin_004 | First 24–72 hours | Timeline | first 72 hours Philippines |
| 1 | pin_005 | Money/payment | Saveable checklist | Philippines money and ATM tips |
| 2 | pin_006 | Phone/eSIM | Mistakes to avoid | Philippines eSIM mistakes |
| 2 | pin_007 | Airport/logistics | Saveable checklist | Philippines airport arrival tips |
| 2 | pin_008 | Digital-nomad connectivity | Travel-photo-led | digital nomad Philippines |
| 2 | pin_009 | Airport/logistics | Mistakes to avoid | Philippines arrival mistakes |
| 2 | pin_010 | Phone/eSIM | Comparison or decision | keep home number with eSIM |
| 3 | pin_011 | Phone/eSIM | Travel-photo-led | Philippines eSIM before takeoff |
| 3 | pin_012 | First 24–72 hours | Timeline | first 24 hours Manila |
| 3 | pin_013 | Phone/eSIM | Comparison or decision | physical SIM or eSIM Philippines |
| 3 | pin_014 | Offline preparation | Saveable checklist | Manila arrival offline checklist |
| 3 | pin_015 | Digital-nomad connectivity | Travel-photo-led | Philippines backup internet |
| 4 | pin_016 | Phone/eSIM | Saveable checklist | Philippines eSIM compatibility |
| 4 | pin_017 | Phone/eSIM | Timeline | when to activate Philippines eSIM |
| 4 | pin_018 | Offline preparation | Saveable checklist | useful apps Philippines travel |
| 4 | pin_019 | Airport/logistics | Travel-photo-led | Manila airport arrival data |
| 4 | pin_020 | Offline preparation | Step-by-step infographic | offline maps Philippines |

Pins `pin_021` through `pin_025` are reserves. Keep all five unpublished unless early evidence justifies a controlled follow-up. Selecting a reserve is an experiment decision, not a Pinterest requirement. Record the rationale before assigning a date; do not rewrite the results of an earlier Pin.

`pin_001`, **Philippines eSIM Setup in 5 Minutes**, is the existing baseline. It remains `created`, uses the untagged base URL, and must not be recreated or have its historical destination rewritten.

## Generate publication files

```bash
npm run campaign:generate
npm run campaign:export
```

The machine-readable source of experiment assignments is `output/experiment-manifest.json`. The schedule is `output/experiment-schedule.csv`; `output/manual-posting.csv` contains the copy, image filename, destination, accessibility text, planned time, publication state, experiment fields, and review dates needed for publishing and later review.

Before publishing, copy the manual-posting file into the operational tool or durable working location. Record the real state as `planned`, `created`, `scheduled`, or `published`. Add the actual published Pin URL only after Pinterest provides it. Never invent a published URL or mark a Pin published in advance.

## UTM rules

The base destination is `https://travel.stampdup.com/philippines-arrival-kit`.

- `pin_001` is the untagged baseline.
- Every Pin from `pin_002` onward has a unique deterministic URL containing `utm_source=pinterest`, `utm_medium=organic`, `utm_campaign=philippines_arrival_kit`, and its own `utm_content=pin_###`.
- Existing unrelated query parameters are preserved. Existing UTM keys are replaced rather than duplicated.
- The tracked URL always retains the same Arrival Kit origin and pathname.

## Enter performance snapshots

`output/performance-entry.csv` is the provider-neutral input template. It has one 7-, 30-, and 90-day row for each active Pin. Leave unavailable metrics blank: a blank means missing data, while `0` means the metric was observed and was zero.

Supported Pinterest fields are impressions, saves, Pin clicks, and outbound clicks. Website fields are Arrival Kit visits, checklist opens, checklist text downloads, print actions, and future email signups, affiliate clicks, and affiliate revenue.

Fill the applicable review rows, then import them:

```bash
npm run campaign:performance:import -- --input output/performance-entry.csv
```

Validated snapshots are stored in `data/performance-snapshots.json`. Counts and revenue cannot be negative; counts must be integers. Unknown Pin IDs, malformed dates/windows, and duplicate rows are rejected. Re-importing an unchanged Pin/window snapshot is idempotent. Importing a changed snapshot for the same Pin/window replaces that snapshot while preserving the other review windows.

No undocumented Pinterest export schema is assumed. If data comes from another service, normalize it to the template columns first.

## Generate reports

```bash
npm run campaign:report -- --window 7
npm run campaign:report -- --window 30
npm run campaign:report -- --window 90
```

Reports are written under `output/reports/`. They preserve facts and calculated rates separately from labeled observations and next-test hypotheses. Rates return missing rather than dividing by zero. Fewer than 1,000 impressions is explicitly marked `small_sample`; this is a conservative evidence flag, not a claim of statistical significance.

- 7 days: early signal only. Do not declare a permanent winner.
- 30 days: meaningful comparison, still subject to completeness and sample-size limits.
- 90 days: durability and business-value review.

## Website event mapping

The server emits privacy-conscious JSON log events containing timestamp, route, and supported UTM labels only. It does not add cookies, fingerprinting, or third-party analytics.

| Website event | Performance field |
|---|---|
| `arrival_kit_visit` | `arrival_kit_visits` |
| `arrival_checklist_open` | `checklist_opens` |
| `arrival_checklist_download` | `checklist_downloads` |
| `arrival_checklist_print` | `print_actions` |
| `esim_recommendation_click` | `affiliate_clicks` |

Important internal links and the checklist print event preserve supported UTM values, including `utm_content`. Attribute an event to the Pin whose `utm_content` matches its `pin_id`. The affiliate event exists only when a vetted `AFFILIATE_ESIM_URL` is configured; this experiment does not add or configure one. Email signup and affiliate revenue remain future manual/import fields.
