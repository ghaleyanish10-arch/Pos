package repo

import (
	"fmt"
	"strings"
)

// ReceiptOutput is the printer abstraction seam: everything the front end
// (browser print) and future hardware/fiscal backends need to render a
// receipt. Consumers implement Renderer instead of talking to a printer
// directly, so adding an ESC/POS stream, a fiscal registration seal, or a
// PDF pipeline never touches business code.
type ReceiptOutput struct {
	Title    string   // business name
	Subtitle string   // address / VAT or GST number
	Headline string   // order ref or table
	Items    []string // pre-formatted "2x Chicken Momo ......... Rs 500"
	Ledger   []string // "Subtotal", each tax, service charge
	Total    string
	Footer   []string
	// FiscalSeam carries country-specific certified-receipt data. Italy's
	// scontrino, Poland's paragon (with NIP/verification URL) or similar slot
	// in without schema changes; nil for non-fiscal markets.
	FiscalSeam *FiscalSeam
	Width      int // characters per line; 42/48 typical thermal, 32 legacy
}

// FiscalSeam is the extension point for certified-receipt regimes (§6). It is
// intentionally a plain data bag: each country's rules differ, so the struct
// only standardizes WHERE the data goes, not what it must contain.
type FiscalSeam struct {
	Country     string // "IT", "PL", "FR", ...
	CertifiedID string // registration / RRN / fiscal document number
	DeviceID    string // fiscal printer / RTE terminal id
	QRURL       string // consumer verification URL where the regime requires one
	Extra       map[string]string
}

// Renderer renders a ReceiptOutput. Browser print and future ESC/POS
// hardware pipelines implement this same interface.
type Renderer interface {
	Render(r ReceiptOutput) ([]byte, error)
}

// ESCPOSPosRenderer renders a ReceiptOutput into raw ESC/POS bytes for
// standard 58/80mm thermal printers. Text is laid out in fixed columns; the
// driver connection (USB/serial/network) is a separate concern.
type ESCPOSPosRenderer struct{}

const (
	escInit  = "\x1b@"  // initialize printer
	escAlign = "\x1ba"  // justification: 0 left, 1 center
	escBold  = "\x1bE"  // emphasis on/off
	escCut   = "\x1dV\x41\x03" // partial cut
)

// Render encodes the receipt. Line discipline: never exceed Width chars —
// wrapping at the encoder keeps drivers from mangling layout mid-line.
func (ESCPOSPosRenderer) Render(r ReceiptOutput) ([]byte, error) {
	width := r.Width
	if width <= 0 {
		width = 42
	}
	var b strings.Builder
	b.WriteString(escInit)

	// Header: centered, bold title, regular subtitle.
	b.WriteString(escAlign + "\x01" + escBold + "\x01")
	b.WriteString(truncate(r.Title, width) + "\n")
	b.WriteString(escBold + "\x00")
	if r.Subtitle != "" {
		b.WriteString(wrap(truncate(r.Subtitle, 2*width), width) + "\n")
	}
	if r.Headline != "" {
		b.WriteString(wrap(truncate(r.Headline, 2*width), width) + "\n")
	}
	b.WriteString(divider(width) + "\n")

	// Items: left name, right amount.
	for _, it := range r.Items {
		b.WriteString(twoColumn(it, "", width) + "\n")
	}

	// Ledger lines.
	if len(r.Items) > 0 {
		b.WriteString(divider(width) + "\n")
	}
	for _, l := range r.Ledger {
		name, amount := splitLedger(l)
		b.WriteString(twoColumn(name, amount, width) + "\n")
	}

	// Total: bold, larger via double-strike.
	b.WriteString(divider(width) + "\n")
	b.WriteString(escBold + "\x01")
	b.WriteString(twoColumn("TOTAL", r.Total, width) + "\n")
	b.WriteString(escBold + "\x00")

	// Fiscal block (country-specific certified receipt data).
	if r.FiscalSeam != nil {
		b.WriteString(divider(width) + "\n")
		b.WriteString(wrap(truncate("FISCAL "+r.FiscalSeam.Country+" "+r.FiscalSeam.CertifiedID, 2*width), width) + "\n")
		if r.FiscalSeam.DeviceID != "" {
			b.WriteString(twoColumn("Device", r.FiscalSeam.DeviceID, width) + "\n")
		}
	}

	// Footer lines, centered.
	b.WriteString(escAlign + "\x01")
	for _, f := range r.Footer {
		b.WriteString(wrap(truncate(f, 2*width), width) + "\n")
	}
	b.WriteString("\n\n\n")
	b.WriteString(escAlign + "\x00" + escCut)

	return []byte(b.String()), nil
}

// splitLedger splits "Label: Amount" into its columns.
func splitLedger(line string) (string, string) {
	if i := strings.LastIndex(line, ": "); i >= 0 {
		return line[:i], line[i+2:]
	}
	return line, ""
}

func divider(width int) string { return strings.Repeat("-", width) }

// twoColumn lays out "left ........ right" padded to width.
func twoColumn(left, right string, width int) string {
	if right == "" {
		return wrap(left, width)
	}
	space := width - len([]rune(left)) - len([]rune(right))
	if space < 1 {
		return wrap(truncate(left, width-len([]rune(right))-1), width) + "\n" + twoColumn("", right, width)
	}
	return left + strings.Repeat(" ", space) + right
}

func truncate(s string, max int) string {
	runes := []rune(s)
	if len(runes) <= max {
		return s
	}
	return string(runes[:max])
}

func wrap(s string, width int) string {
	var out []string
	for _, para := range strings.Split(s, "\n") {
		line := ""
		for _, word := range strings.Fields(para) {
			candidate := strings.TrimSpace(line + " " + word)
			if len([]rune(candidate)) > width && line != "" {
				out = append(out, line)
				line = word
			} else {
				line = candidate
			}
		}
		out = append(out, line)
	}
	return strings.Join(out, "\n")
}

var _ = fmt.Sprintf // reserved for future encoder diagnostics
