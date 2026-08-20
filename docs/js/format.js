const nf0 = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });

export function fmtInt(value) {
  if (value == null || Number.isNaN(value)) return '—';
  return nf0.format(Math.round(value));
}

export function fmtMoney(value) {
  if (value == null || Number.isNaN(value)) return '—';
  return nf0.format(Math.round(value));
}

export function fmtUnit(value) {
  if (value == null || Number.isNaN(value)) return '—';
  return nf1.format(value);
}

export function fmtPct(value) {
  if (value == null || Number.isNaN(value)) return '—';
  return `${nf1.format(value * 100)}%`;
}

export function fmtDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

export function fmtDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
