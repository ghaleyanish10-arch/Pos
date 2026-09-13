package email

import (
	"context"
	"strings"
	"testing"
)

func TestEnabled(t *testing.T) {
	if (&Service{}).Enabled() {
		t.Error("empty service should not be enabled")
	}
	if New("", "from@test.dev", "", "").Enabled() {
		t.Error("missing api key should not be enabled")
	}
	if New("re_test_key", "", "", "").Enabled() {
		t.Error("missing from should not be enabled")
	}
	if !New("re_test_key", "from@test.dev", "Mesa", "http://localhost:5173").Enabled() {
		t.Error("key+from should be enabled")
	}
}

func TestSendRequiresConfig(t *testing.T) {
	s := New("", "", "", "")
	if _, err := s.Send(context.Background(), "a@b.dev", "subj", "<p>x</p>", "x"); err == nil {
		t.Fatal("expected error when service is not configured")
	}
}

func TestSendRequiresRecipient(t *testing.T) {
	s := New("re_test_key", "from@test.dev", "", "")
	if _, err := s.Send(context.Background(), "", "subj", "<p>x</p>", "x"); err == nil {
		t.Fatal("expected error for empty recipient")
	}
}

func TestAppURLTrailingSlash(t *testing.T) {
	s := New("re_test_key", "from@test.dev", "", "http://localhost:5173/")
	if s.AppURL() != "http://localhost:5173" {
		t.Errorf("AppURL = %q, want trailing slash trimmed", s.AppURL())
	}
}

func TestVerificationLinkPointsToLocalApp(t *testing.T) {
	s := New("re_test_key", "from@test.dev", "Mesa", "http://localhost:5173")
	link := s.appURL + "/verify-email?token=abc123"
	if !strings.HasPrefix(link, "http://localhost:5173/verify-email?token=") {
		t.Errorf("verification link unexpected: %q", link)
	}
	resetLink := s.appURL + "/reset-password?token=xyz"
	if !strings.HasPrefix(resetLink, "http://localhost:5173/reset-password?token=") {
		t.Errorf("reset link unexpected: %q", resetLink)
	}
}
