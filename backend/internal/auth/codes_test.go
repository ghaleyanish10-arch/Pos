package auth

import (
	"regexp"
	"testing"
	"time"
)

func TestGenerateCodeFormat(t *testing.T) {
	pattern := regexp.MustCompile(`^\d{6}$`)

	seen := map[string]bool{}
	for i := 0; i < 200; i++ {
		code, err := GenerateCode()
		if err != nil {
			t.Fatalf("GenerateCode returned error: %v", err)
		}
		if !pattern.MatchString(code) {
			t.Fatalf("code %q is not 6 digits", code)
		}
		if seen[code] {
			t.Logf("collision at iteration %d (fine, but noted)", i)
		}
		seen[code] = true
	}
}

func TestHashCodeDeterministic(t *testing.T) {
	if HashCode("123456") == "" {
		t.Fatal("hash must be non-empty")
	}
	if HashCode("123456") != HashCode("123456") {
		t.Fatal("hashing must be deterministic")
	}
	if HashCode("123456") == HashCode("654321") {
		t.Fatal("different codes must hash differently")
	}
	// Never the raw code — a leak into the DB would be the raw value.
	if HashCode("123456") == "123456" {
		t.Fatal("hash must not equal the raw code")
	}
}

func TestCodeTimingConstants(t *testing.T) {
	if CodeTTL() != 10*time.Minute {
		t.Errorf("CodeTTL = %v, want 10m", CodeTTL())
	}
	if ResendCooldown() != 60*time.Second {
		t.Errorf("ResendCooldown = %v, want 60s", ResendCooldown())
	}
}