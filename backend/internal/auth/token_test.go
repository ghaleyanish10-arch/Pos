package auth

import (
	"strings"
	"testing"
	"time"
)

const testSecret = "test-secret-key"

func TestGenerateTokenPair(t *testing.T) {
	pair, err := GenerateTokenPair("u1", "user@test.dev", "Cashier", "b1", 0, testSecret, time.Hour, 24*time.Hour)
	if err != nil {
		t.Fatalf("GenerateTokenPair returned error: %v", err)
	}
	if pair.AccessToken == "" || pair.RefreshToken == "" {
		t.Fatal("expected non-empty access and refresh tokens")
	}
	if pair.AccessToken == pair.RefreshToken {
		t.Fatal("access and refresh tokens must differ")
	}
	if pair.ExpiresAt <= time.Now().Unix() {
		t.Fatal("expected access token expiry in the future")
	}
}

func TestValidateToken_RoundTrip(t *testing.T) {
	pair, err := GenerateTokenPair("u42", "cashier@test.dev", "Store Manager", "b9", 3, testSecret, time.Hour, time.Hour)
	if err != nil {
		t.Fatalf("GenerateTokenPair: %v", err)
	}

	claims, err := ValidateToken(pair.AccessToken, testSecret)
	if err != nil {
		t.Fatalf("ValidateToken: %v", err)
	}
	if claims.TokenVersion != 3 {
		t.Errorf("TokenVersion = %d, want 3", claims.TokenVersion)
	}
	if claims.UserID != "u42" {
		t.Errorf("UserID = %q, want u42", claims.UserID)
	}
	if claims.Role != "Store Manager" {
		t.Errorf("Role = %q, want Store Manager", claims.Role)
	}
	if claims.BranchID != "b9" {
		t.Errorf("BranchID = %q, want b9", claims.BranchID)
	}
	if claims.Email != "cashier@test.dev" {
		t.Errorf("Email = %q, want cashier@test.dev", claims.Email)
	}
}

func TestValidateToken_WrongSecret(t *testing.T) {
	pair, err := GenerateTokenPair("u1", "a@b.c", "Cashier", "", 0, testSecret, time.Hour, time.Hour)
	if err != nil {
		t.Fatalf("GenerateTokenPair: %v", err)
	}
	if _, err := ValidateToken(pair.AccessToken, "different-secret"); err == nil {
		t.Fatal("expected error when validating with wrong secret")
	}
}

func TestValidateToken_Expired(t *testing.T) {
	pair, err := GenerateTokenPair("u1", "a@b.c", "Cashier", "", 0, testSecret, -time.Minute, time.Hour)
	if err != nil {
		t.Fatalf("GenerateTokenPair: %v", err)
	}
	if _, err := ValidateToken(pair.AccessToken, testSecret); err == nil {
		t.Fatal("expected error for expired token")
	}
}

func TestValidateToken_Tampered(t *testing.T) {
	pair, err := GenerateTokenPair("u1", "a@b.c", "Cashier", "", 0, testSecret, time.Hour, time.Hour)
	if err != nil {
		t.Fatalf("GenerateTokenPair: %v", err)
	}
	tampered := pair.AccessToken
	if !strings.HasSuffix(tampered, "a") {
		tampered = pair.AccessToken[:len(pair.AccessToken)-1] + "a"
	} else {
		tampered = pair.AccessToken[:len(pair.AccessToken)-1] + "b"
	}
	if _, err := ValidateToken(tampered, testSecret); err == nil {
		t.Fatal("expected error for tampered token")
	}
}

func TestValidateToken_Garbage(t *testing.T) {
	if _, err := ValidateToken("not-a-jwt", testSecret); err == nil {
		t.Fatal("expected error for garbage token")
	}
}