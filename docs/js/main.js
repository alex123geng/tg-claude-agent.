import { db, getSetting, setSetting, exportAllData, importAllData } from './db.js';
import { parseWeeklyReport, parseCostReference } from './parse.js';
import {
  filterOpsByPeriod,
  buildUnitTableByArticle,
  buildUnitTableByMonth,
  aggregateOpsMultiCost,
  normalizeArticle,
} from './calc.js';
import { fmtInt, fmtMoney, fmtUnit, fmtPct, fmtDate, fmtDateTime } from './format.js';

const state = {
  ops: [],
  costRef: [], // [{article, cost, updatedAt}]
  costRefMap: new Map(),
  uploads: [],
  settings: { taxMode: 'revenue', taxRate: null },
  period: { from: null, to: null },
  periodMode: 'month', // 'month' | 'range' | 'all'
  unitView: 'article', // 'article' | 'month'
  unitSortByView: {
    article: { key: 'profit', dir: 'desc' },
    month: { key: 'month', dir: 'asc' },
  },
  tab: 'overview',
};

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

// ---------- bootstrap ----------

async function init() {
  bindStaticEvents();
  await loadAll();
  initDefaultPeriod();
  render();
}

async function loadAll() {
  const [ops, costRef, uploads, taxMode, taxRate] = await Promise.all([
    db.getAll('weeklyOps'),
    db.getAll('costRef'),
    db.getAll('uploadsLog'),
    getSetting('taxMode', 'revenue'),
    getSetting('taxRate', null),
  ]);
  state.ops = ops;
  state.costRef = costRef;
  // keyed by normalized article — WB's own exports disagree on casing
  // between report types for the same product, see calc.js normalizeArticle
  state.costRefMap = new Map(costRef.map((c) => [normalizeArticle(c.article), c.cost]));
  state.uploads = uploads.sort((a, b) => (b.uploadedAt || '').localeCompare(a.uploadedAt || ''));
  state.settings = { taxMode, taxRate };
}

function initDefaultPeriod() {
  if (state.period.from && state.period.to) return;
  const dates = state.ops.map((o) => o.saleDate).filter(Boolean).sort();
  if (dates.length === 0) {
    const now = new Date();
    state.period.from = monthStart(now.getFullYear(), now.getMonth());
    state.period.to = monthEnd(now.getFullYear(), now.getMonth());
    return;
  }
  const max = dates[dates.length - 1];
  const [y, m] = max.split('-').map(Number);
  state.period.from = monthStart(y, m - 1);
  state.period.to = monthEnd(y, m - 1);
}

function monthStart(y, mIdx0) {
  const d = new Date(Date.UTC(y, mIdx0, 1));
  return d.toISOString().slice(0, 10);
}
function monthEnd(y, mIdx0) {
  const d = new Date(Date.UTC(y, mIdx0 + 1, 0));
  return d.toISOString().slice(0, 10);
}

function dataDateRange() {
  const dates = state.ops.map((o) => o.saleDate).filter(Boolean).sort();
  if (dates.length === 0) return null;
  return { min: dates[0], max: dates[dates.length - 1] };
}

// ---------- banner ----------

let bannerTimer = null;
function showBanner(message, type = 'info', persist = false) {
  const el = $('#banner');
  el.textContent = message;
  el.className = `banner ${type}`;
  if (bannerTimer) clearTimeout(bannerTimer);
  if (!persist) {
    bannerTimer = setTimeout(() => el.classList.add('hidden'), 6000);
  }
}
function hideBanner() {
  $('#banner').classList.add('hidden');
}

// ---------- tabs ----------

function bindStaticEvents() {
  $$('#tabs .tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.tab = btn.dataset.tab;
      $$('#tabs .tab-btn').forEach((b) => b.classList.toggle('active', b === btn));
      render();
    });
  });

  $('#fileInputWeekly').addEventListener('change', async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length) await handleWeeklyUpload(files);
  });

  $('#fileInputCostRef').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (file) await handleCostRefUpload(file);
  });

  $('#fileInputImport').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (file) await handleImport(file);
  });
}

function render() {
  hideBanner();
  const content = $('#content');
  content.innerHTML = '';
  if (state.tab === 'overview') renderOverview(content);
  else if (state.tab === 'unit') renderUnit(content);
  else if (state.tab === 'cost') renderCost(content);
  else if (state.tab === 'uploads') renderUploads(content);
  else if (state.tab === 'settings') renderSettings(content);
}

// ---------- period picker (shared widget) ----------

function renderPeriodPicker(container, onChange) {
  const wrap = document.createElement('div');
  wrap.className = 'toolbar';

  const range = dataDateRange();

  const modeToggle = document.createElement('div');
  modeToggle.className = 'view-toggle';
  const modes = [['month', 'Месяц'], ['range', 'Диапазон'], ['all', 'Весь период']];
  modes.forEach(([mode, label]) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.className = state.periodMode === mode ? 'active' : '';
    b.addEventListener('click', () => {
      state.periodMode = mode;
      if (mode === 'all' && range) {
        state.period.from = range.min;
        state.period.to = range.max;
      }
      render();
    });
    modeToggle.appendChild(b);
  });
  wrap.appendChild(modeToggle);

  if (state.periodMode === 'month') {
    const input = document.createElement('input');
    input.type = 'month';
    input.value = state.period.from ? state.period.from.slice(0, 7) : '';
    input.addEventListener('change', () => {
      if (!input.value) return;
      const [y, m] = input.value.split('-').map(Number);
      state.period.from = monthStart(y, m - 1);
      state.period.to = monthEnd(y, m - 1);
      onChange();
    });
    wrap.appendChild(input);
  } else if (state.periodMode === 'range') {
    const fromInput = document.createElement('input');
    fromInput.type = 'date';
    fromInput.value = state.period.from || '';
    const toInput = document.createElement('input');
    toInput.type = 'date';
    toInput.value = state.period.to || '';
    const apply = document.createElement('button');
    apply.textContent = 'Применить';
    apply.className = 'primary';
    apply.addEventListener('click', () => {
      state.period.from = fromInput.value || state.period.from;
      state.period.to = toInput.value || state.period.to;
      onChange();
    });
    const g1 = document.createElement('span');
    g1.className = 'field-group';
    g1.append('с ', fromInput);
    const g2 = document.createElement('span');
    g2.className = 'field-group';
    g2.append('по ', toInput);
    wrap.append(g1, g2, apply);
  } else {
    const span = document.createElement('span');
    span.className = 'muted';
    span.textContent = range ? `${fmtDate(range.min)} — ${fmtDate(range.max)}` : 'нет данных';
    wrap.appendChild(span);
  }

  const periodLabel = document.createElement('span');
  periodLabel.className = 'muted';
  periodLabel.style.marginLeft = 'auto';
  periodLabel.textContent = state.period.from && state.period.to
    ? `Период: ${fmtDate(state.period.from)} — ${fmtDate(state.period.to)}`
    : '';
  wrap.appendChild(periodLabel);

  container.appendChild(wrap);
}

// ---------- Overview ----------

function renderOverview(root) {
  const section = document.createElement('div');
  section.className = 'section';
  const h = document.createElement('h2');
  h.textContent = 'Обзор';
  section.appendChild(h);
  root.appendChild(section);

  renderPeriodPicker(section, render);

  if (state.ops.length === 0) {
    section.appendChild(emptyState(
      'Нет загруженных отчётов',
      'Загрузите еженедельный детализированный отчёт WB на вкладке «Загрузки», чтобы увидеть цифры.'
    ));
    return;
  }

  const filtered = filterOpsByPeriod(state.ops, state.period.from, state.period.to);
  const agg = aggregateOpsMultiCost(filtered, state.costRefMap, effectiveTaxSettings());
  const byArticle = buildUnitTableByArticle(filtered, state.costRefMap, effectiveTaxSettings());
  const lossCount = byArticle.filter((r) => r.profit < 0).length;

  const cards = document.createElement('div');
  cards.className = 'card-row';
  cards.appendChild(card('Прибыль за период', fmtMoney(agg.profit) + ' ₽', agg.profit >= 0 ? 'positive' : 'negative', `Выручка: ${fmtMoney(agg.revenue)} ₽`));
  cards.appendChild(card('Средняя маржа/ед.', agg.marginPerUnit != null ? fmtUnit(agg.marginPerUnit) + ' ₽' : '—', '', `Продано: ${fmtInt(agg.sold)} шт.`));
  cards.appendChild(card('Убыточных артикулов', fmtInt(lossCount), lossCount > 0 ? 'negative' : 'positive', `Всего артикулов: ${byArticle.length}`));
  cards.appendChild(card('% выкупа', fmtPct(agg.buyoutRate), '', `Заказы: ${fmtInt(agg.orders)}, возвраты: ${fmtInt(agg.returns)}`));
  section.appendChild(cards);

  if (agg.missingCostQty > 0) {
    const warn = document.createElement('p');
    warn.innerHTML = `⚠ Для ${fmtInt(agg.missingCostQty)} проданных ед. не задана себестоимость — прибыль по ним занижена. Заполните вкладку «Себестоимость».`;
    section.appendChild(warn);
  }
  if (state.settings.taxRate == null) {
    const warn = document.createElement('p');
    warn.innerHTML = `⚠ Налоговая ставка не задана (вкладка «Настройки») — налог в расчёте не учитывается.`;
    section.appendChild(warn);
  }

  if (byArticle.length > 0) {
    const top = [...byArticle].sort((a, b) => b.profit - a.profit).slice(0, 5);
    const worst = [...byArticle].sort((a, b) => a.profit - b.profit).slice(0, 5).filter((r) => r.profit < 0);

    const grid = document.createElement('div');
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = 'repeat(auto-fit, minmax(320px, 1fr))';
    grid.style.gap = '16px';

    grid.appendChild(miniTable('Лучшие по прибыли', top));
    if (worst.length > 0) grid.appendChild(miniTable('Убыточные', worst));
    section.appendChild(grid);
  }
}

function miniTable(title, rows) {
  const wrap = document.createElement('div');
  const h = document.createElement('h3');
  h.textContent = title;
  wrap.appendChild(h);
  const tableWrap = document.createElement('div');
  tableWrap.className = 'table-wrap';
  const table = document.createElement('table');
  table.style.minWidth = '0';
  table.innerHTML = `<thead><tr><th class="text-col">Артикул</th><th>Прибыль</th></tr></thead>`;
  const tbody = document.createElement('tbody');
  rows.forEach((r) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td class="text-col">${escapeHtml(r.article)}</td>
      <td class="${r.profit >= 0 ? 'positive' : 'negative'}">${fmtMoney(r.profit)}</td>`;
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  tableWrap.appendChild(table);
  wrap.appendChild(tableWrap);
  return wrap;
}

function card(label, value, cls, sub) {
  const c = document.createElement('div');
  c.className = 'card';
  c.innerHTML = `<div class="card-label">${label}</div><div class="card-value ${cls}">${value}</div><div class="card-sub">${sub || ''}</div>`;
  return c;
}

function emptyState(title, sub) {
  const div = document.createElement('div');
  div.className = 'empty-state';
  div.innerHTML = `<h3>${title}</h3><p>${sub}</p>`;
  return div;
}

// ---------- Unit economics ----------

const UNIT_COLUMNS = [
  { key: 'orders', label: 'Заказы', fmt: fmtInt },
  { key: 'returns', label: 'Возвраты', fmt: fmtInt },
  { key: 'sold', label: 'Продажи', fmt: fmtInt },
  { key: 'buyoutRate', label: '% выкупа', fmt: fmtPct },
  { key: 'salesBeforeSpp', label: 'Продажи, руб. до вычета СПП', fmt: fmtMoney },
  { key: 'revenue', label: 'Выручка', fmt: fmtMoney },
  { key: 'cost', label: 'Себестоимость', fmt: fmtMoney },
  { key: 'commission', label: 'Комиссия', fmt: fmtMoney },
  { key: 'delivery', label: 'Доставка', fmt: fmtMoney },
  { key: 'margin', label: 'Маржа', fmt: fmtMoney },
  { key: 'ad', label: 'Реклама', fmt: fmtNA },
  { key: 'otherWbExpenses', label: 'Прочие расходы ВБ ***', fmt: fmtMoney },
  { key: 'tax', label: 'Налог', fmt: fmtNAOrMoney },
  { key: 'profit', label: 'Прибыль', fmt: fmtMoney, cls: (v) => (v >= 0 ? 'positive' : 'negative') },
  { key: 'marginPct', label: 'Маржа, %', fmt: fmtPct },
  { key: 'roiPct', label: 'Рентабельность, %', fmt: fmtPct },
  { key: 'drrPct', label: 'ДРР, %', fmt: fmtNA },
  { key: 'romiPct', label: 'ROMI, %', fmt: fmtNA },
  { key: 'romPct', label: 'ROM, %', fmt: fmtPct },
  { key: 'priceBeforeSpp', label: 'Цена до СПП', fmt: fmtUnit },
  { key: 'avgPrice', label: 'Средняя цена за ед.', fmt: fmtUnit },
  { key: 'sppPct', label: '% СПП', fmt: fmtPct },
  { key: 'costPerUnit', label: 'Себестоимость за ед', fmt: fmtUnit },
  { key: 'commissionPerUnit', label: 'Комиссия за ед', fmt: fmtUnit },
  { key: 'priceMinusCommissionPerUnit', label: 'Цена минус комиссия, за ед', fmt: fmtUnit },
  { key: 'deliveryPerUnit', label: 'Доставка за ед', fmt: fmtUnit },
  { key: 'marginPerUnit', label: 'Маржа на ед', fmt: fmtUnit },
  { key: 'profitPerUnit', label: 'Прибыль на ед', fmt: fmtUnit },
];

function fmtNA(v) {
  return v == null ? 'нет данных' : fmtPct(v);
}
function fmtNAOrMoney(v) {
  return v == null ? 'нет данных' : fmtMoney(v);
}

function effectiveTaxSettings() {
  if (state.settings.taxRate == null) return null;
  return { mode: state.settings.taxMode, rate: state.settings.taxRate };
}

function renderUnit(root) {
  const section = document.createElement('div');
  section.className = 'section';
  const h = document.createElement('h2');
  h.textContent = 'Юнит-экономика';
  section.appendChild(h);
  root.appendChild(section);

  const toolbar = document.createElement('div');
  toolbar.className = 'toolbar';
  const toggle = document.createElement('div');
  toggle.className = 'view-toggle';
  [['article', 'По артикулам'], ['month', 'По месяцам']].forEach(([mode, label]) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.className = state.unitView === mode ? 'active' : '';
    b.addEventListener('click', () => {
      state.unitView = mode;
      render();
    });
    toggle.appendChild(b);
  });
  toolbar.appendChild(toggle);
  section.appendChild(toolbar);

  if (state.unitView === 'article') {
    renderPeriodPicker(section, render);
  } else {
    const range = dataDateRange();
    const info = document.createElement('p');
    info.className = 'muted';
    info.textContent = range
      ? `Разбивка по всем месяцам с накопленными данными: ${fmtDate(range.min)} — ${fmtDate(range.max)}. Фильтр периода здесь не применяется — переключитесь на «По артикулам», чтобы смотреть один период.`
      : '';
    section.appendChild(info);
  }

  if (state.ops.length === 0) {
    section.appendChild(emptyState('Нет данных', 'Загрузите отчёты на вкладке «Загрузки».'));
    return;
  }

  let rows;
  let keyCol;
  let totalScope;
  if (state.unitView === 'article') {
    totalScope = filterOpsByPeriod(state.ops, state.period.from, state.period.to);
    rows = buildUnitTableByArticle(totalScope, state.costRefMap, effectiveTaxSettings());
    keyCol = { key: 'article', label: 'Артикул' };
  } else {
    totalScope = state.ops;
    rows = buildUnitTableByMonth(totalScope, state.costRefMap, effectiveTaxSettings());
    keyCol = { key: 'monthLabel', label: 'Месяц' };
  }

  const unitSort = state.unitSortByView[state.unitView];
  const { key: sortKey, dir } = unitSort;
  rows = [...rows].sort((a, b) => {
    const va = a[sortKey];
    const vb = b[sortKey];
    if (typeof va === 'string' || typeof vb === 'string') {
      return dir === 'asc' ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
    }
    const na = va == null ? -Infinity : va;
    const nb = vb == null ? -Infinity : vb;
    return dir === 'asc' ? na - nb : nb - na;
  });

  const wrap = document.createElement('div');
  wrap.className = 'table-wrap';
  const table = document.createElement('table');
  const thead = document.createElement('thead');
  const trh = document.createElement('tr');

  const makeTh = (key, label, textCol) => {
    const th = document.createElement('th');
    th.textContent = label;
    if (textCol) th.classList.add('text-col');
    if (unitSort.key === key) {
      const arrow = document.createElement('span');
      arrow.className = 'sort-arrow';
      arrow.textContent = unitSort.dir === 'asc' ? '▲' : '▼';
      th.appendChild(arrow);
    }
    th.addEventListener('click', () => {
      if (unitSort.key === key) {
        unitSort.dir = unitSort.dir === 'asc' ? 'desc' : 'asc';
      } else {
        state.unitSortByView[state.unitView] = { key, dir: key === keyCol.key ? 'asc' : 'desc' };
      }
      render();
    });
    return th;
  };

  trh.appendChild(makeTh(keyCol.key, keyCol.label, true));
  UNIT_COLUMNS.forEach((c) => trh.appendChild(makeTh(c.key, c.label, false)));
  thead.appendChild(trh);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  rows.forEach((r) => {
    const tr = document.createElement('tr');
    const tdKey = document.createElement('td');
    tdKey.className = 'text-col';
    tdKey.textContent = r[keyCol.key];
    tr.appendChild(tdKey);
    UNIT_COLUMNS.forEach((c) => {
      const td = document.createElement('td');
      const v = r[c.key];
      td.textContent = c.fmt(v);
      if (c.cls) td.classList.add(c.cls(v));
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });

  // total row mirrors the "Юнит (мес)" aggregate: whole filtered period for
  // the by-article view, whole history for the by-month view.
  if (totalScope.length > 0) {
    const total = aggregateOpsMultiCost(totalScope, state.costRefMap, effectiveTaxSettings());
    const tr = document.createElement('tr');
    tr.className = 'total-row';
    const tdKey = document.createElement('td');
    tdKey.className = 'text-col';
    tdKey.textContent = state.unitView === 'article' ? 'Итого за период' : 'Итого за всё время';
    tr.appendChild(tdKey);
    UNIT_COLUMNS.forEach((c) => {
      const td = document.createElement('td');
      const v = total[c.key];
      td.textContent = c.fmt(v);
      if (c.cls) td.classList.add(c.cls(v));
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  }

  table.appendChild(tbody);
  wrap.appendChild(table);
  section.appendChild(wrap);

  const note = document.createElement('p');
  note.className = 'footer-note';
  note.innerHTML = '*** Прочие расходы ВБ = хранение, платная приёмка, штрафы. «Заказы» = продажи + возвраты (в детализированном отчёте WB нет отдельного события «заказ»). «Реклама», «ДРР» и «ROMI» показывают «нет данных», пока не подключён отчёт по рекламе.';
  section.appendChild(note);
}

// ---------- Cost reference ----------

function renderCost(root) {
  const section = document.createElement('div');
  section.className = 'section';
  const h = document.createElement('h2');
  h.textContent = 'Себестоимость';
  section.appendChild(h);
  const p = document.createElement('p');
  p.textContent = 'Себестоимость задаётся один раз на артикул и не меняется автоматически из отчётов WB — WB её не знает. Отредактируйте значение прямо в таблице.';
  section.appendChild(p);
  root.appendChild(section);

  const toolbar = document.createElement('div');
  toolbar.className = 'toolbar';

  const addBtn = document.createElement('button');
  addBtn.textContent = '+ Добавить артикул';
  addBtn.className = 'primary';
  addBtn.addEventListener('click', async () => {
    const article = prompt('Артикул поставщика:');
    if (!article) return;
    const trimmed = article.trim();
    if (!trimmed) return;
    await db.put('costRef', { article: trimmed, cost: 0, updatedAt: new Date().toISOString() });
    await loadAll();
    render();
  });
  toolbar.appendChild(addBtn);

  const importBtn = document.createElement('button');
  importBtn.textContent = 'Загрузить справочник (xlsx/html)';
  importBtn.addEventListener('click', () => $('#fileInputCostRef').click());
  toolbar.appendChild(importBtn);

  section.appendChild(toolbar);

  if (state.costRef.length === 0) {
    section.appendChild(emptyState(
      'Себестоимость не задана',
      'Добавьте артикулы вручную или один раз загрузите справочник, чтобы предзаполнить значения.'
    ));
    return;
  }

  const wrap = document.createElement('div');
  wrap.className = 'table-wrap';
  const table = document.createElement('table');
  table.innerHTML = `<thead><tr><th class="text-col">Артикул</th><th>Себестоимость, ₽</th><th>Обновлено</th><th></th></tr></thead>`;
  const tbody = document.createElement('tbody');

  const sorted = [...state.costRef].sort((a, b) => a.article.localeCompare(b.article));
  sorted.forEach((rec) => {
    const tr = document.createElement('tr');
    const tdArt = document.createElement('td');
    tdArt.className = 'text-col';
    tdArt.textContent = rec.article;
    tr.appendChild(tdArt);

    const tdCost = document.createElement('td');
    const input = document.createElement('input');
    input.type = 'number';
    input.step = '0.01';
    input.className = 'editable-cell';
    input.value = rec.cost;
    input.addEventListener('change', async () => {
      const cost = parseFloat(input.value) || 0;
      await db.put('costRef', { article: rec.article, cost, updatedAt: new Date().toISOString() });
      await loadAll();
      showBanner(`Себестоимость «${rec.article}» обновлена: ${fmtMoney(cost)} ₽`, 'success');
    });
    tdCost.appendChild(input);
    tr.appendChild(tdCost);

    const tdUpd = document.createElement('td');
    tdUpd.textContent = fmtDateTime(rec.updatedAt);
    tr.appendChild(tdUpd);

    const tdDel = document.createElement('td');
    const delBtn = document.createElement('button');
    delBtn.textContent = '✕';
    delBtn.className = 'danger';
    delBtn.title = 'Удалить';
    delBtn.addEventListener('click', async () => {
      if (!confirm(`Удалить себестоимость для «${rec.article}»?`)) return;
      await db.delete('costRef', rec.article);
      await loadAll();
      render();
    });
    tdDel.appendChild(delBtn);
    tr.appendChild(tdDel);

    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  wrap.appendChild(table);
  section.appendChild(wrap);
}

async function handleCostRefUpload(file) {
  try {
    showBanner('Разбираю файл справочника…', 'info', true);
    const items = await parseCostReference(file);
    if (items.length === 0) {
      showBanner('В файле не найдено ни одной строки с артикулом и себестоимостью.', 'error');
      return;
    }
    const existing = new Set(state.costRef.map((c) => c.article));
    const newCount = items.filter((i) => !existing.has(i.article)).length;
    const updateCount = items.length - newCount;
    const ok = confirm(
      `Найдено ${items.length} артикулов в справочнике: ${newCount} новых, ${updateCount} с уже заданной себестоимостью.\n\n` +
      `Применить (существующие значения будут перезаписаны)?`
    );
    if (!ok) {
      hideBanner();
      return;
    }
    const now = new Date().toISOString();
    await db.putMany('costRef', items.map((i) => ({ article: i.article, cost: i.cost, updatedAt: now })));
    await loadAll();
    showBanner(`Справочник загружен: ${items.length} артикулов.`, 'success');
    render();
  } catch (err) {
    console.error(err);
    showBanner(`Ошибка при разборе справочника: ${err.message}`, 'error');
  }
}

// ---------- Uploads ----------

function renderUploads(root) {
  const section = document.createElement('div');
  section.className = 'section';
  const h = document.createElement('h2');
  h.textContent = 'Загрузки';
  section.appendChild(h);
  const p = document.createElement('p');
  p.textContent = 'Загружайте еженедельные детализированные отчёты WB (.xlsx или .zip с xlsx внутри) по одному или несколько сразу — они накапливаются в истории, повторно загруженные строки не задваиваются.';
  section.appendChild(p);
  root.appendChild(section);

  const drop = document.createElement('div');
  drop.className = 'upload-drop';
  drop.innerHTML = '<strong>Нажмите, чтобы выбрать файл(ы)</strong>, или перетащите сюда .xlsx / .zip';
  drop.addEventListener('click', () => $('#fileInputWeekly').click());
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('dragover'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('dragover'));
  drop.addEventListener('drop', async (e) => {
    e.preventDefault();
    drop.classList.remove('dragover');
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length) await handleWeeklyUpload(files);
  });
  section.appendChild(drop);

  if (state.uploads.length === 0) {
    section.appendChild(emptyState('Пока нет загрузок', 'Загрузите первый отчёт, чтобы увидеть историю.'));
    return;
  }

  const wrap = document.createElement('div');
  wrap.className = 'table-wrap';
  const table = document.createElement('table');
  table.innerHTML = `<thead><tr>
    <th class="text-col">Файл</th>
    <th>Загружен</th>
    <th>Строк в файле</th>
    <th>Добавлено</th>
    <th>Дублей (пропущено)</th>
    <th></th>
  </tr></thead>`;
  const tbody = document.createElement('tbody');
  state.uploads.forEach((u) => {
    const tr = document.createElement('tr');
    const tdFile = document.createElement('td');
    tdFile.className = 'text-col';
    tdFile.textContent = u.fileName;
    tr.appendChild(tdFile);
    const td = (v) => { const el = document.createElement('td'); el.textContent = v; return el; };
    tr.appendChild(td(fmtDateTime(u.uploadedAt)));
    tr.appendChild(td(fmtInt(u.totalRows)));
    tr.appendChild(td(fmtInt(u.added)));
    tr.appendChild(td(fmtInt(u.duplicates)));
    const tdDel = document.createElement('td');
    const delBtn = document.createElement('button');
    delBtn.textContent = 'Удалить';
    delBtn.className = 'danger';
    delBtn.addEventListener('click', async () => {
      if (!confirm(`Удалить загрузку «${u.fileName}» и связанные ${u.added} операций из истории?`)) return;
      await db.deleteMany('weeklyOps', u.opIds || []);
      await db.delete('uploadsLog', u.id);
      await loadAll();
      showBanner('Загрузка удалена.', 'success');
      render();
    });
    tdDel.appendChild(delBtn);
    tr.appendChild(tdDel);
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  wrap.appendChild(table);
  section.appendChild(wrap);
}

async function handleWeeklyUpload(files) {
  showBanner(`Обрабатываю ${files.length} файл(ов)…`, 'info', true);
  let totalAdded = 0;
  let totalDup = 0;
  const errors = [];
  for (const file of files) {
    try {
      const { ops, totalRows } = await parseWeeklyReport(file);
      const result = await db.putManyDedup('weeklyOps', ops);
      await db.put('uploadsLog', {
        fileName: file.name,
        uploadedAt: new Date().toISOString(),
        totalRows,
        added: result.added,
        duplicates: result.duplicates,
        opIds: result.addedIds,
      });
      totalAdded += result.added;
      totalDup += result.duplicates;
    } catch (err) {
      console.error(err);
      errors.push(`${file.name}: ${err.message}`);
    }
  }
  await loadAll();
  state.period = { from: null, to: null };
  initDefaultPeriod();
  render();
  if (errors.length) {
    showBanner(`Готово с ошибками. Добавлено операций: ${totalAdded}, дублей: ${totalDup}. Ошибки: ${errors.join('; ')}`, 'error', true);
  } else {
    showBanner(`Готово. Добавлено операций: ${totalAdded}, дублей пропущено: ${totalDup}.`, 'success');
  }
}

// ---------- Settings ----------

function renderSettings(root) {
  const section = document.createElement('div');
  section.className = 'section';
  const h = document.createElement('h2');
  h.textContent = 'Настройки';
  section.appendChild(h);
  root.appendChild(section);

  const form = document.createElement('div');
  form.className = 'settings-form';

  const taxBlock = document.createElement('div');
  taxBlock.innerHTML = '<h3>Налоговый режим</h3><p>Ставка не подставляется по умолчанию — укажите её явно, иначе налог не учитывается в расчёте прибыли.</p>';
  const row1 = document.createElement('div');
  row1.className = 'row';
  const modeSelect = document.createElement('select');
  modeSelect.innerHTML = `
    <option value="revenue">УСН «Доходы» (% от выручки)</option>
    <option value="income_minus_expense">УСН «Доходы минус расходы» (% от маржи за вычетом прочих расходов ВБ)</option>
  `;
  modeSelect.value = state.settings.taxMode || 'revenue';
  const rateInput = document.createElement('input');
  rateInput.type = 'number';
  rateInput.step = '0.1';
  rateInput.min = '0';
  rateInput.max = '100';
  rateInput.placeholder = 'ставка, %';
  rateInput.value = state.settings.taxRate != null ? state.settings.taxRate : '';
  const saveBtn = document.createElement('button');
  saveBtn.textContent = 'Сохранить';
  saveBtn.className = 'primary';
  saveBtn.addEventListener('click', async () => {
    const rate = rateInput.value === '' ? null : parseFloat(rateInput.value);
    await setSetting('taxMode', modeSelect.value);
    await setSetting('taxRate', rate);
    await loadAll();
    showBanner('Настройки налога сохранены.', 'success');
    render();
  });
  row1.append(modeSelect, rateInput, saveBtn);
  taxBlock.appendChild(row1);
  form.appendChild(taxBlock);

  const backupBlock = document.createElement('div');
  backupBlock.innerHTML = '<h3>Резервная копия</h3><p>Все данные хранятся в этом браузере (IndexedDB). При смене браузера или устройства — данные не переносятся автоматически, используйте экспорт/импорт.</p>';
  const row2 = document.createElement('div');
  row2.className = 'row';
  const exportBtn = document.createElement('button');
  exportBtn.textContent = 'Экспортировать данные (JSON)';
  exportBtn.addEventListener('click', handleExport);
  const importBtn = document.createElement('button');
  importBtn.textContent = 'Импортировать данные (JSON)';
  importBtn.addEventListener('click', () => $('#fileInputImport').click());
  row2.append(exportBtn, importBtn);
  backupBlock.appendChild(row2);
  form.appendChild(backupBlock);

  const statsBlock = document.createElement('div');
  statsBlock.innerHTML = `<h3>Данные в этом браузере</h3>
    <p>Операций: ${fmtInt(state.ops.length)} · Артикулов с себестоимостью: ${fmtInt(state.costRef.length)} · Загрузок: ${fmtInt(state.uploads.length)}</p>`;
  form.appendChild(statsBlock);

  section.appendChild(form);
}

async function handleExport() {
  const dump = await exportAllData();
  const blob = new Blob([JSON.stringify(dump)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `wb-unit-dashboard-backup-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function handleImport(file) {
  try {
    const text = await file.text();
    const dump = JSON.parse(text);
    const ok = confirm('Импортировать данные из файла? Существующая себестоимость и настройки будут обновлены значениями из файла, операции — добавлены (дубли пропущены).');
    if (!ok) return;
    const result = await importAllData(dump);
    await loadAll();
    showBanner(
      `Импорт завершён: себестоимость — ${result.costRefCount}, добавлено операций — ${result.opsAdded} (дублей пропущено — ${result.opsDuplicates}).`,
      'success'
    );
    render();
  } catch (err) {
    console.error(err);
    showBanner(`Ошибка импорта: ${err.message}`, 'error');
  }
}

// ---------- utils ----------

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

init();
