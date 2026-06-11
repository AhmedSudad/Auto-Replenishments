/* global JSZip */
self.importScripts("https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js");

let zipFile = null;
let sourceFileName = "";
let workbookInfo = null;
let sharedStrings = null;
let sharedStringsXml = "";
let sharedStringIndex = null;
let originalSharedStringCount = 0;

const MODE_CONFIG = {
  conservative: {
    charMin: 0.92,
    tokenMin: 0.84,
    maxLengthDelta: 0.24,
    finalMin: 78,
    prefixMin: 90,
    distinctJaccardMin: 0.4,
    keyAutoMin: 94,
    keyReviewMin: 88,
  },
  balanced: {
    charMin: 0.88,
    tokenMin: 0.72,
    maxLengthDelta: 0.34,
    finalMin: 70,
    prefixMin: 85,
    distinctJaccardMin: 0.34,
    keyAutoMin: 92,
    keyReviewMin: 86,
  },
  aggressive: {
    charMin: 0.82,
    tokenMin: 0.62,
    maxLengthDelta: 0.46,
    finalMin: 62,
    prefixMin: 80,
    distinctJaccardMin: 0.25,
    keyAutoMin: 90,
    keyReviewMin: 84,
  },
};

const LEGAL_PHRASES = [
  "LIMITED LIABILITY COMPANY",
  "PRIVATE LIMITED COMPANY",
  "PUBLIC LIMITED COMPANY",
  "COMMERCIAL AGENCIES",
  "COMMERCIAL AGENCY",
  "GENERAL TRADING",
  "GENERAL TRADE",
  "GENERAL CONTRACTING",
  "TRADING AND CONTRACTING",
  "IMPORT AND EXPORT",
  "IMPORT EXPORT",
  "COMPANY LIMITED",
  "CO LIMITED",
  "CO LTD",
  "L L C",
  "LTD",
  "LIMITED",
  "LLC",
  "INCORPORATED",
  "INC",
  "CORPORATION",
  "CORP",
  "COMPANY",
  "CO",
  "PLC",
  "FZE",
  "FZCO",
  "DMCC",
  "SA",
  "S A",
];

const STOPWORDS = new Set([
  "A",
  "AN",
  "AND",
  "CO",
  "COMPANY",
  "CORP",
  "CORPORATION",
  "FOR",
  "INC",
  "INCORPORATED",
  "L",
  "LC",
  "LTD",
  "LIMITED",
  "LLC",
  "OF",
  "PLC",
  "SA",
  "THE",
]);

const LEGAL_TOKENS = new Set([
  "AB",
  "AG",
  "AS",
  "BHD",
  "BV",
  "CO",
  "COMPANY",
  "CORP",
  "CORPORATION",
  "DMCC",
  "FACTORY",
  "FZE",
  "FZCO",
  "GMBH",
  "INC",
  "INCORPORATED",
  "KK",
  "LC",
  "LIMITED",
  "LLC",
  "LLP",
  "LP",
  "LTD",
  "NV",
  "OY",
  "OYJ",
  "PJSC",
  "PLC",
  "PLLC",
  "PSC",
  "PSJC",
  "PTE",
  "PTY",
  "QSC",
  "SA",
  "SAE",
  "SAOC",
  "SAOG",
  "SARL",
  "SAS",
  "SDN",
  "SPA",
]);

const CURRENCY_TOKENS = new Set([
  "AED",
  "AUD",
  "BHD",
  "BRL",
  "CAD",
  "CHF",
  "CNY",
  "EGP",
  "EUR",
  "GBP",
  "HKD",
  "IQD",
  "JOD",
  "JPY",
  "KWD",
  "OMR",
  "QAR",
  "SAR",
  "TRY",
  "USD",
]);

const BUSINESS_STOPWORDS = new Set([
  "AGENCIES",
  "AGENCY",
  "AL",
  "AND",
  "CO",
  "COMMERCIAL",
  "COMPANY",
  "CONSULTANCY",
  "CONSULTING",
  "EL",
  "ENTERPRISE",
  "ENTERPRISES",
  "EST",
  "ESTABLISHMENT",
  "EXPORT",
  "FACTORY",
  "FOR",
  "FZE",
  "GENERAL",
  "GLOBAL",
  "GROUP",
  "HOLDING",
  "HOLDINGS",
  "IMPORT",
  "INDUSTRIAL",
  "INDUSTRY",
  "INTERNATIONAL",
  "LIMITED",
  "LLC",
  "LTD",
  "OF",
  "PJSC",
  "PLC",
  "SERVICE",
  "SERVICES",
  "THE",
  "TRADE",
  "TRADING",
]);

const GENERIC_PHRASES_DOWNWEIGHT = [
  ["FOR", "GENERAL", "TRADING"],
  ["FOR", "GENERAL", "TRADE"],
  ["FOR", "GEN", "TRADE"],
  ["GENERAL", "TRADING"],
  ["GENERAL", "TRADE"],
  ["IMPORT", "AND", "EXPORT"],
  ["IMPORT", "EXPORT"],
];

const ABBREV_MAP = {
  GEN: "GENERAL",
  "GEN.": "GENERAL",
  TRD: "TRADE",
  "TRD.": "TRADE",
};

const TRUNC_PREFIXES = [
  ["CONTRACTIN", "CONTRACTING"],
  ["CONTRAC", "CONTRACT"],
  ["CONTRACT", "CONTRACT"],
  ["TRADIN", "TRADING"],
  ["TRADI", "TRADING"],
  ["TRAD", "TRADE"],
  ["GENER", "GENERAL"],
  ["GENERA", "GENERAL"],
  ["SERVIC", "SERVICES"],
  ["ELECTRON", "ELECTRONICS"],
];

const ARTICLES = new Set(["AL", "EL", "AL-", "EL-"]);
const DISTINCTIVE_STOPWORDS = new Set([...BUSINESS_STOPWORDS, "INTL", "INT"]);
const GENERIC_CANON_TOKENS = new Set([
  "AGENCIES",
  "AGENCY",
  "CO",
  "COMPANY",
  "CONTRACT",
  "CONTRACTING",
  "EXPORT",
  "IMPORT",
  "LIABILITY",
  "LIMITED",
  "LTD",
  "SERVICE",
  "SERVICES",
  "TRADE",
  "TRADING",
]);
const TRAILING_CONNECTORS = new Set(["AND", "&", "FOR", "OF", "THE", "AL", "EL"]);

const CORRESPONDENT_BANK_ALIASES = [
  { canonical: "JP Morgan Bank", patterns: [/\bJPMORGAN\b/, /\bJ\s*P\s+MORGAN\b/, /^J\s*P(?:\s+N\s+A|\s+NA)?$/, /^JP\s+BANK$/, /^CHASUS\d*$/, /\bJPM\s+CHASE\b/] },
  { canonical: "Bank of America", patterns: [/\bBANK\s+OF\s+AMERICA\b/, /\bB\s+OF\s+A\b/, /\bBOFA\b/, /\bBAML\b/] },
  { canonical: "Citibank", patterns: [/\bCITIBANK\b/, /\bCITI\s+BANK\b/, /\bCITI\s+NA\b/, /\bCITIGROUP\b/, /^CITI(?:\s+(?:SUB|CUB|NY|BANK|NA|N|A|AC|ACC|ACCOUNT|USA))*$/, /^CITY\s+SUB\s+AC$/] },
  { canonical: "HSBC Bank", patterns: [/\bHSBC\b/, /\bHONGKONG\s+AND\s+SHANGHAI\s+BANKING\b/] },
  { canonical: "Standard Chartered Bank", patterns: [/\bSTANDARD\s+CHARTERED\b/, /\bSTANCHART\b/] },
  { canonical: "Deutsche Bank", patterns: [/\bDEUTSCHE\s+BANK\b/] },
  { canonical: "BNP Paribas", patterns: [/\bBNP\s+PARIBAS\b/] },
  { canonical: "Barclays Bank", patterns: [/\bBARCLAYS\b/] },
  { canonical: "UBS Bank", patterns: [/\bUBS\b/, /\bUNION\s+BANK\s+OF\s+SWITZERLAND\b/] },
  { canonical: "Credit Suisse", patterns: [/\bCREDIT\s+SUISSE\b/] },
  { canonical: "Morgan Stanley Bank", patterns: [/\bMORGAN\s+STANLEY\b/] },
  { canonical: "Goldman Sachs Bank", patterns: [/\bGOLDMAN\s+SACHS\b/] },
  { canonical: "Wells Fargo Bank", patterns: [/\bWELLS\s+FARGO\b/] },
  { canonical: "Royal Bank of Canada", patterns: [/\bROYAL\s+BANK\s+OF\s+CANADA\b/, /\bRBC\b/] },
  { canonical: "Toronto-Dominion Bank", patterns: [/\bTORONTO\s+DOMINION\b/, /\bTD\s+BANK\b/] },
  { canonical: "Bank of China", patterns: [/\bBANK\s+OF\s+CHINA\b/, /^BOC\b/] },
  { canonical: "Industrial and Commercial Bank of China", patterns: [/\bINDUSTRIAL\s+AND\s+COMMERCIAL\s+BANK\s+OF\s+CHINA\b/, /\bICBC\b/] },
  { canonical: "China Construction Bank", patterns: [/\bCHINA\s+CONSTRUCTION\s+BANK\b/, /\bCCB\b/] },
  { canonical: "Agricultural Bank of China", patterns: [/\bAGRICULTURAL\s+BANK\s+OF\s+CHINA\b/, /\bABC\s+BANK\b/] },
  { canonical: "China Merchants Bank", patterns: [/\bCHINA\s+MERCHANTS\s+BANK\b/, /\bCMB\b/] },
  { canonical: "MUFG Bank", patterns: [/\bMUFG\b/, /\bMITSUBISHI\s+UFJ\b/] },
  { canonical: "Mizuho Bank", patterns: [/\bMIZUHO\b/] },
  { canonical: "Sumitomo Mitsui Banking Corporation", patterns: [/\bSUMITOMO\s+MITSUI\b/, /\bSMBC\b/] },
  { canonical: "Societe Generale", patterns: [/\bSOCIETE\s+GENERALE\b/, /\bSOCIETE\s+GENERAL\b/] },
  { canonical: "Commerzbank", patterns: [/\bCOMMERZBANK\b/] },
  { canonical: "ING Bank", patterns: [/\bING\s+BANK\b/, /^ING$/] },
  { canonical: "Rabobank", patterns: [/\bRABOBANK\b/] },
  { canonical: "NatWest Bank", patterns: [/\bNATWEST\b/, /\bNATIONAL\s+WESTMINSTER\b/] },
  { canonical: "Lloyds Bank", patterns: [/\bLLOYDS\b/] },
  { canonical: "Santander Bank", patterns: [/\bSANTANDER\b/] },
  { canonical: "BBVA", patterns: [/\bBBVA\b/, /\bBANCO\s+BILBAO\s+VIZCAYA\b/] },
  { canonical: "ANZ Bank", patterns: [/\bANZ\b/, /\bAUSTRALIA\s+AND\s+NEW\s+ZEALAND\s+BANKING\b/] },
  { canonical: "Commonwealth Bank of Australia", patterns: [/\bCOMMONWEALTH\s+BANK\s+OF\s+AUSTRALIA\b/, /\bCBA\b/] },
  { canonical: "National Australia Bank", patterns: [/\bNATIONAL\s+AUSTRALIA\s+BANK\b/, /\bNAB\b/] },
  { canonical: "Westpac Bank", patterns: [/\bWESTPAC\b/] },
  { canonical: "Emirates NBD Bank", patterns: [/\bEMIRATES\s+NBD\b/, /\bENBD\b/] },
  { canonical: "Emirates Islamic Bank", patterns: [/\bEMIRATES\s+ISLAMIC\s+BANK\b/, /\bEMITRATES\s+ISLAMIC\s+BANK\b/] },
  { canonical: "First Abu Dhabi Bank", patterns: [/\bFIRST\s+ABU\s+DHABI\s+BANK\b/, /\bFAB\b/] },
  { canonical: "Abu Dhabi Commercial Bank", patterns: [/\bABU\s+DHABI\s+COMMERCIAL\s+BANK\b/, /\bADCB\b/] },
  { canonical: "Abu Dhabi Islamic Bank", patterns: [/\bABU\s+DHABI\s+ISLAMIC\s+BANK\b/, /\bABI\s+DHABI\s+ISLAMIC\s+BANK\b/, /\bDHABI\s+ISLAMIC\s+BANK\b/] },
  { canonical: "Mashreq Bank", patterns: [/\bMASHREQ\b/] },
  { canonical: "Commercial Bank of Dubai", patterns: [/\bCOMMERCIAL\s+BANK\s+OF\s+DUBAI\b/, /\bCBD\b/] },
  { canonical: "Qatar National Bank", patterns: [/\bQATAR\s+NATIONAL\s+BANK\b/, /\bQNB\b/] },
  { canonical: "Doha Bank", patterns: [/\bDOHA\s+BANK\b/] },
  { canonical: "Al Rajhi Bank", patterns: [/\bAL\s+RAJHI\b/] },
  { canonical: "Saudi National Bank", patterns: [/\bSAUDI\s+NATIONAL\s+BANK\b/, /\bSNB\b/] },
  { canonical: "Riyad Bank", patterns: [/\bRIYAD\s+BANK\b/, /\bRIYADH\s+BANK\b/] },
  { canonical: "Arab National Bank", patterns: [/\bARAB\s+NATIONAL\s+BANK\b/, /\bANB\b/] },
  { canonical: "Saudi Awwal Bank", patterns: [/\bSAUDI\s+AWWAL\b/, /\bSABB\b/] },
  { canonical: "National Bank of Kuwait", patterns: [/\bNATIONAL\s+BANK\s+OF\s+KUWAIT\b/, /\bNBK\b/] },
  { canonical: "Kuwait Finance House", patterns: [/\bKUWAIT\s+FINANCE\s+HOUSE\b/, /\bKFH\b/] },
  { canonical: "Bank Muscat", patterns: [/\bBANK\s+MUSCAT\b/] },
  { canonical: "Arab Bank", patterns: [/\bARAB\s+BANK\b/] },
  { canonical: "National Bank of Egypt", patterns: [/\bNATIONAL\s+BANK\s+OF\s+EGYPT\b/, /\bNBE\b/] },
  { canonical: "Banque Misr", patterns: [/\bBANQUE\s+MISR\b/] },
  { canonical: "Commercial International Bank", patterns: [/\bCOMMERCIAL\s+INTERNATIONAL\s+BANK\b/, /\bCIB\b/] },
  { canonical: "Trade Bank of Iraq", patterns: [/\bTRADE\s+BANK\s+OF\s+IRAQ\b/, /\bTBI\b/] },
  { canonical: "Rafidain Bank", patterns: [/\bRAFIDAIN\b/] },
  { canonical: "Rasheed Bank", patterns: [/\bRASHEED\b/, /\bAL\s+RASHEED\b/] },
  { canonical: "DBS Bank", patterns: [/\bDBS\b/] },
  { canonical: "Byblos Bank", patterns: [/\bBYBLOS\s+BANK\b/, /\bBYBLOS\s+IRAQ\s+USD\s+ACCOUNT\b/] },
  { canonical: "Ziraat Bank", patterns: [/\bZIRAAT\s+BANKASI\b/, /\bTC\s+ZIRAAT\b/, /\bT\s+C\s+ZIRAAT\b/] },
  { canonical: "Turkiye Is Bankasi", patterns: [/\bTURKEY\s+IS\s+BANK\b/, /^IS\s+BANK\b/] },
  { canonical: "Jordan Commercial Bank", patterns: [/\bJORDAN\s+COMMERCIAL\s+BANK\b/, /\bJORDAN\s+COMMERICAL\s+BANK\b/] },
  { canonical: "Albaraka Turk Participation Bank", patterns: [/\bALBARAKA\s+TURK\b/, /\bAL\s+BARAKA\s+TURK\b/] },
  { canonical: "Intesa Sanpaolo", patterns: [/\bINTESA\s+SANPAOLO\b/] },
  { canonical: "Axis Bank", patterns: [/\bAXIS\s+BANK\b/] },
  { canonical: "Standard Chartered Bank", patterns: [/^SCB\s+NEW\s+YORK$/] },
];

const BANK_BRANCH_NOISE = new Set([
  "AMMAN",
  "BAGHDAD",
  "BAHRAIN",
  "BEIRUT",
  "BRANCH",
  "BR",
  "CAIRO",
  "CITY",
  "DHAHRAN",
  "DOHA",
  "DUBAI",
  "FRANKFURT",
  "GENEVA",
  "HEAD",
  "HK",
  "HONG",
  "ISTANBUL",
  "JEDDAH",
  "KONG",
  "KUWAIT",
  "LONDON",
  "MAIN",
  "MANAMA",
  "MUSCAT",
  "NEW",
  "OFFICE",
  "PARIS",
  "REP",
  "REPRESENTATIVE",
  "RIYADH",
  "SINGAPORE",
  "TOKYO",
  "UAE",
  "UK",
  "USA",
  "YORK",
]);

const BANK_SUFFIX_NOISE = new Set([
  "AG",
  "AS",
  "BANKING",
  "BHD",
  "BV",
  "CORP",
  "CORPORATION",
  "GMBH",
  "INC",
  "LIMITED",
  "LLC",
  "LTD",
  "N",
  "NA",
  "NV",
  "PLC",
  "PJSC",
  "PSC",
  "SA",
]);

self.addEventListener("message", async (event) => {
  const message = event.data || {};
  try {
    if (message.type === "load") {
      await loadWorkbook(message);
    } else if (message.type === "sheetMeta") {
      postMessage({ type: "sheetMeta", ...(await getSheetMeta(message.sheetName)) });
    } else if (message.type === "process") {
      await processWorkbook(message);
    }
  } catch (error) {
    postMessage({
      type: "error",
      error: error?.message || "Unexpected processing error.",
    });
  }
});

async function loadWorkbook(message) {
  sourceFileName = message.fileName || "workbook.xlsx";
  workbookInfo = null;
  sharedStrings = null;
  sharedStringIndex = null;
  sharedStringsXml = "";
  originalSharedStringCount = 0;

  postProgress(12, "Opening XLSX package...");
  zipFile = await JSZip.loadAsync(message.buffer);
  workbookInfo = await readWorkbookInfo();
  await readSharedStrings();

  postProgress(30, "Inspecting workbook sheets...");
  const sheets = [];
  for (let index = 0; index < workbookInfo.sheets.length; index += 1) {
    const sheet = workbookInfo.sheets[index];
    const sheetXml = await readZipText(sheet.path);
    const range = readDimension(sheetXml);
    sheets.push({
      name: sheet.name,
      rowCount: range ? Math.max(0, range.e.r - range.s.r) : countRowsFromXml(sheetXml),
      columnCount: range ? Math.max(0, range.e.c - range.s.c + 1) : 0,
    });
    if (index % 2 === 1) await idle();
  }

  const activeSheet = await getSheetMeta(workbookInfo.sheets[0]?.name);
  postMessage({
    type: "loaded",
    sheets,
    activeSheet,
  });
}

async function getSheetMeta(sheetName) {
  assertWorkbook();
  const sheet = findSheet(sheetName);
  const sheetXml = await readZipText(sheet.path);
  const range = readDimension(sheetXml) || inferRange(sheetXml);
  if (!range) {
    return {
      name: sheet.name,
      headers: [],
      suggestedColumn: null,
      suggestionExact: false,
      rowCount: 0,
    };
  }

  const headerRow = findHeaderRow(sheetXml, range);
  const headers = readHeaders(sheetXml, range, headerRow);
  const suggestion = suggestColumn(headers);

  return {
    name: sheet.name,
    headers,
    suggestedColumn: suggestion.index,
    suggestionExact: suggestion.exact,
    headerRow,
    rowCount: Math.max(0, range.e.r - headerRow),
    columnCount: range.e.c - range.s.c + 1,
  };
}

async function processWorkbook(options) {
  assertWorkbook();
  const sheet = findSheet(options.sheetName);
  let sheetXml = await readZipText(sheet.path);
  const range = readDimension(sheetXml) || inferRange(sheetXml);
  if (!range) throw new Error("The selected sheet is empty.");

  const headerRow = findHeaderRow(sheetXml, range);
  const headers = readHeaders(sheetXml, range, headerRow);
  const sourceColumn = Number(options.sourceColumn);
  if (!Number.isFinite(sourceColumn)) throw new Error("Choose a valid source column.");

  postProgress(8, "Scanning company names...");
  const scan = await scanNames(sheetXml, range, headerRow, sourceColumn);

  postProgress(36, `Found ${formatNumber(scan.uniqueCounts.size)} unique source names. Building match groups...`);
  let grouped = await unifyNames(scan.uniqueCounts, options.mode || "balanced", options.format || "upper");
  const sourceHeader = headers.find((header) => header.index === sourceColumn);
  if (isCorrespondentBankHeader(sourceHeader?.rawLabel || sourceHeader?.label)) {
    postProgress(68, "Applying correspondent-bank cleanup pass 2...");
    grouped = refineCorrespondentBankGroups(grouped, scan.uniqueCounts);
    await idle();
    postProgress(71, "Applying correspondent-bank final artifact pass 3...");
    grouped = finalizeCorrespondentBankArtifacts(grouped, scan.uniqueCounts);
    await idle();
  }

  const outputColumnName = options.outputColumnName || "Unified Commercial Company Name";
  const outputColumn = findOrAppendOutputColumn(headers, outputColumnName);

  postProgress(72, "Preparing shared string table...");
  const outputHeaderIndex = ensureSharedString(outputColumnName);
  const outputIndexes = new Map();
  for (const value of new Set(grouped.mapping.values())) {
    outputIndexes.set(value, ensureSharedString(value));
  }

  postProgress(74, "Writing unified-name column into the worksheet XML...");
  const writeResult = await writeUnifiedColumnXml({
    sheetXml,
    range,
    headerRow,
    sourceColumn,
    outputColumn,
    outputHeaderIndex,
    outputIndexes,
    mapping: grouped.mapping,
  });
  sheetXml = writeResult.sheetXml;

  const updatedRange = {
    s: range.s,
    e: {
      r: Math.max(range.e.r, headerRow),
      c: Math.max(range.e.c, outputColumn),
    },
  };
  sheetXml = updateSheetReferences(sheetXml, updatedRange, outputColumn);
  zipFile.file(sheet.path, sheetXml);

  const sharedStringWrites = writeResult.cellsWritten + 1;
  zipFile.file("xl/sharedStrings.xml", buildSharedStringsXml(sharedStringWrites));
  await updateWorkbookDefinedName(sheet, outputColumn);

  postProgress(88, "Packaging the new workbook...");
  const buffer = await zipFile.generateAsync(
    {
      type: "arraybuffer",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    },
    (metadata) => {
      if (metadata.percent) {
        postProgress(88 + metadata.percent * 0.1, "Packaging the new workbook...");
      }
    },
  );

  postMessage(
    {
      type: "done",
      buffer,
      outputFileName: buildOutputName(sourceFileName),
      stats: {
        rowsScanned: scan.rowsScanned,
        rowsUnified: grouped.rowsUnified,
        uniqueBefore: scan.uniqueCounts.size,
        uniqueAfter: grouped.uniqueAfter,
      },
      preview: grouped.preview,
    },
    [buffer],
  );
}

async function scanNames(sheetXml, range, headerRow, sourceColumn) {
  const uniqueCounts = new Map();
  let rowsScanned = 0;
  let lastProgress = 0;

  const rowPattern = /<row\b[^>]*?(?:\/>|>[\s\S]*?<\/row>)/g;
  let match;
  while ((match = rowPattern.exec(sheetXml))) {
    const rowXml = match[0];
    const rowNumber = getRowNumber(rowXml);
    if (rowNumber <= headerRow || rowNumber > range.e.r) continue;
    if (!rowHasRealValue(rowXml)) continue;
    const text = collapseWhitespace(readCellTextFromRow(rowXml, sourceColumn));
    rowsScanned += 1;
    if (text) {
      uniqueCounts.set(text, (uniqueCounts.get(text) || 0) + 1);
    }

    if (rowsScanned - lastProgress >= 5000) {
      lastProgress = rowsScanned;
      const percent = 8 + (rowsScanned / Math.max(1, range.e.r - headerRow)) * 24;
      postProgress(percent, `Scanning rows: ${formatNumber(rowsScanned)} of ${formatNumber(range.e.r - headerRow)}`);
      await idle();
    }
  }

  return { uniqueCounts, rowsScanned };
}

function rowHasRealValue(rowXml) {
  return /<(?:v|is|f)\b/i.test(rowXml);
}

async function unifyNames(uniqueCounts, mode, format) {
  const config = MODE_CONFIG[mode] || MODE_CONFIG.balanced;
  const records = Array.from(uniqueCounts.entries()).map(([name, count], index) => ({
    index,
    name,
    count,
    analysis: analyzeName(name),
  }));

  const union = createUnionFind(records.length);
  unionByKey(records, union, (record) => record.analysis.cleaned, 3);
  unionByKey(records, union, (record) => record.analysis.coreKey, 5);
  unionByKey(records, union, (record) => record.analysis.fingerprint, 5);
  unionByKey(records, union, (record) => record.analysis.standardizedKey, 5);

  const blocks = buildBlocks(records);
  let blockIndex = 0;
  for (const block of blocks.values()) {
    blockIndex += 1;
    if (block.length > 1 && block.length <= 700) {
      compareBlock(records, block, union, config);
    }
    if (blockIndex % 25 === 0) {
      postProgress(42 + Math.min(24, (blockIndex / Math.max(1, blocks.size)) * 24), "Comparing similar name variants...");
      await idle();
    }
  }

  postProgress(66, "Building final canonical company groups...");
  const firstPassGroups = new Map();
  for (const record of records) {
    const root = union.find(record.index);
    if (!firstPassGroups.has(root)) firstPassGroups.set(root, []);
    firstPassGroups.get(root).push(record);
  }

  const groupRecords = Array.from(firstPassGroups.values()).map((members, index) => {
    const representative = chooseCanonical(members, "original");
    const standardized = standardizeCompanyName(representative);
    return {
      index,
      members,
      count: members.reduce((sum, member) => sum + member.count, 0),
      representative,
      standardized,
      clusterKey: firstTwoDistinctiveKey(standardized),
    };
  });

  const groupUnion = createUnionFind(groupRecords.length);
  unionByKey(groupRecords, groupUnion, (group) => group.clusterKey, 3);

  for (let i = 0; i < groupRecords.length; i += 1) {
    const a = groupRecords[i];
    if (!a.clusterKey) continue;
    for (let j = i + 1; j < groupRecords.length; j += 1) {
      const b = groupRecords[j];
      if (!b.clusterKey || groupUnion.find(a.index) === groupUnion.find(b.index)) continue;
      if (shouldMergeCanonicalKeys(a, b, config)) groupUnion.union(a.index, b.index);
    }
    if (i > 0 && i % 300 === 0) await idle();
  }

  const finalGroups = new Map();
  for (const group of groupRecords) {
    const root = groupUnion.find(group.index);
    if (!finalGroups.has(root)) finalGroups.set(root, []);
    finalGroups.get(root).push(...group.members);
  }

  const mapping = new Map();
  const preview = [];
  let rowsUnified = 0;
  for (const members of finalGroups.values()) {
    const canonical = chooseCanonical(members, format);
    for (const member of members) mapping.set(member.name, canonical);
    if (members.length > 1) {
      const count = members.reduce((sum, member) => sum + member.count, 0);
      rowsUnified += count;
      preview.push({
        unified: canonical,
        count,
        variants: members
          .slice()
          .sort((a, b) => b.count - a.count)
          .map((member) => member.name),
      });
    }
  }

  preview.sort((a, b) => b.count - a.count);
  return {
    mapping,
    uniqueAfter: finalGroups.size,
    rowsUnified,
    preview,
  };
}

function refineCorrespondentBankGroups(grouped, uniqueCounts) {
  const mapping = new Map();
  const buckets = new Map();

  for (const [sourceName, count] of uniqueCounts.entries()) {
    const firstPassName = grouped.mapping.get(sourceName) || sourceName;
    const canonical = canonicalizeCorrespondentBankName(sourceName) || canonicalizeCorrespondentBankName(firstPassName) || firstPassName;
    mapping.set(sourceName, canonical);

    if (!buckets.has(canonical)) {
      buckets.set(canonical, {
        unified: canonical,
        count: 0,
        variants: new Map(),
      });
    }
    const bucket = buckets.get(canonical);
    bucket.count += count;
    bucket.variants.set(sourceName, (bucket.variants.get(sourceName) || 0) + count);
  }

  const preview = [];
  let rowsUnified = 0;
  for (const bucket of buckets.values()) {
    const variants = Array.from(bucket.variants.entries()).sort((a, b) => b[1] - a[1]);
    const canonicalKey = normalizeBankCompare(bucket.unified);
    const hasCanonicalChange = variants.some(([variant]) => normalizeBankCompare(variant) !== canonicalKey);
    if (variants.length > 1 || hasCanonicalChange) {
      rowsUnified += bucket.count;
      preview.push({
        unified: bucket.unified,
        count: bucket.count,
        variants: variants.map(([variant]) => variant),
      });
    }
  }

  preview.sort((a, b) => b.count - a.count);
  return {
    mapping,
    uniqueAfter: buckets.size,
    rowsUnified,
    preview,
  };
}

function finalizeCorrespondentBankArtifacts(grouped, uniqueCounts) {
  const mapping = new Map();
  const buckets = new Map();

  for (const [sourceName, count] of uniqueCounts.entries()) {
    const currentName = grouped.mapping.get(sourceName) || sourceName;
    const canonical = canonicalizeCorrespondentBankArtifact(sourceName, currentName) || currentName;
    mapping.set(sourceName, canonical);

    if (!buckets.has(canonical)) {
      buckets.set(canonical, {
        unified: canonical,
        count: 0,
        variants: new Map(),
      });
    }
    const bucket = buckets.get(canonical);
    bucket.count += count;
    bucket.variants.set(sourceName, (bucket.variants.get(sourceName) || 0) + count);
  }

  const preview = [];
  let rowsUnified = 0;
  for (const bucket of buckets.values()) {
    const variants = Array.from(bucket.variants.entries()).sort((a, b) => b[1] - a[1]);
    const canonicalKey = normalizeBankCompare(bucket.unified);
    const hasCanonicalChange = variants.some(([variant]) => normalizeBankCompare(variant) !== canonicalKey);
    if (variants.length > 1 || hasCanonicalChange) {
      rowsUnified += bucket.count;
      preview.push({
        unified: bucket.unified,
        count: bucket.count,
        variants: variants.map(([variant]) => variant),
      });
    }
  }

  preview.sort((a, b) => b.count - a.count);
  return {
    mapping,
    uniqueAfter: buckets.size,
    rowsUnified,
    preview,
  };
}

function canonicalizeCorrespondentBankArtifact(sourceName, currentName) {
  const sourceCanonical = canonicalizeCorrespondentBankName(sourceName);
  if (sourceCanonical) return sourceCanonical;

  const currentCanonical = canonicalizeCorrespondentBankName(currentName);
  if (currentCanonical) return currentCanonical;

  const sourceLookup = normalizeBankLookup(sourceName, true);
  const currentLookup = normalizeBankLookup(currentName, true);
  const combined = `${sourceLookup} ${currentLookup}`.trim();

  if (hasArabicJpBank(sourceName) || hasArabicJpBank(currentName)) return "JP Morgan Bank";
  if (/^JP\s+BANK$/.test(currentLookup) || /^JP\s+BANK$/.test(sourceLookup)) return "JP Morgan Bank";
  if (/^CITI(?:\s+(?:SUB|CUB|NY|AC|ACC|ACCOUNT))*$/.test(combined)) return "Citibank";
  if (/\bDBS\b/.test(combined)) return "DBS Bank";
  if (/\bCHASUS\d*\b/.test(combined)) return "JP Morgan Bank";
  if (/\bDHABI\s+ISLAMIC\s+BANK\b/.test(combined)) return "Abu Dhabi Islamic Bank";
  if (/\bEMITRATES\s+ISLAMIC\s+BANK\b/.test(combined)) return "Emirates Islamic Bank";
  if (/\bJORDAN\s+COMMERICAL\s+BANK\b/.test(combined)) return "Jordan Commercial Bank";
  if (/\bBYBLOS\s+IRAQ\s+USD\s+ACCOUNT\b/.test(combined)) return "Byblos Bank";
  if (/\bSCB\s+NEW\s+YORK\b/.test(combined)) return "Standard Chartered Bank";

  return "";
}

function canonicalizeCorrespondentBankName(value) {
  if (hasArabicJpBank(value)) return "JP Morgan Bank";

  const rawLookup = normalizeBankLookup(value, false);
  const cleanLookup = normalizeBankLookup(value, true);
  if (!rawLookup && !cleanLookup) return "";

  for (const rule of CORRESPONDENT_BANK_ALIASES) {
    if (rule.patterns.some((pattern) => pattern.test(rawLookup) || pattern.test(cleanLookup))) {
      return rule.canonical;
    }
  }

  const cleaned = cleanGenericBankName(value);
  return looksLikeBankName(cleaned) ? cleaned : "";
}

function normalizeBankLookup(value, stripNoise) {
  let tokens = mergeInitialisms(tokenize(basicCleanUpper(value)));
  tokens = normalizeBankTokenAliases(tokens);
  if (stripNoise) tokens = stripBankNoiseTokens(tokens);
  return tokens.join(" ").replace(/\s+/g, " ").trim();
}

function normalizeBankTokenAliases(tokens) {
  const normalized = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const next = tokens[index + 1];
    if (token === "N" && next === "A") {
      normalized.push("NA");
      index += 1;
      continue;
    }
    if (token === "NATIONAL" && next === "ASSOCIATION") {
      normalized.push("NA");
      index += 1;
      continue;
    }
    normalized.push(token);
  }
  return normalized;
}

function stripBankNoiseTokens(tokens) {
  let result = tokens.filter((token) => !BANK_BRANCH_NOISE.has(token));
  result = removeTokenPhrase(result, ["N", "A"]);
  while (result.length) {
    const last = result[result.length - 1];
    if (BANK_SUFFIX_NOISE.has(last) || TRAILING_CONNECTORS.has(last)) {
      result = result.slice(0, -1);
      continue;
    }
    break;
  }
  while (result[0] === "THE") result = result.slice(1);
  return result;
}

function cleanGenericBankName(value) {
  let tokens = mergeInitialisms(tokenize(basicCleanUpper(value)));
  tokens = normalizeBankTokenAliases(tokens);
  tokens = stripBankNoiseTokens(tokens);
  tokens = tokens.map((token) => {
    if (token === "BANKING") return "BANK";
    return token;
  });
  tokens = tidyBankNameTokens(tokens);
  return toBankDisplayName(tokens);
}

function tidyBankNameTokens(tokens) {
  let result = tokens.slice();
  while (result.length && (TRAILING_CONNECTORS.has(result[result.length - 1]) || BANK_SUFFIX_NOISE.has(result[result.length - 1]))) {
    result = result.slice(0, -1);
  }
  while (result[0] === "THE") result = result.slice(1);
  return result;
}

function toBankDisplayName(tokens) {
  const acronyms = new Set(["ADCB", "ANZ", "BBVA", "BNP", "CBA", "CIB", "HSBC", "ICBC", "ING", "MUFG", "NAB", "NBD", "QNB", "RBC", "SMBC", "TBI", "TD", "UBS"]);
  const lowerWords = new Set(["AND", "OF", "THE"]);
  return tokens
    .map((token, index) => {
      if (acronyms.has(token)) return token;
      if (index > 0 && lowerWords.has(token)) return token.toLowerCase();
      return token.charAt(0) + token.slice(1).toLowerCase();
    })
    .join(" ")
    .trim();
}

function looksLikeBankName(value) {
  return /\b(BANK|BANKING|BANQUE|BANCO|BANC)\b/i.test(normalizeName(value));
}

function normalizeBankCompare(value) {
  return normalizeBankLookup(value, true).replace(/\bBANK\b/g, "").replace(/\s+/g, " ").trim();
}

function hasArabicJpBank(value) {
  return /\u062C\u064A\s+\u0628\u064A\s+\u0628\u0646\u0643/u.test(String(value || ""));
}

async function writeUnifiedColumnXml(options) {
  const {
    sheetXml,
    range,
    headerRow,
    sourceColumn,
    outputColumn,
    outputHeaderIndex,
    outputIndexes,
    mapping,
  } = options;
  const totalRows = Math.max(1, range.e.r - headerRow);
  let rowsProcessed = 0;
  let cellsWritten = 0;

  const rowPattern = /<row\b[^>]*?(?:\/>|>[\s\S]*?<\/row>)/g;
  let lastIndex = 0;
  let output = "";
  let match;

  while ((match = rowPattern.exec(sheetXml))) {
    const rowXml = match[0];
    const rowNumber = getRowNumber(rowXml);
    output += sheetXml.slice(lastIndex, match.index);
    lastIndex = rowPattern.lastIndex;

    if (rowNumber === headerRow) {
      output += upsertStringCell(rowXml, rowNumber, outputColumn, outputHeaderIndex, getHeaderStyle(rowXml, sourceColumn));
    } else if (rowNumber > headerRow && rowNumber <= range.e.r) {
      const sourceText = collapseWhitespace(readCellTextFromRow(rowXml, sourceColumn));
      const unified = sourceText ? mapping.get(sourceText) || sourceText : "";
      const stringIndex = unified ? outputIndexes.get(unified) ?? ensureSharedString(unified) : null;
      if (stringIndex !== null) cellsWritten += 1;
      output += upsertStringCell(rowXml, rowNumber, outputColumn, stringIndex, "");
      rowsProcessed += 1;
      if (rowsProcessed % 5000 === 0) {
        const percent = 74 + (rowsProcessed / totalRows) * 10;
        postProgress(percent, `Writing rows: ${formatNumber(rowsProcessed)} of ${formatNumber(totalRows)}`);
        await idle();
      }
    } else {
      output += rowXml;
    }
  }

  output += sheetXml.slice(lastIndex);
  return { sheetXml: output, cellsWritten };
}

function upsertStringCell(rowXml, rowNumber, column, stringIndex, styleAttribute) {
  const rowWithSpans = updateRowSpans(rowXml, column);
  const cellPattern = /<c\b[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g;
  const cells = [];
  let match;
  let lastIndex = 0;
  let body = "";
  let inserted = false;

  while ((match = cellPattern.exec(rowWithSpans))) {
    const cellXml = match[0];
    const cellRef = getAttribute(cellXml, "r");
    const cellColumn = cellRef ? columnToNumber(cellRef.replace(/\d+$/g, "")) : -1;
    if (cellColumn === column) {
      body += rowWithSpans.slice(lastIndex, match.index);
      if (stringIndex !== null) {
        body += makeSharedStringCell(rowNumber, column, stringIndex, getAttribute(cellXml, "s") ? ` s="${escapeAttribute(getAttribute(cellXml, "s"))}"` : styleAttribute);
        inserted = true;
      }
      lastIndex = cellPattern.lastIndex;
      continue;
    }

    if (!inserted && stringIndex !== null && cellColumn > column) {
      body += rowWithSpans.slice(lastIndex, match.index);
      body += makeSharedStringCell(rowNumber, column, stringIndex, styleAttribute);
      inserted = true;
      lastIndex = match.index;
    }
  }

  if (!inserted && stringIndex !== null) {
    const closeIndex = rowWithSpans.lastIndexOf("</row>");
    if (closeIndex >= 0) {
      return `${rowWithSpans.slice(0, closeIndex)}${makeSharedStringCell(rowNumber, column, stringIndex, styleAttribute)}${rowWithSpans.slice(closeIndex)}`;
    }
    return rowWithSpans.replace(/\/>$/, `>${makeSharedStringCell(rowNumber, column, stringIndex, styleAttribute)}</row>`);
  }

  if (body) {
    body += rowWithSpans.slice(lastIndex);
    return body;
  }
  return rowWithSpans;
}

function makeSharedStringCell(rowNumber, column, stringIndex, styleAttribute) {
  const address = `${numberToColumn(column)}${rowNumber}`;
  return `<c r="${address}"${styleAttribute || ""} t="s"><v>${stringIndex}</v></c>`;
}

function getHeaderStyle(rowXml, sourceColumn) {
  const cellXml = findCellXml(rowXml, sourceColumn);
  const style = cellXml ? getAttribute(cellXml, "s") : "";
  return style ? ` s="${escapeAttribute(style)}"` : "";
}

function findOrAppendOutputColumn(headers, outputColumnName) {
  const target = normalizeHeader(outputColumnName);
  let lastNonBlank = -1;
  for (const header of headers) {
    if (header.rawLabel) lastNonBlank = Math.max(lastNonBlank, header.index);
    if (normalizeHeader(header.rawLabel) === target) return header.index;
  }
  return lastNonBlank >= 0 ? lastNonBlank + 1 : 0;
}

function updateSheetReferences(sheetXml, range, outputColumn) {
  let updated = sheetXml.replace(/<dimension\b([^>]*?)ref="([^"]+)"([^>]*)\/>/, (full, before, ref, after) => {
    const parsed = decodeRange(ref);
    if (!parsed) return full;
    parsed.e.r = Math.max(parsed.e.r, range.e.r);
    parsed.e.c = Math.max(parsed.e.c, outputColumn);
    return `<dimension${before}ref="${encodeRange(parsed)}"${after}/>`;
  });

  updated = updated.replace(/<autoFilter\b([^>]*?)ref="([^"]+)"([^>]*?)(\/?)>/, (full, before, ref, after, slash) => {
    const parsed = decodeRange(ref);
    if (!parsed) return full;
    parsed.e.c = Math.max(parsed.e.c, outputColumn);
    return `<autoFilter${before}ref="${encodeRange(parsed)}"${after}${slash}>`;
  });

  return updated;
}

async function updateWorkbookDefinedName(sheet, outputColumn) {
  const workbookXml = await readZipText("xl/workbook.xml");
  const escapedName = escapeRegExp(sheet.name.includes(" ") ? `'${sheet.name.replace(/'/g, "''")}'` : sheet.name);
  const pattern = new RegExp(`(${escapedName}!\\$[A-Z]+\\$\\d+:\\$)([A-Z]+)(\\$\\d+)`, "g");
  let changed = false;
  const updated = workbookXml.replace(pattern, (full, start, endColumn, endRow) => {
    if (columnToNumber(endColumn) >= outputColumn) return full;
    changed = true;
    return `${start}${numberToColumn(outputColumn)}${endRow}`;
  });
  if (changed) zipFile.file("xl/workbook.xml", updated);
}

function findHeaderRow(sheetXml, range) {
  let bestRow = range.s.r;
  let bestScore = -1;
  const maxRow = Math.min(range.e.r, range.s.r + 24);

  forEachRow(sheetXml, (rowXml, rowNumber) => {
    if (rowNumber < range.s.r || rowNumber > maxRow) return;
    const cells = readCellsFromRow(rowXml);
    let filled = 0;
    let headerScore = 0;
    for (const cell of cells) {
      const text = readCellText(cell);
      if (!text) continue;
      filled += 1;
      headerScore += scoreHeader(text);
    }
    const score = filled * 2 + headerScore;
    if (score > bestScore) {
      bestScore = score;
      bestRow = rowNumber;
    }
  });

  return bestRow;
}

function readHeaders(sheetXml, range, headerRow) {
  const rowXml = findRowXml(sheetXml, headerRow);
  const headers = [];
  const cells = rowXml ? readCellsFromRow(rowXml) : [];
  let maxColumn = range.s.c;

  for (const cell of cells) {
    maxColumn = Math.max(maxColumn, cell.column);
  }

  for (let column = range.s.c; column <= maxColumn; column += 1) {
    const cell = cells.find((item) => item.column === column);
    const rawLabel = cell ? readCellText(cell).trim() : "";
    if (!rawLabel && column > range.e.c) continue;
    headers.push({
      index: column,
      letter: numberToColumn(column),
      label: rawLabel || `[Blank column ${numberToColumn(column)}]`,
      rawLabel,
      score: scoreHeader(rawLabel),
    });
  }

  return headers;
}

function suggestColumn(headers) {
  const ranked = headers
    .map((header) => ({ ...header, score: scoreHeader(header.rawLabel || header.label) }))
    .sort((a, b) => b.score - a.score);
  const best = ranked[0];
  if (!best || best.score <= 0) return { index: null, exact: false };
  return {
    index: best.index,
    exact: isExactSupportedSourceHeader(best.rawLabel || best.label),
  };
}

function scoreHeader(text) {
  const value = normalizeHeader(text);
  if (!value) return 0;
  if (value === "commercial company name in english") return 120;
  if (hasHeaderWords(value, ["commercial", "company", "name", "english"])) return 108;
  if (value === "final beneficiary name in english") return 106;
  if (hasHeaderWords(value, ["final", "beneficiary", "name", "english"])) return 98;
  if (value === "correspondent bank name") return 104;
  if (hasHeaderWords(value, ["correspondent", "bank", "name"]) && !hasHeaderWords(value, ["iban"]) && !hasHeaderWords(value, ["swift"]) && !hasHeaderWords(value, ["country"])) return 90;
  return 0;
}

function isExactSupportedSourceHeader(text) {
  const value = normalizeHeader(text);
  return (
    value === "commercial company name in english" ||
    value === "final beneficiary name in english" ||
    value === "correspondent bank name"
  );
}

function isCorrespondentBankHeader(text) {
  const value = normalizeHeader(text);
  return hasHeaderWords(value, ["correspondent", "bank", "name"]) && !hasHeaderWords(value, ["iban"]) && !hasHeaderWords(value, ["swift"]) && !hasHeaderWords(value, ["country"]);
}

function hasHeaderWords(value, words) {
  return words.every((word) => new RegExp(`\\b${word}\\b`, "i").test(value));
}

async function readWorkbookInfo() {
  const workbookXml = await readZipText("xl/workbook.xml");
  const relsXml = await readZipText("xl/_rels/workbook.xml.rels");
  const rels = new Map();

  for (const relationship of relsXml.matchAll(/<Relationship\b([^>]*)\/?>/g)) {
    const attrs = relationship[1];
    const id = getAttribute(attrs, "Id");
    const target = getAttribute(attrs, "Target");
    const type = getAttribute(attrs, "Type");
    if (id && target && /worksheet$/i.test(type)) {
      rels.set(id, resolveZipPath("xl/workbook.xml", target));
    }
  }

  const sheets = [];
  for (const sheetMatch of workbookXml.matchAll(/<sheet\b([^>]*)\/?>/g)) {
    const attrs = sheetMatch[1];
    const name = decodeXml(getAttribute(attrs, "name"));
    const id = getAttribute(attrs, "r:id") || getAttribute(attrs, "id");
    if (!name || !id || !rels.has(id)) continue;
    sheets.push({ name, id, path: rels.get(id) });
  }

  if (!sheets.length) throw new Error("No worksheets were found in this workbook.");
  return { sheets };
}

async function readSharedStrings() {
  const entry = zipFile.file("xl/sharedStrings.xml");
  sharedStrings = [];
  sharedStringIndex = new Map();
  if (!entry) {
    sharedStringsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="0" uniqueCount="0"></sst>`;
    originalSharedStringCount = 0;
    return;
  }

  sharedStringsXml = await entry.async("text");
  for (const match of sharedStringsXml.matchAll(/<si\b[\s\S]*?<\/si>/g)) {
    const value = readSharedStringItem(match[0]);
    addSharedStringToIndex(value, sharedStrings.length);
    sharedStrings.push(value);
  }
  originalSharedStringCount = sharedStrings.length;
}

function readSharedStringItem(xml) {
  const textMatches = Array.from(xml.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g));
  if (textMatches.length) {
    return textMatches.map((match) => decodeXml(match[1])).join("");
  }
  return decodeXml(xml.replace(/<[^>]+>/g, ""));
}

function ensureSharedString(value) {
  const text = String(value || "");
  if (sharedStringIndex.has(text)) return sharedStringIndex.get(text);
  const index = sharedStrings.length;
  sharedStrings.push(text);
  addSharedStringToIndex(text, index);
  return index;
}

function addSharedStringToIndex(value, index) {
  if (!sharedStringIndex.has(value)) sharedStringIndex.set(value, index);
}

function buildSharedStringsXml(addedStringCellCount) {
  const existingCount = Number((sharedStringsXml.match(/\bcount="(\d+)"/) || [])[1] || sharedStrings.length);
  const count = existingCount + Math.max(0, addedStringCellCount || 0);
  const addedItems = sharedStrings
    .slice(originalSharedStringCount)
    .map((value) => `<si><t${needsPreserveSpace(value) ? ' xml:space="preserve"' : ""}>${escapeText(value)}</t></si>`)
    .join("");
  let updated = sharedStringsXml.replace(/<sst\b([^>]*)>/, (full, attrs) => {
    const cleanAttrs = attrs.replace(/\s+count="[^"]*"/, "").replace(/\s+uniqueCount="[^"]*"/, "");
    return `<sst${cleanAttrs} count="${count}" uniqueCount="${sharedStrings.length}">`;
  });
  if (addedItems) updated = updated.replace(/<\/sst>\s*$/i, `${addedItems}</sst>`);
  return updated;
}

function readDimension(sheetXml) {
  const match = sheetXml.match(/<dimension\b[^>]*\bref="([^"]+)"/);
  return match ? decodeRange(match[1]) : null;
}

function inferRange(sheetXml) {
  let maxRow = 0;
  let maxColumn = 0;
  let found = false;
  forEachRow(sheetXml, (rowXml, rowNumber) => {
    found = true;
    maxRow = Math.max(maxRow, rowNumber);
    for (const cell of readCellsFromRow(rowXml)) {
      maxColumn = Math.max(maxColumn, cell.column);
    }
  });
  return found ? { s: { r: 1, c: 0 }, e: { r: maxRow, c: maxColumn } } : null;
}

function countRowsFromXml(sheetXml) {
  let count = 0;
  forEachRow(sheetXml, () => {
    count += 1;
  });
  return count;
}

function forEachRow(sheetXml, callback) {
  const rowPattern = /<row\b[^>]*?(?:\/>|>[\s\S]*?<\/row>)/g;
  let match;
  while ((match = rowPattern.exec(sheetXml))) {
    callback(match[0], getRowNumber(match[0]));
  }
}

function findRowXml(sheetXml, rowNumber) {
  const rowPattern = /<row\b[^>]*?(?:\/>|>[\s\S]*?<\/row>)/g;
  let match;
  while ((match = rowPattern.exec(sheetXml))) {
    if (getRowNumber(match[0]) === rowNumber) return match[0];
    if (getRowNumber(match[0]) > rowNumber) return "";
  }
  return "";
}

function getRowNumber(rowXml) {
  const value = getAttribute(rowXml, "r");
  return Number(value || 0);
}

function readCellsFromRow(rowXml) {
  const cells = [];
  for (const match of rowXml.matchAll(/<c\b[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g)) {
    const xml = match[0];
    const ref = getAttribute(xml, "r");
    if (!ref) continue;
    const columnLetters = ref.replace(/\d+$/g, "");
    cells.push({
      xml,
      column: columnToNumber(columnLetters),
      ref,
    });
  }
  return cells;
}

function findCellXml(rowXml, column) {
  for (const cell of readCellsFromRow(rowXml)) {
    if (cell.column === column) return cell.xml;
  }
  return "";
}

function readCellTextFromRow(rowXml, column) {
  const cellXml = findCellXml(rowXml, column);
  return cellXml ? readCellText({ xml: cellXml }) : "";
}

function readCellText(cell) {
  const xml = cell.xml;
  const type = getAttribute(xml, "t");
  if (type === "s") {
    const index = Number((xml.match(/<v>([\s\S]*?)<\/v>/) || [])[1]);
    return Number.isFinite(index) ? sharedStrings[index] || "" : "";
  }
  if (type === "inlineStr") {
    return Array.from(xml.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g))
      .map((match) => decodeXml(match[1]))
      .join("");
  }
  const value = (xml.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
  return value === undefined ? "" : decodeXml(value);
}

function updateRowSpans(rowXml, outputColumn) {
  const oneBasedColumn = outputColumn + 1;
  return rowXml.replace(/\bspans="(\d+):(\d+)"/, (full, start, end) => {
    const nextEnd = Math.max(Number(end), oneBasedColumn);
    return `spans="${start}:${nextEnd}"`;
  });
}

function decodeRange(ref) {
  const parts = String(ref || "").split(":");
  const start = decodeCell(parts[0]);
  const end = decodeCell(parts[1] || parts[0]);
  if (!start || !end) return null;
  return { s: start, e: end };
}

function encodeRange(range) {
  return `${encodeCell(range.s)}:${encodeCell(range.e)}`;
}

function decodeCell(ref) {
  const match = String(ref || "").replace(/\$/g, "").match(/^([A-Z]+)(\d+)$/i);
  if (!match) return null;
  return {
    c: columnToNumber(match[1]),
    r: Number(match[2]),
  };
}

function encodeCell(cell) {
  return `${numberToColumn(cell.c)}${cell.r}`;
}

function columnToNumber(letters) {
  let value = 0;
  for (const letter of String(letters || "").toUpperCase()) {
    value = value * 26 + letter.charCodeAt(0) - 64;
  }
  return value - 1;
}

function numberToColumn(index) {
  let value = index + 1;
  let column = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    column = String.fromCharCode(65 + remainder) + column;
    value = Math.floor((value - 1) / 26);
  }
  return column;
}

function analyzeName(name) {
  const display = cleanDisplay(name);
  const normalized = normalizeName(display);
  const cleaned = cleanCompanyForMatch(display);
  let tokens = stripGenericForCore(tokenize(cleaned));
  if (!tokens.length) tokens = tokenize(cleaned).filter((token) => !STOPWORDS.has(token));
  if (!tokens.length) tokens = tokenize(normalized);
  const uniqueTokens = Array.from(new Set(tokens));
  const firstCore = tokens[0] || "";
  const distinctive = distinctiveTokens(cleaned);
  const standardized = standardizeCompanyName(display);
  return {
    display,
    cleaned,
    strictKey: normalized,
    coreKey: tokens.join(" "),
    coreView: tokens.join(" "),
    fingerprint: uniqueTokens.slice().sort().join(" "),
    tokens,
    cleanedTokens: tokenize(cleaned),
    firstTwo: firstTwoTokens(cleaned),
    firstCore,
    firstCoreSimplified: simplifyTokenPhonetic(firstCore),
    simplifiedCoreSet: new Set(tokens.map((token) => simplifyTokenPhonetic(token))),
    distinctiveTokens: distinctive,
    distinctiveSet: new Set(distinctive),
    firstDistinctive: distinctive[0] || "",
    familyKey: familyKey(cleaned),
    familyInitials: initialsPair(familyKey(cleaned)).join(":"),
    standardizedKey: firstTwoDistinctiveKey(standardized),
    blockToken: chooseBlockToken(tokens),
  };
}

function cleanCompanyForMatch(value) {
  const basic = basicCleanUpper(value);
  let tokens = mergeInitialisms(tokenize(basic));
  tokens = completeTruncatedTokens(tokens);
  tokens = stripLegalCurrencyTerms(tokens);
  return harmonizePhrases(tokens.join(" "));
}

function basicCleanUpper(value) {
  let text = String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
  text = text.replace(/\bAL(?=[A-KM-Z])/g, "AL ");
  text = text.replace(/\bEL(?=[A-Z])/g, "EL ");
  for (const [abbr, expanded] of Object.entries(ABBREV_MAP)) {
    text = text.replace(new RegExp(`\\b${escapeRegExp(abbr)}\\b`, "g"), expanded);
  }
  return text
    .replace(/\d+/g, " ")
    .replace(/[.,/\\\-()&+*'"`:;|?!@#$%^=<>{}\[\]_~]+/g, " ")
    .replace(/[“”]/g, " ")
    .replace(/[‘’]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value) {
  return String(value || "").split(/\s+/).filter(Boolean);
}

function mergeInitialisms(tokens) {
  const merged = [];
  let buffer = "";
  for (const token of tokens) {
    if (/^[A-Z]$/.test(token)) {
      buffer += token;
    } else {
      if (buffer) merged.push(buffer);
      buffer = "";
      merged.push(token);
    }
  }
  if (buffer) merged.push(buffer);
  return merged;
}

function completeTruncatedTokens(tokens) {
  return tokens.map((token) => {
    for (const [prefix, full] of TRUNC_PREFIXES) {
      if (token.startsWith(prefix)) return full;
    }
    return token;
  });
}

function stripLegalCurrencyTerms(tokens) {
  const withoutPhrases = removeLegalPhrases(tokens.join(" "));
  return tokenize(withoutPhrases).filter((token) => !LEGAL_TOKENS.has(token) && !CURRENCY_TOKENS.has(token));
}

function stripGenericForCore(tokens) {
  let result = tokens.slice();
  for (const phrase of GENERIC_PHRASES_DOWNWEIGHT) {
    result = removeTokenPhrase(result, phrase);
  }
  return result.filter((token) => !BUSINESS_STOPWORDS.has(token));
}

function removeTokenPhrase(tokens, phrase) {
  const result = [];
  for (let index = 0; index < tokens.length; ) {
    const candidate = tokens.slice(index, index + phrase.length);
    if (candidate.length === phrase.length && candidate.every((token, offset) => token === phrase[offset])) {
      index += phrase.length;
    } else {
      result.push(tokens[index]);
      index += 1;
    }
  }
  return result;
}

function firstTwoTokens(value) {
  return tokenize(value).slice(0, 2);
}

function familyKey(value) {
  const tokens = tokenize(value).filter((token) => !ARTICLES.has(token) && token !== "FOR" && !BUSINESS_STOPWORDS.has(token));
  return tokens.slice(0, 2).join(" ");
}

function initialsPair(key) {
  const parts = tokenize(key);
  if (parts.length < 2) return ["", ""];
  return [parts[0][0] || "", parts[1][0] || ""];
}

function distinctiveTokens(value) {
  return tokenize(value).filter((token) => !ARTICLES.has(token) && !DISTINCTIVE_STOPWORDS.has(token));
}

function firstTwoDistinctiveKey(value) {
  const tokens = tokenize(value).filter((token) => !ARTICLES.has(token) && token !== "FOR");
  return tokens.slice(0, 2).join(" ");
}

function standardizeCompanyName(value) {
  let tokens = mergeInitialisms(tokenize(basicCleanUpper(value)));
  tokens = completeTruncatedTokens(tokens).map((token) => {
    if (token === "CO") return "COMPANY";
    if (token === "CO.") return "COMPANY";
    if (token === "LTD") return "LIMITED";
    if (token === "L.L.C") return "LLC";
    return token;
  });
  return tidyConnectorTail(harmonizePhrases(tokens.join(" ")));
}

function harmonizePhrases(value) {
  return String(value || "")
    .replace(/\bGENERAL\s+TRADE\b/g, "GENERAL TRADING")
    .replace(/\bFOR\s+TRADE\b/g, "FOR TRADING")
    .replace(/\bFOR\s+GENERAL\s*$/g, "FOR GENERAL TRADING")
    .replace(/\s+/g, " ")
    .trim();
}

function tidyCompanyTail(value) {
  let tokens = tokenize(value);
  while (tokens.length) {
    const last = tokens[tokens.length - 1];
    if (TRAILING_CONNECTORS.has(last) || LEGAL_TOKENS.has(last)) {
      tokens = tokens.slice(0, -1);
      continue;
    }
    break;
  }
  return tokens.join(" ");
}

function tidyConnectorTail(value) {
  let tokens = tokenize(value);
  while (tokens.length && TRAILING_CONNECTORS.has(tokens[tokens.length - 1])) {
    tokens = tokens.slice(0, -1);
  }
  return tokens.join(" ");
}

function simplifyTokenPhonetic(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/SH/g, "S")
    .replace(/CH/g, "C")
    .replace(/TH/g, "T")
    .replace(/DH/g, "D")
    .replace(/GH/g, "G")
    .replace(/KH/g, "K")
    .replace(/DJ/g, "J")
    .replace(/DG/g, "G")
    .replace(/^G/g, "J")
    .replace(/[EIY]/g, "I")
    .replace(/[OUW]/g, "U")
    .replace(/([A-Z])\1+/g, "$1");
}

function normalizeName(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " AND ")
    .replace(/\bINTL\b/g, " INTERNATIONAL ")
    .replace(/\bMFG\b/g, " MANUFACTURING ")
    .replace(/\bIND\b/g, " INDUSTRY ")
    .replace(/\bL\.?\s*L\.?\s*C\.?\b/g, " LLC ")
    .replace(/\bC\.?\s*O\.?\b/g, " CO ")
    .replace(/\bL\.?\s*T\.?\s*D\.?\b/g, " LTD ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function removeLegalPhrases(value) {
  let text = ` ${value} `;
  for (const phrase of LEGAL_PHRASES.sort((a, b) => b.length - a.length)) {
    text = text.replace(new RegExp(`\\b${escapeRegExp(phrase)}\\b`, "g"), " ");
  }
  return text.replace(/\s+/g, " ").trim();
}

function cleanDisplay(value) {
  return collapseWhitespace(
    String(value || "")
      .replace(/[\u0000-\u001f]+/g, " ")
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'")
      .replace(/\s*([,;:/\\-])\s*/g, "$1 ")
      .replace(/\s+/g, " "),
  );
}

function chooseCanonical(members, format) {
  if (format === "original") return chooseOriginalCanonical(members);
  const standardized = chooseStandardizedCanonical(members);
  if (format === "title") return toTitleCase(standardized);
  return standardized;
}

function chooseOriginalCanonical(members) {
  const best = members
    .slice()
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      const aq = qualityScore(a.name);
      const bq = qualityScore(b.name);
      if (bq !== aq) return bq - aq;
      return b.name.length - a.name.length;
    })[0];

  return cleanDisplay(best.name);
}

function chooseStandardizedCanonical(members) {
  const keyCounters = new Map();
  for (const member of members) {
    const standardized = finalizeMatchName(standardizeCompanyName(member.name));
    const key = firstTwoDistinctiveKey(standardized);
    if (!keyCounters.has(key)) {
      keyCounters.set(key, {
        count: 0,
        names: new Map(),
      });
    }
    const bucket = keyCounters.get(key);
    bucket.count += member.count;
    bucket.names.set(standardized, (bucket.names.get(standardized) || 0) + member.count);
  }

  const keys = Array.from(keyCounters.keys()).filter(Boolean);
  if (!keys.length) return normalizeName(chooseOriginalCanonical(members));

  keys.sort((a, b) => {
    const countDelta = keyCounters.get(b).count - keyCounters.get(a).count;
    if (countDelta !== 0) return countDelta;
    return a.localeCompare(b);
  });
  const targetKey = keys[0];
  const names = Array.from(keyCounters.get(targetKey).names.entries());
  names.sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return compareCanonicalScore(a[0], b[0]);
  });
  return names[0]?.[0] || normalizeName(chooseOriginalCanonical(members));
}

function finalizeMatchName(value) {
  let tokens = tokenize(value);
  while (tokens.length) {
    const last = tokens[tokens.length - 1];
    if (TRAILING_CONNECTORS.has(last) || isFuzzyLegalToken(last)) {
      tokens = tokens.slice(0, -1);
      continue;
    }
    break;
  }
  return tokens.join(" ");
}

function isFuzzyLegalToken(token) {
  const value = String(token || "").toUpperCase().replace(/\./g, "");
  if (LEGAL_TOKENS.has(value)) return true;
  for (const legal of LEGAL_TOKENS) {
    if (Math.abs(value.length - legal.length) > 2) continue;
    if (levenshteinDistance(value, legal) <= 2) return true;
    if (value.length >= 5 && ratio(value, legal) >= 85) return true;
  }
  return false;
}

function compareCanonicalScore(a, b) {
  const aScore = canonicalScore(a);
  const bScore = canonicalScore(b);
  for (let index = 0; index < aScore.length; index += 1) {
    if (aScore[index] < bScore[index]) return -1;
    if (aScore[index] > bScore[index]) return 1;
  }
  return String(a).localeCompare(String(b));
}

function canonicalScore(value) {
  const text = String(value || "");
  let penalties = 0;
  for (const token of GENERIC_CANON_TOKENS) {
    if (new RegExp(`\\b${escapeRegExp(token)}\\b`).test(text)) penalties += 1;
  }
  return [penalties, text.length];
}

function qualityScore(value) {
  const text = String(value || "");
  let score = 0;
  if (/[A-Za-z]/.test(text)) score += 20;
  if (!/[0-9]{5,}/.test(text)) score += 8;
  if (text.length > 8) score += 4;
  if (text === text.toUpperCase()) score += 2;
  return score;
}

function buildBlocks(records) {
  const blocks = new Map();
  for (const record of records) {
    const keys = new Set();
    const { tokens, blockToken, familyInitials, firstDistinctive, standardizedKey } = record.analysis;
    if (familyInitials && familyInitials !== ":") keys.add(`fi:${familyInitials}`);
    if (firstDistinctive) keys.add(`fd:${firstDistinctive}`);
    if (standardizedKey) keys.add(`sk:${standardizedKey}`);
    if (blockToken) keys.add(`p:${blockToken}`);
    if (tokens.length > 1) keys.add(`p2:${tokens.slice(0, 2).join(" ")}`);
    if (blockToken?.length >= 4) keys.add(`s:${blockToken.slice(0, 4)}:${Math.round(tokens.length / 2)}`);
    for (const key of keys) {
      if (!blocks.has(key)) blocks.set(key, []);
      blocks.get(key).push(record.index);
    }
  }
  return blocks;
}

function compareBlock(records, indexes, union, config) {
  for (let i = 0; i < indexes.length; i += 1) {
    const a = records[indexes[i]];
    for (let j = i + 1; j < indexes.length; j += 1) {
      const b = records[indexes[j]];
      if (union.find(a.index) === union.find(b.index)) continue;
      if (isSimilar(a.analysis, b.analysis, config)) union.union(a.index, b.index);
    }
  }
}

function isSimilar(a, b, config) {
  if (!a.coreKey || !b.coreKey) return false;
  if (a.coreKey === b.coreKey || a.fingerprint === b.fingerprint) return true;
  if (Math.min(a.coreKey.length, b.coreKey.length) < 3) return false;

  if (a.firstDistinctive && b.firstDistinctive) {
    const firstDistance = levenshteinDistance(a.firstDistinctive, b.firstDistinctive);
    if (a.firstDistinctive !== b.firstDistinctive && firstDistance > 1) return false;
  }

  if (!hasCompatibleFamilyKey(a.familyKey, b.familyKey)) return false;

  if (jaccard(a.distinctiveSet, b.distinctiveSet) < config.distinctJaccardMin) return false;

  const firstCoreA = a.tokens[0] || "";
  const firstCoreB = b.tokens[0] || "";
  if (firstCoreA && firstCoreB && levenshteinDistance(firstCoreA, firstCoreB) > 2) return false;

  const firstOk =
    !firstCoreA ||
    !firstCoreB ||
    Array.from(b.simplifiedCoreSet).some((token) => ratio(a.firstCoreSimplified, token) >= 85) ||
    Array.from(a.simplifiedCoreSet).some((token) => ratio(b.firstCoreSimplified, token) >= 85);
  if (!firstOk) return false;

  const prefixA = a.firstTwo || [];
  const prefixB = b.firstTwo || [];
  const enforcePrefix = prefixA.length >= 2 && prefixB.length >= 2;
  const prefixExact = enforcePrefix && prefixA.join(" ") === prefixB.join(" ");
  const prefixScore = enforcePrefix ? prefix2Similarity(prefixA, prefixB) : 100;
  if (enforcePrefix && !prefixExact && prefixScore < config.prefixMin) return false;

  const lengthDelta = Math.abs(a.coreKey.length - b.coreKey.length) / Math.max(a.coreKey.length, b.coreKey.length);
  if (lengthDelta > config.maxLengthDelta) return false;

  const tokenScore = tokenSimilarity(a.tokens, b.tokens);
  if (tokenScore < config.tokenMin && prefixScore < config.prefixMin + 6) return false;

  const baseScore = tokenSortRatio(a.cleaned, b.cleaned);
  const charScore = charNgramDiceAvg(a.cleaned, b.cleaned);
  const coreScore = tokenSetRatio(a.coreView, b.coreView);
  let finalScore = baseScore * 0.5 + charScore * 0.25 + coreScore * 0.25;
  if (prefixExact) finalScore = Math.max(finalScore, 90);

  const fallbackCharScore = similarityRatio(a.coreKey, b.coreKey);
  return (
    finalScore >= config.finalMin ||
    fallbackCharScore >= config.charMin ||
    (fallbackCharScore >= config.charMin - 0.04 && tokenScore >= config.tokenMin + 0.12)
  );
}

function shouldMergeCanonicalKeys(a, b, config) {
  if (!a.clusterKey || !b.clusterKey || a.clusterKey === b.clusterKey) return Boolean(a.clusterKey && a.clusterKey === b.clusterKey);
  if (!sameInitialsTwoWords(a.clusterKey, b.clusterKey)) return false;
  const score = ratio(a.clusterKey, b.clusterKey);
  if (score > config.keyAutoMin) return true;
  if (score > config.keyReviewMin) {
    const pairLength = a.clusterKey.replace(/\s+/g, "").length + b.clusterKey.replace(/\s+/g, "").length;
    return pairLength > 20;
  }
  return false;
}

function hasCompatibleFamilyKey(a, b) {
  const aTokens = tokenize(a);
  const bTokens = tokenize(b);
  if (aTokens.length < 2 || bTokens.length < 2) return true;
  if (aTokens[0] !== bTokens[0]) return true;
  const secondA = aTokens[1];
  const secondB = bTokens[1];
  return secondA === secondB || levenshteinDistance(secondA, secondB) <= 2 || ratio(secondA, secondB) >= 84;
}

function sameInitialsTwoWords(a, b) {
  const aTokens = tokenize(a);
  const bTokens = tokenize(b);
  if (aTokens.length < 2 || bTokens.length < 2) return false;
  return aTokens[0][0] === bTokens[0][0] && aTokens[1][0] === bTokens[1][0];
}

function ratio(a, b) {
  return similarityRatio(String(a || ""), String(b || "")) * 100;
}

function prefix2Similarity(aTokens, bTokens) {
  const a = aTokens.slice(0, 2).map(simplifyTokenPhonetic).join(" ");
  const b = bTokens.slice(0, 2).map(simplifyTokenPhonetic).join(" ");
  return ratio(a, b);
}

function tokenSortRatio(a, b) {
  return ratio(tokenize(a).sort().join(" "), tokenize(b).sort().join(" "));
}

function tokenSetRatio(a, b) {
  const aSet = new Set(tokenize(a));
  const bSet = new Set(tokenize(b));
  if (!aSet.size && !bSet.size) return 100;
  if (!aSet.size || !bSet.size) return 0;
  const common = [];
  const aDiff = [];
  const bDiff = [];
  for (const token of aSet) {
    if (bSet.has(token)) common.push(token);
    else aDiff.push(token);
  }
  for (const token of bSet) {
    if (!aSet.has(token)) bDiff.push(token);
  }
  if (!common.length) return 0;
  const commonText = common.sort().join(" ");
  return Math.max(
    ratio(commonText, [...common, ...aDiff].sort().join(" ")),
    ratio(commonText, [...common, ...bDiff].sort().join(" ")),
    ratio([...common, ...aDiff].sort().join(" "), [...common, ...bDiff].sort().join(" ")),
  );
}

function charNgramDiceAvg(a, b) {
  return (diceCoefficient(charGrams(a, 3), charGrams(b, 3)) + diceCoefficient(charGrams(a, 4), charGrams(b, 4)) + diceCoefficient(charGrams(a, 5), charGrams(b, 5))) / 3;
}

function charGrams(value, size) {
  const text = String(value || "");
  const grams = new Set();
  if (text.length < size) return grams;
  for (let index = 0; index <= text.length - size; index += 1) {
    grams.add(text.slice(index, index + size));
  }
  return grams;
}

function diceCoefficient(a, b) {
  if (!a.size && !b.size) return 100;
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const value of a) {
    if (b.has(value)) intersection += 1;
  }
  return (200 * intersection) / (a.size + b.size);
}

function jaccard(a, b) {
  if (!a.size && !b.size) return 1;
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const value of a) {
    if (b.has(value)) intersection += 1;
  }
  return intersection / new Set([...a, ...b]).size;
}

function unionByKey(records, union, getKey, minLength) {
  const seen = new Map();
  for (const record of records) {
    const key = getKey(record);
    if (!key || key.length < minLength) continue;
    if (seen.has(key)) union.union(seen.get(key), record.index);
    else seen.set(key, record.index);
  }
}

function tokenSimilarity(aTokens, bTokens) {
  const a = new Set(aTokens);
  const b = new Set(bTokens);
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection += 1;
  }
  const union = new Set([...a, ...b]).size || 1;
  return intersection / union;
}

function similarityRatio(a, b) {
  if (a === b) return 1;
  const maxLength = Math.max(a.length, b.length);
  if (!maxLength) return 1;
  return 1 - levenshteinDistance(a, b) / maxLength;
}

function levenshteinDistance(a, b) {
  const previous = new Array(b.length + 1);
  const current = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j += 1) previous[j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + cost);
    }
    for (let j = 0; j <= b.length; j += 1) previous[j] = current[j];
  }
  return previous[b.length];
}

function createUnionFind(size) {
  const parent = Array.from({ length: size }, (_, index) => index);
  const rank = new Array(size).fill(0);
  return {
    find(index) {
      let root = index;
      while (parent[root] !== root) root = parent[root];
      while (parent[index] !== index) {
        const next = parent[index];
        parent[index] = root;
        index = next;
      }
      return root;
    },
    union(a, b) {
      let rootA = this.find(a);
      let rootB = this.find(b);
      if (rootA === rootB) return;
      if (rank[rootA] < rank[rootB]) {
        const temp = rootA;
        rootA = rootB;
        rootB = temp;
      }
      parent[rootB] = rootA;
      if (rank[rootA] === rank[rootB]) rank[rootA] += 1;
    },
  };
}

function chooseBlockToken(tokens) {
  if (!tokens.length) return "";
  if (tokens[0] === "AL" && tokens[1]) return tokens[1];
  return tokens[0];
}

function findSheet(sheetName) {
  const sheet = workbookInfo.sheets.find((item) => item.name === sheetName) || workbookInfo.sheets[0];
  if (!sheet) throw new Error("Sheet not found.");
  return sheet;
}

async function readZipText(path) {
  const entry = zipFile.file(path);
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

function getAttribute(xmlOrAttrs, name) {
  const escaped = escapeRegExp(name);
  const match = String(xmlOrAttrs || "").match(new RegExp(`\\b${escaped}="([^"]*)"`));
  return match ? decodeXml(match[1]) : "";
}

function normalizeHeader(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function collapseWhitespace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function toTitleCase(value) {
  return normalizeName(value)
    .toLowerCase()
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase())
    .replace(/\b(Llc|Ltd|Fze|Fzco|Dmcc|Plc|Sa)\b/g, (word) => word.toUpperCase());
}

function decodeXml(value) {
  return String(value || "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function escapeText(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttribute(value) {
  return escapeText(value).replace(/"/g, "&quot;");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function needsPreserveSpace(value) {
  return /^\s|\s$/.test(String(value || ""));
}

function buildOutputName(fileName) {
  const base = String(fileName || "workbook").replace(/\.(xlsx|xlsm|xlsb|xls)$/i, "");
  return `${base}_unified.xlsx`;
}

function assertWorkbook() {
  if (!zipFile || !workbookInfo) throw new Error("Upload a workbook first.");
}

function postProgress(percent, text) {
  postMessage({
    type: "progress",
    percent: Math.max(0, Math.min(100, Math.round(percent))),
    text,
  });
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US").format(Number(value) || 0);
}

function idle() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
