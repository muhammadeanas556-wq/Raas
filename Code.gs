/**
 * RAAS website orders -> Google Sheets ("Orders" tab).
 * Paste this over the old Code.gs in Extensions > Apps Script of your RAAS sheet, then
 * Deploy > Manage deployments > (pencil) Edit > Version: New version > Deploy.
 * Editing the SAME deployment keeps the same web-app URL, so the website needs no change.
 *
 * One row per product in the order. Columns are found by their HEADER NAME, so you can move
 * columns around. Missing columns are added automatically at the right of the Orders tab.
 *
 * Prices (all in PKR):
 *   Original Product Price (per unit)     price of ONE piece before any discount
 *   Discounted Product Price (per unit)   price of ONE piece after the product discount (= original if no discount)
 *   Quantity                              pieces of this product
 *   Total Before Coupon                   discounted price x quantity (formula)
 *   Coupon Discount Amount                the coupon money taken off THIS row (0 when no coupon)
 *   Final Price After Coupon              Total Before Coupon - Coupon Discount Amount (this row, all pieces)
 *   Delivery Charge / Final Order Amount  whole order (all products - coupon + delivery); only on the FIRST row of each order
 */

const SECRET = "raas25.netlify.app";   // must be identical to SHEET_SECRET in the website's index.html
const SPREADSHEET_ID = "";             // leave empty when this script is attached to the sheet (Extensions > Apps Script)
const ORDERS_TAB = "Orders";
const PRODUCTS_TAB = "Products";
const LAYOUT_VERSION = "2";            // bump to re-run the one-time sheet upgrade

const MONEY = '"Rs "#,##0;[Red]-"Rs "#,##0;"Rs 0"';
/* k: internal key, h: header written for a NEW column, a: other header names that mean the same column */
const COLS = [
  { k: "date",        h: "Order Date" },
  { k: "tracking",    h: "Tracking ID" },
  { k: "name",        h: "Client Name",              a: ["Customer Name"] },
  { k: "address",     h: "Address",                  a: ["Customer Address"] },
  { k: "phone",       h: "Phone Number",             a: ["Customer Phone Number", "Phone"] },
  { k: "product",     h: "Product Name" },
  { k: "wholesale",   h: "Product Wholesale Price",  a: ["Wholesale Price"] },
  { k: "discounted",  h: "Discounted Product Price (per unit)", a: ["Product Sale Price", "Discounted Product Price", "Sale Price"], money: true,
    note: "Price of ONE piece after the product discount. Same as the original price when the product has no discount." },
  { k: "qty",         h: "Quantity",                 a: ["Product Quantity"] },
  { k: "before",      h: "Total Before Coupon",      a: ["Total Amount"], money: true,
    note: "Discounted price x Quantity (calculates automatically)." },
  { k: "profit",      h: "Profit", money: true,
    note: "(Discounted price - Wholesale price) x Quantity - Coupon discount (calculates automatically)." },
  { k: "order_id",    h: "Order ID", note: "Website order number. An order with several products has one row per product." },
  { k: "size",        h: "Product Size",             a: ["Size"] },
  { k: "colour",      h: "Selected Product Color",   a: ["Selected Product Colour", "Product Color", "Product Colour", "Color", "Colour"] },
  { k: "original",    h: "Original Product Price (per unit)", a: ["Original Product Price", "Original Price"], money: true,
    note: "Price of ONE piece before any discount. Never overwritten by discounts or coupons." },
  { k: "coupon",      h: "Coupon Code", note: "Empty when no coupon was used." },
  { k: "coupon_disc", h: "Coupon Discount Amount", money: true,
    note: "Coupon money taken off THIS row (all pieces). 0 when no coupon was used or the coupon does not cover this product." },
  { k: "final",       h: "Final Price After Coupon", money: true,
    note: "Total Before Coupon - Coupon Discount Amount, for this row (all pieces)." },
  { k: "delivery",    h: "Delivery Charge", money: true, note: "Whole order. Shown on the first row of the order only." },
  { k: "order_total", h: "Final Order Amount", money: true,
    note: "What the customer pays for the WHOLE order: all products - coupon + delivery. Shown on the first row of the order only, so the column can be added up." },
];

function doGet() {
  return ContentService.createTextOutput("RAAS orders endpoint is running.");
}

function doPost(e) {
  let result;
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    if (body.secret !== SECRET) throw new Error("bad secret");
    result = writeOrder_(body);
  } catch (err) {
    console.error(err);
    result = { ok: false, error: String(err && err.message || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}

/* ---------- writing one order ---------- */
function writeOrder_(o) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const ss = book_();
    const sh = ss.getSheetByName(ORDERS_TAB);
    if (!sh) throw new Error('Tab "' + ORDERS_TAB + '" not found');
    upgradeOnce_(ss, sh);
    const L = ensureColumns_(sh);
    const c = L.map;

    const items = (Array.isArray(o.items) ? o.items : []).filter(Boolean);
    if (!items.length) throw new Error("order has no items");
    const orderId = clean_(o.order_id || "");

    // the same order sent twice (e.g. a retried request) is written only once
    if (orderId && c.order_id) {
      const ids = sh.getRange(2, c.order_id, Math.max(1, sh.getMaxRows() - 1), 1).getDisplayValues();
      if (ids.some(r => String(r[0]).trim() === orderId)) return { ok: true, duplicate: true };
    }

    const wholesale = wholesaleLookup_(ss);
    const when = o.date ? new Date(o.date) : new Date();
    const date = isNaN(when.getTime()) ? new Date() : when;
    const coupon = clean_(o.coupon || "");
    const orderDisc = num_(o.coupon_discount);
    const rows = items.map((it, n) => {
      const qty = Math.max(1, Math.round(num_(it.quantity) || 1));
      const disc = num_(it.discounted_price != null ? it.discounted_price : it.price);
      const orig = it.original_price != null && it.original_price !== "" ? num_(it.original_price) : disc;
      const lineTotal = it.line_total != null ? num_(it.line_total) : disc * qty;
      // coupon share of this row: sent by the website; old website versions only send the order total -> first row
      const share = it.coupon_discount != null ? num_(it.coupon_discount) : (n === 0 ? orderDisc : 0);
      const fin = it.final_price != null ? num_(it.final_price) : lineTotal - share;
      const name = String(it.product || it.name || "");
      return {
        date: date, name: clean_(o.name), address: clean_(o.address), phone: clean_(o.phone),
        product: clean_(name), wholesale: wholesale[norm_(name)], discounted: disc, qty: qty,
        order_id: orderId, size: clean_(it.size || ""), colour: clean_(it.colour || it.color || ""),
        original: orig, coupon: coupon, coupon_disc: share, final: fin,
        delivery: n === 0 ? num_(o.delivery) : "", order_total: n === 0 && o.total != null ? num_(o.total) : "",
      };
    });

    const start = nextRow_(sh, c);
    const need = start + rows.length - 1;
    if (need > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), need - sh.getMaxRows());
    // number formats first (a phone number like 0300... must stay text, rows below the prepared area have no format)
    if (c.phone) sh.getRange(start, c.phone, rows.length, 1).setNumberFormat("@");
    if (c.date) sh.getRange(start, c.date, rows.length, 1).setNumberFormat("dd-mmm-yyyy");
    COLS.filter(x => x.money && c[x.k]).forEach(x => sh.getRange(start, c[x.k], rows.length, 1).setNumberFormat(MONEY));
    if (c.wholesale) sh.getRange(start, c.wholesale, rows.length, 1).setNumberFormat(MONEY);
    const width = L.lastCol;
    const rng = sh.getRange(start, 1, rows.length, width);
    const oldF = rng.getFormulas(), oldV = rng.getValues();
    const out = rows.map((r, i) => {
      const row = oldV[i].map((v, j) => oldF[i][j] || v);   // keep anything already in the row (your own formulas)
      const put = (k, v) => { if (c[k] && v !== undefined) row[c[k] - 1] = v; };
      Object.keys(r).forEach(k => put(k, r[k]));
      const R = start + i;
      if (c.before && c.discounted && c.qty) put("before", formulaBefore_(c, R));
      if (c.profit && c.discounted && c.qty && c.wholesale) put("profit", formulaProfit_(c, R));
      return row;
    });
    rng.setValues(out);
    return { ok: true, rows: rows.length, firstRow: start };
  } finally {
    lock.releaseLock();
  }
}

/* ---------- sheet layout ---------- */
function book_() {
  return SPREADSHEET_ID ? SpreadsheetApp.openById(SPREADSHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
}
function norm_(s) { return String(s == null ? "" : s).toLowerCase().replace(/[^a-z0-9]/g, ""); }
function num_(v) { const n = Number(String(v == null ? "" : v).replace(/[^0-9.\-]/g, "")); return isFinite(n) ? n : 0; }
/* text typed by customers is always stored as plain text (a name like "=SUM(...)" never becomes a formula) */
function clean_(v) {
  const s = String(v == null ? "" : v).trim().slice(0, 500);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}
function letter_(col) { let s = ""; while (col > 0) { const m = (col - 1) % 26; s = String.fromCharCode(65 + m) + s; col = (col - m - 1) / 26; } return s; }
function formulaBefore_(c, r) {
  const D = letter_(c.discounted) + r, Q = letter_(c.qty) + r;
  return '=IF(OR(' + D + '="",' + Q + '=""),"",' + D + '*' + Q + ')';
}
function formulaProfit_(c, r) {
  const W = letter_(c.wholesale) + r, D = letter_(c.discounted) + r, Q = letter_(c.qty) + r;
  const cd = c.coupon_disc ? "-N(" + letter_(c.coupon_disc) + r + ")" : "";
  return '=IF(OR(' + W + '="",' + D + '="",' + Q + '=""),"",(' + D + '-' + W + ')*' + Q + cd + ')';
}

function readLayout_(sh) {
  const lastCol = Math.max(1, sh.getLastColumn());
  const hdr = sh.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
  const map = {};
  COLS.forEach(x => {
    const names = [x.h].concat(x.a || []).map(norm_);
    const i = hdr.findIndex(h => h && names.indexOf(norm_(h)) > -1);
    if (i > -1) map[x.k] = i + 1;
  });
  return { map: map, hdr: hdr, lastCol: lastCol };
}

/* adds every missing column (header only) at the right of the sheet */
function ensureColumns_(sh) {
  let L = readLayout_(sh);
  const missing = COLS.filter(x => !L.map[x.k]);
  if (!missing.length) return L;
  let col = L.hdr.reduce((m, h, i) => (String(h).trim() ? i + 1 : m), 0);   // last used header
  const need = col + missing.length;
  if (need > sh.getMaxColumns()) sh.insertColumnsAfter(sh.getMaxColumns(), need - sh.getMaxColumns());
  missing.forEach(x => {
    col++;
    const cell = sh.getRange(1, col);
    cell.setValue(x.h);
    sh.getRange(1, 1).copyFormatToRange(sh, col, col, 1, 1);
    if (x.note) cell.setNote(x.note);
    sh.setColumnWidth(col, Math.max(110, Math.min(260, x.h.length * 8 + 24)));
    if (x.money) sh.getRange(2, col, Math.max(1, sh.getMaxRows() - 1), 1).setNumberFormat(MONEY);
  });
  return readLayout_(sh);
}

/* first row after the last order (looks at the name / product / order id columns, not at the formula columns) */
function nextRow_(sh, c) {
  const n = Math.max(1, sh.getMaxRows() - 1);
  const keys = ["name", "product", "order_id"].filter(k => c[k]);
  let last = 1;
  keys.forEach(k => {
    const v = sh.getRange(2, c[k], n, 1).getDisplayValues();
    for (let i = v.length - 1; i >= 0; i--) if (String(v[i][0]).trim() !== "") { last = Math.max(last, i + 2); break; }
  });
  return last + 1;
}

/* Products tab: Product Name -> Wholesale Price */
function wholesaleLookup_(ss) {
  const out = {};
  const p = ss.getSheetByName(PRODUCTS_TAB);
  if (!p || p.getLastRow() < 2) return out;
  const v = p.getRange(1, 1, p.getLastRow(), Math.min(4, p.getLastColumn())).getValues();
  const h = v[0].map(norm_);
  const ni = h.indexOf("productname") > -1 ? h.indexOf("productname") : 0;
  const wi = h.indexOf("wholesaleprice") > -1 ? h.indexOf("wholesaleprice") : 1;
  for (let i = 1; i < v.length; i++) {
    const k = norm_(v[i][ni]);
    if (k && v[i][wi] !== "" && v[i][wi] != null && !(k in out)) out[k] = Number(v[i][wi]);
  }
  return out;
}

/* ---------- one-time upgrade of the existing sheet (runs automatically on the first order, or run setupOrderColumns) ---------- */
function setupOrderColumns() {
  const ss = book_(), sh = ss.getSheetByName(ORDERS_TAB);
  if (!sh) throw new Error('Tab "' + ORDERS_TAB + '" not found');
  PropertiesService.getScriptProperties().deleteProperty("RAAS_LAYOUT");
  upgradeOnce_(ss, sh);
  const L = readLayout_(sh);
  return COLS.map(x => x.h + " -> column " + (L.map[x.k] ? letter_(L.map[x.k]) : "?")).join("\n");
}

function upgradeOnce_(ss, sh) {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty("RAAS_LAYOUT") === LAYOUT_VERSION) return;
  let L = ensureColumns_(sh);
  const c = L.map, rows = Math.max(1, sh.getMaxRows() - 1);

  // clearer names for two existing columns (the website finds them by either name)
  [["discounted"], ["before"]].forEach(([k]) => {
    const x = COLS.filter(y => y.k === k)[0];
    if (c[k] && L.hdr[c[k] - 1] !== x.h) sh.getRange(1, c[k]).setValue(x.h);
  });
  COLS.forEach(x => { if (x.note && c[x.k]) sh.getRange(1, c[x.k]).setNote(x.note); });
  if (c.original) sh.getRange(2, c.original, rows, 1).setNumberFormat(MONEY);

  // Total Before Coupon + Profit formulas on every row (Profit now takes the coupon off)
  if (c.before && c.discounted && c.qty) {
    const f = []; for (let r = 2; r <= rows + 1; r++) f.push([formulaBefore_(c, r)]);
    sh.getRange(2, c.before, rows, 1).setFormulas(f);
  }
  if (c.profit && c.discounted && c.qty && c.wholesale) {
    const f = []; for (let r = 2; r <= rows + 1; r++) f.push([formulaProfit_(c, r)]);
    sh.getRange(2, c.profit, rows, 1).setFormulas(f);
  }

  // cosmetic parts below never stop an order from being written
  try { extendHighlight_(sh); } catch (e) { console.warn("highlight", e); }
  try { updateDashboard_(ss, c); } catch (e) { console.warn("dashboard", e); }
  try { updateGuide_(ss); } catch (e) { console.warn("guide", e); }
  props.setProperty("RAAS_LAYOUT", LAYOUT_VERSION);
}

/* the "missing Tracking ID" highlight also covers the new columns */
function extendHighlight_(sh) {
  const lastCol = readLayout_(sh).lastCol;
  const rules = sh.getConditionalFormatRules().map(r => {
    const rg = r.getRanges();
    if (rg.length === 1 && rg[0].getRow() === 2 && rg[0].getColumn() === 1 && rg[0].getNumColumns() > 1 && rg[0].getNumColumns() < lastCol)
      return r.copy().setRanges([sh.getRange(2, 1, rg[0].getNumRows(), lastCol)]).build();
    return r;
  });
  sh.setConditionalFormatRules(rules);
}

function updateDashboard_(ss, c) {
  const d = ss.getSheetByName("Dashboard");
  if (!d) return;
  const O = (k) => "Orders!" + letter_(c[k]) + "2:" + letter_(c[k]) + "1000";
  const labels = d.getRange(1, 2, Math.max(1, d.getLastRow()), 1).getDisplayValues().map(r => r[0]);
  const set = (label, newLabel, formula) => {
    const i = labels.indexOf(label);
    if (i > -1) { d.getRange(i + 1, 2).setValue(newLabel); d.getRange(i + 1, 3).setFormula(formula); }
  };
  // one order can have several rows: count website orders by their Order ID row (first row), plus older rows without an Order ID
  if (c.order_total && c.order_id && c.name)
    set("Total Orders", "Total Orders", "=COUNT(" + O("order_total") + ")+COUNTIFS(" + O("name") + ',"<>",' + O("order_id") + ',"")');
  // product sales after coupons (delivery not included); older rows without this column count their Total Before Coupon
  if (c.final && c.before) {
    const f = "=SUM(" + O("final") + ")+SUMIFS(" + O("before") + "," + O("final") + ',"")';
    set("Total Sales", "Total Sales (after coupons)", f);
    set("Total Sales (after coupons)", "Total Sales (after coupons)", f);
  }
  if (c.coupon_disc && labels.indexOf("Total Coupon Discounts") < 0) {
    let r = labels.length + 1;
    for (let i = 3; i < labels.length; i++) if (!labels[i]) { r = i + 1; break; }
    d.getRange(r, 2).setValue("Total Coupon Discounts");
    d.getRange(r, 3).setFormula("=SUM(" + O("coupon_disc") + ")").setNumberFormat(MONEY);
    d.getRange(4, 2, 1, 2).copyFormatToRange(d, 2, 3, r, r);
    d.getRange(r, 3).setNumberFormat(MONEY);
  }
}

function updateGuide_(ss) {
  const g = ss.getSheetByName("Guide");
  if (!g || String(g.getRange(1, 1).getValue()).trim() !== "HOW TO USE THIS SHEET") return;
  const t = [
    "1. Orders arrive automatically from your website into the 'Orders' tab: one row per product in the order.",
    "2. Type the courier Tracking ID yourself. Rows with no Tracking ID are highlighted yellow.",
    "3. Total Before Coupon and Profit calculate automatically - do not type in them.",
    "   Total Before Coupon = Discounted price x Quantity     Profit = (Discounted price - Wholesale price) x Quantity - Coupon discount",
    "4. Per piece: Original Product Price (per unit), Discounted Product Price (per unit). For the row (all pieces): Coupon Discount Amount, Final Price After Coupon.",
    "5. Delivery Charge and Final Order Amount are for the WHOLE order and appear only on its first row. Coupon Code is empty when no coupon was used.",
    "6. Add your products and wholesale prices in the 'Products' tab (blue cells). The wholesale price is copied into each new order row.",
    "7. Use the filter arrows in the header row to search by name, phone, date, size, colour, coupon or missing Tracking ID.",
    "8. Delete the grey SAMPLE row in Orders (row 2) before going live.",
    "9. Currency is shown as Rs (PKR). Change the format in Format > Number > Custom currency if needed.",
  ];
  if (g.getMaxRows() < 2 + t.length) g.insertRowsAfter(g.getMaxRows(), 2 + t.length - g.getMaxRows());
  g.getRange(3, 1, g.getMaxRows() - 2, 1).clearContent();
  g.getRange(3, 1, t.length, 1).setValues(t.map(x => [x]));
}

/* ---------- tests: run from the Apps Script editor, check the Orders tab, then delete the TEST rows ---------- */
function testOrderWithoutCoupon() {
  return writeOrder_({ order_id: "#TEST-A", name: "Test Customer", phone: "03001234567", address: "Test address, Lahore", coupon: "", coupon_discount: 0, delivery: 0, total: 4000,
    items: [{ product: "Test Kurta", colour: "Navy Blue", size: "M", quantity: 1, original_price: 5000, discounted_price: 4000, line_total: 4000, coupon_discount: 0, final_price: 4000 }] });
}
function testOrderWithCoupon() {
  return writeOrder_({ order_id: "#TEST-B", name: "Test Customer", phone: "03001234567", address: "Test address, Lahore", coupon: "SAVE500", coupon_discount: 500, delivery: 0, total: 3500,
    items: [{ product: "Test Kurta", colour: "Maroon", size: "L", quantity: 1, original_price: 5000, discounted_price: 4000, line_total: 4000, coupon_discount: 500, final_price: 3500 }] });
}
