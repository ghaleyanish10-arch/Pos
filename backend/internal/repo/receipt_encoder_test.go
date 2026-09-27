package repo

import (
	"strings"
	"testing"
)

func TestESCPOSPosRenderer_FullReceipt(t *testing.T) {
	out := ReceiptOutput{
		Title:    "Himalayan Kitchen",
		Subtitle: "Kathmandu · GST 12345",
		Headline: "Table T4",
		Items:    []string{"2x Chicken Momo ......... Rs 500", "1x Coke .................. Rs 120"},
		Ledger:   []string{"Subtotal: Rs 620", "GST 5%: Rs 31"},
		Total:    "Rs 651",
		Footer:   []string{"Thank you, visit again"},
		Width:    42,
	}

	raw, err := ESCPOSPosRenderer{}.Render(out)
	if err != nil {
		t.Fatalf("render: %v", err)
	}
	s := string(raw)

	// ESC/POS control bytes present: init, bold toggles, cut.
	if !strings.Contains(s, escInit) {
		t.Error("missing ESC/POS init sequence")
	}
	if !strings.Contains(s, escCut) {
		t.Error("missing paper-cut sequence")
	}
	// Content present. Ledger lines render two-column (": " becomes spacing).
	for _, want := range []string{"Himalayan Kitchen", "GST 5%", "Rs 31", "TOTAL", "Rs 651", "Thank you, visit again"} {
		if !strings.Contains(s, want) {
			t.Errorf("receipt missing %q", want)
		}
	}
	// Every rendered text line respects the column width (control bytes excluded).
	for _, line := range strings.Split(s, "\n") {
		clean := strings.Map(func(r rune) rune {
			switch r {
			case '\x1b', '\x1d', 'V', 'A', '\x03', '@', 'a', 'E', '\x00', '\x01':
				return -1
			}
			return r
		}, line)
		if len([]rune(strings.TrimRight(clean, " \r"))) > 42 {
			t.Errorf("line exceeds 42 columns: %q", line)
		}
	}
}

func TestESCPOSPosRenderer_FiscalSeam(t *testing.T) {
	out := ReceiptOutput{
		Title: "Roma Trattoria",
		Items: []string{"1x Carbonara .......... EUR 12"},
		Ledger: []string{"Subtotal: EUR 12"},
		Total: "EUR 12",
		FiscalSeam: &FiscalSeam{
			Country:     "IT",
			CertifiedID: "RRN-991823",
			DeviceID:    "RTE-042",
		},
		Width: 42,
	}
	raw, err := ESCPOSPosRenderer{}.Render(out)
	if err != nil {
		t.Fatalf("render: %v", err)
	}
	s := string(raw)
	if !strings.Contains(s, "FISCAL IT RRN-991823") {
		t.Error("fiscal registration id missing from receipt")
	}
	if !strings.Contains(s, "RTE-042") {
		t.Error("fiscal device id missing from receipt")
	}
}
