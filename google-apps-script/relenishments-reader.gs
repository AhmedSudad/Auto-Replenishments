const SPREADSHEET_ID = "1mm6r351-RAnGgqZ9dEXkh6d47ImXh0JH03yiDd4cRwo";
const ALLOWED_SHEETS = ["USD", "EURO", "Yuan", "AED", "JOD", "INR", "SAR"];
const DRIVE_UPLOAD_ROOT_FOLDER_ID = "1I29dTj90DL6xxwvJvomw2MWPP3MTvPEZ";
const MASTER_CACHE_SPREADSHEET_ID = "";
const REPLENISHMENT_DECISION_SHEET_ID = 1310756664;
const DECISION_BANK_DISPLAY_MAP = {
  "Abu Dhabi Bank": "بنك أبوظبي",
  "Mansour Bank": "مصرف المنصور",
  "National Bank of Iraq": "البنك الوطني العراقي",
  "Baghdad Bank": "بنك بغداد",
  "Trade Bank of Iraq": "المصرف العراقي للتجارة",
  "Standard Chartered": "ستاندرد تشارترد",
  "Credit bank": "بنك كريديت",
  "Commercial Islamic Bank": "المصرف التجاري الإسلامي",
  "Etihad": "الاتحاد",
  "Bank of Jordan": "بنك الأردن",
  "Iraqi Islamic Bank": "المصرف العراقي الإسلامي",
  "Arab Bank": "البنك العربي",
  "Cihan Bank": "بنك جيهان",
  BBAC: "بي بي إيه سي",
  "Byblos Bank": "بنك بيبلوس",
  "Al-Mashreq Al-Arabi Bank": "بنك المشرق العربي",
  "Economy Bank": "بنك الاقتصاد",
  "Albaraka Turk Participation Bank": "بنك البركة ترك للمشاركة",
  "Is Bank": "بنك إيش",
  "Ziraat Bankasi Bank": "بنك زراعات",
  "Region Trade Bank": "مصرف تجارة المنطقة",
  "Ameen Al-Iraq Bank": "مصرف أمين العراق",
  "Gulf Commercial Bank": "مصرف الخليج التجاري",
  "International Development Bank": "مصرف التنمية الدولية",
  "National Islamic Bank": "المصرف الإسلامي الوطني",
  "Al Nasik Islamic Bank": "مصرف الناسك الإسلامي",
  "First Iraqi Bank": "المصرف العراقي الأول",
  "ziraat Bankasi Bank": "بنك زراعات",
};
const DECISION_CURRENCY_DISPLAY_MAP = {
  USD: "الدولار الأمريكي",
  EURO: "اليورو",
  Yuan: "اليوان الصيني",
  AED: "الدرهم الإماراتي",
  JOD: "الدينار الأردني",
  INR: "الروبية الهندية",
  SAR: "الريال السعودي",
};

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
    if (action === "recordReplenishmentDecision") {
      return respond_(recordReplenishmentDecision_(params), callback);
    }
    if (action === "resetReplenishmentSheet") {
      return respond_(resetReplenishmentSheet_(params), callback);
    }

    const sheetName = String(params.sheet || params.currency || "").trim();
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
  const sheetName = String(params.sheet || params.currency || "").trim();
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
  const sheetName = String(params.sheet || params.currency || "").trim();
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
  const selectedCorrespondentBank = normalizeCorrespondentComparable_(correspondentBank);
  const candidates = [];

  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    if (!matchesBankValue_(row[bankColumn], selectedBank)) continue;
    if (!matchesCorrespondentBankValue_(row[correspondentColumn], selectedCorrespondentBank)) continue;

    const amount = String(row[amountColumn] || "").trim();
    if (!isPositiveAmount_(amount)) continue;

    const rowDate = parseSheetDate_(row[dateColumn]);
    if (!rowDate || rowDate.getTime() >= selectedDate.getTime()) continue;

    candidates.push({
      rowDate: rowDate,
      rowIndex: rowIndex,
      dateKey: dateKey_(rowDate),
      row: {
        rowNumber: rowIndex + 1,
        amount: amount,
        referenceNumber: String(row[referenceColumn] || "").trim(),
        date: String(row[dateColumn] || "").trim(),
        dateValue: Utilities.formatDate(rowDate, Session.getScriptTimeZone(), "yyyy-MM-dd"),
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
    const action = String(payload.action || "").trim();
    if (action === "uploadReplenishmentWorkbook") {
      return respond_(uploadReplenishmentWorkbook_(payload), "");
    }
    if (action === "calculateReplenishment") {
      return respond_(calculateReplenishment_(payload), "");
    }
    if (action === "recordReplenishmentDecision") {
      return respond_(recordReplenishmentDecision_(payload), "");
    }
    if (action === "updateEndOfDayReport") {
      return respond_(updateEndOfDayReport_(payload), "");
    }
    if (action === "resetReplenishmentSheet") {
      return respond_(resetReplenishmentSheet_(payload), "");
    }
    if (action !== "appendReplenishment") {
      throw new Error("Unsupported action.");
    }

    return respond_(appendReplenishment_(payload), "");
  } catch (error) {
    return respond_(
      {
        ok: false,
        error: error && error.message ? error.message : String(error),
        code: error && error.code ? error.code : "",
        details: error && error.details ? error.details : null,
      },
      ""
    );
  }
}

function uploadReplenishmentWorkbook_(payload) {
  const fileName = requiredValue_(payload.fileName, "File name");
  const selectedBank = String(payload.bank || "").trim();
  const selectedCurrency = String(payload.currency || "").trim();
  const selectedDate = parseSiteDate_(payload.date) || parseDateFromFileName_(fileName);
  const fileBase64 = requiredValue_(payload.fileBase64, "Workbook file");
  const tables = parseUploadedTables_(payload.tables);

  if (!tables.length) throw new Error("No workbook rows were found.");
  if (!selectedDate) throw new Error("Could not infer upload year from the selected date or file name.");
  const uploadCurrency = inferCurrencyFromFileName_(fileName) || inferCurrencyFromTables_(tables) || selectedCurrency;
  const uploadBank = selectedBank || inferBankFromTables_(tables) || fileName;
  if (!uploadCurrency) throw new Error("Currency type column was not found in uploaded workbook.");
  if (ALLOWED_SHEETS.indexOf(uploadCurrency) === -1) {
    throw new Error("Unsupported currency: " + uploadCurrency);
  }

  const target = resolveDriveUploadFolder_(uploadBank, uploadCurrency, selectedDate, fileName);
  const master = resolveMasterSpreadsheet_(target.folder, uploadCurrency, selectedDate, fileName);
  const appendPlan = planUploadedTablesAppend_(master.spreadsheet, tables);
  assertUniqueRequestNumbers_(appendPlan, master.spreadsheet);
  const bytes = Utilities.base64Decode(fileBase64);
  const mimeType =
    String(payload.mimeType || "").trim() ||
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  const file = target.folder.createFile(Utilities.newBlob(bytes, mimeType, fileName));
  const appendResult = appendPlannedRowsToMaster_(appendPlan);

  return {
    ok: true,
    source: "apps-script-drive-upload",
    fileName: fileName,
    fileId: file.getId(),
    fileUrl: file.getUrl(),
    folderId: target.folder.getId(),
    folderPath: target.path.join(" / "),
    masterSpreadsheetId: master.spreadsheet.getId(),
    masterSpreadsheetName: master.spreadsheet.getName(),
    masterSpreadsheetUrl: master.spreadsheet.getUrl(),
    masterSource: master.source,
    appendedRows: appendResult.appendedRows,
    targetSheet: appendResult.sheetName,
    uploadedTable: appendResult.tableName,
    inferredBank: uploadBank,
    inferredCurrency: uploadCurrency,
    inferredYear: selectedDate.getFullYear(),
  };
}

function calculateReplenishment_(payload) {
  const sheetName = String(payload.sheet || "").trim();
  const bankName = String(payload.bank || "").trim();
  const correspondentBank = String(payload.correspondentBank || "").trim();
  const selectedDate = parseSiteDate_(payload.date);
  const fileName = String(payload.fileName || "").trim();
  const sectionRequests = collectReplenishmentSectionRequests_(payload);

  if (!sheetName) throw new Error("Missing sheet.");
  if (!bankName) throw new Error("Missing bank.");
  if (!correspondentBank) throw new Error("Missing correspondent bank.");
  if (!selectedDate) throw new Error("Missing or invalid date.");
  if (!sectionRequests.length) throw new Error("Missing replenishment section dates.");
  if (ALLOWED_SHEETS.indexOf(sheetName) === -1) {
    throw new Error("Unsupported sheet: " + sheetName);
  }

  const uploadTarget = resolveDriveUploadFolder_(bankName, sheetName, selectedDate, fileName);
  const master = resolveMasterSpreadsheet_(uploadTarget.folder, sheetName, selectedDate, fileName);
  const calculations = calculateRegisteredAmountSections_(master.spreadsheet, {
    sheet: sheetName,
    bank: bankName,
    correspondentBank: correspondentBank,
    selectedDate: selectedDate,
    sectionRequests: sectionRequests,
  });

  const targetSpreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  const targetSheet = targetSpreadsheet.getSheetByName(sheetName);
  if (!targetSheet) throw new Error("Target sheet not found: " + sheetName);

  const writeSummary = writeCalculatedRegisteredAmounts_(targetSheet, calculations);

  return {
    ok: true,
    source: "apps-script-calculate-replenishment",
    sheet: sheetName,
    bank: bankName,
    correspondentBank: correspondentBank,
    date: Utilities.formatDate(selectedDate, Session.getScriptTimeZone(), "yyyy-MM-dd"),
    masterSpreadsheetId: master.spreadsheet.getId(),
    masterSpreadsheetName: master.spreadsheet.getName(),
    masterSpreadsheetUrl: master.spreadsheet.getUrl(),
    masterSource: master.source,
    targetSpreadsheetId: targetSpreadsheet.getId(),
    targetSpreadsheetName: targetSpreadsheet.getName(),
    update: writeSummary,
    debug: {
      eighty: calculations.eighty ? calculations.eighty.debug : null,
      hundred: calculations.hundred ? calculations.hundred.debug : null,
    },
    rows: {
      eighty: calculations.eighty ? calculations.eighty.outputRow : null,
      hundred: calculations.hundred ? calculations.hundred.outputRow : null,
    },
  };
}

function collectReplenishmentSectionRequests_(payload) {
  return [
    collectReplenishmentSectionRequest_(payload, "eighty"),
    collectReplenishmentSectionRequest_(payload, "hundred"),
  ].filter(function (section) {
    return section && section.rowNumber;
  });
}

function collectReplenishmentSectionRequest_(payload, sectionKey) {
  const date = String(payload[sectionKey + "Date"] || "").trim();
  const rowNumber = parseInteger_(payload[sectionKey + "RowNumber"]);
  if (!date && !rowNumber) return null;
  return {
    key: sectionKey,
    label: sectionKey === "eighty" ? "80%" : "100%",
    date: date,
    rowNumber: rowNumber,
  };
}

function calculateRegisteredAmountSections_(spreadsheet, criteria) {
  const sections = criteria.sectionRequests || [];
  const sectionResults = {};

  for (let index = 0; index < sections.length; index += 1) {
    const section = sections[index];
    const sectionDate = parseAnySheetDate_(section.date, section.date);
    if (!sectionDate) {
      throw new Error("Missing or invalid date for " + section.label + ".");
    }

    sectionResults[section.key] = calculateRegisteredAmountSection_(spreadsheet, {
      sheet: criteria.sheet,
      bank: criteria.bank,
      correspondentBank: criteria.correspondentBank,
      selectedDate: criteria.selectedDate,
      sectionDate: sectionDate,
      rowNumber: section.rowNumber,
      label: section.label,
    });
  }

  return sectionResults;
}

function calculateRegisteredAmountSection_(spreadsheet, criteria) {
  const sheets = spreadsheet.getSheets();
  const selectedBank = normalizeComparable_(criteria.bank);
  const selectedCorrespondentBank = normalizeCorrespondentComparable_(criteria.correspondentBank);
  const selectedCurrency = normalizeCurrencyValue_(criteria.sheet);
  const selectedDate = criteria.sectionDate;
  let matchedRows = 0;
  let totalRequestedAmount = 0;
  let totalRegisteredAmount = 0;
  const debug = {
    sheetsScanned: 0,
    rowsScanned: 0,
    bankMatched: 0,
    currencyMatched: 0,
    dateMatched: 0,
    correspondentMatched: 0,
    amountMatched: 0,
    requestedAmountPositive: 0,
    headers: [],
    skippedSheets: [],
    dateColumnName: "",
    dateColumnUsed: "",
    selectedDate: formatDateForDebug_(selectedDate),
    dateSamples: [],
  };

  for (let sheetIndex = 0; sheetIndex < sheets.length; sheetIndex += 1) {
    const sheet = sheets[sheetIndex];
    const dataRange = sheet.getDataRange();
    const displayValues = dataRange.getDisplayValues();
    const rawValues = dataRange.getValues();
    if (displayValues.length < 2) continue;

    const headerInfo = findBestHeaderRow_(displayValues, [
      ["bank", "bank name", "??? ??????", "??? ?????"],
      ["currency type", "currency", "type of currency", "??? ??????", "??????"],
      ["date of replenishment", "request date", "????? ???????", "????? ???????", "????? ??????"],
      ["correspondent bank", "correspondent bank name", "??? ?????? ???????", "?????? ???????"],
      ["requested amount in numbers", "requested amount", "amount", "????? ?????? ????", "?????? ????"],
      ["bid fx rate", "fx rate", "bid rate", "??? ?????", "??? ??????"],
      ["registered amount", "?????? ??????", "?????? ?????? ????"],
    ]);

    const headers = headerInfo.headers;
    const startRowIndex = headerInfo.dataStartRowIndex;
    const bankColumn = findHeaderIndexByAliases_(headers, ["bank", "bank name", "??? ??????", "??? ?????"]);
    const currencyColumn = findHeaderIndexByAliases_(headers, ["currency type", "currency", "type of currency", "??? ??????", "??????"]);
    const dateColumn = findPreferredReplenishmentDateColumn_(headers);
    const requestDateColumn = findHeaderIndexByAliases_(headers, ["request date", "date"]);
    const correspondentColumn = findPreferredCorrespondentBankColumn_(headers);
    const requestedAmountColumn = findHeaderIndexByAliases_(headers, [
      "requested amount in numbers",
      "requested amount",
      "amount",
      "????? ?????? ????",
      "?????? ????",
    ]);
    const bidFxRateColumn = findHeaderIndexByAliases_(headers, ["bid fx rate", "fx rate", "bid rate", "??? ?????", "??? ??????"]);
    const registeredAmountColumn = findHeaderIndexByAliases_(headers, ["registered amount", "?????? ??????", "?????? ?????? ????"]);

    if (
      bankColumn < 0 ||
      dateColumn < 0 ||
      correspondentColumn < 0 ||
      requestedAmountColumn < 0
    ) {
      debug.skippedSheets.push({
        sheetName: sheet.getName(),
        headerRow: headerInfo.dataStartRowIndex,
        bankColumn: bankColumn,
        currencyColumn: currencyColumn,
        dateColumn: dateColumn,
        correspondentColumn: correspondentColumn,
        requestedAmountColumn: requestedAmountColumn,
        bidFxRateColumn: bidFxRateColumn,
        registeredAmountColumn: registeredAmountColumn,
      });
      continue;
    }

    debug.sheetsScanned += 1;
    debug.headers.push({
      sheetName: sheet.getName(),
      headerRow: headerInfo.dataStartRowIndex,
      bankColumn: bankColumn,
      currencyColumn: currencyColumn,
      dateColumn: dateColumn,
      dateColumnName: String(headers[dateColumn] || "").trim(),
      correspondentColumn: correspondentColumn,
      requestedAmountColumn: requestedAmountColumn,
      bidFxRateColumn: bidFxRateColumn,
      registeredAmountColumn: registeredAmountColumn,
    });

    if (!debug.dateColumnName && dateColumn >= 0) {
      debug.dateColumnName = String(headers[dateColumn] || "").trim();
    }

    for (let rowIndex = startRowIndex; rowIndex < displayValues.length; rowIndex += 1) {
      const displayRow = displayValues[rowIndex];
      const rawRow = rawValues[rowIndex];
      if (!displayRow || !displayRow.length) continue;
      debug.rowsScanned += 1;

      if (!matchesBankValue_(displayRow[bankColumn], selectedBank)) continue;
      debug.bankMatched += 1;
      if (currencyColumn >= 0) {
        const rowCurrency = normalizeCurrencyValue_(displayRow[currencyColumn]);
        if (selectedCurrency && rowCurrency && rowCurrency !== selectedCurrency) continue;
        debug.currencyMatched += 1;
      } else {
        debug.currencyMatched += 1;
      }

      let rowDate = parseAnySheetDate_(rawRow[dateColumn], displayRow[dateColumn]);
      let dateColumnUsed = String(headers[dateColumn] || "").trim();
      if (debug.dateSamples.length < 3) {
        debug.dateSamples.push({
          sheetName: sheet.getName(),
          rowNumber: rowIndex + 1,
          header: String(headers[dateColumn] || "").trim(),
          rawValue: formatDebugValue_(rawRow[dateColumn]),
          displayValue: String(displayRow[dateColumn] || "").trim(),
          parsedValue: rowDate ? formatDateForDebug_(rowDate) : "",
        });
      }
      if ((!rowDate || !sameDay_(rowDate, selectedDate)) && requestDateColumn >= 0 && requestDateColumn !== dateColumn) {
        const fallbackRowDate = parseAnySheetDate_(rawRow[requestDateColumn], displayRow[requestDateColumn]);
        if (fallbackRowDate) {
          rowDate = fallbackRowDate;
          dateColumnUsed = String(headers[requestDateColumn] || "").trim();
        }
      }
      if (!rowDate || !sameDay_(rowDate, selectedDate)) continue;
      debug.dateMatched += 1;
      if (!debug.dateColumnUsed) debug.dateColumnUsed = dateColumnUsed;

      if (!matchesCorrespondentBankValue_(displayRow[correspondentColumn], selectedCorrespondentBank)) continue;
      debug.correspondentMatched += 1;

      const requestedAmount = parseSheetNumber_(rawRow[requestedAmountColumn], displayRow[requestedAmountColumn]);
      if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) continue;
      debug.requestedAmountPositive += 1;

      const bidFxRate =
        bidFxRateColumn >= 0
          ? parseSheetNumber_(rawRow[bidFxRateColumn], displayRow[bidFxRateColumn])
          : NaN;
      const registeredAmount = convertRequestedAmountToUsd_(requestedAmount, bidFxRate, selectedCurrency);

      matchedRows += 1;
      debug.amountMatched += 1;
      totalRequestedAmount += requestedAmount;
      totalRegisteredAmount += registeredAmount;
    }
  }

  return {
    label: criteria.label,
    rowNumber: criteria.rowNumber,
    outputRow: {
      rowNumber: criteria.rowNumber,
      date: Utilities.formatDate(selectedDate, Session.getScriptTimeZone(), "d MMM yyyy"),
      registeredAmount: roundCurrencyAmount_(totalRegisteredAmount),
    },
    rowsUpdated: matchedRows,
    totalRequestedAmount: roundCurrencyAmount_(totalRequestedAmount),
    totalRegisteredAmount: roundCurrencyAmount_(totalRegisteredAmount),
    matched: matchedRows > 0,
    debug: debug,
  };
}

function formatDateForDebug_(value) {
  if (!(value instanceof Date) || isNaN(value.getTime())) return "";
  return Utilities.formatDate(value, Session.getScriptTimeZone(), "d/M/yyyy");
}

function formatDebugValue_(value) {
  if (value instanceof Date && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), "d/M/yyyy");
  }
  if (typeof value === "number" && isFinite(value)) return String(value);
  return String(value || "").trim();
}

function findBestHeaderRow_(values, aliasGroups) {
  const maxRows = Math.min(values.length, 20);
  let best = {
    headers: values[0] || [],
    dataStartRowIndex: 1,
    score: 0,
  };

  for (let rowIndex = 0; rowIndex < maxRows; rowIndex += 1) {
    const row = values[rowIndex] || [];
    let score = 0;
    for (let aliasIndex = 0; aliasIndex < aliasGroups.length; aliasIndex += 1) {
      if (findHeaderIndexByAliases_(row, aliasGroups[aliasIndex]) >= 0) score += 1;
    }
    if (score > best.score) {
      best = {
        headers: row,
        dataStartRowIndex: rowIndex + 1,
        score: score,
      };
    }
  }

  return best;
}

function findPreferredReplenishmentDateColumn_(headers) {
  const preferredAliases = ["date of replenishment", "????? ???????", "????? ???????", "????? ??????"];
  const fallbackAliases = ["request date", "date"];
  const preferred = findHeaderIndexByAliases_(headers, preferredAliases);
  if (preferred >= 0) return preferred;
  return findHeaderIndexByAliases_(headers, fallbackAliases);
}

function findPreferredCorrespondentBankColumn_(headers) {
  const preferredAliases = ["correspondent bank", "??? ?????? ???????", "?????? ???????"];
  const fallbackAliases = ["correspondent bank name", "correspondent name", "bank correspondent"];
  const preferred = findHeaderIndexByAliases_(headers, preferredAliases);
  if (preferred >= 0) return preferred;
  return findHeaderIndexByAliases_(headers, fallbackAliases);
}

function matchesCorrespondentBankValue_(leftValue, rightComparable) {
  const leftComparable = normalizeCorrespondentComparable_(leftValue);
  const rightComparableNormalized = normalizeCorrespondentComparable_(rightComparable);
  if (!leftComparable || !rightComparableNormalized) return false;
  if (leftComparable === rightComparableNormalized) return true;

  const leftNoSpaces = leftComparable.replace(/\s+/g, "");
  const rightNoSpaces = rightComparableNormalized.replace(/\s+/g, "");
  if (leftNoSpaces === rightNoSpaces) return true;
  if (leftComparable.indexOf(rightComparableNormalized) !== -1 || rightComparableNormalized.indexOf(leftComparable) !== -1) return true;

  const leftTokens = leftComparable.split(" ").filter(Boolean);
  const rightTokens = rightComparableNormalized.split(" ").filter(Boolean);
  if (!leftTokens.length || !rightTokens.length) return false;

  let overlap = 0;
  for (let index = 0; index < leftTokens.length; index += 1) {
    if (rightTokens.indexOf(leftTokens[index]) !== -1) overlap += 1;
  }

  if (overlap >= 1 && overlap / Math.max(leftTokens.length, rightTokens.length) >= 0.5) return true;
  return hasAcronymMatch_(leftComparable, rightComparableNormalized);
}

function hasAcronymMatch_(leftComparable, rightComparable) {
  const leftTokens = leftComparable.split(" ").filter(Boolean);
  const rightTokens = rightComparable.split(" ").filter(Boolean);
  if (!leftTokens.length || !rightTokens.length) return false;

  const leftAcronym = buildAcronym_(leftTokens);
  const rightAcronym = buildAcronym_(rightTokens);
  if (leftAcronym && rightTokens.length > 1 && leftAcronym === rightAcronym) return true;
  if (rightAcronym && leftTokens.length > 1 && leftAcronym === rightAcronym) return true;

  if (leftTokens.length === 1 && rightTokens.length > 1) {
    const target = leftTokens[0];
    if (target === rightAcronym) return true;
    if (rightAcronym.indexOf(target) !== -1 || target.indexOf(rightAcronym) !== -1) return true;
  }

  if (rightTokens.length === 1 && leftTokens.length > 1) {
    const target = rightTokens[0];
    if (target === leftAcronym) return true;
    if (leftAcronym.indexOf(target) !== -1 || target.indexOf(leftAcronym) !== -1) return true;
  }

  return false;
}

function buildAcronym_(tokens) {
  const acronym = tokens
    .map(function (token) {
      return String(token || "").trim().charAt(0);
    })
    .join("")
    .toLowerCase();
  return acronym.replace(/[^a-z0-9\u0600-\u06ff]/g, "");
}

function normalizeCorrespondentComparable_(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[\u0625\u0623\u0622\u0627]/g, "\u0627")
    .replace(/[\u0649]/g, "\u064a")
    .replace(/[\u0629]/g, "\u0647")
    .replace(/\b(jod|usd|euro|eur|aed|sar|inr|yuan|iqd)\b/g, " ")
    .replace(/[\/\\\-_,:;()[\]{}]+/g, " ")
    .replace(/[^a-z0-9\u0600-\u06ff]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function writeCalculatedRegisteredAmounts_(sheet, sectionResults) {
  const headers = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getDisplayValues()[0];
  const registeredAmountColumn = findHeaderIndexByAliases_(headers, ["registered amount"]);
  if (registeredAmountColumn < 0) {
    throw new Error("Registered Amount column was not found in the target sheet.");
  }

  const updatedSections = [];
  const sectionKeys = ["eighty", "hundred"];
  for (let index = 0; index < sectionKeys.length; index += 1) {
    const sectionKey = sectionKeys[index];
    const section = sectionResults[sectionKey];
    if (!section) continue;

    const rowNumber = section.rowNumber;
    if (!rowNumber) {
      throw new Error("Could not find target row for " + section.label + ".");
    }

    const cell = sheet.getRange(rowNumber, registeredAmountColumn + 1);
    const writeValue = roundCurrencyAmount_(section.totalRegisteredAmount);
    cell.setValue(writeValue);
    cell.setNumberFormat("#,##0.00");
    cell.setBackground("#dafcf1");
    cell.setFontColor("#09201b");
    cell.setFontWeight("bold");

    updatedSections.push({
      key: sectionKey,
      label: section.label,
      rowNumber: rowNumber,
      value: writeValue,
      rowsMatched: section.rowsUpdated,
    });
  }

  const totalRegisteredAmount = updatedSections.reduce(function (sum, entry) {
    return sum + Number(entry.value || 0);
  }, 0);

  return {
    rowsUpdated: updatedSections.length,
    totalRegisteredAmount: roundCurrencyAmount_(totalRegisteredAmount),
    sections: updatedSections,
    targetSheetName: sheet.getName(),
  };
}

function parseInteger_(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

function parseAnySheetDate_(rawValue, displayValue) {
  if (rawValue instanceof Date && !isNaN(rawValue.getTime())) {
    return new Date(rawValue.getFullYear(), rawValue.getMonth(), rawValue.getDate());
  }

  if (typeof rawValue === "number" && isFinite(rawValue)) {
    const serial = excelSerialToDate_(rawValue);
    if (serial) return serial;
  }

  const rawText = String(rawValue || "").trim();
  const displayText = String(displayValue || "").trim();
  return parseSheetDate_(rawText) || parseSheetDate_(displayText) || parseSiteDate_(rawText) || parseSiteDate_(displayText);
}

function excelSerialToDate_(value) {
  if (!isFinite(value) || value < 20000 || value > 80000) return null;
  const utcDate = new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * 86400000);
  return new Date(utcDate.getUTCFullYear(), utcDate.getUTCMonth(), utcDate.getUTCDate());
}

function parseSheetNumber_(rawValue, displayValue) {
  const rawNumber = typeof rawValue === "number" ? rawValue : Number(String(rawValue || "").replace(/[\u066c,]/g, "").replace(/[^\d.-]/g, ""));
  if (Number.isFinite(rawNumber) && rawNumber !== 0) return rawNumber;

  const displayNumber = Number(String(displayValue || "").replace(/[\u066c,]/g, "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(displayNumber) ? displayNumber : NaN;
}

function convertRequestedAmountToUsd_(requestedAmount, bidFxRate, currencyName) {
  const normalizedCurrency = normalizeCurrencyValue_(currencyName) || normalizeCurrencyValue_(String(currencyName || ""));
  if (normalizedCurrency === "USD") {
    return requestedAmount;
  }

  if (!Number.isFinite(bidFxRate) || bidFxRate <= 0) {
    return requestedAmount;
  }

  return requestedAmount / bidFxRate;
}

function roundCurrencyAmount_(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

function isLooseComparableMatch_(leftValue, rightComparable) {
  const leftComparable = normalizeComparable_(leftValue);
  if (!leftComparable || !rightComparable) return false;
  if (leftComparable === rightComparable) return true;
  if (leftComparable.indexOf(rightComparable) !== -1 || rightComparable.indexOf(leftComparable) !== -1) return true;

  const leftTokens = leftComparable.split(" ").filter(Boolean);
  const rightTokens = rightComparable.split(" ").filter(Boolean);
  if (!leftTokens.length || !rightTokens.length) return false;

  let matches = 0;
  for (let index = 0; index < leftTokens.length; index += 1) {
    if (rightTokens.indexOf(leftTokens[index]) !== -1) matches += 1;
  }

  return matches / Math.max(leftTokens.length, rightTokens.length) >= 0.5;
}

function matchesBankValue_(leftValue, rightComparable) {
  const leftComparable = normalizeBankComparable_(leftValue);
  const rightComparableNormalized = normalizeBankComparable_(rightComparable);
  if (!leftComparable || !rightComparableNormalized) return false;
  if (leftComparable === rightComparableNormalized) return true;
  if (leftComparable.replace(/\s+/g, "") === rightComparableNormalized.replace(/\s+/g, "")) return true;

  const leftCanonical = canonicalBankKey_(leftComparable);
  const rightCanonical = canonicalBankKey_(rightComparableNormalized);
  return !!leftCanonical && leftCanonical === rightCanonical;
}

function normalizeBankComparable_(value) {
  return normalizeComparable_(value)
    .replace(/\bbanks\b/g, "bank")
    .replace(/\s+/g, " ")
    .trim();
}

function canonicalBankKey_(value) {
  const normalized = normalizeBankComparable_(value);
  if (!normalized) return "";

  const aliases = getBankFolderAliases_();
  const normalizedValue = normalized.replace(/\s+/g, " ");

  const keys = Object.keys(aliases);
  for (let keyIndex = 0; keyIndex < keys.length; keyIndex += 1) {
    const key = keys[keyIndex];
    const aliasList = [key].concat(aliases[key] || []);
    for (let aliasIndex = 0; aliasIndex < aliasList.length; aliasIndex += 1) {
      const aliasComparable = normalizeBankComparable_(aliasList[aliasIndex]);
      if (!aliasComparable) continue;
      if (normalizedValue === aliasComparable) return key;
      if (normalizedValue.indexOf(aliasComparable) !== -1 || aliasComparable.indexOf(normalizedValue) !== -1) {
        return key;
      }
    }
  }

  return normalizedValue;
}

function findHeaderIndexByAliases_(headers, aliases) {
  for (let index = 0; index < headers.length; index += 1) {
    const header = normalizeHeader_(headers[index]);
    if (!header) continue;
    for (let aliasIndex = 0; aliasIndex < aliases.length; aliasIndex += 1) {
      if (header === normalizeHeader_(aliases[aliasIndex])) return index;
    }
  }
  return -1;
}

function parseUploadedTables_(value) {
  const tables = typeof value === "string" ? JSON.parse(value) : value;
  if (!Array.isArray(tables)) return [];

  const parsed = [];
  for (let index = 0; index < tables.length; index += 1) {
    const table = tables[index] || {};
    const rows = Array.isArray(table.rows) ? table.rows : [];
    const cleanRows = [];
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
      const row = Array.isArray(rows[rowIndex]) ? rows[rowIndex] : [];
      const cleanRow = row.map(function (cell) {
        return String(cell == null ? "" : cell).trim();
      });
      if (cleanRow.some(function (cell) { return cell !== ""; })) cleanRows.push(cleanRow);
    }
    if (cleanRows.length) {
      parsed.push({
        name: String(table.name || "Uploaded").trim() || "Uploaded",
        rows: cleanRows,
      });
    }
  }

  return parsed;
}

function resolveDriveUploadFolder_(bankName, currencyName, selectedDate, fileName) {
  const root = DriveApp.getFolderById(DRIVE_UPLOAD_ROOT_FOLDER_ID);
  const bankCandidates = buildBankFolderCandidates_(bankName, fileName);
  const bankFolder = findBestMatchingFolder_(root, bankCandidates, 60);
  if (!bankFolder) {
    throw new Error(
      "Could not find a matching bank folder under " +
        root.getName() +
        ". Available folders: " +
        listDirectChildFolderNames_(root).join(", ")
    );
  }
  const master = resolveMasterSpreadsheet_(bankFolder, currencyName, selectedDate, fileName);

  return {
    folder: master.folder,
    path: master.path,
    bankFolder: bankFolder.getName(),
  };
}

function extractYears_(value) {
  const years = [];
  const pattern = /\b(20\d{2})\b/g;
  let match;
  while ((match = pattern.exec(String(value || "")))) {
    if (years.indexOf(match[1]) === -1) years.push(match[1]);
  }
  return years;
}

function buildBankFolderCandidates_(bankName, fileName) {
  const candidates = [];
  addFolderCandidate_(candidates, bankName);
  extractBankHintsFromFileName_(fileName).forEach(function (hint) {
    addFolderCandidate_(candidates, hint);
  });

  const normalizedBank = normalizeMatchText_(bankName);
  const aliases = getBankFolderAliases_();

  Object.keys(aliases).forEach(function (key) {
    const aliasList = aliases[key];
    for (let index = 0; index < aliasList.length; index += 1) {
      const alias = aliasList[index];
      const aliasKey = normalizeMatchText_(alias);
      if (!aliasKey) continue;
      if (normalizedBank && (normalizedBank.indexOf(aliasKey) !== -1 || aliasKey.indexOf(normalizedBank) !== -1)) {
        addFolderCandidate_(candidates, alias);
      }
    }
  });

  return candidates;
}

function extractBankHintsFromFileName_(fileName) {
  const hints = [];
  const fileText = String(fileName || "").trim();
  if (!fileText) return hints;

  const aliases = getBankFolderAliases_();
  const normalizedFileText = normalizeMatchText_(fileText);

  Object.keys(aliases).forEach(function (key) {
    const aliasList = aliases[key];
    for (let index = 0; index < aliasList.length; index += 1) {
      const alias = aliasList[index];
      const aliasKey = normalizeMatchText_(alias);
      if (!aliasKey) continue;
      if (normalizedFileText.indexOf(aliasKey) !== -1) {
        addFolderCandidate_(hints, alias);
      }
    }
  });

  const prefixMatch = fileText.match(/^(.*?\bbank\b)/i);
  if (prefixMatch && prefixMatch[1]) {
    addFolderCandidate_(hints, prefixMatch[1].trim());
  }

  return hints;
}

function addFolderCandidate_(list, value) {
  const candidate = String(value || "").trim();
  if (!candidate) return;
  if (list.indexOf(candidate) === -1) list.push(candidate);
}

function getBankFolderAliases_() {
  return {
    "abu dhabi": ["Abu Dhabi", "Abu Dhabi Bank", "Abu Dhabi Commercial Bank", "ADCB"],
    "abu dhabi islamic bank": ["Abu Dhabi Islamic Bank", "ADIB"],
    "al bilad": ["Al Bilad", "AL BILAD", "Albilad"],
    "al jazira": ["Al Jazira", "AL JAZIRA", "AlJazira", "Bank AlJazira"],
    "albaraka": ["Albaraka", "Al Baraka", "ALBARAKA", "Al Baraka Banking Group"],
    "axis": ["Axis", "AXIS", "Axis Bank"],
    "banque bia": ["Banque BIA", "BANQUE BIA", "BIA"],
    "citi": ["Citi", "CITI", "Citibank", "Citi Bank"],
    "dbs bank": ["DBS", "DBS BANK", "DBS Bank"],
    "eib": ["EIB", "Emirates Islamic Bank", "Emirates Islamic"],
    "etihad": ["Etihad", "ETIHAD", "Ittihad", "Union"],
    "fab": ["FAB", "First Abu Dhabi Bank"],
    "hbtf": ["HBTF", "Housing Bank for Trade and Finance"],
    "intesa": ["Intesa", "INTESA", "Intesa Sanpaolo"],
    "jcb": ["JCB", "Jordan Commercial Bank", "Jordan Commercial", "JORDAN COMMERCIAL BANK"],
    "jpm": ["JPM", "JPMorgan", "JP Morgan", "JP Morgan Chase"],
    "safwa": ["Safwa", "SAFWA", "Safwa Bank"],
    "scb": ["SCB", "Standard Chartered", "Standard Chartered Bank"],
    "turkey is": ["Turkey Is", "TURKEY IS", "Turkiye Is Bankasi", "Is Bank", "Iş Bank"],
    "ziraat bankasi": ["Ziraat Bankasi", "Ziraat Bankası", "Ziraat", "Ziraat Bank"],
    "beirut and the arab": ["Beirut and the Arab", "Beirut and Arab", "Bank of Beirut and the Arab"],
    "al nasik": ["Al Nasik", "Al NasiK", "Al Nasik Bank"],
    "arab bank": ["Arab Bank"],
    "bank of jordan": ["Bank of Jordan", "Jordan Bank"],
    "baghdad": ["Baghdad", "Bank of Baghdad"],
    "cihan": ["Cihan", "Cihan Bank"],
    "byblos": ["BYBLOS", "Byblos Bank"],
    "ameen": ["Ameen", "Ameen Bank"],
    "commercial islamic bank": ["Commercial Islamic Bank", "CIB"],
    "credit": ["Credit", "Credit Bank", "Credit Bank of Iraq"],
    "economy": ["Economy", "Economy Bank"],
    "national bank of iraq": ["National Bank of Iraq", "NBI"],
    "gulf": ["Gulf", "Gulf Commercial Bank"],
    "iraqi islamic bank": ["Iraqi Islamic Bank", "IIB"],
    "international development bank": ["International Development Bank", "IDB"],
    "first iraqi bank": ["First Iraqi Bank", "FIB"],
    "region": ["REGION", "Region"],
    "mansour": ["Mansour", "Al Mansour"],
    "national islamic bank": ["National Islamic Bank", "NIS"],
    "trade bank of iraq": ["Trade Bank of Iraq", "TBI"],
    "is bank": ["Is Bank", "Iş Bank", "Turkiye Is Bankasi"],
  };
}

function collectMatchingUploadFolders_(folder, context, pathSegments) {
  const matches = [];
  const currentPath = pathSegments.concat([folder.getName()]);
  const fileNames = listFolderFileNames_(folder);

  const score = scoreUploadFolder_(currentPath, fileNames, context);
  if (score >= context.minimumScore) {
    matches.push({
      folder: folder,
      path: currentPath,
      score: score,
      depth: currentPath.length,
    });
  }

  const childFolders = folder.getFolders();
  while (childFolders.hasNext()) {
    const child = childFolders.next();
    const childMatches = collectMatchingUploadFolders_(child, context, currentPath);
    for (let index = 0; index < childMatches.length; index += 1) {
      matches.push(childMatches[index]);
    }
  }

  return matches;
}

function listFolderFileNames_(folder) {
  const files = folder.getFiles();
  const names = [];
  while (files.hasNext()) {
    names.push(files.next().getName());
  }
  return names;
}

function listDirectChildFolderNames_(folder) {
  const folders = folder.getFolders();
  const names = [];
  while (folders.hasNext()) {
    names.push(folders.next().getName());
  }
  return names;
}

function findBestMatchingFolder_(root, candidates, minimumScore) {
  const matches = [];
  collectMatchingFolders_(root, candidates, [], matches);
  if (!matches.length) return null;

  matches.sort(function (left, right) {
    if (right.score !== left.score) return right.score - left.score;
    if (right.depth !== left.depth) return right.depth - left.depth;
    return left.path.join(" / ").localeCompare(right.path.join(" / "));
  });

  const best = matches[0];
  return best.score >= minimumScore ? best.folder : null;
}

function collectMatchingFolders_(folder, candidates, pathSegments, matches) {
  const currentPath = pathSegments.concat([folder.getName()]);
  const folderName = folder.getName();
  const folderScore = scoreNameMatch_(folderName, candidates);
  const pathScore = scoreNameMatch_(currentPath.join(" "), candidates);
  const score = Math.max(folderScore * 3, pathScore, 0);

  if (score > 0) {
    matches.push({
      folder: folder,
      path: currentPath,
      score: score,
      depth: currentPath.length,
    });
  }

  const childFolders = folder.getFolders();
  while (childFolders.hasNext()) {
    collectMatchingFolders_(childFolders.next(), candidates, currentPath, matches);
  }
}

function findBestChildFolder_(parent, candidates, label, minimumScore) {
  const folders = parent.getFolders();
  let best = null;
  const available = [];

  while (folders.hasNext()) {
    const folder = folders.next();
    const folderName = folder.getName();
    available.push(folderName);
    const score = scoreNameMatch_(folderName, candidates);
    if (!best || score > best.score) {
      best = { folder: folder, score: score };
    }
  }

  if (!best || best.score < minimumScore) {
    throw new Error(
      "Could not find matching " +
        label +
        " folder under " +
        parent.getName() +
        ". Available folders: " +
        available.join(", ")
    );
  }

  return best.folder;
}

function scoreNameMatch_(name, candidates) {
  let bestScore = 0;
  const nameKey = normalizeMatchText_(name);
  for (let index = 0; index < candidates.length; index += 1) {
    const candidateKey = normalizeMatchText_(candidates[index]);
    if (!nameKey || !candidateKey) continue;

    if (nameKey === candidateKey) bestScore = Math.max(bestScore, 100);
    else if (nameKey.indexOf(candidateKey) !== -1 || candidateKey.indexOf(nameKey) !== -1) {
      bestScore = Math.max(bestScore, 80);
    } else {
      bestScore = Math.max(bestScore, tokenOverlapScore_(nameKey, candidateKey));
    }
  }
  return bestScore;
}

function normalizeMatchText_(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\b(bank|banks|branch|branches|Ø¨Ù†Ùƒ|Ù…ØµØ±Ù)\b/g, " ")
    .replace(/[^a-z0-9\u0600-\u06ff]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenOverlapScore_(left, right) {
  const leftTokens = left.split(" ").filter(Boolean);
  const rightTokens = right.split(" ").filter(Boolean);
  if (!leftTokens.length || !rightTokens.length) return 0;

  let matches = 0;
  for (let leftIndex = 0; leftIndex < leftTokens.length; leftIndex += 1) {
    for (let rightIndex = 0; rightIndex < rightTokens.length; rightIndex += 1) {
      if (leftTokens[leftIndex] === rightTokens[rightIndex]) {
        matches += 1;
        break;
      }
    }
  }

  return Math.round((matches / Math.max(leftTokens.length, rightTokens.length)) * 70);
}

function resolveMasterSpreadsheet_(folder, currencyName, selectedDate, fileName) {
  const cacheKey = masterCacheKey_(folder.getId(), currencyName, selectedDate.getFullYear());
  const cachedId = getCachedMasterSpreadsheetId_(cacheKey);
  if (cachedId) {
    try {
      const cachedFile = DriveApp.getFileById(cachedId);
      const cachedFolder = findFolderContainingFile_(folder, cachedFile.getId()) || folder;
      if (!isSpreadsheetLikeFile_(cachedFile)) throw new Error("Cached master file is not a spreadsheet.");
      const opened = openSpreadsheetCandidate_(cachedFile, cachedFolder);
      if (opened.cacheId !== cachedId) {
        setCachedMasterSpreadsheetId_(cacheKey, opened.cacheId);
      }
      return {
        spreadsheet: opened.spreadsheet,
        folder: cachedFolder,
        path: buildFolderPath_(cachedFolder),
        source: "cache",
      };
    } catch (error) {
      clearCachedMasterSpreadsheetId_(cacheKey);
    }
  }

  const detected = detectBestSpreadsheet_(
    folder,
    buildBankFolderCandidates_(folder.getName(), fileName),
    [String(selectedDate.getFullYear())].concat(extractYears_(fileName)),
    buildCurrencyCandidates_(currencyName, fileName)
  );
  const opened = openSpreadsheetCandidate_(detected.file, detected.folder);
  setCachedMasterSpreadsheetId_(cacheKey, opened.cacheId);
  return {
    spreadsheet: opened.spreadsheet,
    folder: detected.folder,
    path: detected.path,
    source: "detected",
  };
}

function detectBestSpreadsheet_(folder, bankCandidates, yearCandidates, currencyCandidates) {
  const candidates = [];
  collectSpreadsheetCandidates_(folder, [], candidates, bankCandidates, yearCandidates, currencyCandidates);
  if (!candidates.length) {
    throw new Error("No spreadsheet master file was found in " + folder.getName() + ".");
  }

  candidates.sort(function (left, right) {
    if (right.score !== left.score) return right.score - left.score;
    return right.size - left.size;
  });

  return candidates[0];
}

function collectSpreadsheetCandidates_(folder, pathSegments, candidates, bankCandidates, yearCandidates, currencyCandidates) {
  const currentPath = pathSegments.concat([folder.getName()]);
  const files = folder.getFiles();
  while (files.hasNext()) {
    const file = files.next();
    if (!isSpreadsheetLikeFile_(file)) continue;
    const size = file.getSize() || 0;
    const pathText = normalizeMatchText_(currentPath.join(" "));
    const fileText = normalizeMatchText_(file.getName());
    const bankScore = Math.max(
      scoreNameMatch_(pathText, bankCandidates),
      scoreNameMatch_(fileText, bankCandidates)
    );
    const yearScore = Math.max(
      scoreNameMatch_(pathText, yearCandidates),
      scoreNameMatch_(fileText, yearCandidates)
    );
    const currencyScore = Math.max(
      scoreNameMatch_(pathText, currencyCandidates),
      scoreNameMatch_(fileText, currencyCandidates)
    );

    candidates.push({
      file: file,
      fileId: file.getId(),
      folder: folder,
      path: currentPath,
      size: size,
      score: bankScore * 100000000 + currencyScore * 10000000 + yearScore * 5000000 + size,
    });
  }

  const childFolders = folder.getFolders();
  while (childFolders.hasNext()) {
    collectSpreadsheetCandidates_(childFolders.next(), currentPath, candidates, bankCandidates, yearCandidates, currencyCandidates);
  }
}

function buildCurrencyCandidates_(currencyName, fileName) {
  const candidates = [];
  addFolderCandidate_(candidates, currencyName);
  extractCurrencyHintsFromFileName_(fileName).forEach(function (hint) {
    addFolderCandidate_(candidates, hint);
  });
  return candidates;
}

function extractCurrencyHintsFromFileName_(fileName) {
  const fileText = normalizeMatchText_(fileName);
  if (!fileText) return [];

  const aliases = {
    usd: "USD",
    euro: "EURO",
    eur: "EURO",
    yuan: "Yuan",
    cny: "Yuan",
    aed: "AED",
    dirham: "AED",
    jod: "JOD",
    dinar: "JOD",
    inr: "INR",
    sar: "SAR",
    riyal: "SAR",
  };

  const matches = [];
  const words = fileText.split(" ");
  for (let index = 0; index < words.length; index += 1) {
    const word = words[index];
    if (aliases[word]) addFolderCandidate_(matches, aliases[word]);
  }

  return matches;
}

function openSpreadsheetCandidate_(file, folder) {
  if (file.getMimeType && file.getMimeType() === MimeType.GOOGLE_SHEETS) {
    return {
      spreadsheet: SpreadsheetApp.openById(file.getId()),
      cacheId: file.getId(),
    };
  }

  const existingConverted = findConvertedSpreadsheetCopy_(folder, file.getName());
  if (existingConverted) {
    return {
      spreadsheet: SpreadsheetApp.openById(existingConverted.getId()),
      cacheId: existingConverted.getId(),
    };
  }

  const convertedId = convertSpreadsheetFileToGoogleSheet_(file, folder);
  return {
    spreadsheet: SpreadsheetApp.openById(convertedId),
    cacheId: convertedId,
  };
}

function findConvertedSpreadsheetCopy_(folder, sourceName) {
  const targetName = normalizeComparable_(stripSpreadsheetExtension_(sourceName));
  const files = folder.getFilesByType(MimeType.GOOGLE_SHEETS);
  while (files.hasNext()) {
    const file = files.next();
    const candidateName = normalizeComparable_(file.getName());
    if (candidateName && candidateName === targetName) return file;
  }
  return null;
}

function stripSpreadsheetExtension_(value) {
  return String(value || "")
    .replace(/\.(xlsx|xlsm|xls|ods)$/i, "")
    .trim();
}

function convertSpreadsheetFileToGoogleSheet_(file, folder) {
  if (typeof Drive === "undefined" || !Drive.Files || !Drive.Files.copy) {
    throw new Error(
      "The selected master file is an Excel file. Enable the Advanced Drive service so the script can convert it to a Google Sheet."
    );
  }

  const convertedTitle = stripSpreadsheetExtension_(file.getName());
  const converted = Drive.Files.copy(
    {
      title: convertedTitle,
      mimeType: MimeType.GOOGLE_SHEETS,
      parents: [{ id: folder.getId() }],
    },
    file.getId()
  );

  return converted.id;
}

function isSpreadsheetLikeFile_(file) {
  const mimeType = String(file.getMimeType() || "");
  return (
    mimeType === MimeType.GOOGLE_SHEETS ||
    mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mimeType === "application/vnd.ms-excel" ||
    mimeType === "application/vnd.oasis.opendocument.spreadsheet"
  );
}

function findFolderContainingFile_(folder, fileId, pathSegments) {
  const currentPath = (pathSegments || []).concat([folder.getName()]);
  const files = folder.getFiles();
  while (files.hasNext()) {
    if (files.next().getId() === fileId) {
      return folder;
    }
  }

  const childFolders = folder.getFolders();
  while (childFolders.hasNext()) {
    const found = findFolderContainingFile_(childFolders.next(), fileId, currentPath);
    if (found) return found;
  }

  return null;
}

function buildFolderPath_(folder) {
  return folder ? [folder.getName()] : [];
}

function planUploadedTablesAppend_(spreadsheet, tables) {
  const table = selectLargestTable_(tables);
  const targetSheet = spreadsheet.getSheets()[0];
  const uploadTable = analyzeUploadedTable_(table.rows);
  const uploadHeaders = uploadTable.headers;
  const dataRows = uploadTable.dataRows;
  const masterHeaders = readMasterHeaders_(targetSheet, uploadHeaders.length);
  const columnPlan = buildColumnPlan_(masterHeaders, uploadHeaders);
  const mappedRows = mapUploadedRowsToMasterColumns_(dataRows, columnPlan);
  const normalizedRows = mappedRows.rows;
  if (!normalizedRows.length) throw new Error("No new workbook rows to append.");

  return {
    rows: normalizedRows,
    columnFormats: mappedRows.columnFormats,
    sheet: targetSheet,
    sheetName: targetSheet.getName(),
    tableName: table.name,
    headerRows: uploadTable.headerRows,
    targetHeaders: columnPlan.targetHeaders,
    addedHeaders: columnPlan.addedHeaders,
    requestNumberColumn: columnPlan.requestNumberColumn,
    uploadHeaders: columnPlan.uploadHeaders,
  };
}

function appendPlannedRowsToMaster_(plan) {
  ensureMasterHeaders_(plan.sheet, plan.targetHeaders);
  const targetRow = findFirstEmptyRow_(plan.sheet, plan.targetHeaders.length);
  plan.sheet.getRange(targetRow, 1, plan.rows.length, plan.rows[0].length).setValues(plan.rows);
  applyAppendedColumnFormats_(plan.sheet, targetRow, plan.rows.length, plan.columnFormats || []);

  return {
    appendedRows: plan.rows.length,
    sheetName: plan.sheetName,
    tableName: plan.tableName,
  };
}

function cleanUploadedRows_(rows) {
  return rows
    .filter(function (row) {
      return Array.isArray(row) && row.some(function (cell) { return String(cell || "").trim() !== ""; });
    })
    .map(function (row) {
      return row.map(function (cell) { return String(cell == null ? "" : cell).trim(); });
    });
}

function analyzeUploadedTable_(rows) {
  const cleanRows = cleanUploadedRows_(rows);
  if (cleanRows.length < 2) throw new Error("No new workbook rows to append.");

  const headerStart = findHeaderStartRow_(cleanRows);
  const headerEnd = findHeaderEndRow_(cleanRows, headerStart);
  const headers = mergeHeaderRows_(cleanRows.slice(headerStart, headerEnd + 1));
  const dataRows = cleanRows.slice(headerEnd + 1);
  if (!headers.some(function (header) { return String(header || "").trim() !== ""; })) {
    throw new Error("No workbook headers were found.");
  }
  if (!dataRows.length) throw new Error("No new workbook rows to append.");

  return {
    headers: headers,
    dataRows: dataRows,
    headerRows: headerEnd - headerStart + 1,
  };
}

function findHeaderStartRow_(rows) {
  const limit = Math.min(rows.length, 12);
  let bestIndex = -1;
  let bestScore = -1;

  for (let index = 0; index < limit; index += 1) {
    const knownHeaders = countKnownHeaders_(rows[index]);
    if (knownHeaders > 0) return index;
    const score = scoreHeaderRow_(rows[index]);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  }

  return Math.max(bestIndex, 0);
}

function findHeaderEndRow_(rows, headerStart) {
  let headerEnd = headerStart;
  const maxHeaderRows = Math.min(rows.length - 1, headerStart + 3);

  for (let index = headerStart + 1; index <= maxHeaderRows; index += 1) {
    const currentScore = scoreHeaderRow_(rows[index]);
    const currentLooksLikeHeader = currentScore >= 8 && countKnownHeaders_(rows[index]) > 0;
    if (!currentLooksLikeHeader) break;
    headerEnd = index;
  }

  return headerEnd;
}

function countKnownHeaders_(row) {
  let count = 0;
  for (let index = 0; index < row.length; index += 1) {
    if (isKnownUploadHeader_(row[index])) count += 1;
  }
  return count;
}

function scoreHeaderRow_(row) {
  let nonEmpty = 0;
  let textLike = 0;
  let knownHeaders = 0;

  for (let index = 0; index < row.length; index += 1) {
    const value = String(row[index] || "").trim();
    if (!value) continue;
    nonEmpty += 1;
    if (/[A-Za-z\u0600-\u06ff]/.test(value)) textLike += 1;
    if (canonicalHeader_(normalizeHeader_(value)) !== normalizeHeader_(value) || isKnownUploadHeader_(value)) {
      knownHeaders += 1;
    }
  }

  return nonEmpty + textLike + knownHeaders * 4;
}

function mergeHeaderRows_(headerRows) {
  const width = headerRows.reduce(function (max, row) {
    return Math.max(max, row.length);
  }, 0);
  const headers = [];

  for (let column = 0; column < width; column += 1) {
    const parts = [];
    for (let rowIndex = 0; rowIndex < headerRows.length; rowIndex += 1) {
      const value = String(headerRows[rowIndex][column] || "").trim();
      if (value && parts.indexOf(value) === -1) parts.push(value);
    }
    headers.push(parts.join(" / "));
  }

  return headers;
}

function isKnownUploadHeader_(value) {
  const normalized = normalizeHeader_(value);
  const canonical = canonicalHeader_(normalized);
  return [
    "request number",
    "currency type",
    "bank",
    "amount",
    "date",
    "currency",
    "correspondent bank",
    "registered amount",
  ].indexOf(canonical) !== -1;
}

function inferCurrencyFromTables_(tables) {
  const table = selectLargestTable_(tables);
  const uploadTable = analyzeUploadedTable_(table.rows);
  const currencyColumn = findCurrencyTypeColumn_(uploadTable.headers);
  if (currencyColumn < 0) return "";

  const counts = {};
  for (let rowIndex = 0; rowIndex < uploadTable.dataRows.length; rowIndex += 1) {
    const currency = normalizeCurrencyValue_(uploadTable.dataRows[rowIndex][currencyColumn]);
    if (!currency) continue;
    counts[currency] = (counts[currency] || 0) + 1;
  }

  let bestCurrency = "";
  let bestCount = 0;
  Object.keys(counts).forEach(function (currency) {
    if (counts[currency] > bestCount) {
      bestCurrency = currency;
      bestCount = counts[currency];
    }
  });
  return bestCurrency;
}

function inferCurrencyFromFileName_(fileName) {
  const text = normalizeMatchText_(fileName);
  if (!text) return "";

  const aliases = {
    usd: "USD",
    euro: "EURO",
    eur: "EURO",
    yuan: "Yuan",
    cny: "Yuan",
    aed: "AED",
    dirham: "AED",
    jod: "JOD",
    dinar: "JOD",
    inr: "INR",
    sar: "SAR",
    riyal: "SAR",
  };

  for (let index = 0; index < ALLOWED_SHEETS.length; index += 1) {
    const currency = ALLOWED_SHEETS[index];
    const normalizedCurrency = normalizeMatchText_(currency);
    if (normalizedCurrency && text.indexOf(normalizedCurrency) !== -1) {
      return currency;
    }
  }

  const words = text.split(" ");
  for (let index = 0; index < words.length; index += 1) {
    const word = words[index];
    if (aliases[word]) return aliases[word];
  }

  return "";
}

function inferBankFromTables_(tables) {
  const table = selectLargestTable_(tables);
  const uploadTable = analyzeUploadedTable_(table.rows);
  const bankColumn = findBankColumn_(uploadTable.headers);
  if (bankColumn < 0) return "";
  for (let rowIndex = 0; rowIndex < uploadTable.dataRows.length; rowIndex += 1) {
    const bank = String(uploadTable.dataRows[rowIndex][bankColumn] || "").trim();
    if (bank) return bank;
  }
  return "";
}

function readMasterHeaders_(sheet, minimumWidth) {
  const width = Math.max(sheet.getLastColumn(), minimumWidth, 1);
  if (sheet.getLastRow() < 1) return [];
  const sampleRows = sheet.getRange(1, 1, Math.min(sheet.getLastRow(), 10), width).getDisplayValues();
  try {
    return analyzeUploadedTable_(sampleRows).headers;
  } catch (error) {
    return sheet.getRange(1, 1, 1, width).getDisplayValues()[0].map(function (header) {
      return String(header || "").trim();
    });
  }
}

function buildColumnPlan_(masterHeaders, uploadHeaders) {
  const targetHeaders = masterHeaders.slice();
  const usedMasterColumns = {};
  const uploadToTarget = [];
  const addedHeaders = [];

  for (let uploadIndex = 0; uploadIndex < uploadHeaders.length; uploadIndex += 1) {
    const uploadHeader = String(uploadHeaders[uploadIndex] || "").trim();
    if (!uploadHeader) {
      uploadToTarget[uploadIndex] = -1;
      continue;
    }

    const match = findBestHeaderMatch_(uploadHeader, targetHeaders, usedMasterColumns);
    if (match.index >= 0) {
      uploadToTarget[uploadIndex] = match.index;
      usedMasterColumns[match.index] = true;
    } else {
      const targetIndex = targetHeaders.length;
      targetHeaders.push(uploadHeader);
      addedHeaders.push(uploadHeader);
      uploadToTarget[uploadIndex] = targetIndex;
      usedMasterColumns[targetIndex] = true;
    }
  }

  return {
    targetHeaders: targetHeaders,
    uploadHeaders: uploadHeaders.slice(),
    uploadToTarget: uploadToTarget,
    addedHeaders: addedHeaders,
    requestNumberColumn: findMappedRequestNumberColumn_(uploadHeaders, uploadToTarget),
  };
}

function findBestHeaderMatch_(uploadHeader, masterHeaders, usedMasterColumns) {
  let best = {
    index: -1,
    score: 0,
  };

  for (let index = 0; index < masterHeaders.length; index += 1) {
    if (usedMasterColumns[index]) continue;
    const masterHeader = String(masterHeaders[index] || "").trim();
    if (!masterHeader) continue;

    const score = scoreHeaderMatch_(uploadHeader, masterHeader);
    if (score > best.score) {
      best = {
        index: index,
        score: score,
      };
    }
  }

  return best.score >= 65 ? best : { index: -1, score: 0 };
}

function scoreHeaderMatch_(left, right) {
  const leftKey = normalizeHeader_(left);
  const rightKey = normalizeHeader_(right);
  if (!leftKey || !rightKey) return 0;
  if (leftKey === rightKey) return 100;
  if (canonicalHeader_(leftKey) === canonicalHeader_(rightKey)) return 95;
  if (leftKey.indexOf(rightKey) !== -1 || rightKey.indexOf(leftKey) !== -1) return 85;
  return tokenOverlapScore_(leftKey, rightKey);
}

function canonicalHeader_(value) {
  const normalized = String(value || "")
    .replace(/\b(no|num|number|id)\b/g, "number")
    .replace(/\b(req|request)\b/g, "request")
    .replace(/\b(ref|reference)\b/g, "reference")
    .replace(/\b(curr|currency)\b/g, "currency")
    .replace(/\b(correspondent|correspondance)\b/g, "correspondent")
    .replace(/\b(bank)\b/g, "bank")
    .replace(/\bamt\b/g, "amount")
    .replace(/\s+/g, " ")
    .trim();
  const alias = bilingualHeaderAlias_(normalized);
  return alias || normalized;
}

function bilingualHeaderAlias_(value) {
  const normalized = String(value || "").trim();
  const compact = normalized.replace(/\s+/g, "");
  const normalizedKey = normalizeAliasLookupKey_(normalized);
  if (/(^|[^a-z0-9])(3rd|third)\s*party\s*auditor([^a-z0-9]|$)/.test(normalized)) {
    return "external audit company";
  }
  if (/\buetr\b/.test(normalizedKey) && /\bswift\b/.test(normalizedKey)) {
    return "uetr from swift";
  }
  if (/(\bcheckpoint\b|\bborder\b)/.test(normalized) && /(\bcross\b|\bcustoms\b|\bfrontier\b)/.test(normalized)) {
    return "border checkpoint";
  }
  const aliases = {
    "request number": "request number",
    "request no": "request number",
    "request number number": "request number",
    "\u0631\u0642\u0645 \u0627\u0644\u0637\u0644\u0628": "request number",
    "\u0631\u0642\u0645\u0627\u0644\u0637\u0644\u0628": "request number",
    "\u0631\u0642\u0645 \u0627\u0644\u0643\u062a\u0627\u0628": "request number",
    "\u0631\u0642\u0645\u0627\u0644\u0643\u062a\u0627\u0628": "request number",
    "\u0631\u0642\u0645 \u0627\u0644\u0645\u0639\u0627\u0645\u0644\u0629": "request number",
    "\u0631\u0642\u0645 \u0627\u0644\u0645\u0639\u0627\u0645\u0644\u0647": "request number",
    "\u0631\u0642\u0645\u0627\u0644\u0645\u0639\u0627\u0645\u0644\u0629": "request number",
    "\u0631\u0642\u0645\u0627\u0644\u0645\u0639\u0627\u0645\u0644\u0647": "request number",
    "date": "date",
    "request date": "date",
    "\u062a\u0627\u0631\u064a\u062e": "date",
    "\u062a\u0627\u0631\u064a\u062e \u0627\u0644\u0645\u0634\u0627\u0631\u0643\u0629": "date",
    "\u062a\u0627\u0631\u064a\u062e\u0627\u0644\u0645\u0634\u0627\u0631\u0643\u0629": "date",
    "bank code": "bank code",
    "\u0631\u0645\u0632 \u0627\u0644\u0645\u0635\u0631\u0641": "bank code",
    "\u0631\u0645\u0632\u0627\u0644\u0645\u0635\u0631\u0641": "bank code",
    "bank": "bank",
    "bank name": "bank",
    "\u0627\u0633\u0645 \u0627\u0644\u0628\u0646\u0643": "bank",
    "\u0627\u0633\u0645\u0627\u0644\u0628\u0646\u0643": "bank",
    "\u0627\u0633\u0645 \u0627\u0644\u0645\u0635\u0631\u0641": "bank",
    "\u0627\u0633\u0645\u0627\u0644\u0645\u0635\u0631\u0641": "bank",
    "type of wire transfer": "type of wire transfer",
    "\u0646\u0648\u0639 \u0627\u0644\u062d\u0648\u0627\u0644\u0629 \u0627\u0644\u0645\u0635\u0631\u0641\u064a\u0629": "type of wire transfer",
    "\u0646\u0648\u0639\u0627\u0644\u062d\u0648\u0627\u0644\u0629\u0627\u0644\u0645\u0635\u0631\u0641\u064a\u0629": "type of wire transfer",
    "amount": "amount",
    "\u0627\u0644\u0645\u0628\u0644\u063a": "amount",
    "\u0645\u0628\u0644\u063a": "amount",
    "requested amount in numbers": "requested amount in numbers",
    "\u0645\u0637\u0644\u0648\u0628 \u0627\u0644\u0645\u0628\u0644\u063a \u0631\u0642\u0645\u0627": "requested amount in numbers",
    "\u0645\u0637\u0644\u0648\u0628\u0627\u0644\u0645\u0628\u0644\u063a \u0631\u0642\u0645\u0627": "requested amount in numbers",
    "awarded amount in numbers": "awarded amount in numbers",
    "\u0627\u0644\u0645\u0628\u0644\u063a \u0631\u0642\u0645\u0627": "awarded amount in numbers",
    "\u0627\u0644\u0645\u0628\u0644\u063a\u0631\u0642\u0645\u0627": "awarded amount in numbers",
    "balance": "balance",
    "\u062a\u0648\u0627\u0632\u0646": "balance",
    "currency": "currency",
    "currency type": "currency type",
    "type of currency": "currency type",
    "\u0627\u0644\u0639\u0645\u0644\u0629": "currency",
    "\u0627\u0644\u0639\u0645\u0644\u0647": "currency",
    "\u0639\u0645\u0644\u0629": "currency",
    "\u0639\u0645\u0644\u0647": "currency",
    "\u0646\u0648\u0639 \u0627\u0644\u0639\u0645\u0644\u0629": "currency type",
    "\u0646\u0648\u0639\u0627\u0644\u0639\u0645\u0644\u0629": "currency type",
    "\u0646\u0648\u0639 \u0627\u0644\u0639\u0645\u0644\u0647": "currency type",
    "\u0646\u0648\u0639\u0627\u0644\u0639\u0645\u0644\u0647": "currency type",
    "rtgs transaction reference": "rtgs transaction",
    "transaction date on rtgs": "rtgs transaction",
    "\u062a\u0627\u0631\u064a\u062e \u062d\u0631\u0643\u0629 \u0627\u0644\u0625\u064a\u062f\u0627\u0639 \u0639\u0644\u0649 \u0646\u0638\u0627\u0645 \u0627\u0644 rtgs": "rtgs transaction",
    "\u062a\u0627\u0631\u064a\u062e \u062d\u0631\u0643\u0629 \u0627\u0644\u0627\u064a\u062f\u0627\u0639 \u0639\u0644\u0649 \u0646\u0638\u0627\u0645 \u0627\u0644 rtgs": "rtgs transaction",
    "\u062a\u0627\u0631\u064a\u062e \u062d\u0631\u0643\u0629 \u0627\u0644\u0625\u064a\u062f\u0627\u0639 \u0639\u0644\u0649 \u0646\u0638\u0627\u0645 \u0627\u0644rtgs": "rtgs transaction",
    "\u062a\u0627\u0631\u064a\u062e \u062d\u0631\u0643\u0629 \u0627\u0644\u0627\u064a\u062f\u0627\u0639 \u0639\u0644\u0649 \u0646\u0638\u0627\u0645 \u0627\u0644rtgs": "rtgs transaction",
    "correspondent bank": "correspondent bank",
    "correspondent bank name": "correspondent bank",
    "\u0627\u0644\u0628\u0646\u0643 \u0627\u0644\u0645\u0631\u0627\u0633\u0644": "correspondent bank",
    "\u0627\u0644\u0628\u0646\u0643\u0627\u0644\u0645\u0631\u0627\u0633\u0644": "correspondent bank",
    "\u0627\u0644\u0645\u0635\u0631\u0641 \u0627\u0644\u0645\u0631\u0627\u0633\u0644": "correspondent bank",
    "\u0627\u0644\u0645\u0635\u0631\u0641\u0627\u0644\u0645\u0631\u0627\u0633\u0644": "correspondent bank",
    "intermediary bank name": "intermediary bank name",
    "\u0627\u0633\u0645 \u0627\u0644\u0645\u0635\u0631\u0641 \u0627\u0644\u0648\u0633\u064a\u0637 \u0627\u0644\u0631\u0633\u0645\u064a \u0628\u0627\u0644\u0644\u063a\u0629 \u0627\u0644\u0625\u0646\u062c\u0644\u064a\u0632\u064a\u0629": "intermediary bank name",
    "\u0627\u0633\u0645\u0627\u0644\u0645\u0635\u0631\u0641\u0627\u0644\u0648\u0633\u064a\u0637\u0627\u0644\u0631\u0633\u0645\u064a\u0628\u0627\u0644\u0644\u063a\u0629\u0627\u0644\u0625\u0646\u062c\u0644\u064a\u0632\u064a\u0629": "intermediary bank name",
    "intermediary bank country": "intermediary bank country",
    "\u062f\u0648\u0644\u0629 \u0627\u0644\u0645\u0635\u0631\u0641 \u0627\u0644\u0648\u0633\u064a\u0637": "intermediary bank country",
    "\u062f\u0648\u0644\u0629\u0627\u0644\u0645\u0635\u0631\u0641\u0627\u0644\u0648\u0633\u064a\u0637": "intermediary bank country",
    "intermediary iban no.": "intermediary iban no",
    "intermediary iban no": "intermediary iban no",
    "\u0631\u0642\u0645 \u0627\u0644\u0627\u064a\u0628\u0627\u0646 \u0627\u0644\u062e\u0627\u0635 \u0628\u0627\u0644\u0645\u0635\u0631\u0641 \u0627\u0644\u0648\u0633\u064a\u0637": "intermediary iban no",
    "\u0631\u0642\u0645\u0627\u0644\u0627\u064a\u0628\u0627\u0646\u0627\u0644\u062e\u0627\u0635\u0628\u0627\u0644\u0645\u0635\u0631\u0641\u0627\u0644\u0648\u0633\u064a\u0637": "intermediary iban no",
    "intermediary bank swift code": "intermediary bank swift code",
    "\u0631\u0645\u0632 \u0627\u0644\u0633\u0648\u064a\u0641\u062a \u0627\u0644\u062e\u0627\u0635 \u0628\u0627\u0644\u0645\u0635\u0631\u0641 \u0627\u0644\u0648\u0633\u064a\u0637": "intermediary bank swift code",
    "\u0631\u0645\u0632\u0627\u0644\u0633\u0648\u064a\u0641\u062a\u0627\u0644\u062e\u0627\u0635\u0628\u0627\u0644\u0645\u0635\u0631\u0641\u0627\u0644\u0648\u0633\u064a\u0637": "intermediary bank swift code",
    "correspondent bank iban no.": "correspondent bank iban no",
    "correspondent bank iban no": "correspondent bank iban no",
    "\u0631\u0642\u0645 \u0627\u0644\u0627\u064a\u0628\u0627\u0646 \u0627\u0644\u062e\u0627\u0635 \u0628\u0627\u0644\u0645\u0635\u0631\u0641 \u0627\u0644\u0645\u0631\u0627\u0633\u0644": "correspondent bank iban no",
    "\u0631\u0642\u0645\u0627\u0644\u0627\u064a\u0628\u0627\u0646\u0627\u0644\u062e\u0627\u0635\u0628\u0627\u0644\u0645\u0635\u0631\u0641\u0627\u0644\u0645\u0631\u0627\u0633\u0644": "correspondent bank iban no",
    "correspondent swift code": "correspondent swift code",
    "correspondent bank swift code": "correspondent swift code",
    "\u0631\u0645\u0632 \u0627\u0644\u0633\u0648\u064a\u0641\u062a \u0627\u0644\u062e\u0627\u0635 \u0628\u0627\u0644\u0645\u0635\u0631\u0641 \u0627\u0644\u0645\u0631\u0627\u0633\u0644": "correspondent swift code",
    "\u0631\u0645\u0632\u0627\u0644\u0633\u0648\u064a\u0641\u062a\u0627\u0644\u062e\u0627\u0635\u0628\u0627\u0644\u0645\u0635\u0631\u0641\u0627\u0644\u0645\u0631\u0627\u0633\u0644": "correspondent swift code",
    "correspondent bank country": "correspondent bank country",
    "\u062f\u0648\u0644\u0629 \u0627\u0644\u0645\u0635\u0631\u0641 \u0627\u0644\u0645\u0631\u0627\u0633\u0644": "correspondent bank country",
    "\u062f\u0648\u0644\u0629\u0627\u0644\u0645\u0635\u0631\u0641\u0627\u0644\u0645\u0631\u0627\u0633\u0644": "correspondent bank country",
    "registered amount": "registered amount",
    "\u0627\u0644\u0645\u0628\u0644\u063a \u0627\u0644\u0645\u0633\u062c\u0644": "registered amount",
    "\u0627\u0644\u0645\u0628\u0644\u063a\u0627\u0644\u0645\u0633\u062c\u0644": "registered amount",
    "commercial company name in arabic": "commercial company name in arabic",
    "\u0627\u0644\u0627\u0633\u0645 \u0628\u0627\u0644\u0639\u0631\u0628\u064a": "commercial company name in arabic",
    "\u0627\u0644\u0627\u0633\u0645\u0628\u0627\u0644\u0639\u0631\u0628\u064a": "commercial company name in arabic",
    "commercial company name in english": "commercial company name in english",
    "\u0627\u0644\u0627\u0633\u0645 \u0628\u0627\u0644\u0627\u0646\u062c\u0644\u064a\u0632\u064a": "commercial company name in english",
    "\u0627\u0644\u0627\u0633\u0645\u0628\u0627\u0644\u0627\u0646\u062c\u0644\u064a\u0632\u064a": "commercial company name in english",
    "commercial company account number iban number": "commercial company account number iban number",
    "commercial company account number": "commercial company account number iban number",
    "\u0631\u0642\u0645 \u062d\u0633\u0627\u0628 \u0637\u0627\u0644\u0628 \u0627\u0644\u062a\u062d\u0648\u064a\u0644 \u0631\u0642\u0645 \u0627\u0644\u0627\u064a\u0628\u0627\u0646": "commercial company account number iban number",
    "\u0631\u0642\u0645\u062d\u0633\u0627\u0628\u0637\u0627\u0644\u0628\u0627\u0644\u062a\u062d\u0648\u064a\u0644\u0631\u0642\u0645\u0627\u0644\u0627\u064a\u0628\u0627\u0646": "commercial company account number iban number",
    "director name in arabic": "director name in arabic",
    "\u0627\u0633\u0645 \u0627\u0644\u0645\u062f\u064a\u0631 \u0627\u0644\u0645\u0641\u0648\u0636 \u0628\u0627\u0644\u0639\u0631\u0628\u064a": "director name in arabic",
    "\u0627\u0633\u0645\u0627\u0644\u0645\u062f\u064a\u0631\u0627\u0644\u0645\u0641\u0648\u0636\u0628\u0627\u0644\u0639\u0631\u0628\u064a": "director name in arabic",
    "director name in english": "director name in english",
    "\u0627\u0633\u0645 \u0627\u0644\u0645\u062f\u064a\u0631 \u0627\u0644\u0645\u0641\u0648\u0636 \u0628\u0627\u0644\u0627\u0646\u062c\u0644\u064a\u0632\u064a": "director name in english",
    "\u0627\u0633\u0645\u0627\u0644\u0645\u062f\u064a\u0631\u0627\u0644\u0645\u0641\u0648\u0636\u0628\u0627\u0644\u0627\u0646\u062c\u0644\u064a\u0632\u064a": "director name in english",
    "company establishment number": "company establishment number",
    "\u0631\u0642\u0645 \u0634\u0647\u0627\u062f\u0629 \u0627\u0644\u062a\u0623\u0633\u064a\u0633": "company establishment number",
    "\u0631\u0642\u0645\u0634\u0647\u0627\u062f\u0629\u0627\u0644\u062a\u0623\u0633\u064a\u0633": "company establishment number",
    "issuance date of establishment certificate": "issuance date of establishment certificate",
    "\u062a\u0627\u0631\u064a\u062e \u0627\u0635\u062f\u0627\u0631 \u0634\u0647\u0627\u062f\u0629 \u0627\u0644\u062a\u0623\u0633\u064a\u0633": "issuance date of establishment certificate",
    "\u062a\u0627\u0631\u064a\u062e\u0627\u0635\u062f\u0627\u0631\u0634\u0647\u0627\u062f\u0629\u0627\u0644\u062a\u0623\u0633\u064a\u0633": "issuance date of establishment certificate",
    "purpose of transfer": "purpose of transfer",
    "\u0627\u0644\u063a\u0631\u0636 \u0645\u0646 \u0627\u0644\u062a\u062d\u0648\u064a\u0644": "purpose of transfer",
    "\u0627\u0644\u063a\u0631\u0636\u0645\u0646\u0627\u0644\u062a\u062d\u0648\u064a\u0644": "purpose of transfer",
    "type of financing": "type of financing",
    "\u0646\u0648\u0639 \u0627\u0644\u062a\u0645\u0648\u064a\u0644": "type of financing",
    "\u0646\u0648\u0639\u0627\u0644\u062a\u0645\u0648\u064a\u0644": "type of financing",
    "final beneficiary contact details": "final beneficiary contact details",
    "final beneficiary website": "final beneficiary website",
    "final beneficiary type of goods and /or services which final beneficiary provides": "final beneficiary type of goods and /or services which final beneficiary provides",
    "number of replenishment": "number of replenishment",
    "date of replenishment": "date of replenishment",
    "client account opening date": "client account opening date",
    "clinet account opening date": "client account opening date",
    "date of funds deposit": "date of funds deposit",
    "company hq governorate": "company hq governorate",
    "\u0627\u0644\u0645\u0646\u0641\u0630 \u0627\u0644\u062d\u062f\u0648\u062f\u064a": "border checkpoint",
    "\u0627\u0644\u0645\u0646\u0641\u0630\u0627\u0644\u062d\u062f\u0648\u062f\u064a": "border checkpoint",
    "cross boarder checkpoint": "border checkpoint",
    "cross border checkpoint": "border checkpoint",
    "cross-boarder checkpoint": "border checkpoint",
    "cross-border checkpoint": "border checkpoint",
    "3rd party auditor": "external audit company",
    "third party auditor": "external audit company",
    "3rd party auditor uetr from swift": "uetr from swift",
    "third party auditor uetr from swift": "uetr from swift",
    "uetr from swift": "uetr from swift",
    "uetr swift": "uetr from swift",
    "uetr from swift code": "uetr from swift",
    "\u0634\u0631\u0643\u0629 \u0627\u0644\u062a\u062f\u0642\u064a\u0642 \u0627\u0644\u062f\u0648\u0644\u064a\u0629": "external audit company",
    "\u0634\u0631\u0643\u0629 \u0627\u0644\u062a\u062f\u0642\u064a\u0642 \u0627\u0644\u062f\u0648\u0644\u064a\u0629": "external audit company",
    "\u0634\u0631\u0643\u0647 \u0627\u0644\u062a\u062f\u0642\u064a\u0642 \u0627\u0644\u062f\u0648\u0644\u064a\u0647": "external audit company",
    "\u0634\u0631\u0643\u0629 \u0627\u0644\u062a\u062f\u0642\u064a\u0642 \u0627\u0644\u062e\u0627\u0631\u062c\u064a": "external audit company",
    "\u0634\u0631\u0643\u0629 \u0627\u0644\u062a\u062f\u0642\u064a\u0642 \u0627\u0644\u062e\u0627\u0631\u062c\u064a uetr \u064a\u0648\u0646\u064a\u0643 \u062e\u0627\u0635 \u0628\u0646\u0638\u0627\u0645 \u0627\u0644\u0633\u0648\u064a\u0641\u062a": "uetr from swift",
    "\u0634\u0631\u0643\u0647 \u0627\u0644\u062a\u062f\u0642\u064a\u0642 \u0627\u0644\u062e\u0627\u0631\u062c\u064a": "external audit company",
    "\u0627\u0644\u0628\u064a\u0627\u0646 \u0627\u0644\u0643\u0645\u0643\u0631\u064a": "customs declaration",
    "\u062a\u0627\u0631\u064a\u062e \u0627\u0644\u0628\u064a\u0627\u0646 \u0627\u0644\u0643\u0645\u0643\u0631\u064a": "customs declaration date",
    "uetr": "uetr",
    "uetr يونيك خاص بنظام السويفت": "uetr from swift",
    "main brand or per invoice or service name": "main brand or per invoice or service name",
    "price per unit": "price per unit",
    "headquarter commercial company address": "headquarter commercial company address",
    "name/s of shareholders more then 20%": "shareholders more than 20%",
    "commercial company contact details": "commercial company contact details",
    "annual revenue in iqd for commercial company": "annual revenue in iqd for commercial company",
    "final beneficiary website": "final beneficiary website",
    "final beneficiary type of goods and /or services which final beneficiary provides": "final beneficiary type of goods and /or services which final beneficiary provides",
    "final beneficiary name in arabic": "final beneficiary name in arabic",
    "\u0627\u0633\u0645 \u0627\u0644\u0645\u0633\u062a\u0641\u064a\u062f \u0627\u0644\u0646\u0647\u0627\u0626\u064a \u0628\u0627\u0644\u0639\u0631\u0628\u064a": "final beneficiary name in arabic",
    "\u0627\u0633\u0645\u0627\u0644\u0645\u0633\u062a\u0641\u064a\u062f\u0627\u0644\u0646\u0647\u0627\u0626\u064a\u0628\u0627\u0644\u0639\u0631\u0628\u064a": "final beneficiary name in arabic",
    "final beneficiary name in english": "final beneficiary name in english",
    "\u0627\u0633\u0645 \u0627\u0644\u0645\u0633\u062a\u0641\u064a\u062f \u0627\u0644\u0646\u0647\u0627\u0626\u064a \u0628\u0627\u0644\u0627\u0646\u062c\u0644\u064a\u0632\u064a": "final beneficiary name in english",
    "\u0627\u0633\u0645\u0627\u0644\u0645\u0633\u062a\u0641\u064a\u062f\u0627\u0644\u0646\u0647\u0627\u0626\u064a\u0628\u0627\u0644\u0627\u0646\u062c\u0644\u064a\u0632\u064a": "final beneficiary name in english",
    "final beneficiary country": "final beneficiary country",
    "\u062f\u0648\u0644\u0629 \u0627\u0644\u0645\u0633\u062a\u0641\u064a\u062f \u0627\u0644\u0646\u0647\u0627\u0626\u064a": "final beneficiary country",
    "\u062f\u0648\u0644\u0629\u0627\u0644\u0645\u0633\u062a\u0641\u064a\u062f\u0627\u0644\u0646\u0647\u0627\u0626\u064a": "final beneficiary country",
    "final beneficiary detailed address": "final beneficiary detailed address",
    "\u0639\u0646\u0648\u0627\u0646 \u0627\u0644\u0645\u0633\u062a\u0641\u064a\u062f \u0627\u0644\u0646\u0647\u0627\u0626\u064a \u0627\u0644\u062a\u0641\u0635\u064a\u0644\u064a": "final beneficiary detailed address",
    "\u0639\u0646\u0648\u0627\u0646\u0627\u0644\u0645\u0633\u062a\u0641\u064a\u062f\u0627\u0644\u0646\u0647\u0627\u0626\u064a\u0627\u0644\u062a\u0641\u0635\u064a\u0644\u064a": "final beneficiary detailed address",
    "final beneficiary bank name": "final beneficiary bank name",
    "\u0627\u0633\u0645 \u0645\u0635\u0631\u0641 \u0627\u0644\u0645\u0633\u062a\u0641\u064a\u062f \u0627\u0644\u0646\u0647\u0627\u0626\u064a": "final beneficiary bank name",
    "\u0627\u0633\u0645\u0645\u0635\u0631\u0641\u0627\u0644\u0645\u0633\u062a\u0641\u064a\u062f\u0627\u0644\u0646\u0647\u0627\u0626\u064a": "final beneficiary bank name",
    "final beneficiary iban no": "final beneficiary iban no",
    "final beneficiary iban number": "final beneficiary iban no",
    "\u0631\u0642\u0645 \u0627\u0644\u0627\u064a\u0628\u0627\u0646 \u0644\u0644\u0645\u0633\u062a\u0641\u064a\u062f \u0627\u0644\u0646\u0647\u0627\u0626\u064a": "final beneficiary iban no",
    "\u0631\u0642\u0645\u0627\u0644\u0627\u064a\u0628\u0627\u0646\u0644\u0644\u0645\u0633\u062a\u0641\u064a\u062f\u0627\u0644\u0646\u0647\u0627\u0626\u064a": "final beneficiary iban no",
    "final beneficiary bank swift code": "final beneficiary bank swift code",
    "\u0631\u0645\u0632 \u0627\u0644\u0633\u0648\u064a\u0641\u062a \u0627\u0644\u062e\u0627\u0635 \u0628\u0645\u0635\u0631\u0641 \u0627\u0644\u0645\u0633\u062a\u0641\u064a\u062f \u0627\u0644\u0646\u0647\u0627\u0626\u064a": "final beneficiary bank swift code",
    "\u0631\u0645\u0632\u0627\u0644\u0633\u0648\u064a\u0641\u062a\u0627\u0644\u062e\u0627\u0635\u0628\u0645\u0635\u0631\u0641\u0627\u0644\u0645\u0633\u062a\u0641\u064a\u062f\u0627\u0644\u0646\u0647\u0627\u0626\u064a": "final beneficiary bank swift code",
  };
  return aliases[normalizedKey] || aliases[normalized] || aliases[compact] || "";
}

function normalizeAliasLookupKey_(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[\u0625\u0623\u0622\u0627]/g, "\u0627")
    .replace(/[\u0649]/g, "\u064a")
    .replace(/[\u0629]/g, "\u0647")
    .replace(/[^a-z0-9\u0600-\u06ff]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function findMappedRequestNumberColumn_(uploadHeaders, uploadToTarget) {
  const uploadRequestColumn = findRequestNumberColumn_(uploadHeaders);
  return uploadRequestColumn >= 0 ? uploadToTarget[uploadRequestColumn] : -1;
}

function mapUploadedRowsToMasterColumns_(rows, columnPlan) {
  const mappedRows = [];
  const columnFormats = new Array(columnPlan.targetHeaders.length).fill("");
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const mapped = new Array(columnPlan.targetHeaders.length).fill("");
    for (let uploadIndex = 0; uploadIndex < rows[rowIndex].length; uploadIndex += 1) {
      const targetIndex = columnPlan.uploadToTarget[uploadIndex];
      if (targetIndex < 0) continue;
      const uploadHeader = String(columnPlan.uploadHeaders[uploadIndex] || "").trim();
      const targetHeader = String(columnPlan.targetHeaders[targetIndex] || "").trim();
      const normalizedCell = normalizeUploadedCell_(rows[rowIndex][uploadIndex], uploadHeader, targetHeader);
      mapped[targetIndex] = normalizedCell.value;
      if (normalizedCell.format && !columnFormats[targetIndex]) {
        columnFormats[targetIndex] = normalizedCell.format;
      } else if (normalizedCell.format === "d mmm yyyy hh:mm AM/PM") {
        columnFormats[targetIndex] = normalizedCell.format;
      }
    }
    if (mapped.some(function (cell) { return cell !== ""; })) mappedRows.push(mapped);
  }
  return {
    rows: mappedRows,
    columnFormats: columnFormats,
  };
}

function normalizeUploadedCell_(value, uploadHeader, targetHeader) {
  const rawText = String(value == null ? "" : value).trim();
  if (!rawText) {
    return {
      value: "",
      format: "",
    };
  }

  if (!isDateLikeHeader_(uploadHeader, targetHeader)) {
    return {
      value: rawText,
      format: "",
    };
  }

  const parsed = parseUploadedDateValue_(value);
  if (!parsed) {
    return {
      value: rawText,
      format: "",
    };
  }

  return {
    value: parsed.date,
    format: parsed.hasTime ? "d mmm yyyy hh:mm AM/PM" : "d mmm yyyy",
  };
}

function isDateLikeHeader_(uploadHeader, targetHeader) {
  const normalizedUpload = normalizeHeader_(uploadHeader);
  const normalizedTarget = normalizeHeader_(targetHeader);
  if (!normalizedUpload && !normalizedTarget) return false;

  const targetLooksLikeDate =
    /\bdate\b/.test(normalizedTarget) ||
    /\btime\b/.test(normalizedTarget) ||
    (/\bissuance\b/.test(normalizedTarget) && /\bcertificate\b/.test(normalizedTarget));
  if (targetLooksLikeDate) return true;

  const targetLooksLikeReference =
    /\bref(erence)?\b/.test(normalizedTarget) ||
    /\bnumber\b/.test(normalizedTarget) ||
    /\bid\b/.test(normalizedTarget);
  if (targetLooksLikeReference) return false;

  const uploadLooksLikeDate =
    /\bdate\b/.test(normalizedUpload) ||
    /\btime\b/.test(normalizedUpload) ||
    (/\bissuance\b/.test(normalizedUpload) && /\bcertificate\b/.test(normalizedUpload));
  if (uploadLooksLikeDate) return true;

  return false;
}

function parseUploadedDateValue_(value) {
  if (value instanceof Date && !isNaN(value.getTime())) {
    return {
      date: value,
      hasTime: !isMidnight_(value),
    };
  }

  const rawText = String(value == null ? "" : value).trim();
  if (!rawText) return null;

  if (typeof value === "number" && isFinite(value)) {
    return excelSerialDateTime_(value);
  }

  if (/^-?\d+(?:\.\d+)?$/.test(rawText)) {
    const serialValue = Number(rawText);
    if (serialValue > 20000 && serialValue < 80000) {
      return excelSerialDateTime_(serialValue);
    }
  }

  const parsedDate = new Date(rawText);
  if (!isNaN(parsedDate.getTime())) {
    return {
      date: parsedDate,
      hasTime: !isMidnight_(parsedDate),
    };
  }

  const sheetDate = parseSheetDate_(rawText);
  if (sheetDate) {
    return {
      date: sheetDate,
      hasTime: false,
    };
  }

  return null;
}

function excelSerialDateTime_(serialValue) {
  const wholeDays = Math.floor(serialValue);
  const milliseconds = Math.round((serialValue - wholeDays) * 86400000);
  const utcDate = new Date(Date.UTC(1899, 11, 30) + wholeDays * 86400000 + milliseconds);
  return {
    date: utcDate,
    hasTime: milliseconds !== 0,
  };
}

function isMidnight_(date) {
  return (
    date.getHours() === 0 &&
    date.getMinutes() === 0 &&
    date.getSeconds() === 0 &&
    date.getMilliseconds() === 0
  );
}

function applyAppendedColumnFormats_(sheet, startRow, rowCount, columnFormats) {
  for (let columnIndex = 0; columnIndex < columnFormats.length; columnIndex += 1) {
    const format = String(columnFormats[columnIndex] || "").trim();
    if (!format) continue;
    sheet.getRange(startRow, columnIndex + 1, rowCount, 1).setNumberFormat(format);
  }
}

function ensureMasterHeaders_(sheet, targetHeaders) {
  if (!targetHeaders.length) return;
  sheet.getRange(1, 1, 1, targetHeaders.length).setValues([targetHeaders]);
}

function assertUniqueRequestNumbers_(appendPlan, spreadsheet) {
  if (appendPlan.requestNumberColumn < 0) {
    throw new Error("Request Number column was not found in uploaded workbook.");
  }

  const uploadNumbers = [];
  const uploadSeen = {};
  for (let rowIndex = 0; rowIndex < appendPlan.rows.length; rowIndex += 1) {
    const requestNumber = normalizeRequestNumber_(appendPlan.rows[rowIndex][appendPlan.requestNumberColumn]);
    if (!requestNumber) continue;
    if (uploadSeen[requestNumber]) {
      throw new Error(
        "Duplicate Request Number in uploaded workbook: " + appendPlan.rows[rowIndex][appendPlan.requestNumberColumn]
      );
    }
    uploadSeen[requestNumber] = true;
    uploadNumbers.push({
      key: requestNumber,
      value: String(appendPlan.rows[rowIndex][appendPlan.requestNumberColumn] || "").trim(),
    });
  }

  if (!uploadNumbers.length) {
    throw new Error("No Request Number values were found in uploaded workbook.");
  }

  const masterDuplicates = findMasterRequestNumberDuplicates_(spreadsheet, uploadNumbers);
  if (masterDuplicates.length) {
    const error = new Error(
      "Duplicate Request Number already exists in master sheet: " +
        masterDuplicates
          .slice(0, 10)
          .map(function (duplicate) {
            return duplicate.value + " (" + duplicate.sheetName + " row " + duplicate.row + ")";
          })
          .join(", ")
    );
    error.code = "duplicate_request_number";
    error.details = {
      source: "master",
      duplicates: masterDuplicates,
    };
    throw error;
  }
}

function findMasterRequestNumberDuplicates_(spreadsheet, uploadNumbers) {
  const lookup = {};
  uploadNumbers.forEach(function (entry) {
    lookup[entry.key] = entry.value;
  });

  const duplicates = [];
  let checkedAnyRequestColumn = false;
  const sheets = spreadsheet.getSheets();
  for (let sheetIndex = 0; sheetIndex < sheets.length; sheetIndex += 1) {
    const sheet = sheets[sheetIndex];
    const lastRow = sheet.getLastRow();
    const lastColumn = sheet.getLastColumn();
    if (lastRow < 2 || lastColumn < 1) continue;

    const values = sheet.getRange(1, 1, lastRow, lastColumn).getDisplayValues();
    const requestColumn = findRequestNumberColumn_(values[0] || []);
    if (requestColumn < 0) continue;
    checkedAnyRequestColumn = true;

    for (let rowIndex = 1; rowIndex < values.length; rowIndex += 1) {
      const key = normalizeRequestNumber_(values[rowIndex][requestColumn]);
      if (!key || !lookup[key]) continue;
      duplicates.push({
        value: lookup[key],
        sheetName: sheet.getName(),
        row: rowIndex + 1,
      });
      if (duplicates.length >= 10) return duplicates;
    }
  }

  if (!checkedAnyRequestColumn) {
    throw new Error("Request Number column was not found in the master Google Sheet.");
  }

  return duplicates;
}

function findRequestNumberColumn_(headers) {
  for (let index = 0; index < headers.length; index += 1) {
    const header = String(headers[index] || "").trim();
    if (!header) continue;
    if (scoreHeaderMatch_(header, "Request Number") >= 75) return index;
  }
  return -1;
}

function findCurrencyTypeColumn_(headers) {
  for (let index = 0; index < headers.length; index += 1) {
    const header = String(headers[index] || "").trim();
    if (!header) continue;
    if (scoreHeaderMatch_(header, "Currency type") >= 75) return index;
  }
  return -1;
}

function findBankColumn_(headers) {
  for (let index = 0; index < headers.length; index += 1) {
    const header = String(headers[index] || "").trim();
    if (!header) continue;
    if (scoreHeaderMatch_(header, "Bank") >= 75 || scoreHeaderMatch_(header, "Bank name") >= 75) return index;
  }
  return -1;
}

function normalizeRequestNumber_(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .trim();
}

function normalizeCurrencyValue_(value) {
  const text = String(value || "").trim();
  const normalized = normalizeHeader_(text);
  if (!normalized) return "";
  if (normalized === "eur" || normalized === "euro") return "EURO";
  if (normalized === "usd" || normalized === "dollar" || normalized === "us dollar") return "USD";
  if (normalized === "yuan" || normalized === "cny" || normalized === "rmb") return "Yuan";
  for (let index = 0; index < ALLOWED_SHEETS.length; index += 1) {
    if (normalizeHeader_(ALLOWED_SHEETS[index]) === normalized) return ALLOWED_SHEETS[index];
  }
  return "";
}

function parseDateFromFileName_(fileName) {
  const years = extractYears_(fileName);
  if (!years.length) return null;
  return new Date(Number(years[0]), 0, 1);
}

function selectLargestTable_(tables) {
  let best = null;
  for (let index = 0; index < tables.length; index += 1) {
    const table = tables[index];
    const size = table.rows.reduce(function (total, row) {
      return total + row.filter(function (cell) { return String(cell || "").trim() !== ""; }).length;
    }, 0);
    if (!best || size > best.size) {
      best = {
        name: table.name,
        rows: table.rows,
        size: size,
      };
    }
  }
  if (!best) throw new Error("No workbook table was found.");
  return best;
}

function prepareRowsForAppend_(sheet, rows) {
  const cleanRows = rows.filter(function (row) {
    return row.some(function (cell) { return String(cell || "").trim() !== ""; });
  });
  if (!cleanRows.length) return [];
  if (sheet.getLastRow() < 1) return cleanRows;

  const width = Math.max(sheet.getLastColumn(), cleanRows[0].length);
  const masterHeaders = sheet.getRange(1, 1, 1, width).getDisplayValues()[0];
  if (headersLookSimilar_(masterHeaders, cleanRows[0])) return cleanRows.slice(1);
  return cleanRows;
}

function headersLookSimilar_(left, right) {
  const leftHeaders = left.map(normalizeHeader_).filter(Boolean);
  const rightHeaders = right.map(normalizeHeader_).filter(Boolean);
  if (!leftHeaders.length || !rightHeaders.length) return false;

  let matches = 0;
  for (let index = 0; index < rightHeaders.length; index += 1) {
    if (leftHeaders.indexOf(rightHeaders[index]) !== -1) matches += 1;
  }
  return matches >= Math.min(3, rightHeaders.length);
}

function getCachedMasterSpreadsheetId_(cacheKey) {
  const fromConfig = readMasterCacheSheet_(cacheKey);
  if (fromConfig) return fromConfig;
  return PropertiesService.getScriptProperties().getProperty(cacheKey);
}

function setCachedMasterSpreadsheetId_(cacheKey, spreadsheetId) {
  PropertiesService.getScriptProperties().setProperty(cacheKey, spreadsheetId);
  writeMasterCacheSheet_(cacheKey, spreadsheetId);
}

function clearCachedMasterSpreadsheetId_(cacheKey) {
  PropertiesService.getScriptProperties().deleteProperty(cacheKey);
}

function masterCacheKey_(folderId, currencyName, year) {
  return ["master", folderId, normalizeComparable_(currencyName || ""), String(year || "")].join(":");
}

function readMasterCacheSheet_(cacheKey) {
  if (!MASTER_CACHE_SPREADSHEET_ID) return "";
  const sheet = getMasterCacheSheet_();
  const rows = sheet.getDataRange().getDisplayValues();
  for (let index = 1; index < rows.length; index += 1) {
    if (String(rows[index][0] || "").trim() === cacheKey) return String(rows[index][1] || "").trim();
  }
  return "";
}

function writeMasterCacheSheet_(cacheKey, spreadsheetId) {
  if (!MASTER_CACHE_SPREADSHEET_ID) return;
  const sheet = getMasterCacheSheet_();
  const rows = sheet.getDataRange().getDisplayValues();
  for (let index = 1; index < rows.length; index += 1) {
    if (String(rows[index][0] || "").trim() === cacheKey) {
      sheet.getRange(index + 1, 2, 1, 2).setValues([[spreadsheetId, new Date()]]);
      return;
    }
  }
  sheet.appendRow([cacheKey, spreadsheetId, new Date()]);
}

function getMasterCacheSheet_() {
  const spreadsheet = SpreadsheetApp.openById(MASTER_CACHE_SPREADSHEET_ID);
  const sheet = spreadsheet.getSheetByName("master-cache") || spreadsheet.insertSheet("master-cache");
  if (sheet.getLastRow() === 0) sheet.appendRow(["folderId", "spreadsheetId", "updatedAt"]);
  return sheet;
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
  const date = parseSiteDate_(requiredValue_(payload.date, "Date"));
  if (!date) throw new Error("Invalid date.");
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
  sheet.getRange(targetRow, dateColumn + 1).setNumberFormat("d/M/yyyy");

  return {
    ok: true,
    source: "apps-script-append",
    sheet: sheetName,
    row: targetRow,
  };
}

function recordReplenishmentDecision_(payload) {
  const decision = String(payload.decision || "").trim().toLowerCase();
  if (decision !== "approve" && decision !== "reject") {
    throw new Error("Missing decision.");
  }

  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = getSheetById_(spreadsheet, REPLENISHMENT_DECISION_SHEET_ID);
  if (!sheet) throw new Error("Replenishment decision sheet not found.");

  const bank = requiredValue_(payload.bank, "Bank");
  const amount = requiredValue_(payload.amount, "Amount");
  const currency = requiredValue_(payload.currency, "Currency");
  const correspondentBank = requiredValue_(payload.correspondentBank, "Correspondent Bank");
  const eightyCoverage = normalizeDecisionCoverage_(requiredValue_(payload.eightyCoverage, "80% Coverage"));
  const hundredCoverage = normalizeDecisionCoverage_(requiredValue_(payload.hundredCoverage, "100% Coverage"));
  const notes = String(payload.notes || "").trim();
  const status = decision === "approve" ? "مقبول" : "مرفوض";
  const bankForSheet = formatDecisionBankForSheet_(bank);
  const currencyForSheet = formatDecisionCurrencyForSheet_(currency);

  const layout = getDecisionSheetLayout_(sheet);
  const duplicate = findDuplicateDecisionRow_(
    sheet,
    layout.dataStartRow,
    layout.footerStartRow,
    {
      bank: bankForSheet,
      amount: amount,
      currency: currencyForSheet,
      correspondentBank: correspondentBank,
      eightyCoverage: eightyCoverage,
      hundredCoverage: hundredCoverage,
      status: status,
    }
  );
  if (duplicate) {
    return {
      ok: true,
      source: "apps-script-record-decision",
      duplicate: true,
      sheetId: sheet.getSheetId(),
      sheetName: sheet.getName(),
      row: duplicate.row,
      sequenceNumber: duplicate.sequenceNumber,
      status: status,
      message: "This decision already exists in the sheet.",
    };
  }

  const targetRow = findFirstDecisionInsertionRow_(sheet, layout.dataStartRow, layout.footerStartRow, 9);
  const writeRow = targetRow < layout.footerStartRow ? targetRow : layout.footerStartRow;
  if (writeRow === layout.footerStartRow) {
    sheet.insertRowBefore(writeRow);
  }

  const sequenceNumber = findNextDecisionSequence_(sheet, layout.dataStartRow, writeRow);
  const amountNumber = parseDecisionAmount_(amount);
  const row = [
    sequenceNumber,
    bankForSheet,
    currencyForSheet,
    Number.isFinite(amountNumber) ? amountNumber : amount,
    correspondentBank,
    eightyCoverage,
    hundredCoverage,
    status,
    notes,
  ];

  sheet.getRange(writeRow, 1, 1, 9).setValues([row]);
  sheet.getRange(writeRow, 1, 1, 9).setBackground("#ffffff");
  if (Number.isFinite(amountNumber)) {
    sheet.getRange(writeRow, 4).setNumberFormat('"$" #,##0');
  }
  sheet
    .getRange(writeRow, 1, 1, 9)
    .setBorder(true, true, true, true, true, true, "#000000", SpreadsheetApp.BorderStyle.SOLID);

  return {
    ok: true,
    source: "apps-script-record-decision",
    sheetId: sheet.getSheetId(),
    sheetName: sheet.getName(),
    row: writeRow,
    sequenceNumber: sequenceNumber,
    decision: decision,
    status: status,
  };
}

function updateEndOfDayReport_(payload) {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = getSheetById_(spreadsheet, REPLENISHMENT_DECISION_SHEET_ID);
  if (!sheet) throw new Error("Replenishment decision sheet not found.");

  const reportRange = sheet.getRange("B4:H4");
  const currentText = String(reportRange.getValue() || "").trim();
  if (!currentText) {
    throw new Error("End-of-day report text was not found.");
  }

  const timeZone = Session.getScriptTimeZone();
  const todayText = Utilities.formatDate(new Date(), timeZone, "yyyy/M/d");
  const datePattern = /\b\d{4}\/\d{1,2}\/\d{1,2}\b/g;
  let updatedText = currentText.replace(datePattern, todayText);
  const alreadyCurrent = updatedText === currentText;

  if (!alreadyCurrent) {
    if (!datePattern.test(updatedText) && updatedText.indexOf("الموافق") >= 0) {
      updatedText = updatedText.replace(/(الموافق\s*)/, "$1" + todayText);
    }
    reportRange.setValue(updatedText);
  }

  const totalSummary = calculateApprovedEndOfDayTotal_(sheet);
  const entrySummary = calculateEndOfDayEntryCount_(sheet);
  const totalTarget = findEndOfDayTotalTargetRange_(sheet);
  const totalWordsTarget = findEndOfDayAmountWordsTargetRange_(sheet);
  const entryCountTarget = findEndOfDayEntryCountTargetRange_(sheet);
  const totalWords = formatArabicCurrencyWords_(totalSummary.totalAmount);
  let totalUpdated = false;
  let totalWordsUpdated = false;
  let entryCountUpdated = false;
  let totalRangeAddress = "";
  let totalWordsRangeAddress = "";
  let entryCountRangeAddress = "";
  if (totalTarget) {
    totalTarget.setValue(totalSummary.totalAmount);
    totalTarget.setNumberFormat('"$" #,##0');
    totalUpdated = true;
    totalRangeAddress = totalTarget.getA1Notation();
  }
  if (totalWordsTarget) {
    totalWordsTarget.setValue(totalWords);
    totalWordsUpdated = true;
    totalWordsRangeAddress = totalWordsTarget.getA1Notation();
  }
  if (entryCountTarget) {
    entryCountTarget.setValue(entrySummary.totalEntries);
    entryCountUpdated = true;
    entryCountRangeAddress = entryCountTarget.getA1Notation();
  }

  return {
    ok: true,
    source: "apps-script-update-end-of-day-report",
    sheetId: sheet.getSheetId(),
    sheetName: sheet.getName(),
    range: "B4:H4",
    previousText: currentText,
    currentText: alreadyCurrent ? currentText : updatedText,
    today: todayText,
    totalAmount: totalSummary.totalAmount,
    totalRows: totalSummary.approvedRows,
    totalEntries: entrySummary.totalEntries,
    totalRange: totalRangeAddress,
    totalWords,
    totalWordsRange: totalWordsRangeAddress,
    entryCountRange: entryCountRangeAddress,
    alreadyCurrent: alreadyCurrent,
    updated: !alreadyCurrent || totalUpdated || totalWordsUpdated || entryCountUpdated,
  };
}

function calculateApprovedEndOfDayTotal_(sheet) {
  const layout = getDecisionSheetLayout_(sheet);
  if (layout.footerStartRow <= layout.dataStartRow) {
    return { totalAmount: 0, approvedRows: 0 };
  }

  const values = sheet.getRange(layout.dataStartRow, 1, layout.footerStartRow - layout.dataStartRow, 9).getDisplayValues();
  let totalAmount = 0;
  let approvedRows = 0;

  for (let index = 0; index < values.length; index += 1) {
    const row = values[index];
    if (!row.some(function (value) {
      return String(value || "").trim() !== "";
    })) {
      continue;
    }
    if (isDecisionFooterStartRow_(row)) {
      continue;
    }
    if (!isApprovedDecisionStatus_(row[7])) {
      continue;
    }

    const amount = parseDecisionAmount_(row[3]);
    if (!Number.isFinite(amount)) continue;

    approvedRows += 1;
    totalAmount += amount;
  }

  return {
    totalAmount: roundCurrencyAmount_(totalAmount),
    approvedRows: approvedRows,
  };
}

function calculateEndOfDayEntryCount_(sheet) {
  const layout = getDecisionSheetLayout_(sheet);
  if (layout.footerStartRow <= layout.dataStartRow) {
    return { totalEntries: 0 };
  }

  const values = sheet.getRange(layout.dataStartRow, 1, layout.footerStartRow - layout.dataStartRow, 9).getDisplayValues();
  let totalEntries = 0;

  for (let index = 0; index < values.length; index += 1) {
    const row = values[index];
    if (!row.some(function (value) {
      return String(value || "").trim() !== "";
    })) {
      continue;
    }
    if (isDecisionFooterStartRow_(row)) {
      continue;
    }
    totalEntries += 1;
  }

  return { totalEntries: totalEntries };
}

function isApprovedDecisionStatus_(value) {
  const normalized = normalizeHeader_(value);
  return normalized === normalizeHeader_("مقبول") || normalized === "approved";
}

function findEndOfDayTotalTargetRange_(sheet) {
  const labelText = "اجمالي المبالغ المعززة لهذا اليوم";
  const finder = sheet.createTextFinder(labelText).matchCase(false);
  const labelCell = finder.findNext();
  if (!labelCell) return null;

  const row = labelCell.getRow();
  const rowRanges = sheet.getRange(row, 1, 1, sheet.getLastColumn()).getMergedRanges();
  if (!rowRanges.length) return null;

  rowRanges.sort(function (left, right) {
    return left.getColumn() - right.getColumn();
  });

  const labelRange = rowRanges.find(function (range) {
    return range.getRow() === labelCell.getRow() &&
      range.getColumn() <= labelCell.getColumn() &&
      range.getLastColumn() >= labelCell.getColumn();
  }) || labelCell;

  let targetRange = null;
  for (let index = rowRanges.length - 1; index >= 0; index -= 1) {
    const range = rowRanges[index];
    if (range.getLastColumn() < labelRange.getColumn()) {
      targetRange = range;
      break;
    }
  }

  if (!targetRange) {
    for (let index = 0; index < rowRanges.length; index += 1) {
      const range = rowRanges[index];
      if (range.getColumn() > labelRange.getLastColumn()) {
        targetRange = range;
        break;
      }
    }
  }

  return targetRange;
}

function findEndOfDayAmountWordsTargetRange_(sheet) {
  const exactLabels = ["فقط لاغير", "فقط لا غير"];
  for (let index = 0; index < exactLabels.length; index += 1) {
    const finder = sheet.createTextFinder(exactLabels[index]).matchCase(false);
    const cell = finder.findNext();
    if (!cell) continue;

    const mergedRange = findMergedRangeContainingCell_(sheet, cell);
    if (mergedRange) return mergedRange;
    return cell;
  }

  const labelFinder = sheet.createTextFinder("اجمالي المبالغ المعززة لهذا اليوم").matchCase(false);
  const labelCell = labelFinder.findNext();
  if (!labelCell) return null;

  const row = labelCell.getRow();
  const rowRanges = sheet.getRange(row, 1, 1, sheet.getLastColumn()).getMergedRanges();
  if (!rowRanges.length) return null;

  rowRanges.sort(function (left, right) {
    return left.getColumn() - right.getColumn();
  });

  for (let index = 0; index < rowRanges.length; index += 1) {
    const range = rowRanges[index];
    if (range.getRow() !== labelCell.getRow()) continue;
    if (range.getColumn() <= labelCell.getColumn() && range.getLastColumn() >= labelCell.getColumn()) continue;
    return range;
  }

  return null;
}

function findEndOfDayEntryCountTargetRange_(sheet) {
  const labelText = "عدد المصارف التي قامت بتقديم طلبات تعزيز الأرصدة في الخارج";
  const finder = sheet.createTextFinder(labelText).matchCase(false);
  const labelCell = finder.findNext();
  if (!labelCell) return null;

  const mergedRange = findMergedRangeContainingCell_(sheet, labelCell);
  if (!mergedRange) return labelCell;

  const row = labelCell.getRow();
  const rowRanges = sheet.getRange(row, 1, 1, sheet.getLastColumn()).getMergedRanges();
  rowRanges.sort(function (left, right) {
    return left.getColumn() - right.getColumn();
  });

  const labelRange = rowRanges.find(function (range) {
    return range.getRow() === labelCell.getRow() &&
      range.getColumn() <= labelCell.getColumn() &&
      range.getLastColumn() >= labelCell.getColumn();
  }) || mergedRange;

  for (let index = 0; index < rowRanges.length; index += 1) {
    const range = rowRanges[index];
    if (range.getColumn() > labelRange.getLastColumn()) {
      return range;
    }
  }

  for (let index = rowRanges.length - 1; index >= 0; index -= 1) {
    const range = rowRanges[index];
    if (range.getLastColumn() < labelRange.getColumn()) {
      return range;
    }
  }

  return null;
}

function findMergedRangeContainingCell_(sheet, cell) {
  const mergedRanges = sheet.getRange(cell.getRow(), 1, 1, sheet.getLastColumn()).getMergedRanges();
  for (let index = 0; index < mergedRanges.length; index += 1) {
    const range = mergedRanges[index];
    if (
      range.getRow() === cell.getRow() &&
      range.getColumn() <= cell.getColumn() &&
      range.getLastColumn() >= cell.getColumn()
    ) {
      return range;
    }
  }
  return null;
}

function formatArabicCurrencyWords_(amount) {
  const rounded = Math.max(0, Math.floor(Number(amount) || 0));
  if (!rounded) return "صفر دولار فقط لا غير";

  const words = numberToArabicWords_(rounded);
  return words + " دولار فقط لا غير";
}

function numberToArabicWords_(value) {
  const number = Math.max(0, Math.floor(Number(value) || 0));
  if (number === 0) return "صفر";

  const scales = [
    { value: 1000000000, singular: "مليارًا", dual: "ملياران", plural: "مليارات" },
    { value: 1000000, singular: "مليونًا", dual: "مليونان", plural: "ملايين" },
    { value: 1000, singular: "ألفًا", dual: "ألفان", plural: "آلاف" },
  ];

  const parts = [];
  let remainder = number;

  for (let index = 0; index < scales.length; index += 1) {
    const scale = scales[index];
    const count = Math.floor(remainder / scale.value);
    if (!count) continue;

    parts.push(formatArabicScaleGroup_(count, scale));

    remainder %= scale.value;
  }

  if (remainder) {
    parts.push(tripletToArabicWords_(remainder));
  }

  return parts.join(" و ");
}

function formatArabicScaleGroup_(count, scale) {
  if (count === 1) return scale.singular;
  if (count === 2) return scale.dual;
  if (count >= 3 && count <= 10) {
    return arabicCountForPluralNoun_(count) + " " + scale.plural;
  }
  return tripletToArabicWords_(count) + " " + scale.singular;
}

function arabicCountForPluralNoun_(value) {
  const number = Math.max(0, Math.floor(Number(value) || 0));
  const ones = ["", "ثلاثة", "أربعة", "خمسة", "ستة", "سبعة", "ثمانية", "تسعة", "عشرة"];
  if (number >= 3 && number <= 10) return ones[number - 2];
  return tripletToArabicWords_(number);
}

function tripletToArabicWords_(value) {
  const number = Math.max(0, Math.floor(Number(value) || 0));
  if (number === 0) return "";

  const ones = ["", "واحد", "اثنان", "ثلاثة", "أربعة", "خمسة", "ستة", "سبعة", "ثمانية", "تسعة"];
  const tens = ["", "", "عشرون", "ثلاثون", "أربعون", "خمسون", "ستون", "سبعون", "ثمانون", "تسعون"];
  const hundredsWords = {
    1: "مائة",
    2: "مائتان",
    3: "ثلاثمائة",
    4: "أربعمائة",
    5: "خمسمائة",
    6: "ستمائة",
    7: "سبعمائة",
    8: "ثمانمائة",
    9: "تسعمائة",
  };
  const teens = {
    11: "أحد عشر",
    12: "اثنا عشر",
    13: "ثلاثة عشر",
    14: "أربعة عشر",
    15: "خمسة عشر",
    16: "ستة عشر",
    17: "سبعة عشر",
    18: "ثمانية عشر",
    19: "تسعة عشر",
  };

  const parts = [];
  const hundreds = Math.floor(number / 100);
  const remainder = number % 100;

  if (hundreds) {
    parts.push(hundredsWords[hundreds] || "");
  }

  if (remainder) {
    if (remainder >= 11 && remainder <= 19) {
      parts.push(teens[remainder]);
    } else if (remainder === 10) {
      parts.push("عشرة");
    } else if (remainder < 10) {
      parts.push(ones[remainder]);
    } else {
      const tenValue = Math.floor(remainder / 10);
      const oneValue = remainder % 10;
      if (oneValue) {
        parts.push(ones[oneValue] + " و " + tens[tenValue]);
      } else {
        parts.push(tens[tenValue]);
      }
    }
  }

  return parts.join(" و ");
}

function findDuplicateDecisionRow_(sheet, dataStartRow, footerStartRow, candidate) {
  if (footerStartRow <= dataStartRow) return null;

  const values = sheet.getRange(dataStartRow, 1, footerStartRow - dataStartRow, 9).getDisplayValues();
  const normalizedCandidate = {
    bank: normalizeDecisionBankComparable_(candidate.bank),
    amount: normalizeDecisionAmountComparable_(candidate.amount),
    currency: normalizeDecisionCurrencyComparable_(candidate.currency),
    correspondentBank: normalizeComparable_(candidate.correspondentBank),
    eightyCoverage: normalizeDecisionCoverageComparable_(candidate.eightyCoverage),
    hundredCoverage: normalizeDecisionCoverageComparable_(candidate.hundredCoverage),
    status: normalizeComparable_(candidate.status),
  };

  for (let index = 0; index < values.length; index += 1) {
    const row = values[index];
    if (!row.some(function (value) {
      return String(value || "").trim() !== "";
    })) {
      continue;
    }
    if (isDecisionFooterStartRow_(row)) {
      continue;
    }

    const normalizedRow = {
      bank: normalizeDecisionBankComparable_(row[1]),
      amount: normalizeDecisionAmountComparable_(row[3]),
      currency: normalizeDecisionCurrencyComparable_(row[2]),
      correspondentBank: normalizeComparable_(row[4]),
      eightyCoverage: normalizeDecisionCoverageComparable_(row[5]),
      hundredCoverage: normalizeDecisionCoverageComparable_(row[6]),
      status: normalizeComparable_(row[7]),
    };

    if (
      normalizedRow.bank === normalizedCandidate.bank &&
      normalizedRow.amount === normalizedCandidate.amount &&
      normalizedRow.currency === normalizedCandidate.currency &&
      normalizedRow.correspondentBank === normalizedCandidate.correspondentBank &&
      normalizedRow.eightyCoverage === normalizedCandidate.eightyCoverage &&
      normalizedRow.hundredCoverage === normalizedCandidate.hundredCoverage &&
      normalizedRow.status === normalizedCandidate.status
    ) {
      return {
        row: dataStartRow + index,
        sequenceNumber: parseInteger_(row[0]) || (index + 1),
      };
    }
  }

  return null;
}

function resetReplenishmentSheet_(payload) {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = getSheetById_(spreadsheet, REPLENISHMENT_DECISION_SHEET_ID);
  if (!sheet) throw new Error("Replenishment decision sheet not found.");

  const layout = getDecisionSheetLayout_(sheet);
  if (layout.footerStartRow <= layout.dataStartRow) {
    return {
      ok: true,
      source: "apps-script-reset-decision-sheet",
      sheetId: sheet.getSheetId(),
      sheetName: sheet.getName(),
      removedRows: 0,
      alreadyCleared: true,
      templateRow: layout.dataStartRow,
    };
  }

  const dataRowCount = Math.max(layout.footerStartRow - layout.dataStartRow, 0);
  const dataRows = dataRowCount > 0 ? sheet.getRange(layout.dataStartRow, 1, dataRowCount, 9).getDisplayValues() : [];
  const rowsToDelete = [];

  for (let index = 0; index < dataRows.length; index += 1) {
    const row = dataRows[index];
    if (!row.some(function (value) {
      return String(value || "").trim() !== "";
    })) {
      continue;
    }
    if (isDecisionFooterStartRow_(row)) {
      continue;
    }
    rowsToDelete.push(layout.dataStartRow + index);
  }

  for (let index = rowsToDelete.length - 1; index >= 0; index -= 1) {
    sheet.deleteRow(rowsToDelete[index]);
  }

  return {
    ok: true,
    source: "apps-script-reset-decision-sheet",
    sheetId: sheet.getSheetId(),
    sheetName: sheet.getName(),
    removedRows: rowsToDelete.length,
    alreadyCleared: rowsToDelete.length === 0,
    templateRow: layout.dataStartRow,
  };
}

function getDecisionSheetLayout_(sheet) {
  const lastRow = Math.max(sheet.getLastRow(), 1);
  const values = sheet.getRange(1, 1, lastRow, 9).getDisplayValues();
  let headerRow = -1;

  for (let rowIndex = 0; rowIndex < values.length; rowIndex += 1) {
    const row = values[rowIndex];
    const left = normalizeComparable_(row[0]);
    const bankHeader = normalizeComparable_(row[1]);
    if (left === "ت" || bankHeader === "أسم المصرف" || bankHeader === "اسم المصرف") {
      headerRow = rowIndex + 1;
      break;
    }
  }

  if (headerRow < 0) {
    throw new Error("Replenishment decision header was not found.");
  }

  let dataStartRow = headerRow + 2;
  for (let rowIndex = headerRow; rowIndex < values.length; rowIndex += 1) {
    if (parseInteger_(values[rowIndex][0]) > 0) {
      dataStartRow = rowIndex + 1;
      break;
    }
  }

  let footerStartRow = lastRow + 1;
  for (let rowIndex = dataStartRow - 1; rowIndex < values.length; rowIndex += 1) {
    if (isDecisionFooterStartRow_(values[rowIndex])) {
      footerStartRow = rowIndex + 1;
      break;
    }
  }

  return {
    headerRow: headerRow,
    dataStartRow: dataStartRow,
    footerStartRow: footerStartRow,
  };
}

function isDecisionFooterStartRow_(row) {
  const firstCell = normalizeComparable_(row[0]);
  const hasVisibleContent = row.slice(1).some(function (value) {
    return String(value || "").trim() !== "";
  });
  if (firstCell !== "" && parseInteger_(firstCell) > 0) return false;
  if (!hasVisibleContent) return false;

  const text = row.map(function (value) {
    return normalizeComparable_(value);
  }).join(" | ");
  const normalizedText = normalizeHeader_(text);

  return (
    normalizedText.indexOf("اجمالي المبالغ") >= 0 ||
    normalizedText.indexOf("اجمالي المبالغ المعززه لهذا اليوم") >= 0 ||
    normalizedText.indexOf("عدد المصارف") >= 0 ||
    normalizedText.indexOf("مسؤول الشعبه") >= 0 ||
    normalizedText.indexOf("مسؤول الشعبة") >= 0 ||
    normalizedText.indexOf("السيد المدير العام") >= 0
  );
}

function findFirstDecisionInsertionRow_(sheet, dataStartRow, footerStartRow, width) {
  if (footerStartRow <= dataStartRow) return dataStartRow;

  const rows = sheet.getRange(dataStartRow, 1, footerStartRow - dataStartRow, width).getDisplayValues();
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (row.every(function (value) {
      return String(value || "").trim() === "";
    })) {
      return dataStartRow + index;
    }
  }

  return footerStartRow;
}

function findNextDecisionSequence_(sheet, dataStartRow, insertionRow) {
  const endRow = Math.max(insertionRow - 1, dataStartRow - 1);
  if (endRow < dataStartRow) return 1;

  const values = sheet.getRange(dataStartRow, 1, endRow - dataStartRow + 1, 1).getDisplayValues();
  let maxSequence = 0;
  for (let index = 0; index < values.length; index += 1) {
    const text = String(values[index][0] || "").trim();
    const sequence = parseInteger_(text);
    if (sequence > maxSequence) {
      maxSequence = sequence;
    }
  }

  return maxSequence + 1;
}

function parseDecisionAmount_(value) {
  const normalized = normalizeSheetAmount_(value);
  if (!normalized) return NaN;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function normalizeDecisionCoverage_(value) {
  const text = String(value || "").trim().replace(/%/g, "");
  return text;
}

function normalizeDecisionCoverageComparable_(value) {
  return normalizeComparable_(normalizeDecisionCoverage_(value));
}

function normalizeDecisionAmountComparable_(value) {
  const amount = parseDecisionAmount_(value);
  if (Number.isFinite(amount)) {
    return String(amount);
  }
  return normalizeComparable_(value);
}

function normalizeDecisionBankComparable_(value) {
  return normalizeDecisionDisplayComparable_(value, DECISION_BANK_DISPLAY_MAP, "iraqi islamic bank");
}

function normalizeDecisionCurrencyComparable_(value) {
  return normalizeDecisionDisplayComparable_(value, DECISION_CURRENCY_DISPLAY_MAP, "jod");
}

function formatDecisionBankForSheet_(value) {
  return formatDecisionDisplayForSheet_(value, DECISION_BANK_DISPLAY_MAP);
}

function formatDecisionCurrencyForSheet_(value) {
  return formatDecisionDisplayForSheet_(value, DECISION_CURRENCY_DISPLAY_MAP);
}

function normalizeDecisionDisplayComparable_(value, displayMap, fallbackKey) {
  const normalized = normalizeHeader_(value);
  if (!normalized) return "";

  const keys = Object.keys(displayMap);
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    if (normalized === normalizeHeader_(key) || normalized === normalizeHeader_(displayMap[key])) {
      return normalizeComparable_(key);
    }
  }

  if (fallbackKey && normalized === normalizeHeader_(fallbackKey)) {
    return normalizeComparable_(fallbackKey);
  }

  return normalizeComparable_(value);
}

function formatDecisionDisplayForSheet_(value, displayMap) {
  const normalized = normalizeHeader_(value);
  if (!normalized) return String(value || "").trim();

  const keys = Object.keys(displayMap);
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    if (normalized === normalizeHeader_(key) || normalized === normalizeHeader_(displayMap[key])) {
      return displayMap[key];
    }
  }

  return String(value || "").trim();
}

function getSheetById_(spreadsheet, sheetId) {
  const sheets = spreadsheet.getSheets();
  for (let index = 0; index < sheets.length; index += 1) {
    if (sheets[index].getSheetId() === sheetId) {
      return sheets[index];
    }
  }
  return null;
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
    .replace(/[\u0625\u0623\u0622\u0627]/g, "\u0627")
    .replace(/[\u0649]/g, "\u064a")
    .replace(/[\u0629]/g, "\u0647")
    .replace(/[^a-z0-9\u0600-\u06ff]+/g, " ")
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

