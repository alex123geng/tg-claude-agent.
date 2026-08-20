// Parsing of WB "Еженедельный детализированный отчёт" files (.xlsx or a
// .zip containing one .xlsx) and of the optional "Справочник" cost
// reference file, using SheetJS (XLSX, loaded from CDN in index.html)
// and JSZip (also from CDN).

// Real column headers as they appear in WB's weekly detailed report.
// A couple of alternate spellings are listed because WB has changed
// header wording slightly between report format versions.
const REPORT_COLUMNS = {
  article: ['Артикул поставщика'],
  saleDate: ['Дата продажи'],
  orderDate: ['Дата заказа покупателем'],
  qty: ['Кол-во', 'Количество'],
  docType: ['Тип документа'],
  purpose: ['Обоснование для оплаты'],
  priceRetail: ['Цена розничная'],
  priceRetailDiscounted: ['Цена розничная с учетом согласованной скидки', 'Цена розничная с учётом согласованной скидки'],
  commissionRub: ['Вознаграждение Вайлдберриз (ВВ), без НДС'],
  payout: ['К перечислению Продавцу за реализованный Товар'],
  delivery: ['Услуги по доставке товара покупателю'],
  storage: ['Хранение'],
  acceptance: ['Операции на приемке', 'Операции на приёмке'],
  penalties: ['Общая сумма штрафов'],
  returnQty: ['Количество возврата'],
  deliveryQty: ['Количество доставок'],
  supplyNumber: ['Номер поставки'],
  assemblyNumber: ['Номер сборочного задания'],
  srid: ['Srid', 'srid'],
};

const REF_COLUMNS = {
  article: ['Артикул поставщика'],
  cost: ['Итоговая средняя себестоимость 1 шт'],
};

function resolveHeaderIndex(headerRow, candidates) {
  const normalized = headerRow.map((h) => (h == null ? '' : String(h).trim()));
  for (const candidate of candidates) {
    const idx = normalized.indexOf(candidate);
    if (idx !== -1) return idx;
  }
  return -1;
}

function buildColumnIndex(headerRow, columnMap) {
  const index = {};
  const missing = [];
  for (const [key, candidates] of Object.entries(columnMap)) {
    const idx = resolveHeaderIndex(headerRow, candidates);
    index[key] = idx;
    if (idx === -1) missing.push(candidates[0]);
  }
  return { index, missing };
}

// Excel/Sheets serial date -> 'YYYY-MM-DD'. Also passes through strings
// and Date objects (SheetJS may hand back either depending on cellDates).
function toIsoDate(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === 'number') {
    // SheetJS date serial (days since 1899-12-30)
    const ms = Math.round((value - 25569) * 86400 * 1000);
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  }
  const str = String(value).trim();
  const m = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const m2 = str.match(/^(\d{2})\.(\d{2})\.(\d{4})/);
  if (m2) return `${m2[3]}-${m2[2]}-${m2[1]}`;
  return str;
}

function toNumber(value) {
  if (value == null || value === '') return 0;
  if (typeof value === 'number') return value;
  const n = parseFloat(String(value).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

async function readWorkbookFromFile(file) {
  const buf = await file.arrayBuffer();
  const isZip = file.name.toLowerCase().endsWith('.zip') ||
    (buf.byteLength > 2 && new Uint8Array(buf, 0, 2)[0] === 0x50 && new Uint8Array(buf, 0, 2)[1] === 0x4b);

  if (isZip) {
    const zip = await JSZip.loadAsync(buf);
    const xlsxEntry = Object.values(zip.files).find(
      (f) => !f.dir && f.name.toLowerCase().endsWith('.xlsx')
    );
    if (!xlsxEntry) {
      throw new Error('В архиве не найден .xlsx файл');
    }
    const xlsxBuf = await xlsxEntry.async('arraybuffer');
    return XLSX.read(xlsxBuf, { type: 'array', cellDates: true });
  }
  return XLSX.read(buf, { type: 'array', cellDates: true });
}

// Builds a stable dedup key from the fields that together uniquely
// identify one report row. Re-uploading the same/overlapping report must
// not duplicate operations.
function buildOpId(fields) {
  return [
    fields.article,
    fields.saleDate,
    fields.orderDate,
    fields.docType,
    fields.purpose,
    fields.supplyNumber,
    fields.assemblyNumber,
    fields.srid,
    fields.qty,
    fields.priceRetailDiscounted,
    fields.commissionRub,
    fields.payout,
    fields.delivery,
    fields.storage,
    fields.acceptance,
    fields.penalties,
    fields.returnQty,
  ]
    .map((v) => (v == null ? '' : String(v)))
    .join('|');
}

export async function parseWeeklyReport(file) {
  const workbook = await readWorkbookFromFile(file);
  const sheetName = workbook.SheetNames.includes('Sheet1') ? 'Sheet1' : workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null });
  if (rows.length === 0) {
    throw new Error('Файл пуст');
  }
  const headerRow = rows[0];
  const { index, missing } = buildColumnIndex(headerRow, REPORT_COLUMNS);
  const criticalMissing = missing.filter((m) =>
    [REPORT_COLUMNS.article[0], REPORT_COLUMNS.saleDate[0], REPORT_COLUMNS.qty[0]].includes(m)
  );
  if (criticalMissing.length > 0) {
    throw new Error(
      `Не найдены обязательные колонки в отчёте: ${criticalMissing.join(', ')}. ` +
      'Похоже, это не еженедельный детализированный отчёт WB или формат изменился.'
    );
  }

  const ops = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every((c) => c == null || c === '')) continue;
    const get = (key) => (index[key] === -1 ? null : row[index[key]]);

    const fields = {
      article: get('article') != null ? String(get('article')).trim() : '',
      saleDate: toIsoDate(get('saleDate')),
      orderDate: toIsoDate(get('orderDate')),
      docType: get('docType') != null ? String(get('docType')).trim() : '',
      purpose: get('purpose') != null ? String(get('purpose')).trim() : '',
      qty: toNumber(get('qty')),
      priceRetail: toNumber(get('priceRetail')),
      priceRetailDiscounted: toNumber(get('priceRetailDiscounted')),
      commissionRub: toNumber(get('commissionRub')),
      payout: toNumber(get('payout')),
      delivery: toNumber(get('delivery')),
      storage: toNumber(get('storage')),
      acceptance: toNumber(get('acceptance')),
      penalties: toNumber(get('penalties')),
      returnQty: toNumber(get('returnQty')),
      deliveryQty: toNumber(get('deliveryQty')),
      supplyNumber: get('supplyNumber') != null ? String(get('supplyNumber')).trim() : '',
      assemblyNumber: get('assemblyNumber') != null ? String(get('assemblyNumber')).trim() : '',
      srid: get('srid') != null ? String(get('srid')).trim() : '',
    };
    if (!fields.article) continue; // rows without an article carry no sellable info
    fields.id = buildOpId(fields);
    ops.push(fields);
  }

  return { ops, totalRows: rows.length - 1, sheetName };
}

export async function parseCostReference(file) {
  let rows;
  const name = file.name.toLowerCase();
  if (name.endsWith('.html') || name.endsWith('.htm')) {
    const text = await file.text();
    rows = parseHtmlTable(text);
  } else {
    const buf = await file.arrayBuffer();
    const workbook = XLSX.read(buf, { type: 'array' });
    const sheetName = workbook.SheetNames.find((n) => /справочник/i.test(n)) || workbook.SheetNames[0];
    rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, raw: true, defval: null });
  }

  // The reference sheet has a few decorative rows before the real header;
  // find the row that actually contains our expected column names.
  let headerRowIdx = -1;
  let index = null;
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const { index: idx, missing } = buildColumnIndex(rows[i] || [], REF_COLUMNS);
    if (missing.length === 0) {
      headerRowIdx = i;
      index = idx;
      break;
    }
  }
  if (headerRowIdx === -1) {
    throw new Error(
      `Не найдены колонки "${REF_COLUMNS.article[0]}" и "${REF_COLUMNS.cost[0]}" в файле справочника.`
    );
  }

  const items = [];
  for (let i = headerRowIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    const article = row[index.article] != null ? String(row[index.article]).trim() : '';
    const cost = toNumber(row[index.cost]);
    if (!article) continue;
    items.push({ article, cost });
  }

  // Last occurrence wins for duplicate articles (most recent row in sheet order).
  const map = new Map();
  for (const item of items) {
    map.set(item.article, item.cost);
  }
  return Array.from(map.entries()).map(([article, cost]) => ({ article, cost }));
}

function parseHtmlTable(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const table = doc.querySelector('table');
  if (!table) return [];
  const rows = [];
  for (const tr of table.querySelectorAll('tr')) {
    const cells = Array.from(tr.querySelectorAll('td,th')).map((td) => td.textContent.trim());
    rows.push(cells);
  }
  return rows;
}
