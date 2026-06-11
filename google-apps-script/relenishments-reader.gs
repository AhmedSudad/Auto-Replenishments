const SPREADSHEET_ID = "1mm6r351-RAnGgqZ9dEXkh6d47ImXh0JH03yiDd4cRwo";
const ALLOWED_SHEETS = ["USD", "EURO", "Yuan", "AED", "JOD", "INR", "SAR"];

function doGet(event) {
  const params = (event && event.parameter) || {};
  const callback = String(params.callback || "").trim();

  try {
    const action = String(params.action || "correspondentBanks").trim();
    if (action === "previousReplenishment") {
      return respond_(findPreviousReplenishment_(params), callback);
    }
    if (action === "duplicateReplenishment") {
      return respond_(findDuplicateReplenishment_(params), callback);
    }

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

function findDuplicateReplenishment_(params) {
  const sheetName = String(params.sheet || "").trim();
  const bankName = String(params.bank || "").trim();
  const referenceNumber = String(params.referenceNumber || "").trim();

  if (!sheetName) throw new Error("Missing sheet parameter.");
  if (!bankName) throw new Error("Missing bank parameter.");
  if (!referenceNumber) throw new Error("Missing reference number parameter.");
  if (ALLOWED_SHEETS.indexOf(sheetName) === -1) {
    throw new Error("Unsupported sheet: " + sheetName);
  }

  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) throw new Error("Sheet not found: " + sheetName);

  const headers = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 7)).getDisplayValues()[0];
  const bankColumn = resolveColumn_(headers, "bank", 0);
  const referenceColumn = resolveColumn_(headers, "ref no", 2);
  const duplicate = findDuplicateReference_(sheet, bankColumn, referenceColumn, bankName, referenceNumber);

  return {
    ok: true,
    source: "apps-script-duplicate-reference",
    sheet: sheetName,
    bank: bankName,
    referenceNumber: referenceNumber,
    duplicate: duplicate !== null,
    row: duplicate ? duplicate.row : null,
  };
}

function findPreviousReplenishment_(params) {
  const sheetName = String(params.sheet || "").trim();
  const bankName = String(params.bank || "").trim();
  const selectedDate = parseSiteDate_(params.date);
  const correspondentBank = String(params.correspondentBank || "").trim();

  if (!sheetName) throw new Error("Missing sheet parameter.");
  if (!bankName) throw new Error("Missing bank parameter.");
  if (!selectedDate) throw new Error("Missing or invalid date parameter.");
  if (!correspondentBank) throw new Error("Missing correspondent bank parameter.");
  if (ALLOWED_SHEETS.indexOf(sheetName) === -1) {
    throw new Error("Unsupported sheet: " + sheetName);
  }

  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) throw new Error("Sheet not found: " + sheetName);

  const rows = sheet.getDataRange().getDisplayValues();
  if (!rows.length) throw new Error("Sheet is empty: " + sheetName);

  const headers = rows[0];
  const bankColumn = resolveColumn_(headers, "bank", 0);
  const amountColumn = resolveColumn_(headers, "amount", 1);
  const referenceColumn = resolveColumn_(headers, "ref no", 2);
  const dateColumn = resolveColumn_(headers, "date", 3);
  const registeredAmountColumn = resolveColumn_(headers, "registered amount", 4);
  const correspondentColumn = resolveColumn_(headers, "correspondent bank", 6);

  const selectedBank = normalizeComparable_(bankName);
  const selectedCorrespondentBank = normalizeComparable_(correspondentBank);
  const candidates = [];

  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    if (normalizeComparable_(row[bankColumn]) !== selectedBank) continue;
    if (normalizeComparable_(row[correspondentColumn]) !== selectedCorrespondentBank) continue;

    const amount = String(row[amountColumn] || "").trim();
    if (!isPositiveAmount_(amount)) continue;

    const rowDate = parseSheetDate_(row[dateColumn]);
    if (!rowDate || rowDate.getTime() >= selectedDate.getTime()) continue;

    candidates.push({
      rowDate: rowDate,
      rowIndex: rowIndex,
      dateKey: dateKey_(rowDate),
      row: {
        amount: amount,
        referenceNumber: String(row[referenceColumn] || "").trim(),
        date: String(row[dateColumn] || "").trim(),
        registeredAmount: String(row[registeredAmountColumn] || "").trim(),
        correspondentBank: String(row[correspondentColumn] || "").trim(),
      },
    });
  }

  const previousRows = selectPreviousRowsByDistinctDate_(candidates);

  return {
    ok: true,
    source: "apps-script-previous-replenishment",
    sheet: sheetName,
    bank: bankName,
    date: Utilities.formatDate(selectedDate, Session.getScriptTimeZone(), "yyyy-MM-dd"),
    correspondentBank: correspondentBank,
    row: previousRows[0] || null,
    rows: {
      eighty: previousRows[0] || null,
      hundred: previousRows[1] || null,
    },
  };
}

function selectPreviousRowsByDistinctDate_(candidates) {
  const seenDates = {};
  const selectedRows = [];

  candidates.sort(function (left, right) {
    return right.rowDate.getTime() - left.rowDate.getTime() || right.rowIndex - left.rowIndex;
  });

  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    if (seenDates[candidate.dateKey]) continue;

    seenDates[candidate.dateKey] = true;
    selectedRows.push(candidate.row);
    if (selectedRows.length >= 2) break;
  }

  return selectedRows;
}

function dateKey_(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1),
    String(date.getDate()),
  ].join("-");
}

function isPositiveAmount_(value) {
  const normalized = normalizeSheetAmount_(value);
  return normalized !== "" && Number(normalized) > 0;
}

function normalizeSheetAmount_(value) {
  return String(value || "")
    .replace(/[\u066c,]/g, "")
    .replace(/[^\d.-]/g, "")
    .trim();
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

  const bank = requiredValue_(payload.bank, "Bank");
  const amount = requiredValue_(payload.amount, "Amount");
  const referenceNumber = requiredValue_(payload.referenceNumber, "Reference Number");
  const date = requiredValue_(payload.date, "Date");
  const correspondentBank = requiredValue_(payload.correspondentBank, "Correspondent Bank");
  const duplicate = findDuplicateReference_(sheet, bankColumn, referenceColumn, bank, referenceNumber);
  if (duplicate) {
    throw new Error("Reference Number already exists for this bank.");
  }

  const row = new Array(rowWidth).fill("");
  row[bankColumn] = bank;
  row[amountColumn] = amount;
  row[referenceColumn] = referenceNumber;
  row[dateColumn] = date;
  row[registeredAmountColumn] = String(payload.registeredAmount || "").trim();
  row[verdictColumn] = String(payload.verdict || "").trim();
  row[correspondentColumn] = correspondentBank;

  const targetRow = findFirstEmptyRow_(sheet, rowWidth);
  sheet.getRange(targetRow, 1, 1, rowWidth).setValues([row]);

  return {
    ok: true,
    source: "apps-script-append",
    sheet: sheetName,
    row: targetRow,
  };
}

function findDuplicateReference_(sheet, bankColumn, referenceColumn, bankName, referenceNumber) {
  const rows = sheet.getDataRange().getDisplayValues();
  const selectedBank = normalizeComparable_(bankName);
  const selectedReference = normalizeComparable_(referenceNumber);

  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    if (normalizeComparable_(row[bankColumn]) !== selectedBank) continue;
    if (normalizeComparable_(row[referenceColumn]) !== selectedReference) continue;

    return {
      row: rowIndex + 1,
      bank: String(row[bankColumn] || "").trim(),
      referenceNumber: String(row[referenceColumn] || "").trim(),
    };
  }

  return null;
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

function parseSiteDate_(value) {
  const match = String(value || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function parseSheetDate_(value) {
  const match = String(value || "").trim().match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
  if (!match) return null;
  const yearText = match[3];
  const year = yearText.length === 2 ? Number("20" + yearText) : Number(yearText);
  return new Date(year, Number(match[2]) - 1, Number(match[1]));
}

function sameDay_(left, right) {
  return (
    left &&
    right &&
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
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
