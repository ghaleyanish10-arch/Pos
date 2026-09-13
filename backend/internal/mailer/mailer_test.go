package mailer

import (
	"strings"
	"testing"
	"time"
)

func TestConfigured(t *testing.T) {
	if (&Mailer{}).Configured() {
		t.Error("empty mailer should not be configured")
	}
	if New("", "587", "u", "p", "").Configured() {
		t.Error("missing host should not be configured")
	}
	if New("smtp.test.dev", "587", "u", "p", "no-reply@test.dev").Configured() != true {
		t.Error("host+from should be configured")
	}
}

func TestSendWithoutConfigErrors(t *testing.T) {
	m := New("", "", "", "", "")
	if err := m.Send("a@b.dev", "subj", "text", "<p>html</p>"); err == nil {
		t.Fatal("expected error when smtp is not configured")
	}
}

func TestSendInvoiceEmailEmptyRecipient(t *testing.T) {
	m := New("smtp.test.dev", "587", "u", "p", "no-reply@test.dev")
	err := m.SendInvoiceEmail("", "INV-1", "Party", 100, time.Now(), nil)
	if err == nil || !strings.Contains(err.Error(), "recipient") {
		t.Fatalf("expected empty-recipient error, got %v", err)
	}
}

func TestBuildMessage(t *testing.T) {
	msg := string(buildMessage("from@test.dev", "to@test.dev", "Hello", "plain body", "<p>html body</p>"))
	for _, want := range []string{
		"From: from@test.dev",
		"To: to@test.dev",
		"Subject: Hello",
		"multipart/alternative",
		"plain body",
		"<p>html body</p>",
	} {
		if !strings.Contains(msg, want) {
			t.Errorf("message missing %q", want)
		}
	}
}

func TestInvoiceTextAndHTML(t *testing.T) {
	due := time.Date(2026, 9, 20, 0, 0, 0, 0, time.UTC)
	lines := []Line{{Description: "Catering", Qty: 2, UnitPrice: 1850}}
	text := invoiceText("INV-2041", "Yeti Airlines", 4180, due, lines)
	html := invoiceHTML("INV-2041", "Yeti Airlines", 4180, due, lines)

	for _, want := range []string{"INV-2041", "Yeti Airlines", "Rs 4180", "20 Sep 2026", "Catering"} {
		if !strings.Contains(text, want) {
			t.Errorf("text body missing %q", want)
		}
		if !strings.Contains(html, want) {
			t.Errorf("html body missing %q", want)
		}
	}
}
