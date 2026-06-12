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
      resetButton: document.getElementById("resetReplenishmentButton"),
      approveButton: document.getElementById("approveReplenishmentButton"),
      rejectButton: document.getElementById("rejectReplenishmentButton"),
      reportButton: document.getElementById("reportReplenishmentButton"),
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
    actionConfirmOverlay: document.getElementById("actionConfirmOverlay"),
    actionConfirmDialog: document.getElementById("actionConfirmDialog"),
    actionConfirmIcon: document.getElementById("actionConfirmIcon"),
    actionConfirmTitle: document.getElementById("actionConfirmTitle"),
    actionConfirmMessage: document.getElementById("actionConfirmMessage"),
    actionConfirmYes: document.getElementById("actionConfirmYes"),
    actionConfirmNo: document.getElementById("actionConfirmNo"),
    duplicateOverlay: document.getElementById("duplicateReferenceOverlay"),
    duplicateMessage: document.getElementById("duplicateReferenceMessage"),
    duplicateMeta: document.getElementById("duplicateReferenceMeta"),
    duplicateClose: document.getElementById("duplicateReferenceClose"),
    formStatus: document.getElementById("relenishmentsStatus"),
    operationTracker: document.getElementById("replenishmentOperationTracker"),
    operationLabel: document.getElementById("replenishmentOperationLabel"),
    operationPercent: document.getElementById("replenishmentOperationPercent"),
    operationSteps: document.getElementById("replenishmentOperationSteps"),
    operationFill: document.getElementById("replenishmentOperationFill"),
    heroCanvas: document.getElementById("replenishmentHeroCanvas"),
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
    driveUploadFile: null,
    uploadWorker: null,
    uploadRequestId: 0,
    operationKey: null,
    operationLabelText: "Idle",
    operationStepsText: "Idle → Ready → Done",
    operationStartedAt: 0,
    operationFrameId: 0,
    operationFinishTimer: 0,
    submitting: false,
    checkingDuplicate: false,
    submitAwaitingConfirm: false,
    pendingActionConfirm: null,
  };

  init();

  function init() {
    window.lucide?.createIcons();
    bindFormSubmitGuard();
    initializeBankCurrencyOptions();
      bindAmountFormatter();
      bindCurrencyDependentFields();
      bindResetButton();
      bindApproveRejectButtons();
      bindReportButton();
      bindManualUpload();
      setupDatePicker();
    bindCalculateButton();
    bindSubmitConfirmation();
    startReplenishmentHeroCanvas();
  }

  function bindFormSubmitGuard() {
    elements.form?.addEventListener("submit", (event) => {
      event.preventDefault();
    });
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

    function bindReportButton() {
      elements.reportButton?.addEventListener("click", async () => {
        if (isOperationActive()) return;
        beginOperation("report", "Preparing report");
        setStatus("End-of-day report will be added next", "muted");
        await sleep(900);
        finishOperation("End-of-day report will be added next");
      });
    }

    function bindResetButton() {
      elements.resetButton?.addEventListener("click", () => {
        if (isOperationActive()) return;
        openActionConfirm({
          kind: "reset",
          title: "Reset this form?",
          message: "This will clear the current replenishment inputs. You can still change the reset behavior later.",
          yesLabel: "Reset",
          onConfirm: () => setStatus("Reset action will be added next", "muted"),
        });
      });
    }

    function bindApproveRejectButtons() {
      elements.approveButton?.addEventListener("click", () => {
        if (isOperationActive()) return;
        openActionConfirm({
          kind: "approve",
          title: "Approve this item?",
          message: "Are you sure you want to approve this item?",
          yesLabel: "Approve",
          onConfirm: () => setStatus("Approve action will be added next", "muted"),
        });
      });

      elements.rejectButton?.addEventListener("click", () => {
        if (isOperationActive()) return;
        openActionConfirm({
          kind: "reject",
          title: "Reject this item?",
          message: "Are you sure you want to reject this item?",
          yesLabel: "Reject",
          onConfirm: () => setStatus("Reject action will be added next", "muted"),
        });
      });
    }

    function getActionButtons() {
      return [
        elements.resetButton,
        elements.approveButton,
        elements.rejectButton,
        elements.reportButton,
        elements.uploadButton,
        elements.calculateButton,
        elements.submitButton,
      ].filter(Boolean);
    }

  function setActionButtonsBusy(isBusy) {
    for (const button of getActionButtons()) {
      button.disabled = isBusy;
    }
  }

    function setConfirmButtonsBusy(isBusy) {
      if (elements.confirmYes) elements.confirmYes.disabled = isBusy;
      if (elements.confirmNo) elements.confirmNo.disabled = isBusy;
    }

    function setActionConfirmButtonsBusy(isBusy) {
      if (elements.actionConfirmYes) elements.actionConfirmYes.disabled = isBusy;
      if (elements.actionConfirmNo) elements.actionConfirmNo.disabled = isBusy;
    }

  function isOperationActive() {
    return Boolean(state.operationKey || state.submitting || state.checkingDuplicate);
  }

  function sleep(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  function beginOperation(operationKey, label) {
    clearOperationTimers();
    state.operationKey = operationKey;
    state.operationLabelText = label || operationLabelFor(operationKey);
    state.operationStepsText = operationStepsFor(operationKey, "start");
    state.operationStartedAt = performance.now();
    updateOperationTracker(0, true, state.operationLabelText, "running");
    setActionButtonsBusy(true);
    state.operationFrameId = requestAnimationFrame(tickOperationTracker);
  }

  function finishOperation(finalLabel, status = "success") {
    clearOperationTimers();
    state.operationStepsText = operationStepsFor(state.operationKey, "done");
    updateOperationTracker(100, false, finalLabel || state.operationLabelText, status);
    state.operationFinishTimer = window.setTimeout(() => {
      state.operationKey = null;
      state.operationLabelText = "Idle";
      state.operationStepsText = "Idle → Ready → Done";
      updateOperationTracker(0, false, "Idle", "idle");
      setActionButtonsBusy(false);
    }, 520);
  }

  function resetOperationLock(finalLabel) {
    clearOperationTimers();
    state.operationKey = null;
    state.operationLabelText = "Idle";
    state.operationStepsText = "Idle → Ready → Done";
    updateOperationTracker(0, false, finalLabel || "Idle", "idle");
    setActionButtonsBusy(false);
  }

  function clearOperationTimers() {
    if (state.operationFrameId) {
      cancelAnimationFrame(state.operationFrameId);
      state.operationFrameId = 0;
    }
    if (state.operationFinishTimer) {
      window.clearTimeout(state.operationFinishTimer);
      state.operationFinishTimer = 0;
    }
  }

  function operationLabelFor(operationKey) {
    if (operationKey === "upload") return "Uploading workbook";
    if (operationKey === "calculate") return "Updating registered amounts";
    if (operationKey === "submit") return "Submitting";
    if (operationKey === "report") return "Preparing report";
    return "Working";
  }

  function operationStepsFor(operationKey, phase) {
    if (operationKey === "upload") {
      return phase === "done" ? "Uploading → Validating → Done" : "Uploading → Validating → Done";
    }
    if (operationKey === "calculate") {
      return phase === "done" ? "Checking → Matching → Done" : "Checking → Matching → Done";
    }
    if (operationKey === "submit") {
      return phase === "done" ? "Checking → Confirming → Done" : "Checking → Confirming → Done";
    }
    if (operationKey === "report") {
      return phase === "done" ? "Preparing → Generating → Done" : "Preparing → Generating → Done";
    }
    return "Idle → Ready → Done";
  }

  function tickOperationTracker() {
    if (!state.operationKey) return;
    const elapsed = performance.now() - state.operationStartedAt;
    const progress = Math.min(92, (elapsed / 2400) * 92);
    updateOperationTracker(progress, true, state.operationLabelText, "running");
    state.operationFrameId = requestAnimationFrame(tickOperationTracker);
  }

  function updateOperationTracker(progress, isActive, label, mode) {
    if (elements.operationTracker) {
      elements.operationTracker.classList.toggle("running", isActive);
      elements.operationTracker.classList.toggle("success", mode === "success");
      elements.operationTracker.classList.toggle("error", mode === "error");
    }
    if (elements.operationLabel) elements.operationLabel.textContent = label || "Idle";
    if (elements.operationPercent) elements.operationPercent.textContent = `${Math.max(0, Math.min(100, Math.round(progress || 0)))}%`;
    if (elements.operationSteps) elements.operationSteps.textContent = state.operationStepsText || "Idle → Ready → Done";
    if (elements.operationFill) elements.operationFill.style.width = `${Math.max(0, Math.min(100, progress || 0))}%`;
  }

  async function loadManualWorkbook(file) {
    if (!/\.(xlsx|xlsm)$/i.test(file.name)) {
      setStatus("Upload an .xlsx or .xlsm workbook", "error");
      return;
    }

    const uploadCriteria = collectDriveUploadCriteria();

    state.uploadRequestId += 1;
    const requestId = state.uploadRequestId;
    beginOperation("upload", "Reading workbook");
    setStatus("Reading workbook", "muted");

    try {
      const buffer = await file.arrayBuffer();
      state.driveUploadFile = {
        requestId,
        fileName: file.name,
        mimeType: file.type || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        base64: arrayBufferToBase64(buffer),
        criteria: uploadCriteria,
      };
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
      state.driveUploadFile = null;
      finishOperation(error.message || "Workbook upload failed", "error");
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
      finishOperation(event.message || "Workbook upload failed", "error");
      setStatus(event.message || "Workbook upload failed", "error");
    });
    return worker;
  }

  async function handleUploadWorkerMessage(event) {
    const message = event.data || {};
    if (message.requestId !== state.uploadRequestId) return;

    if (message.type === "progress") {
      state.operationLabelText = "Uploading";
      state.operationStepsText = "Uploading → Validating → Done";
      updateOperationTracker(18, true, state.operationLabelText, "running");
      setStatus(message.text || "Reading workbook", "muted");
      return;
    }

    if (message.type === "error") {
      state.driveUploadFile = null;
      finishOperation(message.error || "Workbook upload failed", "error");
      setStatus(message.error || "Workbook upload failed", "error");
      return;
    }

    if (message.type !== "loaded") return;

    state.manualWorkbookName = message.fileName || "";
    state.manualTables = buildManualTables(message.tables || []);
    applyManualWorkbookTables();
    clearResultFields();
    updateCorrespondentBanks();
    state.operationLabelText = "Validating";
    state.operationStepsText = "Uploading → Validating → Done";
    updateOperationTracker(72, true, state.operationLabelText, "running");
    let operationLabel = state.manualWorkbookName ? `Uploaded ${state.manualWorkbookName}` : "Workbook upload finished";
    let operationStatus = "success";

    const workbookCurrency = inferWorkbookCurrency(message.tables || [], message.fileName || "");
    const selectedCurrency = String(elements.currencySelect?.value || "").trim();
    if (workbookCurrency && selectedCurrency && normalizeCurrencyChoice(selectedCurrency) !== normalizeCurrencyChoice(workbookCurrency)) {
      setStatus(
        `Warning: workbook currency is ${workbookCurrency}, but the selected currency is ${selectedCurrency}. Routing by workbook currency.`,
        "warning",
      );
    }

    try {
      const result = await uploadWorkbookToDrive(message);
      showUploadSuccessPrompt(result);
      setStatus(`Uploaded to Drive: ${result.appendedRows} rows`, "muted");
    } catch (error) {
      console.error(error);
      operationLabel = error.message || "Workbook upload failed";
      operationStatus = "error";
      if (isDuplicateUploadError(error)) {
        showUploadDuplicatePrompt(error);
        setStatus("Duplicate request number found. Upload blocked.", "error");
      } else {
        setStatus(error.message || `Workbook loaded locally: ${state.manualWorkbookName}`, "error");
      }
    } finally {
      state.driveUploadFile = null;
      finishOperation(operationLabel, operationStatus);
    }
  }

  function collectDriveUploadCriteria() {
    return {
      bank: String(elements.bankSelect?.value || "").trim(),
      currency: String(elements.currencySelect?.value || "").trim(),
      date: String(elements.dateInput?.value || "").trim(),
    };
  }

  function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    const chunkSize = 0x8000;
    const chunks = [];
    for (let index = 0; index < bytes.length; index += chunkSize) {
      chunks.push(String.fromCharCode(...bytes.subarray(index, index + chunkSize)));
    }
    return btoa(chunks.join(""));
  }

  async function uploadWorkbookToDrive(message) {
    const uploadFile = state.driveUploadFile;
    if (!uploadFile || uploadFile.requestId !== message.requestId) {
      throw new Error("Workbook upload state expired.");
    }

    const writerUrl = getAppsScriptWriterUrl();
    if (!writerUrl) {
      throw new Error("Drive upload URL missing.");
    }

    setStatus("Uploading workbook to Drive", "muted");
    const response = await fetch(writerUrl, {
      method: "POST",
      mode: "cors",
      cache: "no-store",
      headers: {
        "Content-Type": "text/plain;charset=utf-8",
      },
      body: JSON.stringify({
        action: "uploadReplenishmentWorkbook",
        bank: uploadFile.criteria.bank,
        currency: uploadFile.criteria.currency,
        date: uploadFile.criteria.date,
        fileName: uploadFile.fileName,
        mimeType: uploadFile.mimeType,
        fileBase64: uploadFile.base64,
        tables: selectDriveUploadTables(message.tables || []),
      }),
    });
    if (!response.ok) {
      throw new Error("Drive upload request failed.");
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.toLowerCase().includes("application/json")) {
      throw new Error("Apps Script update required for Drive upload.");
    }

    const result = await response.json();
    if (!result || result.ok !== true) {
      const error = new Error(result?.error || "Drive upload failed.");
      error.code = result?.code || "";
      error.details = result?.details || null;
      throw error;
    }
    return result;
  }

  function isDuplicateUploadError(error) {
    return Boolean(
      error &&
        (error.code === "duplicate_request_number" ||
          /duplicate request number/i.test(error.message || "") ||
          /request number already exists/i.test(error.message || ""))
    );
  }

  function showUploadDuplicatePrompt(error) {
    const details = error.details || {};
    const items = [];
    items.push({ label: "File", value: state.driveUploadFile?.fileName || state.manualWorkbookName || "" });
    items.push({ label: "Currency", value: String(state.driveUploadFile?.criteria?.currency || "").trim() || "Inferred from workbook" });
    items.push({ label: "Request No.", value: extractFirstRequestNumber_(error.message) || "Check workbook and master sheet" });

    if (Array.isArray(details.duplicates) && details.duplicates.length) {
      const firstDuplicate = details.duplicates[0];
      items.push({
        label: "Found in",
        value: `${firstDuplicate.sheetName || "master"} row ${firstDuplicate.row || ""}`.trim(),
      });
    }

    openReferencePrompt({
      variant: "error",
      title: "Upload blocked",
      message: error.message || "A duplicate request number was found. Upload was blocked before any file was saved.",
      items,
    });
  }

  function showUploadSuccessPrompt(result) {
    openReferencePrompt({
      variant: "success",
      title: "Upload complete",
      message: "The workbook was saved and appended successfully.",
      items: [
        { label: "Rows added", value: String(result.appendedRows || 0) },
        { label: "Master file", value: result.masterSpreadsheetName || result.masterSpreadsheetUrl || "" },
        { label: "Master sheet", value: result.targetSheet || "" },
        { label: "Master source", value: result.masterSource || "" },
        { label: "Saved folder", value: result.folderPath || "" },
        { label: "Uploaded file", value: result.fileName || "" },
      ],
    });
  }

  function inferWorkbookCurrency(tables, fileName) {
    return inferCurrencyFromFileName(fileName) || inferCurrencyFromTables(tables);
  }

  function inferCurrencyFromFileName(fileName) {
    const text = normalizeComparable(fileName);
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

    const words = text.split(" ");
    for (const word of words) {
      if (aliases[word]) return aliases[word];
    }

    for (const currency of ["USD", "EURO", "Yuan", "AED", "JOD", "INR", "SAR"]) {
      if (text.includes(normalizeComparable(currency))) return currency;
    }

    return "";
  }

  function inferCurrencyFromTables(tables) {
    const table = selectDriveUploadTables(tables)[0] || null;
    const rows = Array.isArray(table?.rows) ? table.rows : [];
    if (!rows.length) return "";

    const analyzed = analyzeCurrencyWorkbookRows(rows);
    if (analyzed) return analyzed;
    return "";
  }

  function analyzeCurrencyWorkbookRows(rows) {
    const cleanRows = rows
      .map((row) => (Array.isArray(row) ? row.map((cell) => String(cell ?? "").trim()) : []))
      .filter((row) => row.some((cell) => cell !== ""));
    if (!cleanRows.length) return "";

    const headerStart = findWorkbookHeaderStart(cleanRows);
    if (headerStart < 0) return "";
    const headers = cleanRows[headerStart] || [];
    const currencyColumn = findCurrencyTypeColumn(headers);
    if (currencyColumn < 0) return "";

    const counts = new Map();
    for (let index = headerStart + 1; index < cleanRows.length; index += 1) {
      const value = normalizeCurrencyChoice(cleanRows[index][currencyColumn]);
      if (!value) continue;
      counts.set(value, (counts.get(value) || 0) + 1);
    }

    let bestCurrency = "";
    let bestCount = 0;
    for (const [currency, count] of counts.entries()) {
      if (count > bestCount) {
        bestCurrency = currency;
        bestCount = count;
      }
    }
    return bestCurrency;
  }

  function findWorkbookHeaderStart(rows) {
    let bestIndex = -1;
    let bestScore = -1;
    const limit = Math.min(rows.length, 12);
    for (let index = 0; index < limit; index += 1) {
      const score = rows[index].reduce((total, value) => {
        const normalized = normalizeHeader(value);
        if (!normalized) return total;
        return total + (normalized.includes("currency") || normalized.includes("request") || normalized.includes("bank") ? 3 : 1);
      }, 0);
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    }
    return bestIndex;
  }

  function findCurrencyTypeColumn(headers) {
    const normalizedHeaders = headers.map((header) => normalizeHeader(header));
    for (let index = 0; index < normalizedHeaders.length; index += 1) {
      const header = normalizedHeaders[index];
      if (!header) continue;
      if (header === "currency type" || header === "type of currency" || header === "currency") return index;
      if (header.includes("currency") && !header.includes("code")) return index;
    }
    return -1;
  }

  function normalizeCurrencyChoice(value) {
    const text = normalizeComparable(value);
    if (!text) return "";
    if (["usd", "us dollar", "dollar"].includes(text)) return "USD";
    if (["euro", "eur"].includes(text)) return "EURO";
    if (["yuan", "cny"].includes(text)) return "Yuan";
    if (["aed", "dirham"].includes(text)) return "AED";
    if (["jod", "dinar"].includes(text)) return "JOD";
    if (["inr", "rupee"].includes(text)) return "INR";
    if (["sar", "riyal"].includes(text)) return "SAR";
    return String(value || "").trim();
  }

  function startReplenishmentHeroCanvas() {
    const canvas = elements.heroCanvas;
    if (!canvas) return;
    const motionQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (motionQuery?.matches) return;

    const ctx = canvas.getContext("2d");
    const paths = [
      {
        from: [0.04, 0.3],
        c1: [0.2, 0.25],
        c2: [0.34, 0.42],
        to: [0.48, 0.46],
        color: [74, 242, 255],
        speed: 0.00012,
      },
      {
        from: [0.05, 0.58],
        c1: [0.22, 0.54],
        c2: [0.34, 0.51],
        to: [0.5, 0.52],
        color: [177, 93, 255],
        speed: 0.00011,
      },
      {
        from: [0.12, 0.15],
        c1: [0.24, 0.19],
        c2: [0.36, 0.28],
        to: [0.46, 0.38],
        color: [42, 235, 168],
        speed: 0.0001,
      },
      {
        from: [0.55, 0.42],
        c1: [0.68, 0.38],
        c2: [0.81, 0.31],
        to: [0.94, 0.24],
        color: [52, 244, 219],
        speed: 0.00012,
      },
      {
        from: [0.54, 0.52],
        c1: [0.69, 0.54],
        c2: [0.81, 0.59],
        to: [0.95, 0.61],
        color: [85, 201, 255],
        speed: 0.000105,
      },
      {
        from: [0.5, 0.32],
        c1: [0.51, 0.37],
        c2: [0.52, 0.43],
        to: [0.53, 0.48],
        color: [255, 255, 255],
        speed: 0.00016,
      },
    ];
    const particles = Array.from({ length: 56 }, (_, index) => ({
      pathIndex: index % paths.length,
      offset: Math.random(),
      size: 1.1 + Math.random() * 1.8,
      tail: 0.03 + Math.random() * 0.05,
      delay: Math.random() * 0.9,
    }));
    let width = 0;
    let height = 0;

    function resize() {
      const rect = canvas.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      canvas.width = Math.floor(width * ratio);
      canvas.height = Math.floor(height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    }

    function pointOnPath(path, t) {
      const u = 1 - t;
      return {
        x:
          (u * u * u * path.from[0] +
            3 * u * u * t * path.c1[0] +
            3 * u * t * t * path.c2[0] +
            t * t * t * path.to[0]) * width,
        y:
          (u * u * u * path.from[1] +
            3 * u * u * t * path.c1[1] +
            3 * u * t * t * path.c2[1] +
            t * t * t * path.to[1]) * height,
      };
    }

    function drawGlow(point, color, radius, alpha) {
      const gradient = ctx.createRadialGradient(point.x, point.y, 0, point.x, point.y, radius * 5);
      gradient.addColorStop(0, `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${alpha})`);
      gradient.addColorStop(0.35, `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${alpha * 0.34})`);
      gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(point.x, point.y, radius * 5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = `rgba(248, 254, 255, ${Math.min(1, alpha + 0.18)})`;
      ctx.beginPath();
      ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    function drawTrail(path, fromT, toT, color, alpha) {
      const steps = 5;
      ctx.lineWidth = Math.max(1, width * 0.001);
      ctx.lineCap = "round";
      for (let step = 0; step < steps; step += 1) {
        const start = fromT + ((toT - fromT) * step) / steps;
        const end = fromT + ((toT - fromT) * (step + 1)) / steps;
        if (start < 0 || end > 1) continue;
        const a = pointOnPath(path, start);
        const b = pointOnPath(path, end);
        ctx.strokeStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${alpha * ((step + 1) / steps)})`;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }

    function draw(timestamp) {
      ctx.clearRect(0, 0, width, height);
      ctx.globalCompositeOperation = "lighter";

      for (const particle of particles) {
        const path = paths[particle.pathIndex];
        const progress = (timestamp * path.speed + particle.offset + particle.delay) % 1;
        const eased = 1 - Math.pow(1 - progress, 1.8);
        const pulse = 0.55 + Math.sin((progress + particle.offset) * Math.PI) * 0.25;
        const point = pointOnPath(path, eased);
        drawTrail(path, Math.max(0, eased - particle.tail), eased, path.color, 0.16 * pulse);
        drawGlow(point, path.color, particle.size, 0.42 * pulse);
      }

      const center = { x: width * 0.5, y: height * 0.44 };
      const pulse = 0.5 + Math.sin(timestamp * 0.003) * 0.12;
      drawGlow(center, [56, 242, 225], Math.max(2.2, width * 0.0021), pulse);

      ctx.globalCompositeOperation = "source-over";
      requestAnimationFrame(draw);
    }

    resize();
    draw(0);
    window.addEventListener("resize", resize);
    if (window.ResizeObserver) {
      new ResizeObserver(resize).observe(canvas);
    }
  }

  function extractFirstRequestNumber_(message) {
    const match = String(message || "").match(/Duplicate Request Number(?: in uploaded workbook| already exists in master sheet)?:\s*(.+?)(?:\s*\(|$)/i);
    return match ? String(match[1] || "").trim() : "";
  }

  function selectDriveUploadTables(tables) {
    let bestTable = null;
    let bestSize = 0;

    for (const table of tables) {
      const rows = Array.isArray(table?.rows) ? table.rows : [];
      const size = rows.reduce((total, row) => {
        if (!Array.isArray(row)) return total;
        return total + row.filter((cell) => String(cell ?? "").trim()).length;
      }, 0);
      if (size > bestSize) {
        bestTable = table;
        bestSize = size;
      }
    }

    return bestTable ? [bestTable] : [];
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
    url.searchParams.set("currency", sheetName);
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
    beginOperation("calculate", "Updating registered amounts");
    setStatus("Updating registered amounts", "muted");
    let operationLabel = "Registered amounts updated";
    let operationStatus = "success";

    try {
      const criteria = collectPreviousRowCriteria();
      const rows = await loadPreviousReplenishmentRows(criteria);

      if (!rows.eighty && !rows.hundred) {
        setStatus("No previous rows found", "warning");
        return;
      }

      if (rows.eighty) fillEightyFields(rows.eighty);
      if (rows.hundred) fillHundredFields(rows.hundred);

      const updateResult = await updateRegisteredAmounts(criteria, rows);
      const mergedRows = mergeCalculatedRows(rows, updateResult.rows || {});

      if (mergedRows.eighty) fillEightyFields(mergedRows.eighty);
      if (mergedRows.hundred) fillHundredFields(mergedRows.hundred);

      showCalculationSuccessPrompt(updateResult, mergedRows);
      if (rows.eighty && rows.hundred) {
        setStatus(buildCalculationStatus(updateResult, mergedRows), "muted");
      } else {
        setStatus(buildCalculationStatus(updateResult, mergedRows), "warning");
      }
    } catch (error) {
      console.error(error);
      operationLabel = error.message || "Previous row lookup failed";
      operationStatus = "error";
      setStatus(error.message || "Previous row lookup failed", "error");
    } finally {
      finishOperation(operationLabel, operationStatus);
    }
  }

  async function updateRegisteredAmounts(criteria, rows) {
    const writerUrl = getAppsScriptWriterUrl();
    if (!writerUrl) {
      throw new Error("Submit URL missing");
    }

    let url;
    try {
      url = new URL(writerUrl);
    } catch (error) {
      throw new Error("Full sheet writer URL is invalid.");
    }

    const payload = {
      action: "calculateReplenishment",
      sheet: criteria.sheet,
      currency: criteria.sheet,
      bank: criteria.bank,
      date: criteria.dateValue,
      correspondentBank: criteria.correspondentBank,
      eightyDate: rows?.eighty?.dateValue || rows?.eighty?.date || "",
      eightyRowNumber: rows?.eighty?.rowNumber || "",
      hundredDate: rows?.hundred?.dateValue || rows?.hundred?.date || "",
      hundredRowNumber: rows?.hundred?.rowNumber || "",
    };

    const response = await fetch(url.toString(), {
      method: "POST",
      mode: "cors",
      cache: "no-store",
      body: new URLSearchParams(payload),
    });
    if (!response.ok) {
      throw new Error("Registered amount update request failed.");
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.toLowerCase().includes("application/json")) {
      throw new Error("Apps Script update required");
    }

    const result = await response.json();
    if (!result || result.ok !== true) {
      throw new Error(result?.error || "Registered amount update returned an error.");
    }

    return result;
  }

  function collectPreviousRowCriteria() {
    const selectedDate = parseDateValue(requiredFieldValue(elements.dateInput, "Date"));
    if (!selectedDate) throw new Error("Date is invalid.");
    const sheet = requiredFieldValue(elements.currencySelect, "Currency");

    return {
      sheet,
      currency: sheet,
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
    url.searchParams.set("currency", criteria.currency || criteria.sheet);
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
          rowNumber: rowIndex + 2,
          amount,
          referenceNumber: readCellDisplayValue(row, referenceColumn),
          date: previousRowDateDisplay(row, dateColumn, rowDate),
          dateValue: dateValue(rowDate),
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
    setCalculatedFieldValue(elements.eightyAmountInput, row.amount);
    setCalculatedFieldValue(elements.eightyReferenceInput, row.referenceNumber);
    setCalculatedFieldValue(elements.eightyDateInput, row.date);
    setCalculatedFieldValue(elements.eightyRegisteredAmountInput, row.registeredAmount);
    setCalculatedFieldValue(elements.eightyCorrespondentBankInput, row.correspondentBank);
    updateCoverageField(elements.eightyCoverageInput, row.amount, row.registeredAmount, 0.8, "eighty");
  }

  function fillHundredFields(row) {
    setCalculatedFieldValue(elements.hundredAmountInput, row.amount);
    setCalculatedFieldValue(elements.hundredReferenceInput, row.referenceNumber);
    setCalculatedFieldValue(elements.hundredDateInput, row.date);
    setCalculatedFieldValue(elements.hundredRegisteredAmountInput, row.registeredAmount);
    setCalculatedFieldValue(elements.hundredCorrespondentBankInput, row.correspondentBank);
    updateCoverageField(elements.hundredCoverageInput, row.amount, row.registeredAmount, 0.98, "hundred");
  }

  function setCalculatedFieldValue(element, value) {
    if (!element) return;
    const text = value == null ? "" : String(value).trim();
    element.value = text || "N/A";
  }

  function clearResultFields() {
    if (elements.eightyAmountInput) elements.eightyAmountInput.value = "";
    if (elements.eightyReferenceInput) elements.eightyReferenceInput.value = "";
    if (elements.eightyDateInput) elements.eightyDateInput.value = "";
    if (elements.eightyRegisteredAmountInput) elements.eightyRegisteredAmountInput.value = "";
    if (elements.eightyCorrespondentBankInput) elements.eightyCorrespondentBankInput.value = "";
    resetCoverageField(elements.eightyCoverageInput);
    if (elements.hundredAmountInput) elements.hundredAmountInput.value = "";
    if (elements.hundredReferenceInput) elements.hundredReferenceInput.value = "";
    if (elements.hundredDateInput) elements.hundredDateInput.value = "";
    if (elements.hundredRegisteredAmountInput) elements.hundredRegisteredAmountInput.value = "";
    if (elements.hundredCorrespondentBankInput) elements.hundredCorrespondentBankInput.value = "";
    resetCoverageField(elements.hundredCoverageInput);
  }

  function updateCoverageField(element, amountValue, registeredValue, threshold, sectionName) {
    if (!element) return;
    const wrapper = element.closest(".coverage-field");
    const amount = parseCoverageAmount(amountValue);
    const registeredAmount = parseCoverageAmount(registeredValue);
    if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(registeredAmount)) {
      resetCoverageField(element);
      element.value = "N/A";
      return;
    }

    const coverage = registeredAmount / amount;
    element.value = formatCoveragePercent(coverage);
    applyCoverageState(wrapper, coverage, threshold, sectionName);
  }

  function resetCoverageField(element) {
    if (!element) return;
    const wrapper = element.closest(".coverage-field");
    if (wrapper) {
      wrapper.classList.remove("coverage-pass", "coverage-fail");
      wrapper.classList.add("coverage-neutral");
    }
    element.value = "";
  }

  function applyCoverageState(wrapper, coverage, threshold, sectionName) {
    if (!wrapper) return;
    wrapper.classList.remove("coverage-pass", "coverage-fail", "coverage-neutral");
    wrapper.classList.add(Number.isFinite(coverage) && coverage >= threshold ? "coverage-pass" : "coverage-fail");
    wrapper.dataset.section = sectionName;
  }

  function parseCoverageAmount(value) {
    const normalized = normalizeSheetAmount(value);
    if (!normalized) return NaN;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : NaN;
  }

  function formatCoveragePercent(value) {
    if (!Number.isFinite(value)) return "N/A";
    return new Intl.NumberFormat(undefined, {
      style: "percent",
      maximumFractionDigits: 2,
      minimumFractionDigits: 0,
    }).format(value);
  }

  function setCalculateBusy(isBusy) {
    setActionButtonsBusy(isBusy);
  }

  function buildCalculationStatus(result, rows) {
    const update = result?.update || {};
    const parts = [];
    const eightySection = update.sections?.find?.((section) => section.key === "eighty");
    const hundredSection = update.sections?.find?.((section) => section.key === "hundred");

    if (eightySection) parts.push(`80% ${formatCompactAmount(eightySection.value)}`);
    if (hundredSection) parts.push(`100% ${formatCompactAmount(hundredSection.value)}`);
    if (update.totalRegisteredAmount != null) parts.push(`Total ${formatCompactAmount(update.totalRegisteredAmount)}`);
    if (update.targetSheetName) parts.push(update.targetSheetName);
    if (result?.masterSpreadsheetName || update.masterSpreadsheetName) {
      parts.push(result?.masterSpreadsheetName || update.masterSpreadsheetName);
    }

    const rowCount = [rows?.eighty, rows?.hundred].filter(Boolean).length;
    if (rowCount === 1) parts.push("1 row updated");
    if (rowCount === 2) parts.push("2 rows updated");

    return parts.length ? parts.join(" | ") : "Registered amounts updated";
  }

  function mergeCalculatedRows(rows, updatedRows) {
    return {
      eighty: rows?.eighty
        ? {
            ...rows.eighty,
            registeredAmount: updatedRows?.eighty?.registeredAmount ?? rows.eighty.registeredAmount,
          }
        : null,
      hundred: rows?.hundred
        ? {
            ...rows.hundred,
            registeredAmount: updatedRows?.hundred?.registeredAmount ?? rows.hundred.registeredAmount,
          }
        : null,
    };
  }

  function showCalculationSuccessPrompt(result, rows) {
    const update = result?.update || {};
    const debug = result?.debug || {};
    const items = [];
    if (rows?.eighty) {
      items.push({ label: "80% Registered", value: formatCompactAmount(rows.eighty.registeredAmount) });
      items.push({ label: "80% Date", value: rows.eighty.date || "" });
    }
    if (rows?.hundred) {
      items.push({ label: "100% Registered", value: formatCompactAmount(rows.hundred.registeredAmount) });
      items.push({ label: "100% Date", value: rows.hundred.date || "" });
    }
    if (update.totalRegisteredAmount != null) {
      items.push({ label: "Exact Total", value: formatCompactAmount(update.totalRegisteredAmount) });
    }
    if (update.targetSheetName) {
      items.push({ label: "Updated Sheet", value: update.targetSheetName });
    }
    if (result?.masterSpreadsheetName) {
      items.push({ label: "Master Source", value: result.masterSpreadsheetName });
    }

    appendDebugSummary(items, "80% Debug", debug.eighty);
    appendDebugSummary(items, "100% Debug", debug.hundred);

    openReferencePrompt({
      title: "Registered amounts updated",
      message: "The calculate button updated the target sheet cells and saved the totals.",
      items,
      variant: "success",
    });
  }

  function appendDebugSummary(items, label, debug) {
    if (!debug) return;
    const summary = [
      `Sheets ${debug.sheetsScanned || 0}`,
      `Rows ${debug.rowsScanned || 0}`,
      `Bank ${debug.bankMatched || 0}`,
      `Currency ${debug.currencyMatched || 0}`,
      `Date ${debug.dateMatched || 0}`,
      `Corr ${debug.correspondentMatched || 0}`,
      `Amt ${debug.amountMatched || 0}`,
    ].join(" | ");
    items.push({ label, value: summary });
    if (debug.dateColumnName || debug.selectedDate) {
      items.push({
        label: `${label} Date source`,
        value: `${debug.dateColumnName || "unknown"} | site ${debug.selectedDate || "?"}`,
      });
    }
    if (debug.dateColumnUsed && debug.dateColumnUsed !== debug.dateColumnName) {
      items.push({
        label: `${label} Date fallback`,
        value: debug.dateColumnUsed,
      });
    }
    if (Array.isArray(debug.dateSamples) && debug.dateSamples.length) {
      const sampleText = debug.dateSamples
        .map((sample) => {
          const parts = [
            sample.sheetName || "Sheet",
            `row ${sample.rowNumber || "?"}`,
            `hdr ${sample.header || "?"}`,
            `raw ${sample.rawValue || ""}`,
            `display ${sample.displayValue || ""}`,
            `parsed ${sample.parsedValue || "?"}`,
          ];
          return parts.join(" | ");
        })
        .join(" || ");
      items.push({
        label: `${label} Date samples`,
        value: sampleText,
      });
    }

    if (Array.isArray(debug.skippedSheets) && debug.skippedSheets.length) {
      const skipped = debug.skippedSheets[0];
      const missing = [];
      if (skipped.bankColumn < 0) missing.push("bank");
      if (skipped.currencyColumn < 0) missing.push("currency");
      if (skipped.dateColumn < 0) missing.push("date");
      if (skipped.correspondentColumn < 0) missing.push("corr");
      if (skipped.requestedAmountColumn < 0) missing.push("amount");
      if (skipped.registeredAmountColumn < 0) missing.push("registered");
      items.push({
        label: `${label} First skip`,
        value: `${skipped.sheetName || "Sheet"} | row ${skipped.headerRow || "?"} | missing ${missing.join(", ") || "none"}`,
      });
    }
  }

  function formatCompactAmount(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return String(value || "").trim();
    return numeric.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 0 });
  }

    function bindSubmitConfirmation() {
      elements.submitButton?.addEventListener("click", async () => {
        if (!elements.form?.reportValidity()) return;
        await handleSubmitIntent();
      });
    elements.confirmNo?.addEventListener("click", closeSubmitConfirm);
    elements.confirmYes?.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (state.submitting || state.checkingDuplicate) return;
      state.submitAwaitingConfirm = false;
      setConfirmButtonsBusy(true);
      closeSubmitConfirm({ preserveOperation: true });
      await submitReplenishment();
    });
      elements.confirmOverlay?.addEventListener("click", (event) => {
        if (event.target === elements.confirmOverlay) closeSubmitConfirm();
      });
      elements.actionConfirmNo?.addEventListener("click", closeActionConfirm);
      elements.actionConfirmYes?.addEventListener("click", async () => {
        const pending = state.pendingActionConfirm;
        closeActionConfirm({ preserveFocus: true });
        if (!pending) return;
        await pending.onConfirm?.();
      });
      elements.actionConfirmOverlay?.addEventListener("click", (event) => {
        if (event.target === elements.actionConfirmOverlay) closeActionConfirm();
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
    state.submitAwaitingConfirm = false;
    beginOperation("submit", "Checking reference");
    setStatus("Checking reference", "muted");
    let keepLocked = false;
    let operationLabel = "Checking reference";
    let operationStatus = "success";

    try {
      const criteria = collectDuplicateCriteria();
      const result = await checkDuplicateReference(criteria);
      if (result.duplicate) {
        showDuplicateReferencePrompt(criteria, result);
        return;
      }

      setStatus("Ready", "muted");
      state.submitAwaitingConfirm = true;
      keepLocked = true;
      openSubmitConfirm();
      state.operationLabelText = "Confirming";
      state.operationStepsText = "Checking → Confirming → Done";
      updateOperationTracker(100, true, "Awaiting confirmation", "running");
    } catch (error) {
      console.error(error);
      const message = error.message || "Reference check failed. Submission blocked.";
      operationLabel = message;
      operationStatus = "error";
      setStatus(message, "error");
      showBlockingPrompt("Reference check failed", message);
    } finally {
      state.checkingDuplicate = false;
      if (!keepLocked) {
        if (operationStatus === "error") {
          finishOperation(operationLabel, operationStatus);
        } else {
          resetOperationLock("Ready");
        }
      }
    }
  }

  function collectDuplicateCriteria() {
    const sheet = requiredFieldValue(elements.currencySelect, "Currency");
    return {
      sheet,
      currency: sheet,
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
    url.searchParams.set("currency", criteria.currency || criteria.sheet);
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

  function openReferencePrompt({ title, message, items, variant = "error" }) {
    if (!elements.duplicateOverlay) return;

    const dialog = elements.duplicateOverlay.querySelector(".confirm-dialog");
    const icon = elements.duplicateOverlay.querySelector(".confirm-icon");
    const kicker = elements.duplicateOverlay.querySelector(".section-kicker");
    const titleElement = document.getElementById("duplicateReferenceTitle");
    if (titleElement) titleElement.textContent = title || "Submission blocked";
    if (elements.duplicateMessage) elements.duplicateMessage.textContent = message || "Submission blocked.";
    renderDuplicateMeta(items || []);

    if (dialog) {
      dialog.classList.toggle("duplicate-dialog", variant !== "success");
      dialog.classList.toggle("success-dialog", variant === "success");
    }
    if (icon) {
      icon.classList.toggle("duplicate-icon", variant !== "success");
      icon.classList.toggle("success-icon", variant === "success");
      icon.innerHTML = `<i data-lucide="${variant === "success" ? "circle-check-big" : "badge-alert"}"></i>`;
    }
    if (elements.duplicateClose) {
      elements.duplicateClose.classList.toggle("duplicate-close", variant !== "success");
      elements.duplicateClose.classList.toggle("success-close", variant === "success");
    }
    if (kicker) {
      kicker.textContent = variant === "success" ? "Upload complete" : "Submission blocked";
    }
    window.lucide?.createIcons();

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
      setConfirmButtonsBusy(false);
      elements.confirmYes?.focus();
    }

    function openActionConfirm({ kind, title, message, yesLabel, onConfirm }) {
      if (!elements.actionConfirmOverlay || !elements.actionConfirmDialog) return;
      state.pendingActionConfirm = { onConfirm };
      elements.actionConfirmOverlay.hidden = false;
      elements.actionConfirmDialog.dataset.actionKind = kind || "approve";
      if (elements.actionConfirmIcon) {
        elements.actionConfirmIcon.dataset.actionKind = kind || "approve";
      }
      if (elements.actionConfirmTitle) elements.actionConfirmTitle.textContent = title || "Are you sure?";
      if (elements.actionConfirmMessage) elements.actionConfirmMessage.textContent = message || "Please confirm this action.";
      if (elements.actionConfirmYes) {
        elements.actionConfirmYes.querySelector("span")?.replaceChildren(document.createTextNode(yesLabel || "Yes"));
      }
      setActionConfirmButtonsBusy(false);
      elements.actionConfirmYes?.focus();
    }

    function closeActionConfirm(options = {}) {
      if (!elements.actionConfirmOverlay || elements.actionConfirmOverlay.hidden) return;
      elements.actionConfirmOverlay.hidden = true;
      if (!options.preserveAction) {
        state.pendingActionConfirm = null;
      }
      setActionConfirmButtonsBusy(false);
    }

    function updateSubmitConfirmMessage() {
      if (!elements.confirmMessage) return;
      const currency = String(elements.currencySelect?.value || "").trim();
      elements.confirmMessage.textContent = currency
      ? `This will add the replenishment to the ${currency} sheet.`
      : "This will add the replenishment to the selected currency sheet.";
  }

  function closeSubmitConfirm(options = {}) {
    if (!elements.confirmOverlay || elements.confirmOverlay.hidden) return;
    elements.confirmOverlay.hidden = true;
    if (!options.preserveOperation) {
      state.submitAwaitingConfirm = false;
    }
    if (!state.submitting && !options.preserveOperation) {
      resetOperationLock("Ready");
    }
    if (!options.preserveFocus) {
      elements.submitButton?.focus();
    }
  }

  async function submitReplenishment() {
    if (state.submitting || !elements.form?.reportValidity()) return;

    const writerUrl = getAppsScriptWriterUrl();
    if (!writerUrl) {
      setStatus("Submit URL missing", "error");
      return;
    }

    state.submitting = true;
    beginOperation("submit", "Submitting");
    state.operationStepsText = "Checking → Confirming → Done";
    setConfirmButtonsBusy(true);
    setStatus("Submitting", "muted");
    let operationLabel = "Submitted";
    let operationStatus = "success";

    try {
      const payload = collectSubmitPayload();
      const response = await appendReplenishment(writerUrl, payload);
      closeSubmitConfirm({ preserveOperation: true, preserveFocus: true });
      showSubmitSuccessPrompt(response, payload);
      setStatus(`Submitted to ${response.sheet} row ${response.row}`, "muted");
    } catch (error) {
      console.error(error);
      const message = error.message || "Submit failed";
      operationLabel = message;
      operationStatus = "error";
      setStatus(message, "error");
      if (/Reference Number already exists/i.test(message)) {
        closeSubmitConfirm({ preserveOperation: true, preserveFocus: true });
        try {
          showDuplicateReferencePrompt(collectDuplicateCriteria(), {});
        } catch (duplicateError) {
          showBlockingPrompt("Duplicate reference", `${message} Submission blocked.`);
        }
      }
    } finally {
      state.submitting = false;
      setConfirmButtonsBusy(false);
      if (state.submitAwaitingConfirm) {
        state.submitAwaitingConfirm = false;
      }
      finishOperation(operationLabel, operationStatus);
      setConfirmButtonsBusy(false);
    }
  }

  function collectSubmitPayload() {
    const sheet = requiredFieldValue(elements.currencySelect, "Currency");
    return {
      action: "appendReplenishment",
      sheet,
      currency: sheet,
      bank: requiredFieldValue(elements.bankSelect, "Bank"),
      amount: requiredFieldValue(elements.amountInput, "Amount"),
      referenceNumber: requiredFieldValue(elements.referenceInput, "Reference Number"),
      date: requiredFieldValue(elements.dateInput, "Date"),
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

  function showSubmitSuccessPrompt(result, payload) {
    openReferencePrompt({
      variant: "success",
      title: "Submission complete",
      message: "The replenishment was saved successfully.",
      items: [
        { label: "Sheet", value: result.sheet || payload.sheet || "" },
        { label: "Row added", value: String(result.row || "") },
        { label: "Bank", value: payload.bank || "" },
        { label: "Reference", value: payload.referenceNumber || "" },
        { label: "Date", value: payload.date || "" },
        { label: "Amount", value: formatCompactAmount(payload.amount || "") },
        { label: "Correspondent Bank", value: payload.correspondentBank || "" },
      ],
    });
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
    setActionButtonsBusy(isBusy);
    setConfirmButtonsBusy(isBusy);
  }

  function setUploadBusy(isBusy) {
    setActionButtonsBusy(isBusy);
  }

  function setStatus(text, variant) {
    if (!elements.formStatus) return;
    const fullText = String(text || "").trim();
    const compactText =
      fullText.length > 180
        ? `${fullText.slice(0, 177).trimEnd()}...`
        : fullText;

    elements.formStatus.textContent = compactText;
    elements.formStatus.title = fullText;
    elements.formStatus.classList.remove("muted", "warning", "error");
    if (variant) elements.formStatus.classList.add(variant);
  }
})();
