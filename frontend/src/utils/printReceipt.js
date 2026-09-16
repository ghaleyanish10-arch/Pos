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
 */
export function buildReceiptHtml(r) {
  const items = (r.items || []).map((l) => row(l[0], l[1])).join('');
  const ledger = (r.ledger || []).map((l) => row(l[0], l[1])).join('');
  const footer = (r.footerLines || []).map((l) => `<p>${esc(l)}</p>`).join('');
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>Receipt · ${esc(r.title || '')}</title>
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
      <h1>${esc(r.title || '')}</h1>
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
      ${r.thanks ? `<p class="foot">${esc(r.thanks)}</p>` : ''}
    </div>
  </body>
</html>`;
}

/**
 * Open the receipt in a popup and trigger print. Resolves true when the
 * print was triggered, false when the popup was blocked.
 */
export function printReceiptHtml(receiptData) {
  const w = window.open('', '_blank', 'width=420,height=640,scrollbars=yes');
  if (!w) return false;
  w.document.open();
  w.document.write(buildReceiptHtml(receiptData));
  w.document.close();
  // Print once the popup document has actually loaded (fonts/layout settled)
  // rather than a blind timeout — printing mid-layout can clip the tail.
  const go = () => {
    try {
      w.focus();
      w.print();
    } catch {
      /* user already closed the popup */
    }
  };
  if (w.document.readyState === 'complete') {
    setTimeout(go, 120);
  } else {
    w.addEventListener('load', () => setTimeout(go, 120), { once: true });
  }
  return true;
}
