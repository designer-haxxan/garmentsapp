// EAN-13 barcode encoder (the same format the shop already uses for generated product codes).
// Produces the 95-module pattern (1 = bar, 0 = space), plus SVG and TSPL output for labels.

const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
const G = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111'];
const R = L.map((p) => [...p].map((b) => (b === '1' ? '0' : '1')).join(''));
// The first digit selects which of the left six digits use L (odd) or G (even) encoding.
const PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];

export function ean13CheckDigit(first12) {
  const sum = [...first12].reduce((s, d, i) => s + Number(d) * (i % 2 ? 3 : 1), 0);
  return String((10 - (sum % 10)) % 10);
}

// Accepts 12 digits (check digit is added) or 13 digits (check digit must be right). Returns null otherwise.
export function normaliseEan13(code) {
  const s = String(code ?? '').replace(/\s+/g, '');
  if (!/^\d{12,13}$/.test(s)) return null;
  const body = s.slice(0, 12);
  const check = ean13CheckDigit(body);
  if (s.length === 13 && s[12] !== check) return null;
  return body + check;
}

// Start guard 101, left digits, centre guard 01010, right digits, end guard 101.
export function ean13Modules(code) {
  const c = normaliseEan13(code);
  if (!c) return null;
  const pattern = PARITY[Number(c[0])];
  let bits = '101';
  for (let i = 0; i < 6; i++) bits += pattern[i] === 'L' ? L[Number(c[i + 1])] : G[Number(c[i + 1])];
  bits += '01010';
  for (let i = 7; i < 13; i++) bits += R[Number(c[i])];
  bits += '101';
  return { code: c, bits: [...bits].map(Number) };
}

// SVG barcode with the human-readable digits underneath. height: a number of CSS px, or 'fill' to take the
// whole box (the SVG keeps its proportions and is centred). The viewBox is about 1.7:1, as on printed EAN codes.
export function ean13Svg(code, { height = 'fill', color = '#000' } = {}) {
  const m = ean13Modules(code);
  if (!m) return '<div class="small text-danger">Invalid barcode</div>';
  const isGuard = (i) => i < 3 || (i >= 45 && i < 50) || i >= 92;
  const rects = [];
  for (let i = 0; i < 95;) {
    if (!m.bits[i]) { i++; continue; }
    let j = i;
    while (j < 95 && m.bits[j]) j++;
    // Guard bars run lower than the bars, as on printed EAN codes.
    rects.push(`<rect x="${i + 10}" y="0" width="${j - i}" height="${isGuard(i) ? 56 : 50}"/>`);
    i = j;
  }
  const text = (x, t, anchor = 'middle') => `<text x="${x}" y="66" font-size="10" font-family="monospace" text-anchor="${anchor}" fill="${color}">${t}</text>`;
  const digits = text(3, m.code[0], 'start') + text(34, m.code.slice(1, 7)) + text(81, m.code.slice(7));
  const size = height === 'fill' ? 'width:100%;height:100%' : `height:${height}px;width:100%`;
  return `<svg class="ean" viewBox="0 0 115 68" preserveAspectRatio="xMidYMid meet" style="${size}" role="img" aria-label="Barcode ${m.code}"><g fill="${color}">${rects.join('')}</g>${digits}</svg>`;
}

// TSPL BARCODE command (203 dpi label printers, 8 dots per mm). Returns '' for an invalid code.
export function tsplEan13(x, y, code, { height = 60, narrow = 2 } = {}) {
  const c = normaliseEan13(code);
  if (!c) return '';
  return `BARCODE ${x},${y},"EAN13",${height},1,0,${narrow},${narrow * 2},"${c}"`;
}
