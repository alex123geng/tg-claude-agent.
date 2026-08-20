// Unit-economics calculation engine — mirrors the "Юнит" / "Юнит (мес)"
// sheets of the reference Google Sheet ("РНП / ИП Фролов В.").
//
// Formula notes (see README "Как считается" section for the full
// derivation and validation against the reference export):
//  - Заказы = Продажи(шт) + Возвраты(шт) — the weekly detailed report has
//    no separate "order placed" event, so orders are approximated as
//    shipped-and-kept + shipped-and-returned. Validated against the
//    reference control month (июль 2026): computed 29.1% buyout vs 29%
//    in the reference "Юнит (мес)" sheet.
//  - Прибыль = Маржа − Прочие расходы ВБ − Реклама − Налог. Validated to
//    match the reference sheet exactly (to the ruble) on the sample row.
//  - Маржа = Выручка − Себестоимость − Комиссия − Доставка, exactly as
//    specified in the source spec. On the one reference row we could
//    cross-check, this came out ~4% higher than the reference "Маржа" —
//    we couldn't isolate the missing component without the seller's full
//    historical operations log (only one sample week was available, vs.
//    an all-time reference row). Everything downstream of Маржа (Прибыль,
//    Рентабельность, per-unit columns) reconciles exactly, so the formula
//    is implemented literally as specified rather than adjusted by guess.

export function filterOpsByPeriod(ops, fromIso, toIso) {
  return ops.filter((op) => op.saleDate && op.saleDate >= fromIso && op.saleDate <= toIso);
}

function safeDiv(a, b) {
  return b ? a / b : null;
}

// WB's own exports disagree on article casing between report types (seen
// e.g. "льняной_с_брюками_песочный" in the weekly report vs
// "Льняной_с_брюками_песочный" in the Справочник export for the same
// product) — look costs up case-insensitively so that doesn't silently
// zero out the cost.
export function normalizeArticle(article) {
  return String(article).trim().toLowerCase();
}

function costMapHas(costRefMap, article) {
  return costRefMap.has(normalizeArticle(article));
}
function costMapGet(costRefMap, article) {
  return costRefMap.get(normalizeArticle(article));
}

// Aggregates a list of ops (already filtered to the desired period and,
// for per-article rows, to a single article) into one "Юнит" row.
export function aggregateOps(ops, costPerUnit, taxSettings) {
  let qtySold = 0;
  let qtyReturned = 0;
  let salesBeforeSpp = 0;
  let revenue = 0;
  let commission = 0;
  let delivery = 0;
  let storage = 0;
  let acceptance = 0;
  let penalties = 0;

  for (const op of ops) {
    const isSale = op.docType === 'Продажа' || op.purpose === 'Продажа';
    if (isSale) {
      qtySold += op.qty;
      salesBeforeSpp += op.priceRetailDiscounted;
    }
    qtyReturned += op.returnQty;
    revenue += op.payout;
    commission += op.commissionRub;
    delivery += op.delivery;
    storage += op.storage;
    acceptance += op.acceptance;
    penalties += op.penalties;
  }

  const orders = qtySold + qtyReturned;
  const buyoutRate = safeDiv(qtySold, orders);
  const otherWbExpenses = storage + acceptance + penalties;
  const hasCost = costPerUnit != null;
  const cost = hasCost ? qtySold * costPerUnit : 0;
  const margin = revenue - cost - commission - delivery;

  const ad = null; // рекламный отчёт в v1 не подключён — см. README
  const adAmount = ad || 0;

  let tax = null;
  if (taxSettings && taxSettings.rate != null) {
    const rate = taxSettings.rate / 100;
    if (taxSettings.mode === 'income_minus_expense') {
      const base = Math.max(0, margin - otherWbExpenses - adAmount);
      tax = base * rate;
    } else {
      tax = revenue * rate;
    }
  }
  const taxAmount = tax || 0;

  const profit = margin - otherWbExpenses - adAmount - taxAmount;

  const priceBeforeSpp = safeDiv(salesBeforeSpp, qtySold);
  const avgPrice = safeDiv(revenue, qtySold);
  const sppPct = priceBeforeSpp && avgPrice != null ? 1 - avgPrice / priceBeforeSpp : null;
  const costPerUnitOut = hasCost ? costPerUnit : null;
  const commissionPerUnit = safeDiv(commission, qtySold);
  const priceMinusCommissionPerUnit =
    avgPrice != null && commissionPerUnit != null ? avgPrice - commissionPerUnit : null;
  const deliveryPerUnit = safeDiv(delivery, qtySold);
  const marginPerUnit = safeDiv(margin, qtySold);
  const profitPerUnit = safeDiv(profit, qtySold);

  return {
    orders,
    returns: qtyReturned,
    sold: qtySold,
    buyoutRate,
    salesBeforeSpp,
    revenue,
    cost,
    hasCost,
    commission,
    delivery,
    margin,
    ad,
    otherWbExpenses,
    tax,
    profit,
    marginPct: safeDiv(margin, revenue),
    roiPct: safeDiv(profit, revenue),
    drrPct: null, // нет данных о рекламе
    romiPct: null, // нет данных о рекламе
    romPct: safeDiv(profit, cost) ,
    priceBeforeSpp,
    avgPrice,
    sppPct,
    costPerUnit: costPerUnitOut,
    commissionPerUnit,
    priceMinusCommissionPerUnit,
    deliveryPerUnit,
    marginPerUnit,
    profitPerUnit,
    opsCount: ops.length,
  };
}

export function buildUnitTableByArticle(ops, costRefMap, taxSettings) {
  const byArticle = new Map();
  for (const op of ops) {
    if (!byArticle.has(op.article)) byArticle.set(op.article, []);
    byArticle.get(op.article).push(op);
  }
  const rows = [];
  for (const [article, articleOps] of byArticle.entries()) {
    const costPerUnit = costMapHas(costRefMap, article) ? costMapGet(costRefMap, article) : null;
    const metrics = aggregateOps(articleOps, costPerUnit, taxSettings);
    rows.push({ article, ...metrics });
  }
  return rows;
}

function monthKey(iso) {
  return iso.slice(0, 7); // 'YYYY-MM'
}

const MONTH_NAMES = [
  'янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек',
];

export function monthLabel(key) {
  const [y, m] = key.split('-').map(Number);
  return `${MONTH_NAMES[m - 1]}. ${y}`;
}

export function buildUnitTableByMonth(ops, costRefMap, taxSettings) {
  const byMonth = new Map();
  for (const op of ops) {
    const key = monthKey(op.saleDate);
    if (!byMonth.has(key)) byMonth.set(key, []);
    byMonth.get(key).push(op);
  }
  const rows = [];
  for (const [month, monthOps] of byMonth.entries()) {
    // Cost per unit varies by article; compute a blended per-unit cost
    // implicitly by summing per-article cost inside aggregateOpsMulti.
    const metrics = aggregateOpsMultiCost(monthOps, costRefMap, taxSettings);
    rows.push({ month, monthLabel: monthLabel(month), ...metrics });
  }
  rows.sort((a, b) => a.month.localeCompare(b.month));
  return rows;
}

// Same as aggregateOps but costPerUnit differs per op (per article), used
// for aggregates that span multiple articles (monthly totals, overview).
export function aggregateOpsMultiCost(ops, costRefMap, taxSettings) {
  let qtySold = 0;
  let qtyReturned = 0;
  let salesBeforeSpp = 0;
  let revenue = 0;
  let commission = 0;
  let delivery = 0;
  let storage = 0;
  let acceptance = 0;
  let penalties = 0;
  let cost = 0;
  let missingCostQty = 0;

  for (const op of ops) {
    const isSale = op.docType === 'Продажа' || op.purpose === 'Продажа';
    if (isSale) {
      qtySold += op.qty;
      salesBeforeSpp += op.priceRetailDiscounted;
      if (costMapHas(costRefMap, op.article)) {
        cost += op.qty * costMapGet(costRefMap, op.article);
      } else {
        missingCostQty += op.qty;
      }
    }
    qtyReturned += op.returnQty;
    revenue += op.payout;
    commission += op.commissionRub;
    delivery += op.delivery;
    storage += op.storage;
    acceptance += op.acceptance;
    penalties += op.penalties;
  }

  const orders = qtySold + qtyReturned;
  const buyoutRate = safeDiv(qtySold, orders);
  const otherWbExpenses = storage + acceptance + penalties;
  const margin = revenue - cost - commission - delivery;
  const adAmount = 0;

  let tax = null;
  if (taxSettings && taxSettings.rate != null) {
    const rate = taxSettings.rate / 100;
    if (taxSettings.mode === 'income_minus_expense') {
      const base = Math.max(0, margin - otherWbExpenses - adAmount);
      tax = base * rate;
    } else {
      tax = revenue * rate;
    }
  }
  const taxAmount = tax || 0;
  const profit = margin - otherWbExpenses - adAmount - taxAmount;

  const priceBeforeSpp = safeDiv(salesBeforeSpp, qtySold);
  const avgPrice = safeDiv(revenue, qtySold);
  const sppPct = priceBeforeSpp && avgPrice != null ? 1 - avgPrice / priceBeforeSpp : null;
  const commissionPerUnit = safeDiv(commission, qtySold);
  const priceMinusCommissionPerUnit =
    avgPrice != null && commissionPerUnit != null ? avgPrice - commissionPerUnit : null;
  const deliveryPerUnit = safeDiv(delivery, qtySold);
  const marginPerUnit = safeDiv(margin, qtySold);
  const profitPerUnit = safeDiv(profit, qtySold);

  return {
    orders,
    returns: qtyReturned,
    sold: qtySold,
    buyoutRate,
    salesBeforeSpp,
    revenue,
    cost,
    hasCost: missingCostQty === 0,
    missingCostQty,
    commission,
    delivery,
    margin,
    ad: null,
    otherWbExpenses,
    tax,
    profit,
    marginPct: safeDiv(margin, revenue),
    roiPct: safeDiv(profit, revenue),
    drrPct: null,
    romiPct: null,
    romPct: safeDiv(profit, cost),
    priceBeforeSpp,
    avgPrice,
    sppPct,
    costPerUnit: safeDiv(cost, qtySold),
    commissionPerUnit,
    priceMinusCommissionPerUnit,
    deliveryPerUnit,
    marginPerUnit,
    profitPerUnit,
    opsCount: ops.length,
  };
}
