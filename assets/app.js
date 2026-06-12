(function () {
  const elements = {
    ambientCanvas: document.getElementById("ambientCanvas"),
    heroFlowCanvas: document.getElementById("heroFlowCanvas"),
    fileInput: document.getElementById("fileInput"),
    dropZone: document.getElementById("dropZone"),
    loadStatus: document.getElementById("loadStatus"),
    fileSummary: document.getElementById("fileSummary"),
    fileName: document.getElementById("fileName"),
    workbookSummary: document.getElementById("workbookSummary"),
    sheetSelect: document.getElementById("sheetSelect"),
    columnSelect: document.getElementById("columnSelect"),
    columnStatus: document.getElementById("columnStatus"),
    outputColumnInput: document.getElementById("outputColumnInput"),
    formatSelect: document.getElementById("formatSelect"),
    processButton: document.getElementById("processButton"),
    resetButton: document.getElementById("resetButton"),
    processStatus: document.getElementById("processStatus"),
    progressFill: document.getElementById("progressFill"),
    progressText: document.getElementById("progressText"),
    statRows: document.getElementById("statRows"),
    statUnified: document.getElementById("statUnified"),
    statBefore: document.getElementById("statBefore"),
    statAfter: document.getElementById("statAfter"),
    downloadButton: document.getElementById("downloadButton"),
    previewStatus: document.getElementById("previewStatus"),
    previewBody: document.getElementById("previewBody"),
  };

  const state = {
    worker: null,
    fileName: "",
    loaded: false,
    downloadUrl: "",
    sheets: [],
  };

  init();

  function init() {
    window.lucide?.createIcons();
    startAmbientCanvas();
    startHeroFlowCanvas();
    bindEvents();
    createWorker();
  }

  function bindEvents() {
    elements.fileInput.addEventListener("change", (event) => {
      const file = event.target.files?.[0];
      if (file) loadFile(file);
    });

    ["dragenter", "dragover"].forEach((eventName) => {
      elements.dropZone.addEventListener(eventName, (event) => {
        event.preventDefault();
        elements.dropZone.classList.add("dragging");
      });
    });

    ["dragleave", "drop"].forEach((eventName) => {
      elements.dropZone.addEventListener(eventName, (event) => {
        event.preventDefault();
        elements.dropZone.classList.remove("dragging");
      });
    });

    elements.dropZone.addEventListener("drop", (event) => {
      const file = event.dataTransfer?.files?.[0];
      if (file) loadFile(file);
    });

    elements.sheetSelect.addEventListener("change", () => {
      requestSheetMeta(elements.sheetSelect.value);
    });

    elements.columnSelect.addEventListener("change", () => {
      setColumnStatus("Column selected", "muted");
      updateOutputColumnNameFromSource();
    });

    elements.processButton.addEventListener("click", processWorkbook);
    elements.resetButton.addEventListener("click", resetApp);
  }

  function createWorker() {
    if (state.worker) state.worker.terminate();
    state.worker = new Worker("/assets/worker.js");
    state.worker.addEventListener("message", handleWorkerMessage);
    state.worker.addEventListener("error", (event) => {
      setStatus(elements.processStatus, "Worker error", "error");
      setProgress(0, event.message || "The browser worker failed.");
      enableProcessing(false);
    });
  }

  async function loadFile(file) {
    resetDownload();
    clearStats();
    clearPreview();
    createWorker();
    state.fileName = file.name;
    state.loaded = false;

    setStatus(elements.loadStatus, "Reading file", "");
    setStatus(elements.processStatus, "Loading", "muted");
    setProgress(8, "Reading workbook into the browser worker...");
    enableProcessing(false);

    try {
      const buffer = await file.arrayBuffer();
      state.worker.postMessage(
        {
          type: "load",
          fileName: file.name,
          buffer,
        },
        [buffer],
      );
    } catch (error) {
      setStatus(elements.loadStatus, "Load failed", "error");
      setProgress(0, error.message || "Unable to read the file.");
    }
  }

  function requestSheetMeta(sheetName) {
    resetDownload();
    clearPreview();
    state.worker.postMessage({ type: "sheetMeta", sheetName });
    setColumnStatus("Inspecting sheet", "muted");
  }

  function processWorkbook() {
    resetDownload();
    clearPreview();
    const sheetName = elements.sheetSelect.value;
    const sourceColumn = Number(elements.columnSelect.value);
    const outputColumnName = elements.outputColumnInput.value.trim() || "Source Column_NEW";
    const mode = document.querySelector("input[name='mode']:checked")?.value || "balanced";
    const format = elements.formatSelect.value;

    if (!Number.isFinite(sourceColumn)) {
      setColumnStatus("Choose a supported source column", "error");
      return;
    }

    enableProcessing(false);
    setStatus(elements.processStatus, "Processing", "");
    setProgress(2, "Preparing matching rules...");

    state.worker.postMessage({
      type: "process",
      sheetName,
      sourceColumn,
      outputColumnName,
      mode,
      format,
    });
  }

  function handleWorkerMessage(event) {
    const message = event.data;
    if (!message || !message.type) return;

    if (message.type === "progress") {
      setProgress(message.percent || 0, message.text || "Working...");
      return;
    }

    if (message.type === "loaded") {
      state.loaded = true;
      state.sheets = message.sheets || [];
      populateSheets(message);
      const canProcess = renderSheetMeta(message.activeSheet);
      setStatus(elements.loadStatus, "Workbook loaded", "");
      setStatus(elements.processStatus, "Ready", "muted");
      setProgress(100, "Workbook loaded. Confirm the source column, then unify names.");
      enableConfig(true);
      enableProcessing(canProcess);
      return;
    }

    if (message.type === "sheetMeta") {
      const canProcess = renderSheetMeta(message);
      enableProcessing(canProcess);
      return;
    }

    if (message.type === "done") {
      handleDone(message);
      return;
    }

    if (message.type === "error") {
      setStatus(elements.loadStatus, state.loaded ? "Workbook loaded" : "Load failed", state.loaded ? "" : "error");
      setStatus(elements.processStatus, "Error", "error");
      setProgress(0, message.error || "Processing failed.");
      enableProcessing(state.loaded);
    }
  }

  function populateSheets(message) {
    elements.sheetSelect.innerHTML = "";
    (message.sheets || []).forEach((sheet) => {
      const option = document.createElement("option");
      option.value = sheet.name;
      option.textContent = `${sheet.name} (${formatNumber(sheet.rowCount)} rows)`;
      elements.sheetSelect.append(option);
    });
    if (message.activeSheet?.name) elements.sheetSelect.value = message.activeSheet.name;
  }

  function renderSheetMeta(sheet) {
    if (!sheet) return false;

    elements.fileSummary.hidden = false;
    elements.fileName.textContent = state.fileName;
    elements.workbookSummary.textContent = `${state.sheets.length || 1} sheet(s), active: ${sheet.name}`;

    const sourceHeaders = getSupportedSourceHeaders(sheet.headers || []);
    elements.columnSelect.innerHTML = "";
    if (!sourceHeaders.length) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "No supported source columns found";
      elements.columnSelect.append(option);
      setColumnStatus("No supported source columns", "error");
      return false;
    }

    sourceHeaders.forEach((header) => {
      const option = document.createElement("option");
      option.value = String(header.index);
      option.textContent = `${header.letter} - ${header.label}`;
      option.dataset.label = header.rawLabel || header.label;
      elements.columnSelect.append(option);
    });

    const suggestedAvailable = sourceHeaders.some((header) => header.index === sheet.suggestedColumn);
    if (suggestedAvailable) {
      elements.columnSelect.value = String(sheet.suggestedColumn);
    } else if (sourceHeaders.length) {
      elements.columnSelect.value = String(sourceHeaders[0].index);
    }

    if (sheet.suggestionExact && suggestedAvailable) {
      setColumnStatus("Exact source found", "");
    } else if (suggestedAvailable || sourceHeaders.length) {
      setColumnStatus("Closest match selected", "warning");
    } else {
      setColumnStatus("Choose source column", "warning");
    }
    updateOutputColumnNameFromSource();
    return true;
  }

  function updateOutputColumnNameFromSource() {
    const options = Array.from(elements.columnSelect.options || []);
    const option = options.find((item) => item.value === elements.columnSelect.value) || elements.columnSelect.selectedOptions?.[0];
    const label = option?.dataset?.label || option?.textContent || "";
    const cleanLabel = label.replace(/^[A-Z]+ - /, "").trim();
    if (!cleanLabel || option?.value === "") return;
    elements.outputColumnInput.value = `${cleanLabel}_NEW`;
  }

  function getSupportedSourceHeaders(headers) {
    const categories = [
      { key: "commercial", rank: 0 },
      { key: "beneficiary", rank: 1 },
      { key: "correspondent", rank: 2 },
    ];
    const bestByCategory = new Map();

    headers.forEach((header) => {
      const score = scoreSupportedSourceHeader(header.rawLabel || header.label);
      if (!score) return;
      const current = bestByCategory.get(score.key);
      if (!current || score.score > current.score) {
        bestByCategory.set(score.key, { ...header, sourceCategory: score.key, score: score.score });
      }
    });

    return categories.map((category) => bestByCategory.get(category.key)).filter(Boolean);
  }

  function scoreSupportedSourceHeader(label) {
    const value = normalizeColumnLabel(label);
    if (!value) return null;
    if (hasWords(value, ["commercial", "company", "name", "english"])) {
      return { key: "commercial", score: value === "commercial company name in english" ? 120 : 100 };
    }
    if (hasWords(value, ["final", "beneficiary", "name", "english"])) {
      return { key: "beneficiary", score: value === "final beneficiary name in english" ? 110 : 92 };
    }
    if (hasWords(value, ["correspondent", "bank", "name"]) && !hasWords(value, ["iban"]) && !hasWords(value, ["swift"]) && !hasWords(value, ["country"])) {
      return { key: "correspondent", score: value === "correspondent bank name" ? 100 : 86 };
    }
    return null;
  }

  function normalizeColumnLabel(label) {
    return String(label || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function hasWords(value, words) {
    return words.every((word) => new RegExp(`\\b${word}\\b`, "i").test(value));
  }

  function handleDone(message) {
    const blob = new Blob([message.buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    state.downloadUrl = URL.createObjectURL(blob);
    elements.downloadButton.href = state.downloadUrl;
    elements.downloadButton.download = message.outputFileName || buildOutputName(state.fileName);
    elements.downloadButton.classList.remove("disabled");
    elements.downloadButton.setAttribute("aria-disabled", "false");

    renderStats(message.stats);
    renderPreview(message.preview || []);
    setStatus(elements.processStatus, "Complete", "");
    setProgress(100, "Finished. Download the unified workbook.");
    enableProcessing(true);
  }

  function renderStats(stats = {}) {
    elements.statRows.textContent = formatNumber(stats.rowsScanned || 0);
    elements.statUnified.textContent = formatNumber(stats.rowsUnified || 0);
    elements.statBefore.textContent = formatNumber(stats.uniqueBefore || 0);
    elements.statAfter.textContent = formatNumber(stats.uniqueAfter || 0);
  }

  function renderPreview(preview) {
    elements.previewBody.innerHTML = "";

    if (!preview.length) {
      elements.previewBody.innerHTML = `<tr><td colspan="3" class="empty-row">No merged groups were detected with the selected mode.</td></tr>`;
      setStatus(elements.previewStatus, "No merged groups", "muted");
      return;
    }

    const fragment = document.createDocumentFragment();
    preview.forEach((group) => {
      const row = document.createElement("tr");
      const variants = (group.variants || [])
        .map((variant) => `<span>${escapeHtml(variant)}</span>`)
        .join("");
      row.innerHTML = `
        <td><strong>${escapeHtml(group.unified)}</strong></td>
        <td>${formatNumber(group.count || 0)}</td>
        <td><div class="variant-list">${variants}</div></td>
      `;
      fragment.append(row);
    });
    elements.previewBody.append(fragment);
    setStatus(elements.previewStatus, `${preview.length} merged group(s)`, "");
  }

  function enableConfig(enabled) {
    elements.sheetSelect.disabled = !enabled;
    elements.columnSelect.disabled = !enabled;
    elements.outputColumnInput.disabled = !enabled;
    elements.formatSelect.disabled = !enabled;
    elements.resetButton.disabled = !enabled;
  }

  function enableProcessing(enabled) {
    elements.processButton.disabled = !enabled;
  }

  function resetApp() {
    state.loaded = false;
    state.fileName = "";
    state.sheets = [];
    elements.fileInput.value = "";
    elements.fileSummary.hidden = true;
    elements.sheetSelect.innerHTML = "";
    elements.columnSelect.innerHTML = "";
    enableConfig(false);
    enableProcessing(false);
    resetDownload();
    clearStats();
    clearPreview();
    setStatus(elements.loadStatus, "Waiting for file", "muted");
    setStatus(elements.processStatus, "Idle", "muted");
    setColumnStatus("No column selected", "muted");
    setProgress(0, "Upload a workbook to begin.");
    createWorker();
  }

  function resetDownload() {
    if (state.downloadUrl) URL.revokeObjectURL(state.downloadUrl);
    state.downloadUrl = "";
    elements.downloadButton.removeAttribute("href");
    elements.downloadButton.removeAttribute("download");
    elements.downloadButton.classList.add("disabled");
    elements.downloadButton.setAttribute("aria-disabled", "true");
  }

  function clearStats() {
    elements.statRows.textContent = "-";
    elements.statUnified.textContent = "-";
    elements.statBefore.textContent = "-";
    elements.statAfter.textContent = "-";
  }

  function clearPreview() {
    elements.previewBody.innerHTML = `<tr><td colspan="3" class="empty-row">Results will appear after processing.</td></tr>`;
    setStatus(elements.previewStatus, "No results yet", "muted");
  }

  function setProgress(percent, text) {
    const safePercent = Math.max(0, Math.min(100, Number(percent) || 0));
    elements.progressFill.style.width = `${safePercent}%`;
    elements.progressText.textContent = text;
  }

  function setColumnStatus(text, variant) {
    setStatus(elements.columnStatus, text, variant);
  }

  function setStatus(element, text, variant) {
    element.textContent = text;
    element.classList.remove("muted", "warning", "error");
    if (variant) element.classList.add(variant);
  }

  function buildOutputName(fileName) {
    const clean = fileName.replace(/\.(xlsx|xlsm|xlsb|xls)$/i, "");
    return `${clean || "workbook"}_unified.xlsx`;
  }

  function formatNumber(value) {
    return new Intl.NumberFormat("en-US").format(Number(value) || 0);
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function startAmbientCanvas() {
    const canvas = elements.ambientCanvas;
    const ctx = canvas.getContext("2d");
    const points = [];
    const pointCount = 72;

    function resize() {
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.floor(window.innerWidth * ratio);
      canvas.height = Math.floor(window.innerHeight * ratio);
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    }

    function seed() {
      points.length = 0;
      for (let index = 0; index < pointCount; index += 1) {
        points.push({
          x: Math.random() * window.innerWidth,
          y: Math.random() * window.innerHeight,
          vx: (Math.random() - 0.5) * 0.28,
          vy: (Math.random() - 0.5) * 0.28,
          r: 1 + Math.random() * 1.8,
        });
      }
    }

    function draw() {
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      ctx.fillStyle = "rgba(57, 217, 255, 0.54)";
      ctx.strokeStyle = "rgba(57, 217, 255, 0.10)";
      ctx.lineWidth = 1;

      for (const point of points) {
        point.x += point.vx;
        point.y += point.vy;
        if (point.x < -20) point.x = window.innerWidth + 20;
        if (point.x > window.innerWidth + 20) point.x = -20;
        if (point.y < -20) point.y = window.innerHeight + 20;
        if (point.y > window.innerHeight + 20) point.y = -20;

        ctx.beginPath();
        ctx.arc(point.x, point.y, point.r, 0, Math.PI * 2);
        ctx.fill();
      }

      for (let i = 0; i < points.length; i += 1) {
        for (let j = i + 1; j < points.length; j += 1) {
          const a = points[i];
          const b = points[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          if (distance < 132) {
            ctx.globalAlpha = (132 - distance) / 132;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }
      ctx.globalAlpha = 1;
      requestAnimationFrame(draw);
    }

    resize();
    seed();
    draw();
    window.addEventListener("resize", () => {
      resize();
      seed();
    });
  }

  function startHeroFlowCanvas() {
    const canvas = elements.heroFlowCanvas;
    if (!canvas) return;
    const motionQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (motionQuery?.matches) return;

    const ctx = canvas.getContext("2d");
    const paths = [
      {
        from: [0.06, 0.24],
        c1: [0.22, 0.19],
        c2: [0.36, 0.34],
        to: [0.515, 0.43],
        color: [70, 226, 255],
        speed: 0.00012,
      },
      {
        from: [0.08, 0.43],
        c1: [0.23, 0.37],
        c2: [0.37, 0.46],
        to: [0.505, 0.48],
        color: [188, 82, 255],
        speed: 0.00014,
      },
      {
        from: [0.12, 0.62],
        c1: [0.27, 0.58],
        c2: [0.39, 0.55],
        to: [0.51, 0.52],
        color: [38, 239, 173],
        speed: 0.00011,
      },
      {
        from: [0.91, 0.27],
        c1: [0.78, 0.27],
        c2: [0.65, 0.36],
        to: [0.55, 0.44],
        color: [52, 242, 220],
        speed: 0.000105,
      },
      {
        from: [0.9, 0.56],
        c1: [0.77, 0.54],
        c2: [0.65, 0.5],
        to: [0.55, 0.49],
        color: [74, 198, 255],
        speed: 0.0001,
      },
      {
        from: [0.48, 0.08],
        c1: [0.51, 0.18],
        c2: [0.52, 0.28],
        to: [0.52, 0.36],
        color: [240, 248, 255],
        speed: 0.00016,
      },
      {
        from: [0.02, 0.18],
        c1: [0.18, 0.2],
        c2: [0.32, 0.31],
        to: [0.47, 0.42],
        color: [112, 80, 255],
        speed: 0.00009,
      },
      {
        from: [0.04, 0.72],
        c1: [0.2, 0.68],
        c2: [0.34, 0.58],
        to: [0.49, 0.51],
        color: [44, 220, 255],
        speed: 0.000085,
      },
      {
        from: [0.96, 0.22],
        c1: [0.8, 0.24],
        c2: [0.66, 0.34],
        to: [0.55, 0.45],
        color: [50, 242, 220],
        speed: 0.000095,
      },
      {
        from: [0.94, 0.68],
        c1: [0.8, 0.64],
        c2: [0.66, 0.58],
        to: [0.55, 0.52],
        color: [176, 88, 255],
        speed: 0.00009,
      },
    ];
    const particles = Array.from({ length: 108 }, (_, index) => ({
      pathIndex: index % paths.length,
      offset: Math.random(),
      size: 1.15 + Math.random() * 1.9,
      tail: 0.03 + Math.random() * 0.045,
      delay: Math.random() * 1.1,
    }));
    const whitePaths = [
      {
        from: [0.02, 0.22],
        c1: [0.18, 0.2],
        c2: [0.36, 0.3],
        to: [0.51, 0.41],
        speed: 0.00013,
      },
      {
        from: [0.04, 0.52],
        c1: [0.2, 0.5],
        c2: [0.37, 0.49],
        to: [0.52, 0.5],
        speed: 0.00011,
      },
      {
        from: [0.08, 0.74],
        c1: [0.22, 0.69],
        c2: [0.35, 0.61],
        to: [0.49, 0.53],
        speed: 0.0001,
      },
      {
        from: [0.97, 0.2],
        c1: [0.82, 0.23],
        c2: [0.67, 0.33],
        to: [0.56, 0.43],
        speed: 0.00012,
      },
      {
        from: [0.96, 0.63],
        c1: [0.8, 0.6],
        c2: [0.66, 0.56],
        to: [0.56, 0.52],
        speed: 0.000105,
      },
      {
        from: [0.5, 0.08],
        c1: [0.51, 0.17],
        c2: [0.52, 0.27],
        to: [0.52, 0.38],
        speed: 0.00014,
      },
    ];
    const whiteParticles = Array.from({ length: 140 }, (_, index) => ({
      pathIndex: index % whitePaths.length,
      offset: Math.random(),
      size: 0.45 + Math.random() * 0.75,
      tail: 0.03 + Math.random() * 0.04,
      delay: Math.random() * 1.2,
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
      const x =
        u * u * u * path.from[0] +
        3 * u * u * t * path.c1[0] +
        3 * u * t * t * path.c2[0] +
        t * t * t * path.to[0];
      const y =
        u * u * u * path.from[1] +
        3 * u * u * t * path.c1[1] +
        3 * u * t * t * path.c2[1] +
        t * t * t * path.to[1];
      return { x: x * width, y: y * height };
    }

    function drawGlow(point, color, radius, alpha) {
      const gradient = ctx.createRadialGradient(point.x, point.y, 0, point.x, point.y, radius * 5.8);
      gradient.addColorStop(0, `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${alpha})`);
      gradient.addColorStop(0.34, `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${alpha * 0.36})`);
      gradient.addColorStop(1, `rgba(${color[0]}, ${color[1]}, ${color[2]}, 0)`);
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(point.x, point.y, radius * 5.8, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = `rgba(248, 254, 255, ${Math.min(1, alpha + 0.2)})`;
      ctx.beginPath();
      ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    function drawWhiteGlow(point, radius, alpha) {
      const glowRadius = radius * 4.2;
      const gradient = ctx.createRadialGradient(point.x, point.y, 0, point.x, point.y, glowRadius);
      gradient.addColorStop(0, `rgba(255, 255, 255, ${alpha})`);
      gradient.addColorStop(0.25, `rgba(255, 255, 255, ${alpha * 0.45})`);
      gradient.addColorStop(0.6, `rgba(255, 255, 255, ${alpha * 0.12})`);
      gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(point.x, point.y, glowRadius, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = `rgba(255, 255, 255, ${Math.min(1, alpha + 0.24)})`;
      ctx.beginPath();
      ctx.arc(point.x, point.y, Math.max(0.9, radius), 0, Math.PI * 2);
      ctx.fill();
    }

    function drawTrail(path, fromT, toT, color, alpha) {
      const steps = 5;
      ctx.lineWidth = Math.max(1.1, width * 0.00115);
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
        const ease = 1 - Math.pow(1 - progress, 1.8);
        const pulse = 0.55 + Math.sin((progress + particle.offset) * Math.PI) * 0.25;
        const point = pointOnPath(path, ease);
        drawTrail(path, Math.max(0, ease - particle.tail), ease, path.color, 0.24 * pulse);
        drawGlow(point, path.color, particle.size, 0.52 * pulse);
      }

      for (const particle of whiteParticles) {
        const path = whitePaths[particle.pathIndex];
        const progress = (timestamp * path.speed + particle.offset + particle.delay) % 1;
        const ease = 1 - Math.pow(1 - progress, 1.75);
        const pulse = 0.48 + Math.sin((progress + particle.offset) * Math.PI * 1.7) * 0.18;
        const point = pointOnPath(path, ease);
        drawTrail(path, Math.max(0, ease - particle.tail), ease, [255, 255, 255], 0.18 * pulse);
        drawWhiteGlow(point, particle.size, 0.55 * pulse);
      }

      const focus = { x: width * 0.52, y: height * 0.45 };
      const focusPulse = 0.48 + Math.sin(timestamp * 0.003) * 0.16;
      drawGlow(focus, [55, 242, 225], Math.max(2.8, width * 0.0022), focusPulse);

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
})();
