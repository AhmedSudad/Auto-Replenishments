(function () {
  const GOOGLE_SHEET_ID = "1mm6r351-RAnGgqZ9dEXkh6d47ImXh0JH03yiDd4cRwo";
  const BANK_CURRENCY_SHEET = "Banks & currencies";
  const BANK_HEADER = "bank";
  const CORRESPONDENT_BANK_HEADER = "correspondent bank";

  const elements = {
    form: document.getElementById("relenishmentsForm"),
    bankSelect: document.getElementById("bankSelect"),
    amountInput: document.getElementById("amountInput"),
    referenceInput: document.getElementById("referenceInput"),
    dateInput: document.getElementById("dateInput"),
    datePicker: document.getElementById("datePicker"),
    dateTrigger: document.getElementById("dateTrigger"),
    dateDisplay: document.getElementById("dateDisplay"),
    datePopover: document.getElementById("datePopover"),
    dateMonthLabel: document.getElementById("dateMonthLabel"),
    dateGrid: document.getElementById("dateGrid"),
    prevYearButton: document.getElementById("prevYearButton"),
    prevMonthButton: document.getElementById("prevMonthButton"),
    nextMonthButton: document.getElementById("nextMonthButton"),
    nextYearButton: document.getElementById("nextYearButton"),
    currencySelect: document.getElementById("currencySelect"),
    correspondentBankSelect: document.getElementById("correspondentBankSelect"),
    uploadButton: document.getElementById("uploadReplenishmentButton"),
    workbookInput: document.getElementById("replenishmentWorkbookInput"),
    calculateButton: document.getElementById("calculateReplenishmentButton"),
    submitButton: document.getElementById("submitReplenishmentButton"),
    eightyAmountInput: document.getElementById("eightyAmountInput"),
    eightyReferenceInput: document.getElementById("eightyReferenceInput"),
    eightyDateInput: document.getElementById("eightyDateInput"),
    eightyRegisteredAmountInput: document.getElementById("eightyRegisteredAmountInput"),
    eightyCorrespondentBankInput: document.getElementById("eightyCorrespondentBankInput"),
    eightyCoverageInput: document.getElementById("eightyCoverageInput"),
    hundredAmountInput: document.getElementById("hundredAmountInput"),
    hundredReferenceInput: document.getElementById("hundredReferenceInput"),
    hundredDateInput: document.getElementById("hundredDateInput"),
    hundredRegisteredAmountInput: document.getElementById("hundredRegisteredAmountInput"),
    hundredCorrespondentBankInput: document.getElementById("hundredCorrespondentBankInput"),
    hundredCoverageInput: document.getElementById("hundredCoverageInput"),
    confirmOverlay: document.getElementById("submitConfirmOverlay"),
    confirmMessage: document.getElementById("submitConfirmMessage"),
    confirmYes: document.getElementById("confirmSubmitYes"),
    confirmNo: document.getElementById("confirmSubmitNo"),
    duplicateOverlay: document.getElementById("duplicateReferenceOverlay"),
    duplicateMessage: document.getElementById("duplicateReferenceMessage"),
    duplicateMeta: document.getElementById("duplicateReferenceMeta"),
    duplicateClose: document.getElementById("duplicateReferenceClose"),
    formStatus: document.getElementById("relenishmentsStatus"),
  };

  const state = {
    selectedDate: null,
    visibleMonth: null,
    correspondentRequestId: 0,
    sheetCache: new Map(),
    allBanks: [],
    allCurrencies: [],
    bankCurrencyMap: new Map(),
    currencyBankMap: new Map(),
    manualWorkbookName: "",
    manualTables: new Map(),
    uploadWorker: null,
    uploadRequestId: 0,
    submitting: false,
    checkingDuplicate: false,
  };

  init();

  function init() {
    window.lucide?.createIcons();
    initializeBankCurrencyOptions();
    bindAmountFormatter();
    bindCurrencyDependentFields();
    bindManualUpload();
    setupDatePicker();
    bindCalculateButton();
    bindSubmitConfirmation();
  }

  async function initializeBankCurrencyOptions() {
    setStatus("Loading lists", "muted");
    try {
      const [localBanks, currencies] = await Promise.all([
        loadList("assets/list-of-banks.txt"),
        loadList("assets/currency.txt"),
      ]);
      state.allCurrencies = currencies;

      try {
        const matrix = getManualBankCurrencyMatrix() || (await loadBankCurrencyMatrix(currencies));
        if (matrix.banks.length) {
          state.allBanks = matrix.banks;
          state.bankCurrencyMap = matrix.bankCurrencyMap;
          state.currencyBankMap = matrix.currencyBankMap;
        } else {
          setFallbackBankCurrencyMap(localBanks, currencies);
        }
      } catch (error) {
        console.warn("Bank-currency matrix failed; using local dropdown fallback.", error);
        setFallbackBankCurrencyMap(localBanks, currencies);
      }

      syncBankCurrencyOptions();
      populateSelect(elements.correspondentBankSelect, [], "Select bank first");
      elements.correspondentBankSelect.disabled = true;
      setStatus(state.bankCurrencyMap.size ? "Ready" : "Currency map fallback", state.bankCurrencyMap.size ? "muted" : "warning");
    } catch (error) {
      populateSelect(elements.bankSelect, [], "Unable to load banks");
      populateSelect(elements.currencySelect, [], "Unable to load currencies");
      if (elements.bankSelect) elements.bankSelect.disabled = true;
      if (elements.currencySelect) elements.currencySelect.disabled = true;
      setStatus("List load error", "error");
    }
  }

  async function loadList(url) {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`Unable to load ${url}`);
    return parseList(await response.text());
  }

  function parseList(text) {
    const seen = new Set();
    const values = [];
    for (const line of String(text || "").split(/\r?\n/)) {
      const value = line.trim();
      const key = value.toLowerCase();
      if (!value || seen.has(key)) continue;
      seen.add(key);
      values.push(value);
    }
    return values;
  }

  function bindCurrencyDependentFields() {
    elements.bankSelect?.addEventListener("change", () => {
      syncBankCurrencyOptions("bank");
      clearResultFields();
      updateCorrespondentBanks();
    });
    elements.currencySelect?.addEventListener("change", () => {
      syncBankCurrencyOptions("currency");
      clearResultFields();
      updateCorrespondentBanks();
    });
    elements.correspondentBankSelect?.addEventListener("change", clearResultFields);
  }

  function bindManualUpload() {
    elements.uploadButton?.addEventListener("click", () => {
      elements.workbookInput?.click();
    });

    elements.workbookInput?.addEventListener("change", async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      await loadManualWorkbook(file);
      elements.workbookInput.value = "";
    });
  }

  async function loadManualWorkbook(file) {
    if (!/\.(xlsx|xlsm)$/i.test(file.name)) {
      setStatus("Upload an .xlsx or .xlsm workbook", "error");
      return;
    }

    state.uploadRequestId += 1;
    const requestId = state.uploadRequestId;
    setUploadBusy(true);
    setStatus("Reading workbook", "muted");

    try {
      const buffer = await file.arrayBuffer();
      const worker = createUploadWorker();
      worker.postMessage(
        {
          type: "load",
          requestId,
          fileName: file.name,
          buffer,
        },
        [buffer],
      );
    } catch (error) {
      console.error(error);
      setUploadBusy(false);
      setStatus(error.message || "Workbook upload failed", "error");
    }
  }

  function createUploadWorker() {
    if (state.uploadWorker) state.uploadWorker.terminate();

    const worker = new Worker("/assets/relenishments-upload-worker.js");
    state.uploadWorker = worker;
    worker.addEventListener("message", handleUploadWorkerMessage);
    worker.addEventListener("error", (event) => {
      console.error(event);
      setUploadBusy(false);
      setStatus(event.message || "Workbook upload failed", "error");
    });
    return worker;
  }

  function handleUploadWorkerMessage(event) {
    const message = event.data || {};
    if (message.requestId !== state.uploadRequestId) return;

    if (message.type === "progress") {
      setStatus(message.text || "Reading workbook", "muted");
      return;
    }

    setUploadBusy(false);

    if (message.type === "error") {
      setStatus(message.error || "Workbook upload failed", "error");
      return;
    }

    if (message.type !== "loaded") return;

    state.manualWorkbookName = message.fileName || "";
    state.manualTables = buildManualTables(message.tables || []);
    applyManualWorkbookTables();
    clearResultFields();
    updateCorrespondentBanks();
    setStatus(`Workbook loaded: ${state.manualWorkbookName}`, "muted");
  }

  function buildManualTables(tables) {
    const mapped = new Map();
    for (const table of tables) {
      const name = String(table.name || "").trim();
      if (!name) continue;
      mapped.set(normalizeSheetKey(name), {
        name,
        rows: rowsToGoogleTableRows(table.rows || []),
        cols: rowsToGoogleTableColumns(table.rows || []),
      });
    }
    return mapped;
  }

  function rowsToGoogleTableRows(rows) {
    return rows.map((row) => ({
      c: row.map((value) => ({
        v: String(value ?? "").trim(),
        f: String(value ?? "").trim(),
      })),
    }));
  }

  function rowsToGoogleTableColumns(rows) {
    const headers = rows[0] || [];
    return headers.map((header, index) => ({
      id: String(index),
      label: String(header ?? "").trim(),
    }));
  }

  function applyManualWorkbookTables() {
    const matrix = getManualBankCurrencyMatrix();
    if (!matrix || !matrix.banks.length) return;

    const selectedBank = elements.bankSelect?.value || "";
    const selectedCurrency = elements.currencySelect?.value || "";
    state.allBanks = matrix.banks;
    state.bankCurrencyMap = matrix.bankCurrencyMap;
    state.currencyBankMap = matrix.currencyBankMap;
    syncBankCurrencyOptions();
    if (selectedBank && isOptionAllowed(selectedBank, state.allBanks)) elements.bankSelect.value = selectedBank;
    if (selectedCurrency && state.allCurrencies.includes(selectedCurrency)) elements.currencySelect.value = selectedCurrency;
  }

  function getManualBankCurrencyMatrix() {
    const table = getManualTable(BANK_CURRENCY_SHEET);
    if (!table || !state.allCurrencies.length) return null;
    return parseBankCurrencyMatrix(table, state.allCurrencies);
  }

  function getManualTable(sheetName) {
    return state.manualTables.get(normalizeSheetKey(sheetName)) || null;
  }

  function normalizeSheetKey(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  function updateCorrespondentBanks() {
    loadCorrespondentBanks(elements.currencySelect?.value || "", elements.bankSelect?.value || "");
  }

  async function loadBankCurrencyMatrix(currencies) {
    const table = await loadGoogleSheetTable(BANK_CURRENCY_SHEET, "A:I");
    return parseBankCurrencyMatrix(table, currencies);
  }

  function parseBankCurrencyMatrix(table, currencies) {
    const rows = Array.isArray(table?.rows) ? table.rows : [];
    const headerRow = rows.length ? readRowValues(rows[0]) : [];
    const bankColumnIndex = findBankMatrixColumn(headerRow);
    const currencyColumns = headerRow
      .map((header, index) => ({ currency: normalizeCurrencyName(header, currencies), index }))
      .filter((entry) => entry.currency);
    const bankCurrencyMap = new Map();
    const currencyBankMap = new Map(currencies.map((currency) => [currency, []]));
    const banks = [];

    if (bankColumnIndex < 0 || !currencyColumns.length) {
      return { banks, bankCurrencyMap, currencyBankMap };
    }

    for (const row of rows.slice(1)) {
      const bankName = readCellValue(row, bankColumnIndex);
      if (!bankName) continue;

      const allowedCurrencies = [];
      for (const { currency, index } of currencyColumns) {
        const marker = normalizeCurrencyName(readCellValue(row, index), currencies);
        if (marker === currency) allowedCurrencies.push(currency);
      }
      if (!allowedCurrencies.length) continue;

      const bankKey = normalizeComparable(bankName);
      if (!bankCurrencyMap.has(bankKey)) {
        banks.push(bankName);
        bankCurrencyMap.set(bankKey, { name: bankName, currencies: allowedCurrencies });
      }

      for (const currency of allowedCurrencies) {
        const bankList = currencyBankMap.get(currency) || [];
        if (!bankList.some((value) => normalizeComparable(value) === bankKey)) {
          bankList.push(bankName);
          currencyBankMap.set(currency, bankList);
        }
      }
    }

    return { banks, bankCurrencyMap, currencyBankMap };
  }

  function findBankMatrixColumn(headers) {
    const index = headers.findIndex((header) => normalizeHeader(header) === "banks" || normalizeHeader(header) === BANK_HEADER);
    return index >= 0 ? index : 0;
  }

  function normalizeCurrencyName(value, currencies) {
    const text = String(value || "").trim();
    if (!text) return "";
    const normalizedText = text.toLowerCase();
    if (normalizedText === "eur" || normalizedText === "euro") return currencies.includes("EURO") ? "EURO" : "EUR";
    return currencies.find((currency) => currency.toLowerCase() === normalizedText) || "";
  }

  function setFallbackBankCurrencyMap(banks, currencies) {
    state.allBanks = banks;
    state.allCurrencies = currencies;
    state.bankCurrencyMap = new Map(
      banks.map((bank) => [
        normalizeComparable(bank),
        {
          name: bank,
          currencies: currencies.slice(),
        },
      ]),
    );
    state.currencyBankMap = new Map(currencies.map((currency) => [currency, banks.slice()]));
  }

  function syncBankCurrencyOptions(changedField) {
    const selectedBank = elements.bankSelect?.value || "";
    const selectedCurrency = elements.currencySelect?.value || "";
    let nextBank = selectedBank;
    let nextCurrency = selectedCurrency;

    const selectedBankEntry = state.bankCurrencyMap.get(normalizeComparable(selectedBank));
    if (changedField === "bank" && selectedCurrency && selectedBankEntry && !selectedBankEntry.currencies.includes(selectedCurrency)) {
      nextCurrency = "";
    }

    const banksForSelectedCurrency = selectedCurrency ? state.currencyBankMap.get(selectedCurrency) || [] : state.allBanks;
    if (changedField === "currency" && selectedBank && !isOptionAllowed(selectedBank, banksForSelectedCurrency)) {
      nextBank = "";
    }

    const nextBankEntry = state.bankCurrencyMap.get(normalizeComparable(nextBank));
    const availableCurrencies = nextBankEntry ? nextBankEntry.currencies : state.allCurrencies;
    if (nextCurrency && !availableCurrencies.includes(nextCurrency)) {
      nextCurrency = "";
    }

    const availableBanks = nextCurrency ? state.currencyBankMap.get(nextCurrency) || [] : state.allBanks;
    if (nextBank && !isOptionAllowed(nextBank, availableBanks)) {
      nextBank = "";
    }

    populateSelect(elements.bankSelect, availableBanks, "Select bank", nextBank);
    populateSelect(elements.currencySelect, availableCurrencies, "Select currency", nextCurrency);
    if (elements.bankSelect) elements.bankSelect.disabled = !availableBanks.length;
    if (elements.currencySelect) elements.currencySelect.disabled = !availableCurrencies.length;
  }

  function isOptionAllowed(value, options) {
    const key = normalizeComparable(value);
    return options.some((option) => normalizeComparable(option) === key);
  }

  async function loadCorrespondentBanks(currency, bankName) {
    const select = elements.correspondentBankSelect;
    if (!select) return;

    state.correspondentRequestId += 1;
    const requestId = state.correspondentRequestId;

    if (!bankName) {
      populateSelect(select, [], "Select bank first");
      select.disabled = true;
      return;
    }

    if (!currency) {
      populateSelect(select, [], "Select currency first");
      select.disabled = true;
      return;
    }

    populateSelect(select, [], "Loading correspondent banks");
    select.disabled = true;
    setStatus("Loading correspondent banks", "muted");

    try {
      const banks = await loadCorrespondentBankOptions(currency, bankName);
      if (requestId !== state.correspondentRequestId) return;
      populateSelect(select, banks, banks.length ? "Select correspondent bank" : "No correspondent banks for selected bank");
      select.disabled = !banks.length;
      setStatus(banks.length ? "Ready" : "No correspondent banks for selected bank", banks.length ? "muted" : "warning");
    } catch (error) {
      if (requestId !== state.correspondentRequestId) return;
      populateSelect(select, [], "Unable to load correspondent banks");
      select.disabled = true;
      setStatus("Correspondent bank list error", "error");
    }
  }

  async function loadCorrespondentBankOptions(currency, bankName) {
    const manualTable = getManualTable(currency);
    if (manualTable) return extractCorrespondentBanks(manualTable, bankName);

    const readerUrl = getAppsScriptReaderUrl();
    if (readerUrl) {
      try {
        return await loadAppsScriptCorrespondentBanks(readerUrl, currency, bankName);
      } catch (error) {
        console.warn("Full sheet reader failed; using public sheet fallback.", error);
      }
    }

    const table = await loadGoogleSheetTable(currency);
    return extractCorrespondentBanks(table, bankName);
  }

  function getAppsScriptReaderUrl() {
    return String(window.RELENISHMENTS_CONFIG?.correspondentBankReaderUrl || "").trim();
  }

  function getAppsScriptWriterUrl() {
    return String(window.RELENISHMENTS_CONFIG?.replenishmentWriterUrl || getAppsScriptReaderUrl()).trim();
  }

  function populateSelect(select, values, placeholder, selectedValue = "") {
    if (!select) return;
    select.innerHTML = `<option value="">${placeholder}</option>`;
    for (const value of values) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      select.append(option);
    }
    if (selectedValue && isOptionAllowed(selectedValue, values)) {
      select.value = selectedValue;
    }
  }

  async function loadAppsScriptCorrespondentBanks(readerUrl, sheetName, bankName) {
    let url;
    try {
      url = new URL(readerUrl);
    } catch (error) {
      throw new Error("Full sheet reader URL is invalid.");
    }

    url.searchParams.set("sheet", sheetName);
    url.searchParams.set("bank", bankName);

    const response = await fetch(url.toString(), {
      cache: "no-store",
      mode: "cors",
    });
    if (!response.ok) {
      throw new Error("Full sheet reader request failed.");
    }

    const payload = await response.json();
    if (!payload || payload.ok !== true || !Array.isArray(payload.values)) {
      throw new Error(payload?.error || "Full sheet reader returned no correspondent banks.");
    }

    return uniqueCleanValues(payload.values);
  }

  function loadGoogleSheetTable(sheetName, range = "A:G", options = {}) {
    const cacheKey = `${sheetName}::${range}`;
    if (!options.forceRefresh && state.sheetCache.has(cacheKey)) return Promise.resolve(state.sheetCache.get(cacheKey));

    return new Promise((resolve, reject) => {
      const callbackName = `__relenishmentsSheet_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const script = document.createElement("script");
      const timeoutId = window.setTimeout(() => {
        cleanup();
        reject(new Error("Google Sheets request timed out."));
      }, 20000);
      const url = new URL(`https://docs.google.com/spreadsheets/d/${GOOGLE_SHEET_ID}/gviz/tq`);
      url.searchParams.set("sheet", sheetName);
      if (range) url.searchParams.set("range", range);
      url.searchParams.set("tqx", `out:json;responseHandler:${callbackName}`);
      if (options.forceRefresh) url.searchParams.set("_", String(Date.now()));

      window[callbackName] = (response) => {
        cleanup();
        if (!response || response.status === "error" || !response.table) {
          reject(new Error("Google Sheets returned no table data."));
          return;
        }
        state.sheetCache.set(cacheKey, response.table);
        resolve(response.table);
      };

      script.onerror = () => {
        cleanup();
        reject(new Error("Unable to load Google Sheets data."));
      };
      script.async = true;
      script.src = url.toString();
      document.head.append(script);

      function cleanup() {
        window.clearTimeout(timeoutId);
        delete window[callbackName];
        script.remove();
      }
    });
  }

  function extractCorrespondentBanks(table, bankName) {
    const rows = Array.isArray(table?.rows) ? table.rows : [];
    const columns = table?.cols || [];
    let bankColumnIndex = findColumnIndex(columns, BANK_HEADER);
    let correspondentColumnIndex = findColumnIndex(columns, CORRESPONDENT_BANK_HEADER);
    let dataRows = rows;

    if ((bankColumnIndex < 0 || correspondentColumnIndex < 0) && rows.length) {
      const firstRowValues = readRowValues(rows[0]);
      if (bankColumnIndex < 0) {
        bankColumnIndex = firstRowValues.findIndex((value) => normalizeHeader(value) === BANK_HEADER);
      }
      if (correspondentColumnIndex < 0) {
        correspondentColumnIndex = firstRowValues.findIndex((value) => normalizeHeader(value) === CORRESPONDENT_BANK_HEADER);
      }
      dataRows = bankColumnIndex >= 0 && correspondentColumnIndex >= 0 ? rows.slice(1) : rows;
    }

    const selectedBankKey = normalizeComparable(bankName);
    if (bankColumnIndex < 0) {
      bankColumnIndex = findColumnByComparableValue(dataRows, selectedBankKey);
    }
    if (bankColumnIndex < 0 && columns.length) {
      bankColumnIndex = 0;
    }

    if (bankColumnIndex < 0 || correspondentColumnIndex < 0) return [];

    const matchingValues = [];
    for (const row of dataRows) {
      if (normalizeComparable(readCellValue(row, bankColumnIndex)) !== selectedBankKey) continue;
      const value = readCellValue(row, correspondentColumnIndex);
      matchingValues.push(value);
    }
    return uniqueCleanValues(matchingValues);
  }

  function findColumnByComparableValue(rows, selectedValue) {
    for (const row of rows) {
      const cells = row?.c || [];
      for (let index = 0; index < cells.length; index += 1) {
        if (normalizeComparable(cellText(cells[index])) === selectedValue) {
          return index;
        }
      }
    }
    return -1;
  }

  function findColumnIndex(columns, headerName) {
    return columns.findIndex((column) => normalizeHeader(column?.label || column?.id) === headerName);
  }

  function readRowValues(row) {
    return Array.from(row?.c || []).map((cell) => cellText(cell));
  }

  function readCellValue(row, index) {
    return cellText(row?.c?.[index]);
  }

  function cellText(cell) {
    const value = cell?.v ?? cell?.f ?? "";
    return String(value).trim();
  }

  function normalizeHeader(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalizeComparable(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  function uniqueCleanValues(values) {
    const seen = new Set();
    const cleanedValues = [];
    for (const rawValue of values) {
      const value = String(rawValue || "").trim();
      const key = value.toLowerCase();
      if (!value || seen.has(key)) continue;
      seen.add(key);
      cleanedValues.push(value);
    }
    return cleanedValues;
  }

  function bindAmountFormatter() {
    if (!elements.amountInput) return;
    elements.amountInput.addEventListener("input", () => {
      elements.amountInput.value = formatAmountInput(elements.amountInput.value);
    });
    elements.amountInput.addEventListener("blur", () => {
      const value = normalizeAmount(elements.amountInput.value);
      if (!value) return;
      const amount = Number(value);
      if (Number.isFinite(amount)) {
        elements.amountInput.value = amount.toLocaleString("en-US", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
      }
    });
  }

  function formatAmountInput(value) {
    const normalized = normalizeAmount(value);
    if (!normalized) return "";
    const [integer, decimal = ""] = normalized.split(".");
    const formattedInteger = Number(integer || 0).toLocaleString("en-US", {
      maximumFractionDigits: 0,
    });
    return normalized.includes(".") ? `${formattedInteger}.${decimal}` : formattedInteger;
  }

  function normalizeAmount(value) {
    let text = String(value || "").replace(/,/g, "").replace(/[^\d.]/g, "");
    const dotIndex = text.indexOf(".");
    if (dotIndex >= 0) {
      text = `${text.slice(0, dotIndex + 1)}${text.slice(dotIndex + 1).replace(/\./g, "")}`;
      const [integer, decimal = ""] = text.split(".");
      return `${integer}.${decimal.slice(0, 2)}`;
    }
    return text;
  }

  function setupDatePicker() {
    if (!elements.dateInput) return;
    state.selectedDate = parseDateValue(elements.dateInput.value) || startOfDay(new Date());
    state.visibleMonth = new Date(state.selectedDate.getFullYear(), state.selectedDate.getMonth(), 1);
    setSelectedDate(state.selectedDate, false);

    elements.dateTrigger?.addEventListener("click", () => {
      toggleDatePicker();
    });
    elements.prevMonthButton?.addEventListener("click", () => {
      changeVisibleMonth(-1);
    });
    elements.nextMonthButton?.addEventListener("click", () => {
      changeVisibleMonth(1);
    });
    elements.prevYearButton?.addEventListener("click", () => {
      changeVisibleMonth(-12);
    });
    elements.nextYearButton?.addEventListener("click", () => {
      changeVisibleMonth(12);
    });
    document.addEventListener("click", (event) => {
      if (!elements.datePicker?.contains(event.target)) closeDatePicker();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeDatePicker();
    });
    renderCalendar();
  }

  function todayValue() {
    const today = new Date();
    return dateValue(startOfDay(today));
  }

  function toggleDatePicker() {
    if (!elements.datePopover) return;
    if (elements.datePopover.hidden) openDatePicker();
    else closeDatePicker();
  }

  function openDatePicker() {
    if (!elements.datePopover) return;
    elements.datePopover.hidden = false;
    elements.dateTrigger?.setAttribute("aria-expanded", "true");
    renderCalendar();
  }

  function closeDatePicker() {
    if (!elements.datePopover || elements.datePopover.hidden) return;
    elements.datePopover.hidden = true;
    elements.dateTrigger?.setAttribute("aria-expanded", "false");
  }

  function changeVisibleMonth(delta) {
    state.visibleMonth = new Date(state.visibleMonth.getFullYear(), state.visibleMonth.getMonth() + delta, 1);
    renderCalendar();
  }

  function renderCalendar() {
    if (!elements.dateGrid || !elements.dateMonthLabel || !state.visibleMonth) return;

    const month = state.visibleMonth.getMonth();
    const year = state.visibleMonth.getFullYear();
    elements.dateMonthLabel.textContent = state.visibleMonth.toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
    });
    elements.dateGrid.innerHTML = "";

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = startOfDay(new Date());

    for (let index = 0; index < firstDay; index += 1) {
      const spacer = document.createElement("span");
      spacer.className = "date-grid-spacer";
      elements.dateGrid.append(spacer);
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = new Date(year, month, day);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "date-day-button";
      button.textContent = String(day);
      if (sameDay(date, today)) button.classList.add("today");
      if (sameDay(date, state.selectedDate)) button.classList.add("selected");
      button.addEventListener("click", () => {
        setSelectedDate(date, true);
      });
      elements.dateGrid.append(button);
    }
  }

  function setSelectedDate(date, closeAfterSelect) {
    state.selectedDate = startOfDay(date);
    elements.dateInput.value = dateValue(state.selectedDate);
    if (elements.dateDisplay) {
      elements.dateDisplay.textContent = state.selectedDate.toLocaleDateString("en-US", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
    }
    renderCalendar();
    clearResultFields();
    if (closeAfterSelect) closeDatePicker();
  }

  function parseDateValue(value) {
    const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }

  function dateValue(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function startOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function sameDay(a, b) {
    return a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  function bindCalculateButton() {
    elements.calculateButton?.addEventListener("click", async () => {
      if (!validateCalculateFields()) return;
      await calculatePreviousRows();
    });
  }

  function validateCalculateFields() {
    const requiredFields = [
      { element: elements.bankSelect, label: "Bank" },
      { element: elements.dateInput, label: "Date", focusElement: elements.dateTrigger },
      { element: elements.currencySelect, label: "Currency" },
      { element: elements.correspondentBankSelect, label: "Correspondent Bank" },
    ];

    for (const field of requiredFields) {
      if (String(field.element?.value || "").trim()) continue;

      setStatus(`${field.label} is required`, "error");
      const focusElement = field.focusElement || field.element;
      if (focusElement && typeof focusElement.focus === "function") {
        focusElement.focus();
      }
      return false;
    }

    return true;
  }

  async function calculatePreviousRows() {
    clearResultFields();
    setCalculateBusy(true);
    setStatus("Finding previous rows", "muted");

    try {
      const criteria = collectPreviousRowCriteria();
      const rows = await loadPreviousReplenishmentRows(criteria);
      if (!rows.eighty && !rows.hundred) {
        setStatus("No previous rows found", "warning");
        return;
      }

      if (rows.eighty) fillEightyFields(rows.eighty);
      if (rows.hundred) fillHundredFields(rows.hundred);

      if (rows.eighty && rows.hundred) {
        setStatus(`80% ${rows.eighty.date || ""} / 100% ${rows.hundred.date || ""}`.trim(), "muted");
      } else if (rows.eighty) {
        setStatus("80% row loaded; no 100% row found", "warning");
      } else {
        setStatus("100% row loaded; no 80% row found", "warning");
      }
    } catch (error) {
      console.error(error);
      setStatus(error.message || "Previous row lookup failed", "error");
    } finally {
      setCalculateBusy(false);
    }
  }

  function collectPreviousRowCriteria() {
    const selectedDate = parseDateValue(requiredFieldValue(elements.dateInput, "Date"));
    if (!selectedDate) throw new Error("Date is invalid.");

    return {
      sheet: requiredFieldValue(elements.currencySelect, "Currency"),
      bank: requiredFieldValue(elements.bankSelect, "Bank"),
      dateValue: requiredFieldValue(elements.dateInput, "Date"),
      selectedDate,
      correspondentBank: requiredFieldValue(elements.correspondentBankSelect, "Correspondent Bank"),
    };
  }

  async function loadPreviousReplenishmentRows(criteria) {
    const manualTable = getManualTable(criteria.sheet);
    if (manualTable) return findPreviousReplenishmentRows(manualTable, criteria);

    const readerUrl = getAppsScriptReaderUrl();
    if (readerUrl) {
      try {
        return await loadAppsScriptPreviousRows(readerUrl, criteria);
      } catch (error) {
        console.warn("Previous row reader failed; using public sheet fallback.", error);
      }
    }

    const table = await loadGoogleSheetTable(criteria.sheet, "A:G", { forceRefresh: true });
    return findPreviousReplenishmentRows(table, criteria);
  }

  async function loadAppsScriptPreviousRows(readerUrl, criteria) {
    let url;
    try {
      url = new URL(readerUrl);
    } catch (error) {
      throw new Error("Full sheet reader URL is invalid.");
    }

    url.searchParams.set("action", "previousReplenishment");
    url.searchParams.set("sheet", criteria.sheet);
    url.searchParams.set("bank", criteria.bank);
    url.searchParams.set("date", criteria.dateValue);
    url.searchParams.set("correspondentBank", criteria.correspondentBank);

    const response = await fetch(url.toString(), {
      cache: "no-store",
      mode: "cors",
    });
    if (!response.ok) {
      throw new Error("Previous row request failed.");
    }

    const payload = await response.json();
    if (!payload || payload.ok !== true) {
      throw new Error(payload?.error || "Previous row endpoint is unavailable.");
    }

    if (payload.rows && typeof payload.rows === "object") {
      return {
        eighty: payload.rows.eighty || null,
        hundred: payload.rows.hundred || null,
      };
    }

    if (Object.prototype.hasOwnProperty.call(payload, "row")) {
      return {
        eighty: payload.row || null,
        hundred: null,
      };
    }

    throw new Error("Previous row endpoint is unavailable.");
  }

  function findPreviousReplenishmentRows(table, criteria) {
    const rows = Array.isArray(table?.rows) ? table.rows : [];
    const columns = table?.cols || [];
    const bankColumn = resolveTableColumn(columns, rows, "bank", 0);
    const amountColumn = resolveTableColumn(columns, rows, "amount", 1);
    const referenceColumn = resolveTableColumn(columns, rows, "ref no", 2);
    const dateColumn = resolveTableColumn(columns, rows, "date", 3);
    const registeredAmountColumn = resolveTableColumn(columns, rows, "registered amount", 4);
    const correspondentColumn = resolveTableColumn(columns, rows, "correspondent bank", 6);

    if (bankColumn < 0 || dateColumn < 0 || correspondentColumn < 0) {
      throw new Error("Required sheet columns were not found.");
    }

    const selectedBank = normalizeComparable(criteria.bank);
    const selectedCorrespondentBank = normalizeComparable(criteria.correspondentBank);
    const candidates = [];

    rows.forEach((row, rowIndex) => {
      if (normalizeComparable(readCellDisplayValue(row, bankColumn)) !== selectedBank) return;
      if (normalizeComparable(readCellDisplayValue(row, correspondentColumn)) !== selectedCorrespondentBank) return;

      const amount = readCellDisplayValue(row, amountColumn);
      if (!isPositiveAmount(amount)) return;

      const rowDate = parseSheetDateCell(row?.c?.[dateColumn]);
      if (!rowDate || rowDate >= criteria.selectedDate) return;

      candidates.push({
        rowDate,
        rowIndex,
        dateKey: dateValue(rowDate),
        row: {
          amount,
          referenceNumber: readCellDisplayValue(row, referenceColumn),
          date: previousRowDateDisplay(row, dateColumn, rowDate),
          registeredAmount: readCellDisplayValue(row, registeredAmountColumn),
          correspondentBank: readCellDisplayValue(row, correspondentColumn),
        },
      });
    });

    const previousRows = selectPreviousRowsByDistinctDate(candidates);
    return {
      eighty: previousRows[0] || null,
      hundred: previousRows[1] || null,
    };
  }

  function selectPreviousRowsByDistinctDate(candidates) {
    const seenDates = new Set();
    return candidates
      .sort((left, right) => right.rowDate - left.rowDate || right.rowIndex - left.rowIndex)
      .filter((candidate) => {
        if (seenDates.has(candidate.dateKey)) return false;
        seenDates.add(candidate.dateKey);
        return true;
      })
      .slice(0, 2)
      .map((candidate) => candidate.row);
  }

  function isPositiveAmount(value) {
    const normalized = normalizeSheetAmount(value);
    return normalized !== "" && Number(normalized) > 0;
  }

  function normalizeSheetAmount(value) {
    return String(value || "")
      .replace(/[\u066c,]/g, "")
      .replace(/[^\d.-]/g, "")
      .trim();
  }

  function resolveTableColumn(columns, rows, headerName, fallbackIndex) {
    const normalizedHeader = normalizeHeader(headerName);
    let index = columns.findIndex((column) => normalizeHeader(column?.label || column?.id) === normalizedHeader);
    if (index >= 0) return index;

    if (rows.length) {
      const firstRowValues = readRowDisplayValues(rows[0]);
      index = firstRowValues.findIndex((value) => normalizeHeader(value) === normalizedHeader);
      if (index >= 0) return index;
    }

    return fallbackIndex;
  }

  function readRowDisplayValues(row) {
    return Array.from(row?.c || []).map((cell) => cellDisplayText(cell));
  }

  function readCellDisplayValue(row, index) {
    return cellDisplayText(row?.c?.[index]);
  }

  function cellDisplayText(cell) {
    const value = cell?.f ?? cell?.v ?? "";
    return String(value).trim();
  }

  function parseSheetDateCell(cell) {
    const displayValue = cellDisplayText(cell);
    const rawValue = String(cell?.v ?? "").trim();
    return parseSheetDate(displayValue) || parseSheetDate(rawValue);
  }

  function previousRowDateDisplay(row, dateColumn, rowDate) {
    const value = readCellDisplayValue(row, dateColumn);
    if (/^\d{5}(?:\.\d+)?$/.test(value)) return formatDisplayDate(rowDate);
    return value || formatDisplayDate(rowDate);
  }

  function parseSheetDate(value) {
    const text = String(value || "").trim();
    if (!text) return null;

    if (/^\d{5}(?:\.\d+)?$/.test(text)) {
      return excelSerialDate(Number(text));
    }

    const googleDateMatch = text.match(/^Date\((\d{4}),\s*(\d{1,2}),\s*(\d{1,2})\)$/);
    if (googleDateMatch) {
      return startOfDay(new Date(Number(googleDateMatch[1]), Number(googleDateMatch[2]), Number(googleDateMatch[3])));
    }

    const slashDateMatch = text.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
    if (slashDateMatch) {
      const yearText = slashDateMatch[3];
      const year = yearText.length === 2 ? Number(`20${yearText}`) : Number(yearText);
      return startOfDay(new Date(year, Number(slashDateMatch[2]) - 1, Number(slashDateMatch[1])));
    }

    return null;
  }

  function excelSerialDate(value) {
    if (!Number.isFinite(value) || value < 20000 || value > 80000) return null;
    const utcDate = new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * 86400000);
    return startOfDay(new Date(utcDate.getUTCFullYear(), utcDate.getUTCMonth(), utcDate.getUTCDate()));
  }

  function formatDisplayDate(date) {
    if (!date) return "";
    return `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;
  }

  function fillEightyFields(row) {
    if (elements.eightyAmountInput) elements.eightyAmountInput.value = row.amount || "";
    if (elements.eightyReferenceInput) elements.eightyReferenceInput.value = row.referenceNumber || "";
    if (elements.eightyDateInput) elements.eightyDateInput.value = row.date || "";
    if (elements.eightyRegisteredAmountInput) elements.eightyRegisteredAmountInput.value = row.registeredAmount || "";
    if (elements.eightyCorrespondentBankInput) elements.eightyCorrespondentBankInput.value = row.correspondentBank || "";
    if (elements.eightyCoverageInput) elements.eightyCoverageInput.value = row.coverage || "";
  }

  function fillHundredFields(row) {
    if (elements.hundredAmountInput) elements.hundredAmountInput.value = row.amount || "";
    if (elements.hundredReferenceInput) elements.hundredReferenceInput.value = row.referenceNumber || "";
    if (elements.hundredDateInput) elements.hundredDateInput.value = row.date || "";
    if (elements.hundredRegisteredAmountInput) elements.hundredRegisteredAmountInput.value = row.registeredAmount || "";
    if (elements.hundredCorrespondentBankInput) elements.hundredCorrespondentBankInput.value = row.correspondentBank || "";
    if (elements.hundredCoverageInput) elements.hundredCoverageInput.value = row.coverage || "";
  }

  function clearResultFields() {
    if (elements.eightyAmountInput) elements.eightyAmountInput.value = "";
    if (elements.eightyReferenceInput) elements.eightyReferenceInput.value = "";
    if (elements.eightyDateInput) elements.eightyDateInput.value = "";
    if (elements.eightyRegisteredAmountInput) elements.eightyRegisteredAmountInput.value = "";
    if (elements.eightyCorrespondentBankInput) elements.eightyCorrespondentBankInput.value = "";
    if (elements.eightyCoverageInput) elements.eightyCoverageInput.value = "";
    if (elements.hundredAmountInput) elements.hundredAmountInput.value = "";
    if (elements.hundredReferenceInput) elements.hundredReferenceInput.value = "";
    if (elements.hundredDateInput) elements.hundredDateInput.value = "";
    if (elements.hundredRegisteredAmountInput) elements.hundredRegisteredAmountInput.value = "";
    if (elements.hundredCorrespondentBankInput) elements.hundredCorrespondentBankInput.value = "";
    if (elements.hundredCoverageInput) elements.hundredCoverageInput.value = "";
  }

  function setCalculateBusy(isBusy) {
    if (elements.calculateButton) elements.calculateButton.disabled = isBusy;
  }

  function bindSubmitConfirmation() {
    elements.submitButton?.addEventListener("click", async () => {
      if (!elements.form?.reportValidity()) return;
      await handleSubmitIntent();
    });
    elements.confirmNo?.addEventListener("click", closeSubmitConfirm);
    elements.confirmYes?.addEventListener("click", async () => {
      await submitReplenishment();
    });
    elements.confirmOverlay?.addEventListener("click", (event) => {
      if (event.target === elements.confirmOverlay) closeSubmitConfirm();
    });
    elements.duplicateClose?.addEventListener("click", closeDuplicateReferencePrompt);
    elements.duplicateOverlay?.addEventListener("click", (event) => {
      if (event.target === elements.duplicateOverlay) closeDuplicateReferencePrompt();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      closeSubmitConfirm();
      closeDuplicateReferencePrompt();
    });
  }

  async function handleSubmitIntent() {
    if (state.submitting || state.checkingDuplicate) return;

    state.checkingDuplicate = true;
    setSubmitBusy(true);
    setStatus("Checking reference", "muted");

    try {
      const criteria = collectDuplicateCriteria();
      const result = await checkDuplicateReference(criteria);
      if (result.duplicate) {
        showDuplicateReferencePrompt(criteria, result);
        return;
      }

      setStatus("Ready", "muted");
      openSubmitConfirm();
    } catch (error) {
      console.error(error);
      const message = error.message || "Reference check failed. Submission blocked.";
      setStatus(message, "error");
      showBlockingPrompt("Reference check failed", message);
    } finally {
      state.checkingDuplicate = false;
      setSubmitBusy(false);
    }
  }

  function collectDuplicateCriteria() {
    return {
      sheet: requiredFieldValue(elements.currencySelect, "Currency"),
      bank: requiredFieldValue(elements.bankSelect, "Bank"),
      referenceNumber: requiredFieldValue(elements.referenceInput, "Reference Number"),
    };
  }

  async function checkDuplicateReference(criteria) {
    const readerUrl = getAppsScriptWriterUrl() || getAppsScriptReaderUrl();
    if (readerUrl) {
      try {
        return await loadAppsScriptDuplicateReference(readerUrl, criteria);
      } catch (error) {
        console.warn("Duplicate reference reader failed; using public sheet fallback.", error);
      }
    }

    const table = await loadGoogleSheetTable(criteria.sheet, "A:G", { forceRefresh: true });
    return findDuplicateReference(table, criteria);
  }

  async function loadAppsScriptDuplicateReference(readerUrl, criteria) {
    let url;
    try {
      url = new URL(readerUrl);
    } catch (error) {
      throw new Error("Full sheet reader URL is invalid.");
    }

    url.searchParams.set("action", "duplicateReplenishment");
    url.searchParams.set("sheet", criteria.sheet);
    url.searchParams.set("bank", criteria.bank);
    url.searchParams.set("referenceNumber", criteria.referenceNumber);

    const response = await fetch(url.toString(), {
      cache: "no-store",
      mode: "cors",
    });
    if (!response.ok) {
      throw new Error("Duplicate reference request failed.");
    }

    const payload = await response.json();
    if (!payload || payload.ok !== true || !Object.prototype.hasOwnProperty.call(payload, "duplicate")) {
      throw new Error(payload?.error || "Duplicate reference endpoint is unavailable.");
    }

    return payload;
  }

  function findDuplicateReference(table, criteria) {
    const rows = Array.isArray(table?.rows) ? table.rows : [];
    const columns = table?.cols || [];
    const bankColumn = resolveTableColumn(columns, rows, "bank", 0);
    const referenceColumn = resolveTableColumn(columns, rows, "ref no", 2);

    if (bankColumn < 0 || referenceColumn < 0) {
      throw new Error("Required sheet columns were not found.");
    }

    const selectedBank = normalizeComparable(criteria.bank);
    const selectedReference = normalizeComparable(criteria.referenceNumber);

    for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
      const row = rows[rowIndex];
      if (normalizeComparable(readCellDisplayValue(row, bankColumn)) !== selectedBank) continue;
      if (normalizeComparable(readCellDisplayValue(row, referenceColumn)) !== selectedReference) continue;

      return {
        ok: true,
        source: "public-sheet-duplicate-reference",
        sheet: criteria.sheet,
        bank: criteria.bank,
        referenceNumber: criteria.referenceNumber,
        duplicate: true,
        row: rowIndex + 2,
      };
    }

    return {
      ok: true,
      source: "public-sheet-duplicate-reference",
      sheet: criteria.sheet,
      bank: criteria.bank,
      referenceNumber: criteria.referenceNumber,
      duplicate: false,
      row: null,
    };
  }

  function showDuplicateReferencePrompt(criteria, result) {
    setStatus("Duplicate reference", "error");
    openReferencePrompt({
      title: "Duplicate reference",
      message: "This reference number already exists for the selected bank. Submission blocked.",
      items: [
        { label: "Bank", value: criteria.bank },
        { label: "Reference", value: criteria.referenceNumber },
        { label: "Sheet row", value: result.row || "" },
      ],
    });
  }

  function showBlockingPrompt(title, message) {
    openReferencePrompt({
      title,
      message,
      items: [],
    });
  }

  function openReferencePrompt({ title, message, items }) {
    if (!elements.duplicateOverlay) return;

    const titleElement = document.getElementById("duplicateReferenceTitle");
    if (titleElement) titleElement.textContent = title || "Submission blocked";
    if (elements.duplicateMessage) elements.duplicateMessage.textContent = message || "Submission blocked.";
    renderDuplicateMeta(items || []);

    elements.duplicateOverlay.hidden = false;
    window.requestAnimationFrame(() => {
      elements.duplicateClose?.focus();
    });
  }

  function renderDuplicateMeta(items) {
    if (!elements.duplicateMeta) return;
    elements.duplicateMeta.innerHTML = "";

    for (const item of items) {
      const value = String(item.value || "").trim();
      if (!value) continue;

      const row = document.createElement("div");
      row.className = "duplicate-reference-row";

      const label = document.createElement("span");
      label.textContent = item.label;

      const text = document.createElement("span");
      text.textContent = value;

      row.append(label, text);
      elements.duplicateMeta.append(row);
    }
  }

  function closeDuplicateReferencePrompt() {
    if (!elements.duplicateOverlay || elements.duplicateOverlay.hidden) return;
    elements.duplicateOverlay.hidden = true;
    elements.submitButton?.focus();
  }

  function openSubmitConfirm() {
    if (!elements.confirmOverlay) return;
    updateSubmitConfirmMessage();
    elements.confirmOverlay.hidden = false;
    elements.confirmYes?.focus();
  }

  function updateSubmitConfirmMessage() {
    if (!elements.confirmMessage) return;
    const currency = String(elements.currencySelect?.value || "").trim();
    elements.confirmMessage.textContent = currency
      ? `This will add the replenishment to the ${currency} sheet.`
      : "This will add the replenishment to the selected currency sheet.";
  }

  function closeSubmitConfirm() {
    if (!elements.confirmOverlay || elements.confirmOverlay.hidden) return;
    elements.confirmOverlay.hidden = true;
    elements.submitButton?.focus();
  }

  async function submitReplenishment() {
    if (state.submitting || !elements.form?.reportValidity()) return;

    const writerUrl = getAppsScriptWriterUrl();
    if (!writerUrl) {
      setStatus("Submit URL missing", "error");
      return;
    }

    state.submitting = true;
    setSubmitBusy(true);
    setStatus("Submitting", "muted");

    try {
      const payload = collectSubmitPayload();
      const response = await appendReplenishment(writerUrl, payload);
      closeSubmitConfirm();
      setStatus(`Submitted to ${response.sheet} row ${response.row}`, "muted");
    } catch (error) {
      console.error(error);
      const message = error.message || "Submit failed";
      setStatus(message, "error");
      if (/Reference Number already exists/i.test(message)) {
        closeSubmitConfirm();
        try {
          showDuplicateReferencePrompt(collectDuplicateCriteria(), {});
        } catch (duplicateError) {
          showBlockingPrompt("Duplicate reference", `${message} Submission blocked.`);
        }
      }
    } finally {
      state.submitting = false;
      setSubmitBusy(false);
    }
  }

  function collectSubmitPayload() {
    return {
      action: "appendReplenishment",
      sheet: requiredFieldValue(elements.currencySelect, "Currency"),
      bank: requiredFieldValue(elements.bankSelect, "Bank"),
      amount: requiredFieldValue(elements.amountInput, "Amount"),
      referenceNumber: requiredFieldValue(elements.referenceInput, "Reference Number"),
      date: formatSheetDate(requiredFieldValue(elements.dateInput, "Date")),
      correspondentBank: requiredFieldValue(elements.correspondentBankSelect, "Correspondent Bank"),
    };
  }

  async function appendReplenishment(writerUrl, payload) {
    const response = await fetch(writerUrl, {
      method: "POST",
      mode: "cors",
      cache: "no-store",
      body: new URLSearchParams(payload),
    });
    if (!response.ok) {
      throw new Error("Google Sheets submit request failed.");
    }
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.toLowerCase().includes("application/json")) {
      throw new Error("Apps Script update required");
    }

    const result = await response.json();
    if (!result || result.ok !== true) {
      throw new Error(result?.error || "Google Sheets submit returned an error.");
    }
    return result;
  }

  function requiredFieldValue(element, label) {
    const value = String(element?.value || "").trim();
    if (!value) throw new Error(`${label} is required.`);
    return value;
  }

  function formatSheetDate(value) {
    const date = parseDateValue(value);
    if (!date) return value;
    return `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;
  }

  function setSubmitBusy(isBusy) {
    if (elements.uploadButton) elements.uploadButton.disabled = isBusy;
    if (elements.calculateButton) elements.calculateButton.disabled = isBusy;
    if (elements.submitButton) elements.submitButton.disabled = isBusy;
    if (elements.confirmYes) elements.confirmYes.disabled = isBusy;
    if (elements.confirmNo) elements.confirmNo.disabled = isBusy;
  }

  function setUploadBusy(isBusy) {
    if (elements.uploadButton) elements.uploadButton.disabled = isBusy;
    if (elements.calculateButton) elements.calculateButton.disabled = isBusy;
    if (elements.submitButton) elements.submitButton.disabled = isBusy;
  }

  function setStatus(text, variant) {
    if (!elements.formStatus) return;
    elements.formStatus.textContent = text;
    elements.formStatus.classList.remove("muted", "warning", "error");
    if (variant) elements.formStatus.classList.add(variant);
  }
})();
