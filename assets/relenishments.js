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
    submitButton: document.getElementById("submitReplenishmentButton"),
    confirmOverlay: document.getElementById("submitConfirmOverlay"),
    confirmYes: document.getElementById("confirmSubmitYes"),
    confirmNo: document.getElementById("confirmSubmitNo"),
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
    submitting: false,
  };

  init();

  function init() {
    window.lucide?.createIcons();
    initializeBankCurrencyOptions();
    bindAmountFormatter();
    bindCurrencyDependentFields();
    setupDatePicker();
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
        const matrix = await loadBankCurrencyMatrix(currencies);
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
      updateCorrespondentBanks();
    });
    elements.currencySelect?.addEventListener("change", () => {
      syncBankCurrencyOptions("currency");
      updateCorrespondentBanks();
    });
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

  function loadGoogleSheetTable(sheetName, range = "A:G") {
    const cacheKey = `${sheetName}::${range}`;
    if (state.sheetCache.has(cacheKey)) return Promise.resolve(state.sheetCache.get(cacheKey));

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

  function bindSubmitConfirmation() {
    elements.submitButton?.addEventListener("click", () => {
      if (!elements.form?.reportValidity()) return;
      openSubmitConfirm();
    });
    elements.confirmNo?.addEventListener("click", closeSubmitConfirm);
    elements.confirmYes?.addEventListener("click", async () => {
      await submitReplenishment();
    });
    elements.confirmOverlay?.addEventListener("click", (event) => {
      if (event.target === elements.confirmOverlay) closeSubmitConfirm();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeSubmitConfirm();
    });
  }

  function openSubmitConfirm() {
    if (!elements.confirmOverlay) return;
    elements.confirmOverlay.hidden = false;
    elements.confirmYes?.focus();
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
      setStatus(error.message || "Submit failed", "error");
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
    if (elements.submitButton) elements.submitButton.disabled = isBusy;
    if (elements.confirmYes) elements.confirmYes.disabled = isBusy;
    if (elements.confirmNo) elements.confirmNo.disabled = isBusy;
  }

  function setStatus(text, variant) {
    if (!elements.formStatus) return;
    elements.formStatus.textContent = text;
    elements.formStatus.classList.remove("muted", "warning", "error");
    if (variant) elements.formStatus.classList.add(variant);
  }
})();
