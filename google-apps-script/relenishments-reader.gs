const SPREADSHEET_ID = "1mm6r351-RAnGgqZ9dEXkh6d47ImXh0JH03yiDd4cRwo";
const ALLOWED_SHEETS = ["USD", "EURO", "Yuan", "AED", "JOD", "INR", "SAR"];

function doGet(event) {
  const params = (event && event.parameter) || {};
  const callback = String(params.callback || "").trim();

  try {
    const sheetName = String(params.sheet || "").trim();
    const bankName = String(params.bank || "").trim();

    if (!sheetName) throw new Error("Missing sheet parameter.");
    if (!bankName) throw new Error("Missing bank parameter.");
    if (ALLOWED_SHEETS.indexOf(sheetName) === -1) {
      throw new Error("Unsupported sheet: " + sheetName);
    }

    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = spreadsheet.getSheetByName(sheetName);
    if (!sheet) throw new Error("Sheet not found: " + sheetName);

    const rows = sheet.getDataRange().getDisplayValues();
    if (!rows.length) throw new Error("Sheet is empty: " + sheetName);

    const headers = rows[0];
    let bankColumn = findHeaderIndex_(headers, "bank");
    const correspondentColumn = findHeaderIndex_(headers, "correspondent bank");
    if (correspondentColumn < 0) throw new Error("Correspondent Bank column was not found.");

    const selectedBank = normalizeComparable_(bankName);
    if (bankColumn < 0) {
      bankColumn = findColumnByValue_(rows, selectedBank);
    }
    if (bankColumn < 0) {
      bankColumn = 0;
    }

    const seen = {};
    const values = [];

    for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
      const row = rows[rowIndex];
      if (normalizeComparable_(row[bankColumn]) !== selectedBank) continue;

      const value = String(row[correspondentColumn] || "").trim();
      const key = value.toLowerCase();
      if (!value || seen[key]) continue;

      seen[key] = true;
      values.push(value);
    }

    return respond_(
      {
        ok: true,
        source: "apps-script-full-sheet",
        sheet: sheetName,
        bank: bankName,
        rowsScanned: Math.max(rows.length - 1, 0),
        values: values,
      },
      callback
    );
  } catch (error) {
    return respond_(
      {
        ok: false,
        error: error && error.message ? error.message : String(error),
      },
      callback
    );
  }
}

function doPost(event) {
  try {
    const payload = parsePostPayload_(event);
    if (String(payload.action || "") !== "appendReplenishment") {
      throw new Error("Unsupported action.");
    }

    return respond_(appendReplenishment_(payload), "");
  } catch (error) {
    return respond_(
      {
        ok: false,
        error: error && error.message ? error.message : String(error),
      },
      ""
    );
  }
}

function appendReplenishment_(payload) {
  const sheetName = String(payload.sheet || "").trim();
  if (!sheetName) throw new Error("Missing sheet.");
  if (ALLOWED_SHEETS.indexOf(sheetName) === -1) {
    throw new Error("Unsupported sheet: " + sheetName);
  }

  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) throw new Error("Sheet not found: " + sheetName);

  const headers = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 7)).getDisplayValues()[0];
  const bankColumn = resolveColumn_(headers, "bank", 0);
  const amountColumn = resolveColumn_(headers, "amount", 1);
  const referenceColumn = resolveColumn_(headers, "ref no", 2);
  const dateColumn = resolveColumn_(headers, "date", 3);
  const registeredAmountColumn = resolveColumn_(headers, "registered amount", 4);
  const verdictColumn = resolveColumn_(headers, "verdict", 5);
  const correspondentColumn = resolveColumn_(headers, "correspondent bank", 6);
  const rowWidth =
    Math.max(
      bankColumn,
      amountColumn,
      referenceColumn,
      dateColumn,
      registeredAmountColumn,
      verdictColumn,
      correspondentColumn,
      6
    ) + 1;

  const row = new Array(rowWidth).fill("");
  row[bankColumn] = requiredValue_(payload.bank, "Bank");
  row[amountColumn] = requiredValue_(payload.amount, "Amount");
  row[referenceColumn] = requiredValue_(payload.referenceNumber, "Reference Number");
  row[dateColumn] = requiredValue_(payload.date, "Date");
  row[registeredAmountColumn] = String(payload.registeredAmount || "").trim();
  row[verdictColumn] = String(payload.verdict || "").trim();
  row[correspondentColumn] = requiredValue_(payload.correspondentBank, "Correspondent Bank");

  const targetRow = findFirstEmptyRow_(sheet, rowWidth);
  sheet.getRange(targetRow, 1, 1, rowWidth).setValues([row]);

  return {
    ok: true,
    source: "apps-script-append",
    sheet: sheetName,
    row: targetRow,
  };
}

function findHeaderIndex_(headers, headerName) {
  const target = normalizeHeader_(headerName);
  for (let index = 0; index < headers.length; index += 1) {
    if (normalizeHeader_(headers[index]) === target) return index;
  }
  return -1;
}

function findColumnByValue_(rows, selectedValue) {
  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    for (let columnIndex = 0; columnIndex < row.length; columnIndex += 1) {
      if (normalizeComparable_(row[columnIndex]) === selectedValue) {
        return columnIndex;
      }
    }
  }
  return -1;
}

function resolveColumn_(headers, headerName, fallbackIndex) {
  const index = findHeaderIndex_(headers, headerName);
  return index >= 0 ? index : fallbackIndex;
}

function findFirstEmptyRow_(sheet, width) {
  const lastRow = Math.max(sheet.getLastRow(), 1);
  if (lastRow < 2) return 2;

  const values = sheet.getRange(2, 1, lastRow - 1, width).getDisplayValues();
  for (let index = 0; index < values.length; index += 1) {
    const row = values[index];
    if (row.every((value) => String(value || "").trim() === "")) {
      return index + 2;
    }
  }

  return lastRow + 1;
}

function requiredValue_(value, label) {
  const text = String(value || "").trim();
  if (!text) throw new Error(label + " is required.");
  return text;
}

function parsePostPayload_(event) {
  const params = (event && event.parameter) || {};
  if (Object.keys(params).length) return params;

  const contents = event && event.postData && event.postData.contents;
  if (!contents) return {};

  try {
    return JSON.parse(contents);
  } catch (error) {
    return {};
  }
}

function normalizeHeader_(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeComparable_(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function respond_(payload, callback) {
  const json = JSON.stringify(payload);
  if (callback && /^[A-Za-z_$][0-9A-Za-z_$]*$/.test(callback)) {
    return ContentService.createTextOutput(callback + "(" + json + ");").setMimeType(
      ContentService.MimeType.JAVASCRIPT
    );
  }

  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}
