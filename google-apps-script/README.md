# Auto Replenishments Apps Script

The public Google Sheets export used by the browser can respect the current visible/filter state of the sheet. This Apps Script reads the full tab with `getDataRange().getDisplayValues()`, including rows hidden by filters, then returns only the correspondent-bank values for the selected bank and currency. It also appends submitted replenishments to the selected currency tab.

The same web app now accepts uploaded Excel workbooks from the replenishment page. It saves the original workbook in Google Drive, finds the matching bank folder under the configured root folder, detects the largest spreadsheet file in that branch as the master source, converts Excel masters to Google Sheets when needed, caches that master mapping, and appends the largest worksheet from the uploaded workbook.

Setup:

1. Open `https://script.google.com/` and create a new project.
2. Replace the default code with `relenishments-reader.gs`.
3. Save the project.
4. Select `Deploy` > `New deployment`.
5. Choose `Web app`.
6. Set `Execute as` to `Me`.
7. Set `Who has access` to `Anyone`.
8. Click `Deploy`, authorize it, then copy the Web app URL ending with `/exec`.
9. Send that URL back, or paste it into `assets/relenishments-config.js` as `correspondentBankReaderUrl`.
10. Redeploy the Cloudflare Pages site.

Use the Web app URL, not the deployment ID.

Drive upload requirements:

1. Confirm `DRIVE_UPLOAD_ROOT_FOLDER_ID` in `relenishments-reader.gs` points to the correct root Drive folder.
2. Make sure the Apps Script owner can access the root folder and all nested folders that may contain the master spreadsheets. The upload flow now walks the folder tree recursively, and folder lookup is driven by bank-name hints from the file name and workbook.
3. Confirm uploaded workbooks and master spreadsheets have a `Request Number` header. Duplicate request numbers block the upload before the file is saved or rows are appended.
4. Confirm the uploaded workbook has a header band near the top. Apps Script dynamically handles one-row or multi-row English/Arabic headers, maps close matches into existing master columns, and adds unmatched uploaded columns at the far right.
5. Bank lookup uses flexible aliases and recursive folder scanning so Drive folder names can differ slightly from the workbook or file name. The upload year is used later when choosing the most relevant master spreadsheet, not for locating the Drive folder itself.
6. Confirm uploaded workbooks contain `Currency Type` values. The upload uses them to infer metadata and validation, not the folder path.
7. Keep `MASTER_CACHE_SPREADSHEET_ID` blank to use `PropertiesService` for the `folder ID -> master spreadsheet ID` cache.
8. Optionally set `MASTER_CACHE_SPREADSHEET_ID` to a small config spreadsheet ID to keep the cache auditable in a `master-cache` tab.
9. Add the repository's `appsscript.json` manifest to the Apps Script project so the `drive` and `spreadsheets` scopes are declared explicitly.
10. Enable the Advanced Drive service in the Apps Script project so Excel master files can be converted to Google Sheets automatically.
11. After replacing the Apps Script code, deploy a new web app version and re-authorize it so the upload endpoint can access Drive.

When updating an existing Apps Script project:

1. Replace the existing code with the latest `relenishments-reader.gs`.
2. Select `Deploy` > `Manage deployments`.
3. Edit the Web app deployment.
4. Choose `New version`.
5. Click `Deploy`.

The `/exec` URL should remain the same after deploying a new version.
