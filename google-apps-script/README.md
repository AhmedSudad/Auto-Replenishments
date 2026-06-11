# Auto Replenishments Apps Script

The public Google Sheets export used by the browser can respect the current visible/filter state of the sheet. This Apps Script reads the full tab with `getDataRange().getDisplayValues()`, including rows hidden by filters, then returns only the correspondent-bank values for the selected bank and currency. It also appends submitted replenishments to the selected currency tab.

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

When updating an existing Apps Script project:

1. Replace the existing code with the latest `relenishments-reader.gs`.
2. Select `Deploy` > `Manage deployments`.
3. Edit the Web app deployment.
4. Choose `New version`.
5. Click `Deploy`.

The `/exec` URL should remain the same after deploying a new version.
