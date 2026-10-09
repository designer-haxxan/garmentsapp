// Garment wizard: one style (e.g. "Embroidered Lawn Suit") with many colours and sizes.
// Creates every colour × size variant in one save, each with its own SKU and EAN-13 barcode.
import * as UI from '../core/ui.js';
import { esc, num, AppError } from '../core/utils.js';
import * as Catalog from '../services/catalog.js';
import * as Posting from '../services/posting.js';
import { ean13CheckDigit } from '../printer/barcode.js';
import { SECTION_LIST, GARMENT_TYPES, SIZE_PRESETS, WAIST_SIZES, COLORS, typeCode } from '../garment/presets.js';

const MAX_VARIANTS = 300;
const splitList = (s) => String(s || '').split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
// Case-insensitive de-duplication that keeps the first spelling.
function uniqueList(list) {
  const seen = new Map();
  for (const v of list) if (!seen.has(v.toLowerCase())) seen.set(v.toLowerCase(), v);
  return [...seen.values()];
}
const codePart = (s, n) => String(s).replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, n);

// In-store EAN-13 codes (2 prefix, the same range the product form generates), unique in the catalogue and the batch.
function newBarcodes(n) {
  const out = []; const taken = new Set();
  let guard = 0;
  while (out.length < n && guard++ < n * 50) {
    const body = '2' + Array.from(crypto.getRandomValues(new Uint8Array(11)), (b) => b % 10).join('');
    const code = body + ean13CheckDigit(body);
    if (!taken.has(code) && !Catalog.findByCode(code)) { taken.add(code); out.push(code); }
  }
  if (out.length < n) throw new AppError('Could not create unique barcodes. Try again.');
  return out;
}

// Style code not used by any existing SKU, e.g. "SK382" for a Shalwar Kameez.
function autoStyleCode(type) {
  const used = new Set(Catalog.allProducts().map((p) => (p.sku || '').toUpperCase()));
  const base = typeCode(type);
  for (let n = 100; n < 1000; n++) {
    const code = `${base}${n}`;
    if (![...used].some((s) => s === code || s.startsWith(code + '-'))) return code;
  }
  return `${base}${Date.now().toString(36).toUpperCase()}`;
}

async function ensureCategory(name) {
  const clean = String(name || '').trim();
  if (!clean) return '';
  const found = Catalog.allCategories().find((c) => c.name.toLowerCase() === clean.toLowerCase());
  return found ? found.id : Posting.saveCategory({ name: clean });
}

const sizeChips = (sizes, selected) => sizes.map((s) => `
  <input type="checkbox" class="btn-check f-size-chk" id="sz-${esc(s)}" value="${esc(s)}" ${selected.has(s) ? 'checked' : ''}>
  <label class="btn btn-sm btn-outline-secondary size-chip" for="sz-${esc(s)}">${esc(s)}</label>`).join('');

const colorChips = (selected) => COLORS.map((c, i) => `
  <input type="checkbox" class="btn-check f-color-chk" id="cl-${i}" value="${esc(c.name)}" ${selected.has(c.name) ? 'checked' : ''}>
  <label class="color-chip" for="cl-${i}"><span class="swatch" style="background:${c.hex}"></span>${esc(c.name)}</label>`).join('');

export function openGarmentWizard() {
  const sel = { colors: new Set(), sizes: new Set(), waist: false };
  return UI.formModal({
    title: 'New garment style', size: 'lg', submitLabel: 'Create variants',
    body: `<div class="garment-form">
      <div class="section-cards mb-3">${SECTION_LIST.map((s, i) => `
        <input type="radio" class="btn-check" name="gender" id="gs-${s.id}" value="${s.id}" ${i === 0 ? 'checked' : ''}>
        <label class="section-card sec-${s.id}" for="gs-${s.id}"><span class="sec-icon"></span><span class="sec-name">${esc(s.name)}</span></label>`).join('')}</div>
      <div class="row g-2">
        <div class="col-md-6"><label class="form-label">Garment type</label>
          <input name="type" class="form-control f-type" list="garment-types" value="Shalwar Kameez" autocomplete="off"><datalist id="garment-types">${GARMENT_TYPES.map((t) => `<option value="${esc(t)}">`).join('')}</datalist></div>
        <div class="col-md-6"><label class="form-label">Style name *</label>
          <input name="styleName" class="form-control" required maxlength="120" placeholder="e.g. Embroidered Lawn Suit"></div>
        <div class="col-md-6"><label class="form-label">Brand</label><input name="brand" class="form-control" maxlength="60"></div>
        <div class="col-md-6"><label class="form-label">Style code</label><input name="styleCode" class="form-control text-uppercase" maxlength="20" placeholder="Auto (e.g. SK382)"></div>
        <div class="col-4"><label class="form-label">Cost price</label><input name="purchasePrice" class="form-control" inputmode="decimal"></div>
        <div class="col-4"><label class="form-label">Sale price *</label><input name="salePrice" class="form-control" inputmode="decimal" required></div>
        <div class="col-4"><label class="form-label">Wholesale</label><input name="wholesalePrice" class="form-control" inputmode="decimal"></div>
        <div class="col-12 mt-3"><div class="d-flex justify-content-between align-items-center mb-1"><label class="form-label mb-0">Colours *</label><span class="small text-body-secondary sel-colors">0 selected</span></div>
          <div class="color-grid">${colorChips(sel.colors)}</div>
          <input name="customColors" class="form-control form-control-sm mt-2" placeholder="Other colours, comma separated (e.g. Teal, Rust)"></div>
        <div class="col-12 mt-3"><div class="d-flex justify-content-between align-items-center mb-1"><label class="form-label mb-0">Sizes *</label>
          <button type="button" class="btn btn-link btn-sm p-0 btn-waist">Waist sizes</button></div>
          <div class="size-grid"></div>
          <input name="customSizes" class="form-control form-control-sm mt-2" placeholder="Other sizes, comma separated (e.g. 5Y, 6Y, 7Y)"></div>
        <div class="col-6 mt-2"><label class="form-label">Opening stock per variant</label><input name="openingStock" class="form-control" inputmode="decimal" value="0"></div>
        <div class="col-12 mt-3"><div class="alert alert-info py-2 small mb-0 variant-count"></div></div>
      </div></div>`,
    onShown: ($m) => {
      const gender = () => $m.find('input[name=gender]:checked').val() || 'kids';
      const presetSizes = () => (sel.waist ? WAIST_SIZES : SIZE_PRESETS[gender()]);
      const drawSizes = () => {
        $m.find('.size-grid').html(sizeChips(presetSizes(), sel.sizes));
        $m.find('.btn-waist').text(sel.waist ? 'Clothing sizes' : 'Waist sizes (trousers)');
        drawCount();
      };
      const readSel = () => {
        sel.colors = new Set($m.find('.f-color-chk:checked').map((_, el) => el.value).get());
        sel.sizes = new Set($m.find('.f-size-chk:checked').map((_, el) => el.value).get());
      };
      const drawCount = () => {
        readSel();
        $m.find('.sel-colors').text(`${sel.colors.size} selected`);
        const c = uniqueList([...sel.colors, ...splitList($m.find('[name=customColors]').val())]).length;
        const s = uniqueList([...sel.sizes, ...splitList($m.find('[name=customSizes]').val())]).length;
        $m.find('.variant-count').html(c && s ? `This creates <b>${c * s}</b> variant(s): ${c} colour(s) × ${s} size(s), each with its own barcode.` : 'Choose colours and sizes to see how many variants will be created.');
      };
      // Default to waist sizes for trousers, jeans and shorts.
      const setWaistFromType = () => { if (!sel.waist && /trouser|jeans|short/i.test($m.find('.f-type').val())) sel.waist = true; };
      setWaistFromType();
      drawSizes();
      $m.on('change', 'input[name=gender]', () => { sel.sizes.clear(); drawSizes(); });
      $m.on('change', '.f-type', () => { setWaistFromType(); drawSizes(); });
      $m.on('change', '.f-color-chk, .f-size-chk', drawCount);
      $m.on('input', '[name=customColors], [name=customSizes]', drawCount);
      $m.on('click', '.btn-waist', () => { readSel(); sel.waist = !sel.waist; sel.sizes.clear(); drawSizes(); });
      $m.find('[name=styleName]').trigger('focus');
    },
    onSubmit: async (v, $m) => {
      const styleName = String(v.styleName || '').trim();
      if (!styleName) throw new AppError('Enter a style name.');
      const salePrice = num(v.salePrice, NaN);
      if (!(salePrice >= 0)) throw new AppError('Enter a valid sale price.');
      const colors = uniqueList([...$m.find('.f-color-chk:checked').map((_, el) => el.value).get(), ...splitList(v.customColors)]);
      const sizes = uniqueList([...$m.find('.f-size-chk:checked').map((_, el) => el.value).get(), ...splitList(v.customSizes)]);
      if (!colors.length) throw new AppError('Choose at least one colour.');
      if (!sizes.length) throw new AppError('Choose at least one size.');
      const count = colors.length * sizes.length;
      if (count > MAX_VARIANTS) throw new AppError(`At most ${MAX_VARIANTS} variants at once. Create this style in two parts.`);

      const type = String(v.type || '').trim();
      const code = codePart(String(v.styleCode || '').trim() || autoStyleCode(type), 20) || autoStyleCode(type);
      const categoryId = await ensureCategory(type);
      const barcodes = newBarcodes(count);
      const usedSkus = new Set(Catalog.allProducts().map((p) => (p.sku || '').toUpperCase()).filter(Boolean));
      const openingStock = num(v.openingStock, 0);
      const variants = [];
      let i = 0;
      for (const color of colors) for (const size of sizes) {
        const base = `${code}-${codePart(color, 3)}-${codePart(size, 6)}`;
        let sku = base; let n = 2;
        while (usedSkus.has(sku)) sku = `${base}-${n++}`;
        usedSkus.add(sku);
        variants.push({ color, size, sku, barcode: barcodes[i++], openingStock });
      }
      const recs = await Posting.saveGarment({
        styleName, gender: v.gender || 'kids', categoryId, brand: String(v.brand || '').trim(), unit: 'pcs', trackStock: true,
        salePrice, purchasePrice: num(v.purchasePrice, 0), wholesalePrice: num(v.wholesalePrice, 0),
      }, variants);
      UI.toast(`Created ${recs.length} variant(s) for ${styleName}`);
      return { styleId: recs[0].styleId, count: recs.length };
    },
  });
}
