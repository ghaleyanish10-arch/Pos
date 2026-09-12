package config

import (
	"os"
	"testing"
	"time"
)

func TestLoadDefaults(t *testing.T) {
	os.Unsetenv("PORT")
	os.Unsetenv("DATABASE_URL")
	os.Unsetenv("JWT_SECRET")
	os.Unsetenv("JWT_ACCESS_EXPIRY")
	os.Unsetenv("JWT_REFRESH_EXPIRY")
	os.Unsetenv("CORS_ORIGIN")

	cfg := Load()
	if cfg.Port != "8080" {
		t.Errorf("Port = %q, want 8080", cfg.Port)
	}
	if cfg.DatabaseURL != "postgres://postgres:postgres@localhost:5432/mesa_os?sslmode=disable" {
		t.Errorf("DatabaseURL unexpected: %q", cfg.DatabaseURL)
	}
	if cfg.JWTSecret != "change-me" {
		t.Errorf("JWTSecret unexpected: %q", cfg.JWTSecret)
	}
	if cfg.JWTAccessExpiry != 15*time.Minute {
		t.Errorf("JWTAccessExpiry unexpected: %v", cfg.JWTAccessExpiry)
	}
	if cfg.JWTRefreshExpiry != 168*time.Hour {
		t.Errorf("JWTRefreshExpiry unexpected: %v", cfg.JWTRefreshExpiry)
	}
	if cfg.CORSOrigin != "http://localhost:5173" {
		t.Errorf("CORSOrigin unexpected: %q", cfg.CORSOrigin)
	}
}

func TestLoadFromEnv(t *testing.T) {
	os.Setenv("PORT", "9999")
	os.Setenv("DATABASE_URL", "postgres://x")
	os.Setenv("JWT_SECRET", "super-secret")
	os.Setenv("JWT_ACCESS_EXPIRY", "5s")
	os.Setenv("JWT_REFRESH_EXPIRY", "10m")
	os.Setenv("CORS_ORIGIN", "https://example.com")
	defer func() {
		os.Unsetenv("PORT")
		os.Unsetenv("DATABASE_URL")
		os.Unsetenv("JWT_SECRET")
		os.Unsetenv("JWT_ACCESS_EXPIRY")
		os.Unsetenv("JWT_REFRESH_EXPIRY")
		os.Unsetenv("CORS_ORIGIN")
	}()

	cfg := Load()
	if cfg.Port != "9999" || cfg.DatabaseURL != "postgres://x" || cfg.JWTSecret != "super-secret" {
		t.Errorf("env vars not applied: %+v", cfg)
	}
	if cfg.JWTAccessExpiry != 5*time.Second {
		t.Errorf("JWTAccessExpiry = %v, want 5s", cfg.JWTAccessExpiry)
	}
	if cfg.JWTRefreshExpiry != 10*time.Minute {
		t.Errorf("JWTRefreshExpiry = %v, want 10m", cfg.JWTRefreshExpiry)
	}
	if cfg.CORSOrigin != "https://example.com" {
		t.Errorf("CORSOrigin = %q", cfg.CORSOrigin)
	}
}

func TestParseDurationInvalidFallsBack(t *testing.T) {
	os.Setenv("JWT_ACCESS_EXPIRY", "not-a-duration")
	defer os.Unsetenv("JWT_ACCESS_EXPIRY")

	cfg := Load()
	if cfg.JWTAccessExpiry != 15*time.Minute {
		t.Errorf("JWTAccessExpiry = %v, want 15m fallback", cfg.JWTAccessExpiry)
	}
}
