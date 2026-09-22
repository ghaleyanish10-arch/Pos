/**
 * Shared receipt printing.
 *
 * Why this exists: printing was clipping long receipts. Two causes, both
 * fixed here:
 *
 *  1. The `#print-receipt` overlay path (purchase orders) relies on
 *     `@media print` overrides in index.css — see that file for the
 *     page-break + margin rules added for it.
 *
 *  2. The popup path (ManualPayment) used `window.open('width=420,
 *     height=640')` with no print margins and no page-break rules: a
 *     receipt taller than the popup viewport got scaled/cropped by the
 *     print dialog and rows crossing a page boundary were dropped.
 *
 * This builder emits a self-contained document with no fixed heights
 * anywhere, `@page` margins, and `page-break-inside: avoid` per row so a
 * long receipt flows onto a second page instead of being truncated.
 *
 * The receipt body is a fixed 300px column: that is exactly 80mm at 96dpi,
 * so an 80mm thermal printer (the common POS width) receives it 1:1 without
 * driver rescaling, and on A4 it prints as a centered slip. Item cells use
 * `overflow-wrap: anywhere` so long names wrap cleanly instead of being
 * truncated unpredictably by a printer driver.
 */

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const row = (a, b) =>
  `<tr><td>${esc(a)}</td><td style="text-align:right">${esc(b)}</td></tr>`;

/**
 * Build the full HTML document string for a receipt.
 * `r` shape (everything optional except items):
 *   { title, subtitle, subline, meta, items: [[label, amount], ...],
 *     ledger: [[label, amount], ...], total, paidBy, paidAt,
 *     footerLines: [..], thanks }
 * `settings` (optional): { businessName, address, city, phone, vatNo,
 *   currency, receiptFooter, receiptThanks } — when present the header block
 *   and closing lines come from the Restaurant/Receipts settings instead of
 *   hardcoded defaults.
 */
export function buildReceiptHtml(r, settings) {
  const s = settings || {};
  const brand = s.businessName || r.title || 'Mesa OS';
  const addrLine = [s.address, s.city].filter(Boolean).join(', ');
  const contact = [s.phone, s.vatNo ? `VAT ${s.vatNo}` : ''].filter(Boolean).join(' · ');
  const items = (r.items || []).map((l) => row(l[0], l[1])).join('');
  const ledger = (r.ledger || []).map((l) => row(l[0], l[1])).join('');
  const footer = (r.footerLines || []).map((l) => `<p>${esc(l)}</p>`).join('');
  const thanks = r.thanks || s.receiptThanks || s.receiptFooter || 'Thank you — see you again!';
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>Receipt · ${esc(brand)}</title>
    <style>
      /* No fixed heights anywhere — the document sizes to its content. */
      @page { margin: 8mm 10mm; }
      body { margin: 0; background: #fff; color: #000; font: 12px/1.45 'Courier New', Courier, monospace; }
      .rcpt { width: 300px; margin: 0 auto; padding: 12px 10px; }
      .rcpt h1 { margin: 0 0 2px; font-size: 16px; text-align: center; }
      .rcpt .sub { margin: 0; text-align: center; }
      .rcpt .dash { border-bottom: 1px dashed #000; margin: 8px 0; }
      .rcpt table { width: 100%; border-collapse: collapse; }
      .rcpt td { padding: 1px 0; vertical-align: top; overflow-wrap: anywhere; word-break: break-word; }
      .rcpt .tot td { font-size: 15px; font-weight: bold; }
      .rcpt .paid { border-top: 1px dashed #000; margin-top: 8px; padding-top: 6px; }
      .rcpt .foot { margin-top: 8px; text-align: center; }
      @media print {
        body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        /* Long receipts must flow onto extra pages, never drop rows. */
        .rcpt table { page-break-inside: auto; }
        .rcpt tr { page-break-inside: avoid; page-break-after: auto; }
        .rcpt .dash { page-break-inside: avoid; }
      }
    </style>
  </head>
  <body>
    <div class="rcpt">
      <h1>${esc(brand)}</h1>
      ${addrLine ? `<p class="sub">${esc(addrLine)}</p>` : ''}
      ${contact ? `<p class="sub">${esc(contact)}</p>` : ''}
      ${r.subtitle ? `<p class="sub">${esc(r.subtitle)}</p>` : ''}
      ${r.subline ? `<p class="sub">${esc(r.subline)}</p>` : ''}
      ${r.meta ? `<p class="sub">${esc(r.meta)}</p>` : ''}
      <div class="dash"></div>
      <table>
        ${items}
      </table>
      ${ledger ? `<div class="dash"></div>
      <table>
        ${ledger}
      </table>` : ''}
      ${r.total ? `<table class="tot" style="margin-top:4px">
        ${row('TOTAL', r.total)}
      </table>` : ''}
      ${r.paidBy ? `<p class="paid"><b>Paid by ${esc(r.paidBy)}</b> &nbsp;·&nbsp; ${esc(r.paidAt || '')}</p>` : ''}
      ${footer}
      ${thanks ? `<p class="foot">${esc(thanks)}</p>` : ''}
    </div>
  </body>
</html>`;
}

/**
 * Per-guest split receipts: after a split-bill charge, every guest gets their
 * own itemized slip.
 *
 *  - "by items" segments carry their own itemIds, so a guest's slip lists
 *    exactly the dishes they ate.
 *  - "even" segments (no itemIds) list the whole bill with the guest's share
 *    called out — the standard for even splits so nobody disputes what was
 *    on the table.
 *
 * Prints are staggered a beat apart so the browser queues one dialog per
 * slip instead of racing N iframes into the print queue.
 */
export function printSplitReceipts({ title, subtitle, tableName, orderRef, items = [], segments = [], thanks }, settings) {
  if (!Array.isArray(segments) || segments.length === 0) return false;
  const billSubtotal = items.reduce((s, l) => s + l.qty * l.price, 0);
  let printed = 0;

  segments.forEach((seg, i) => {
    const mine = Array.isArray(seg.itemIds)
      ? items.filter((l) => seg.itemIds.includes(l.id))
      : null; // null = even split: the slip shows the shared bill
    const lineRows = (mine || items).map((l) => [`${l.qty}× ${l.name}`, `Rs ${(l.qty * l.price).toLocaleString('en-IN')}`]);
    const guestNo = i + 1;
    const receipt = {
      title: title || (settings && settings.businessName) || 'Mesa OS',
      subtitle: subtitle || 'Split bill',
      subline: tableName ? `Table ${tableName}` : '',
      meta: orderRef ? `Order ${orderRef} · Guest ${guestNo} of ${segments.length}` : `Guest ${guestNo} of ${segments.length}`,
      items: lineRows.length > 0 ? lineRows : [['—', '—']],
      ledger: mine
        ? [['Items subtotal (incl. VAT)', `Rs ${billSubtotal ? Math.round(mine.reduce((s, l) => s + l.qty * l.price, 0)).toLocaleString('en-IN') : '0'}`]]
        : [['Bill subtotal (incl. VAT)', `Rs ${Math.round(billSubtotal).toLocaleString('en-IN')}`]],
      total: `Rs ${Math.round(seg.amount).toLocaleString('en-IN')}`,
      paidBy: seg.method || 'Split',
      paidAt: new Date().toLocaleString(),
      footerLines: [`Guest ${guestNo} of ${segments.length} — ${seg.method || 'split'} payment`],
      thanks: thanks || 'Thank you — see you again!'
    };
    // Stagger: queue each slip after the previous one has been handed to the
    // print dialog rather than firing every iframe at once.
    setTimeout(() => {
      if (printReceiptHtml(receipt, settings)) printed += 1;
    }, i * 400);
  });

  return printed >= 0; // scheduled; individual failures are non-fatal
}

/**
 * Print a receipt without leaving the page.
 *
 * Earlier this opened a popup window (`window.open` + `w.print()`), which is
 * the classic POS freeze: after the print dialog closed, the popup kept focus
 * and stayed alive, and returning to the main window could leave the app
 * unresponsive (blocked event loop from the focus/print handshake, plus
 * Chrome throttling the opener while the popup lived on).
 *
 * A hidden iframe avoids all of it: no second window exists, the print
 * dialog's "done" returns straight to the live app, and the iframe is
 * removed right after printing so nothing lingers holding resources.
 */
export function printReceiptHtml(receiptData, settings) {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  // Off-screen but rendered: display:none can make some engines skip layout,
  // which blanks the print output.
  frame.style.position = 'fixed';
  frame.style.right = '0';
  frame.style.bottom = '0';
  frame.style.width = '0';
  frame.style.height = '0';
  frame.style.border = '0';
  frame.style.visibility = 'hidden';
  document.body.appendChild(frame);

  const cleanup = () => {
    // Removal is deferred a tick: tearing the frame down synchronously from
    // its own print-completion event can leave the print queue in a bad state
    // on some engines, which is exactly the "app hangs after printing" bug.
    setTimeout(() => {
      try {
        frame.remove();
      } catch {
        /* already gone */
      }
    }, 0);
  };

  const go = () => {
    try {
      frame.contentWindow.focus();
      frame.contentWindow.print();
    } catch {
      /* print refused — nothing to clean beyond the frame itself */
    }
    cleanup();
  };

  const doc = frame.contentWindow?.document;
  if (!doc) {
    frame.remove();
    return false;
  }
  doc.open();
  doc.write(buildReceiptHtml(receiptData, settings));
  doc.close();

  // Print once the frame document has actually laid out (fonts settled)
  // rather than a blind tick — printing mid-layout can clip the tail.
  if (doc.readyState === 'complete') {
    setTimeout(go, 120);
  } else {
    frame.addEventListener('load', () => setTimeout(go, 120), { once: true });
  }
  return true;
}
