// Label designer: choose a size and fields, see a live preview, build a print list and print.
// Route: #/labels, or #/labels/<productId>,<productId>… or #/labels/style:<styleId> (all colours and sizes).
import * as UI from '../core/ui.js';
import { esc, debounce } from '../core/utils.js';
import { saveSettings, getSettings } from '../core/settings.js';
import * as Catalog from '../services/catalog.js';
import * as Printer from '../printer/printer.js';
import { labelTemplate, labelHTML, labelSheetHTML, labelTSPL, LABEL_CSS, DEFAULT_LABEL, fmtPrice } from '../printer/label.js';
import { ean13CheckDigit } from '../printer/barcode.js';
import { LABEL_SIZES, SECTIONS } from '../garment/presets.js';

const $ = window.jQuery;
const MM = 3.7795; // CSS pixels per millimetre

// Sample tag for the preview when nothing is in the print list yet (the barcode is a valid EAN-13).
const SAMPLE_BARCODE = (() => { const b = '890000000001'; return b + ean13CheckDigit(b); })();
const SAMPLE = { id: 'sample', name: 'Printed Cotton Frock - Pink - 4Y', styleName: 'Printed Cotton Frock', brand: 'Bazaar',
  gender: 'kids', color: 'Pink', size: '4Y', sku: 'FRK-PNK-4Y', barcode: SAMPLE_BARCODE, salePrice: 1250 };
const FIELDS = [['shop', 'Shop name'], ['brand', 'Brand'], ['style', 'Style name'], ['gender', 'Section'], ['color', 'Colour'], ['size', 'Size'], ['sku', 'SKU'], ['price', 'Price'], ['barcode', 'Barcode']];

let $root = null; let tpl = null; let items = []; let saveTimer = null; let onResize = null;

// Injected once: the label styles must exist for the preview and the print sheet.
function ensureStyles() {
  if (document.getElementById('label-css')) return;
  const s = document.createElement('style');
  s.id = 'label-css';
  s.textContent = LABEL_CSS;
  document.head.appendChild(s);
}

const sizeOf = (id) => LABEL_SIZES.find((s) => s.id === id) || LABEL_SIZES[0];
const printList = () => items.map((i) => ({ product: Catalog.product(i.id), copies: i.copies })).filter((i) => i.product);
const labelCount = () => printList().reduce((n, i) => n + (Number(i.copies) || 1), 0);

function layout() {
  const isCustom = tpl.size === 'custom';
  const sizeOpts = LABEL_SIZES.map((s) => `<option value="${s.id}" ${s.id === tpl.size ? 'selected' : ''}>${esc(s.name)}</option>`).join('');
  const method = getSettings().printer.method;
  const hint = method === 'browser'
    ? 'Browser print: in the print dialog pick your label printer, set the paper size to the label size and scale to 100% with no margins.'
    : 'Sends TSPL label commands to a Bluetooth or RawBT label printer (TSC, Xprinter, Gprinter and similar). Connect the printer in Settings → Printer.';
  return `<div class="lbl-designer">
    <div class="lbl-grid">
      <section class="panel design-panel">
        <div class="panel-title"><i class="bi bi-sliders"></i> Label design</div>
        <div class="row g-2">
          <div class="col-12"><label class="form-label">Label size</label><select class="form-select f-size">${sizeOpts}</select></div>
          <div class="col-6 ${isCustom ? '' : 'd-none'} custom-size"><label class="form-label">Width (mm)</label><input type="number" min="15" max="120" class="form-control f-w" value="${tpl.w}"></div>
          <div class="col-6 ${isCustom ? '' : 'd-none'} custom-size"><label class="form-label">Height (mm)</label><input type="number" min="10" max="100" class="form-control f-h" value="${tpl.h}"></div>
          <div class="col-12"><label class="form-label">Shop name</label><input class="form-control f-shopname" maxlength="40" value="${esc(tpl.shopName)}" placeholder="${esc(getSettings().business.name)}"></div>
          <div class="col-12"><label class="form-label d-flex justify-content-between">Text size <span class="small text-body-secondary scale-v">${tpl.scale}%</span></label>
            <input type="range" class="form-range f-scale" min="70" max="140" step="5" value="${tpl.scale}"></div>
          <div class="col-12"><label class="form-label">Show on label</label>
            <div class="field-toggles">${FIELDS.map(([k, label]) => `<input type="checkbox" class="btn-check f-field" id="lf-${k}" data-f="${k}" ${tpl.fields[k] ? 'checked' : ''}><label class="btn btn-sm btn-outline-primary" for="lf-${k}">${label}</label>`).join('')}</div></div>
          <div class="col-12"><div class="form-check form-switch"><input class="form-check-input f-border" type="checkbox" id="lf-border" ${tpl.border ? 'checked' : ''}><label class="form-check-label" for="lf-border">Dashed cut line around label</label></div></div>
        </div>
      </section>

      <section class="panel preview-panel">
        <div class="panel-title d-flex justify-content-between align-items-center"><span><i class="bi bi-eye"></i> Live preview</span><span class="small text-body-secondary">${tpl.w} × ${tpl.h} mm</span></div>
        <div class="preview-wrap"><div class="preview-inner"></div></div>
        <div class="small text-body-secondary text-center mt-2">${items.length ? 'Showing the first product in your print list' : 'Sample tag, add products below to print them'}</div>
      </section>

      <section class="panel list-panel">
        <div class="panel-title d-flex justify-content-between align-items-center"><span><i class="bi bi-list-check"></i> Print list</span><span class="badge text-bg-primary rounded-pill total-count">${labelCount()} label(s)</span></div>
        <div class="input-group mb-2"><span class="input-group-text"><i class="bi bi-search"></i></span>
          <input type="search" class="form-control lq" placeholder="Search product, style, colour, barcode…" autocomplete="off"></div>
        <div class="lq-results mb-2"></div>
        <div class="print-items"></div>
        <div class="d-flex flex-wrap gap-2 mt-3 align-items-center">
          <button class="btn btn-primary btn-print flex-grow-1 flex-md-grow-0"><i class="bi bi-printer me-1"></i>Print labels</button>
          <button class="btn btn-outline-secondary btn-clear-list"><i class="bi bi-x-circle me-1"></i>Clear list</button>
        </div>
        <div class="small text-body-secondary mt-2">${esc(hint)}</div>
      </section>
    </div>
  </div>`;
}

// Live preview: the real label HTML, scaled to fit the panel width.
function drawPreview() {
  const list = printList();
  const sample = list[0]?.product || SAMPLE;
  const $inner = $root.find('.preview-inner');
  $inner.html(labelHTML(sample, tpl)).css({ transform: 'none' });
  fitPreview();
}

function fitPreview() {
  const wrap = $root.find('.preview-wrap')[0];
  if (!wrap) return;
  const natural = tpl.w * MM;
  const avail = Math.max(120, wrap.clientWidth - 16);
  const s = Math.min(3, avail / natural);
  $root.find('.preview-inner').css({ transform: `scale(${s})`, transformOrigin: 'top center' });
  wrap.style.height = `${Math.ceil(tpl.h * MM * s) + 16}px`;
}

function drawItems() {
  const list = printList();
  $root.find('.print-items').html(list.length ? list.map(({ product: p, copies }) => `
    <div class="print-row" data-id="${esc(p.id)}">
      <div class="main"><div class="title">${esc(p.styleName || p.name)}</div>
        <div class="sub">${esc([p.color, p.size, p.sku].filter(Boolean).join(' · ') || p.name)}${p.barcode ? '' : ' · <span class="text-danger">no barcode</span>'}</div></div>
      <input type="number" min="1" max="999" class="form-control form-control-sm copies" value="${copies}" aria-label="Copies">
      <button class="btn btn-sm btn-light btn-remove" aria-label="Remove"><i class="bi bi-x-lg"></i></button>
    </div>`).join('') : `<div class="empty-mini"><i class="bi bi-tags"></i><span>Search and add products or a whole style to print.</span></div>`);
  $root.find('.total-count').text(`${labelCount()} label(s)`);
}

function addItem(id, copies = 1) {
  const p = Catalog.product(id);
  if (!p) return false;
  const existing = items.find((i) => i.id === id);
  if (existing) existing.copies = Math.min(999, existing.copies + copies);
  else items.push({ id, copies });
  return true;
}

function addStyle(styleId) {
  const variants = Catalog.allProducts().filter((p) => p.styleId === styleId && p.active);
  variants.forEach((p) => addItem(p.id));
  return variants.length;
}

function saveTemplate() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveSettings({ labels: tpl }), 250);
}

function refresh() {
  drawPreview();
  drawItems();
}

function bind() {
  $root.on('change', '.f-size', function () {
    const s = sizeOf(this.value);
    tpl.size = s.id;
    if (s.id !== 'custom') { tpl.w = s.w; tpl.h = s.h; }
    $root.find('.custom-size').toggleClass('d-none', s.id !== 'custom');
    $root.find('.f-w').val(tpl.w); $root.find('.f-h').val(tpl.h);
    $root.find('.preview-panel .panel-title span:last-child').text(`${tpl.w} × ${tpl.h} mm`);
    saveTemplate(); refresh();
  });
  $root.on('input change', '.f-w, .f-h', debounce(function () {
    tpl.w = Math.min(120, Math.max(15, Number($root.find('.f-w').val()) || 50));
    tpl.h = Math.min(100, Math.max(10, Number($root.find('.f-h').val()) || 25));
    $root.find('.preview-panel .panel-title span:last-child').text(`${tpl.w} × ${tpl.h} mm`);
    saveTemplate(); refresh();
  }, 200));
  $root.on('input', '.f-shopname', debounce(function () { tpl.shopName = this.value.trim(); saveTemplate(); drawPreview(); }, 150));
  $root.on('input', '.f-scale', function () { tpl.scale = Number(this.value); $root.find('.scale-v').text(`${tpl.scale}%`); saveTemplate(); drawPreview(); });
  $root.on('change', '.f-field', function () { tpl.fields[this.dataset.f] = this.checked; saveTemplate(); drawPreview(); });
  $root.on('change', '.f-border', function () { tpl.border = this.checked; saveTemplate(); drawPreview(); });

  $root.on('input', '.lq', debounce(function () {
    const q = this.value.trim();
    const $r = $root.find('.lq-results');
    if (!q) return $r.empty();
    const found = Catalog.searchProducts(q, { limit: 12 });
    $r.html(found.length ? found.map((p) => `
      <div class="list-row lq-row">
        <div class="main"><div class="title">${esc(p.styleName || p.name)}</div><div class="sub">${esc([p.color, p.size, p.sku, p.barcode].filter(Boolean).join(' · '))}</div></div>
        ${p.styleId ? `<button class="btn btn-sm btn-outline-primary btn-add-style" data-style="${esc(p.styleId)}" title="Add every colour and size"><i class="bi bi-collection"></i></button>` : ''}
        <button class="btn btn-sm btn-primary btn-add" data-id="${esc(p.id)}" aria-label="Add"><i class="bi bi-plus-lg"></i></button>
      </div>`).join('') : '<div class="small text-body-secondary p-2">No products match.</div>');
  }, 120));
  $root.on('click', '.btn-add', function () { if (addItem(this.dataset.id)) refresh(); });
  $root.on('click', '.btn-add-style', function () {
    const n = addStyle(this.dataset.style);
    UI.toast(`Added ${n} variant(s)`, 'success', 1800);
    refresh();
  });
  $root.on('change', '.copies', function () {
    const id = $(this).closest('.print-row').attr('data-id');
    const it = items.find((i) => i.id === id);
    if (it) it.copies = Math.min(999, Math.max(1, Math.round(Number(this.value) || 1)));
    this.value = it?.copies ?? 1;
    drawItems(); drawPreview();
  });
  $root.on('click', '.btn-remove', function () {
    const id = $(this).closest('.print-row').attr('data-id');
    items = items.filter((i) => i.id !== id);
    refresh();
  });
  $root.on('click', '.btn-clear-list', async () => {
    if (!items.length) return;
    if (!await UI.confirmDialog('Remove all products from the print list?', { okLabel: 'Clear', okClass: 'btn-danger' })) return;
    items = []; refresh();
  });
  $root.on('click', '.btn-print', async () => {
    const list = printList();
    if (!list.length) return UI.toast('Add products to the print list first.', 'warning');
    const missing = list.filter((i) => !i.product.barcode).length;
    if (missing && !await UI.confirmDialog(`${missing} product(s) have no barcode. Their labels will print without one. Continue?`, { okLabel: 'Print anyway' })) return;
    try {
      await Printer.printLabels({
        html: () => labelSheetHTML(list, tpl),
        tspl: () => labelTSPL(list, tpl),
        w: tpl.w, h: tpl.h,
      });
    } catch (e) { UI.toastError(e); }
  });
}

// Route params: product ids separated by commas, or style:<styleId> to add every colour and size of a garment.
function preload(params) {
  items = [];
  const raw = params?.[0] || ''; // the router has already decoded the route segment
  for (const part of raw.split(',').filter(Boolean)) {
    if (part.startsWith('style:')) addStyle(part.slice(6));
    else addItem(part);
  }
}

export default {
  async render(el, { params = [] } = {}) {
    ensureStyles();
    tpl = labelTemplate();
    preload(params);
    $root = $(el).off();
    $root.html(UI.pageHeader('Label designer', '', null) + layout());
    bind();
    refresh();
    onResize = debounce(fitPreview, 120);
    $(window).on('resize', onResize);
  },
  destroy() {
    if (onResize) $(window).off('resize', onResize);
    clearTimeout(saveTimer);
    if (tpl) saveSettings({ labels: tpl });
    onResize = null;
  },
};
