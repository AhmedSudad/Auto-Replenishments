/* global JSZip */
self.importScripts("https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js");

self.addEventListener("message", async (event) => {
  const message = event.data || {};
  if (message.type !== "load") return;

  try {
    postProgress(message.requestId, "Opening workbook");
    const zip = await JSZip.loadAsync(message.buffer);
    const workbook = await readWorkbook(zip);
    const sharedStrings = await readSharedStrings(zip);
    const tables = [];

    for (let index = 0; index < workbook.sheets.length; index += 1) {
      const sheet = workbook.sheets[index];
      postProgress(message.requestId, `Reading ${sheet.name}`);
      const xml = await readZipText(zip, sheet.path);
      const rows = readWorksheetRows(xml, sharedStrings);
      tables.push({
        name: sheet.name,
        rows,
      });

      if (index % 2 === 1) await idle();
    }

    self.postMessage({
      type: "loaded",
      requestId: message.requestId,
      fileName: message.fileName || "workbook.xlsx",
      tables,
    });
  } catch (error) {
    self.postMessage({
      type: "error",
      requestId: message.requestId,
      error: error?.message || "Workbook upload failed.",
    });
  }
});

async function readWorkbook(zip) {
  const workbookXml = await readZipText(zip, "xl/workbook.xml");
  const relationshipsXml = await readZipText(zip, "xl/_rels/workbook.xml.rels");
  const relationships = readRelationships(relationshipsXml);
  const sheets = [];
  const pattern = /<sheet\b([^>]*)\/?>/g;
  let match;

  while ((match = pattern.exec(workbookXml))) {
    const attrs = match[1] || "";
    const name = getAttribute(attrs, "name");
    const relationshipId = getAttribute(attrs, "r:id");
    const target = relationships.get(relationshipId);
    if (!name || !target) continue;
    sheets.push({
      name,
      path: resolveZipPath("xl/workbook.xml", target),
    });
  }

  if (!sheets.length) throw new Error("No worksheets were found.");
  return { sheets };
}

function readRelationships(xml) {
  const relationships = new Map();
  const pattern = /<Relationship\b([^>]*)\/?>/g;
  let match;

  while ((match = pattern.exec(xml))) {
    const attrs = match[1] || "";
    const id = getAttribute(attrs, "Id");
    const target = getAttribute(attrs, "Target");
    if (id && target) relationships.set(id, target);
  }

  return relationships;
}

async function readSharedStrings(zip) {
  const entry = zip.file("xl/sharedStrings.xml");
  if (!entry) return [];

  const xml = await entry.async("text");
  const strings = [];
  const pattern = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
  let match;

  while ((match = pattern.exec(xml))) {
    const itemXml = match[1] || "";
    const parts = [];
    const textPattern = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
    let textMatch;
    while ((textMatch = textPattern.exec(itemXml))) {
      parts.push(decodeXml(textMatch[1] || ""));
    }
    strings.push(parts.join(""));
  }

  return strings;
}

function readWorksheetRows(xml, sharedStrings) {
  const rows = [];
  const rowPattern = /<row\b[^>]*?(?:\/>|>[\s\S]*?<\/row>)/g;
  let rowMatch;

  while ((rowMatch = rowPattern.exec(xml))) {
    const rowXml = rowMatch[0] || "";
    const values = [];
    const cellPattern = /<c\b([^>]*?)>([\s\S]*?)<\/c>|<c\b([^>]*?)\/>/g;
    let cellMatch;

    while ((cellMatch = cellPattern.exec(rowXml))) {
      const attrs = cellMatch[1] || cellMatch[3] || "";
      const body = cellMatch[2] || "";
      const reference = getAttribute(attrs, "r");
      const columnIndex = reference ? columnIndexFromRef(reference) : values.length;
      values[columnIndex] = readCellValue(attrs, body, sharedStrings);
    }

    if (values.some((value) => String(value || "").trim() !== "")) {
      rows.push(fillSparseRow(values));
    }
  }

  return rows;
}

function readCellValue(attrs, body, sharedStrings) {
  const type = getAttribute(attrs, "t");

  if (type === "inlineStr") {
    return readInlineString(body);
  }

  const value = readValue(body);
  if (type === "s") {
    return sharedStrings[Number(value)] || "";
  }
  if (type === "b") {
    return value === "1" ? "TRUE" : "FALSE";
  }

  return value;
}

function readInlineString(body) {
  const parts = [];
  const textPattern = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
  let match;
  while ((match = textPattern.exec(body))) {
    parts.push(decodeXml(match[1] || ""));
  }
  return parts.join("");
}

function readValue(body) {
  const match = String(body || "").match(/<v\b[^>]*>([\s\S]*?)<\/v>/);
  return match ? decodeXml(match[1] || "").trim() : "";
}

function fillSparseRow(values) {
  const width = values.length;
  return Array.from({ length: width }, (_, index) => values[index] ?? "");
}

async function readZipText(zip, path) {
  const entry = zip.file(path);
  if (!entry) throw new Error(`Workbook part not found: ${path}`);
  return entry.async("text");
}

function resolveZipPath(fromPath, target) {
  if (target.startsWith("/")) return target.replace(/^\/+/, "");
  const base = fromPath.split("/").slice(0, -1);
  for (const part of target.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") base.pop();
    else base.push(part);
  }
  return base.join("/");
}

function columnIndexFromRef(reference) {
  const letters = String(reference || "").match(/^[A-Z]+/i)?.[0] || "";
  let index = 0;
  for (const letter of letters.toUpperCase()) {
    index = index * 26 + (letter.charCodeAt(0) - 64);
  }
  return Math.max(0, index - 1);
}

function getAttribute(xmlOrAttrs, name) {
  const escaped = escapeRegExp(name);
  const match = String(xmlOrAttrs || "").match(new RegExp(`\\b${escaped}="([^"]*)"`));
  return match ? decodeXml(match[1]) : "";
}

function decodeXml(value) {
  return String(value || "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function postProgress(requestId, text) {
  self.postMessage({
    type: "progress",
    requestId,
    text,
  });
}

function idle() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
