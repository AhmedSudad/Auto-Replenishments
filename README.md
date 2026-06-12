# Auto Replenishments

Static browser workspace and Google Apps Script automation for calculating and submitting cash replenishment entries to a Google Sheet.

## What This Project Does

- Opens a browser-based replenishment form at `/relenishments.html`.
- Loads bank, currency, and correspondent-bank reference data from Google Sheets.
- Calculates 80% and 100% replenishment values from the entered balance and cash-in-transit values.
- Submits approved replenishment rows back to the selected currency sheet through a Google Apps Script web app.
- Includes a separate data-unifying tool page for cleaning company names in uploaded Excel workbooks.

## Project Structure

```text
.
|-- assets/
|   |-- relenishments.js           # Browser logic for replenishment calculations and submission
|   |-- relenishments-config.js    # Apps Script endpoint configuration
|   |-- app.js                     # Company-name unifier browser logic
|   |-- worker.js                  # XLSX processing worker for the data-unifying tool
|   |-- styles.css                 # Shared site styles
|   |-- list-of-banks.txt          # Static bank reference list
|   `-- currency.txt               # Static currency reference list
|-- google-apps-script/
|   |-- relenishments-reader.gs    # Apps Script web app for reading/writing Google Sheets
|   `-- README.md                  # Apps Script deployment notes
|-- data-unifying-tool/
|   `-- index.html                 # Alternate entry page for the company-name unifier
|-- index.html                     # Static entry page
|-- relenishments.html             # Auto replenishments workspace
|-- wrangler.toml                  # Cloudflare Pages configuration
|-- _headers                       # Cloudflare Pages response headers
`-- _redirects                     # Cloudflare Pages redirect rules
```

## Local Use

This is a static site. Serve the folder with any local static server and open the local URL in a browser.

```powershell
cd C:\Users\ahmed.moustafa\Desktop\PY\company-name-unifier
python -m http.server 8790 --bind 127.0.0.1
```

Then open:

```text
http://127.0.0.1:8790/relenishments.html
```

## Google Apps Script Setup

The browser app needs a deployed Apps Script web app to read full Google Sheet rows and append replenishment submissions.

1. Open Google Apps Script.
2. Create or open the Apps Script project for this automation.
3. Copy the contents of `google-apps-script/relenishments-reader.gs` into the Apps Script editor.
4. Deploy it as a web app.
5. Set `Execute as` to `Me`.
6. Set `Who has access` to `Anyone`.
7. Copy the deployed web app URL ending in `/exec`.
8. Put that URL in `assets/relenishments-config.js` for both `correspondentBankReaderUrl` and `replenishmentWriterUrl`.

More deployment details are in `google-apps-script/README.md`.

## Google Drive Upload Workflow

The replenishment upload button sends manually uploaded Excel files to Apps Script:

- Root Google Drive folder ID: `1I29dTj90DL6xxwvJvomw2MWPP3MTvPEZ`
- The folder is expected to contain year, bank, and currency subfolders.
- The replenishment page upload button should let the user select a downloaded Excel file.
- The upload process is standalone and does not require the replenishment form fields to be filled.
- The app should infer the target bank folder from the uploaded Excel file name and workbook contents, allowing for slight bank-name variations and recursive nested Drive folders where the order may vary. The upload year should help choose the correct master spreadsheet, not the folder location.
- The master spreadsheet can be a large `.xlsx` file in Drive; the Apps Script converts it to a Google Sheet copy for appending when needed, so the largest spreadsheet file wins even if the filename doesn't contain the word `master`.
- The workbook `Currency Type` column determines the target currency folder when the page currency field is not selected.
- Apps Script should save the uploaded Excel file into the matching Google Drive bank/currency folder.
- Apps Script should copy/append the uploaded Excel contents into the large master Google Sheet already present in that same folder.
- The uploaded workbook must contain a `Request Number` column. Apps Script checks those request numbers before saving the file or appending rows, and blocks the entire upload if any request number already exists in the master Google Sheet or appears twice in the uploaded workbook.
- Uploaded columns are matched to the master sheet by header. The script dynamically detects one-row or multi-row bilingual header bands, then treats close English/Arabic header variants, such as `Request Number`, `Request No`, and Arabic equivalents for known fields, as the same column when they clearly match.
- Any uploaded columns that do not match the master headers are added at the far right of the master sheet so they can be handled manually later.
- Uploaded rows are appended below existing data at the first available blank row.
- The master Google Sheet will not necessarily contain `master` in its name. On first use, Apps Script should detect it by opening candidate Google Sheets in the folder and choosing the one with the largest used data range.
- After detection, Apps Script should persist a mapping of `folder ID -> master spreadsheet ID` so future uploads use the saved master directly instead of scanning every file again.
- If the saved master file is missing or inaccessible, Apps Script should re-run detection and update the mapping.

Mapping storage is supported through Apps Script `PropertiesService`. To use a small auditable config Google Sheet instead, put its spreadsheet ID in `MASTER_CACHE_SPREADSHEET_ID` inside `google-apps-script/relenishments-reader.gs`.

## Cloudflare Pages Deployment

This repository can be deployed as a Cloudflare Pages static site.

Recommended settings:

- Build command: leave blank
- Build output directory: `.`
- Root directory: repository root

Wrangler deploy command:

```powershell
npx wrangler pages deploy . --project-name auto-replenishments
```

## GitHub Setup Without Browser Access

If Git is installed on the work PC, you can connect this local folder to GitHub entirely from PowerShell:

```powershell
cd C:\Users\ahmed.moustafa\Desktop\PY\company-name-unifier
git init
git branch -M main
git remote add origin https://github.com/AhmedSudad/auto-replenishments.git
git add .
git commit -m "Prepare auto replenishments project"
git push -u origin main
```

If the remote already exists locally, use this instead of `git remote add`:

```powershell
git remote set-url origin https://github.com/AhmedSudad/auto-replenishments.git
```

Authentication can be done from the terminal with Git Credential Manager, a personal access token, or SSH. No browser access is required by the project itself.

## GitHub API Fallback

Some work PCs block Git's HTTPS transport even when normal PowerShell HTTPS works. If `git push` fails with a connection reset, use the API publisher:

```powershell
cd C:\Users\ahmed.moustafa\Desktop\PY\company-name-unifier
powershell -ExecutionPolicy Bypass -File .\scripts\publish-github-api.ps1
```

The script prompts for a GitHub token on your PC. Use a token that can write repository contents for `AhmedSudad/Auto-Replenishments`. Do not paste the token into chat or commit it to the project.

## Notes

- `.wrangler/`, dependency folders, local caches, logs, and generated spreadsheet exports are intentionally ignored by Git.
- Keep production Apps Script URLs and Google Sheet access rules reviewed before publishing the repository.
- Local development with `python -m http.server` uses `/relenishments.html`; Cloudflare Pages also rewrites `/relenishments` to that file.
