// Garment label model. One list of text lines drives both outputs:
//  - HTML/CSS for the on-screen preview and browser printing (any printer, exact label size)
//  - TSPL commands for thermal label printers (sent over Bluetooth or RawBT)
// Layout: a top row (product text on the left, price on the right) and the barcode filling the rest.
import { esc, fmtNum } from '../core/utils.js';
import { getSettings } from '../core/settings.js';
import { normaliseEan13, ean13Svg, tsplEan13 } from './barcode.js';
import { asciiSafe } from './escpos.js';
import { sectionName } from '../garment/presets.js';

export const DEFAULT_LABEL = {
  size: '50x25', w: 50, h: 25, scale: 100, border: true, shopName: '', copies: 1,
  fields: { shop: true, brand: false, style: true, gender: false, color: true, size: true, sku: false, price: true, barcode: true },
};

// Font size (pt) of each line kind at 100 % scale.
const FONT = { small: 6, name: 8.5, meta: 7.5, price: 10.5 };

// Settings-level label template merged over the defaults.
export function labelTemplate() {
  const s = getSettings().labels || {};
  return {
    ...DEFAULT_LABEL, ...s,
    shopName: s.shopName ?? getSettings().business.name,
    fields: { ...DEFAULT_LABEL.fields, ...(s.fields || {}) },
  };
}

// Price without decimals when whole (typical for garment tags), otherwise two decimals.
export function fmtPrice(n) {
  const v = Number(n) || 0;
  return Number.isInteger(v) ? v.toLocaleString('en-US') : fmtNum(v);
}

// Text lines for one product, in print order. The same lines are used for preview and TSPL output.
// Separators are ASCII so the TSPL output stays printable.
export function labelLines(p, tpl) {
  const f = tpl.fields;
  const cur = getSettings().currency;
  const out = [];
  const head = [f.brand && p.brand, f.shop && tpl.shopName].filter(Boolean).join(' / ');
  if (head) out.push({ kind: 'small', text: head });
  if (f.style) out.push({ kind: 'name', text: p.styleName || p.name });
  const meta = [f.gender && sectionName(p.gender), f.color && p.color, f.size && p.size].filter(Boolean).join(' / ');
  if (meta) out.push({ kind: 'meta', text: meta });
  if (f.sku && p.sku) out.push({ kind: 'small', text: 'SKU ' + p.sku });
  if (f.price) out.push({ kind: 'price', text: `${cur} ${fmtPrice(p.salePrice)}` });
  return out;
}

const showBarcode = (p, tpl) => tpl.fields.barcode && normaliseEan13(p.barcode);

// One label as HTML. The size is in millimetres, so the preview and the printed label match.
export function labelHTML(p, tpl = labelTemplate()) {
  const k = (Number(tpl.scale) || 100) / 100;
  const lines = labelLines(p, tpl);
  const info = lines.filter((l) => l.kind !== 'price')
    .map((l) => `<div class="lbl-${l.kind}" style="font-size:${(FONT[l.kind] * k).toFixed(2)}pt">${esc(l.text)}</div>`).join('');
  const price = lines.filter((l) => l.kind === 'price')
    .map((l) => `<div class="lbl-price" style="font-size:${(FONT.price * k).toFixed(2)}pt">${esc(l.text)}</div>`).join('');
  const bc = showBarcode(p, tpl) ? `<div class="lbl-bc">${ean13Svg(p.barcode)}</div>` : '';
  return `<div class="lbl ${tpl.border ? 'lbl-b' : ''}" style="width:${tpl.w}mm;height:${tpl.h}mm">
    <div class="lbl-top"><div class="lbl-info">${info}</div>${price ? `<div class="lbl-prices">${price}</div>` : ''}</div>${bc}</div>`;
}

// Print sheet: one page per label, with copies expanded. items = [{ product, copies }].
export function labelSheetHTML(items, tpl = labelTemplate()) {
  const pages = [];
  for (const { product, copies } of items) {
    for (let i = 0; i < Math.max(1, Math.min(999, copies || 1)); i++) pages.push(`<div class="lbl-page">${labelHTML(product, tpl)}</div>`);
  }
  return pages.join('');
}

// TSPL program for a thermal label printer (203 dpi = 8 dots per mm). ASCII only; other characters become "?".
const dots = (mm) => Math.round(mm * 8);
const CHAR_W = { 1: 8, 2: 12, 3: 16 }; // TSPL built-in font cell widths in dots
const CHAR_H = { 1: 12, 2: 20, 3: 24 };
export function labelTSPL(items, tpl = labelTemplate()) {
  const W = dots(tpl.w); const H = dots(tpl.h);
  const cmds = [`SIZE ${tpl.w} mm,${tpl.h} mm`, 'GAP 2 mm,0 mm', 'DIRECTION 1', 'REFERENCE 0,0', 'OFFSET 0 mm', 'SPEED 4', 'DENSITY 8'];
  const clean = (s) => asciiSafe(s).replace(/"/g, "'");
  const pad = 8;
  const k = (Number(tpl.scale) || 100) / 100;
  for (const { product, copies } of items) {
    const lines = labelLines(product, tpl);
    const info = lines.filter((l) => l.kind !== 'price');
    const prices = lines.filter((l) => l.kind === 'price');
    // Price on the right of the top row, in the largest font that fits, then the info column gets the rest.
    let priceFont = '3'; let priceText = prices.map((l) => clean(l.text)).join(' ');
    if (priceText.length * CHAR_W[3] > W * 0.45) priceFont = '2';
    const priceW = priceText.length * CHAR_W[priceFont];
    const infoW = W - 2 * pad - (priceText ? priceW + 6 : 0);
    for (let c = 0; c < Math.max(1, Math.min(999, copies || 1)); c++) {
      const block = ['CLS'];
      if (tpl.border) block.push(`BOX 2,2,${W - 2},${H - 2},2`);
      let y = 6;
      for (const l of info) {
        // Step the font down for long names, then truncate, so text never runs into the price.
        let font = { small: '1', name: '3', meta: '2' }[l.kind];
        let text = clean(l.text);
        if (font === '3' && text.length * CHAR_W[3] > infoW) font = '2';
        const fits = Math.max(4, Math.floor(infoW / CHAR_W[font]));
        if (text.length > fits) text = text.slice(0, fits);
        block.push(`TEXT ${pad},${y},"${font}",0,1,1,"${text}"`);
        y += Math.round((CHAR_H[font] + 4) * k);
      }
      if (priceText) block.push(`TEXT ${W - pad - priceW},6,"${priceFont}",0,1,1,"${priceText}"`);
      const bcCode = showBarcode(product, tpl) ? normaliseEan13(product.barcode) : null;
      if (bcCode) {
        const narrow = 2;
        const bcW = 95 * narrow;
        const bx = Math.max(pad, Math.round((W - bcW) / 2));
        const bcH = Math.max(40, H - y - 24);
        block.push(tsplEan13(bx, y + 2, bcCode, { height: bcH, narrow }));
      }
      block.push('PRINT 1,1');
      cmds.push(...block);
    }
  }
  return new TextEncoder().encode(cmds.join('\r\n') + '\r\n');
}

// CSS for label pages (used by the preview and the print sheet). Kept here so both always match.
export const LABEL_CSS = `
.lbl { position: relative; overflow: hidden; background: #fff; color: #111; font-family: 'Inter Variable', Arial, sans-serif; padding: 1.2mm 1.6mm; display: flex; flex-direction: column; box-sizing: border-box; line-height: 1.15; }
.lbl-b { outline: .25mm dashed #c7cbd6; outline-offset: -.25mm; }
.lbl-top { flex: 0 0 auto; display: flex; align-items: flex-start; justify-content: space-between; gap: 1.5mm; }
.lbl-info { flex: 1 1 auto; min-width: 0; }
.lbl-prices { flex: 0 0 auto; text-align: right; white-space: nowrap; }
.lbl-small { color: #4b5563; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.lbl-name { font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.lbl-meta { color: #374151; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.lbl-price { font-weight: 900; letter-spacing: -.01em; }
.lbl-bc { flex: 1 1 0; min-height: 0; margin-top: .8mm; }
.lbl-bc svg { display: block; }
.lbl-page { width: auto; break-inside: avoid; }
@media print {
  .lbl-page { page-break-after: always; break-after: page; }
  .lbl-page:last-child { page-break-after: auto; break-after: auto; }
  .lbl { outline: none !important; }
}`;
