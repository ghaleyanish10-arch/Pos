package config

import (
	"os"
	"time"

	"github.com/joho/godotenv"
)

type Config struct {
	Port            string
	DatabaseURL     string
	JWTSecret       string
	JWTAccessExpiry time.Duration
	JWTRefreshExpiry time.Duration
	CORSOrigin      string

	// SMTP — when unset, email endpoints return a clear 503 instead of pretending to send.
	SMTPHost     string
	SMTPPort     string
	SMTPUsername string
	SMTPPassword string
	SMTPFrom     string

	// Resend — real email delivery from localhost (api.resend.com).
	RESENDAPIKey string
	EmailFrom    string
	EmailFromName string
	AppURL       string
}

func Load() *Config {
	godotenv.Load()

	return &Config{
		Port:            getEnv("PORT", "8080"),
		DatabaseURL:     getEnv("DATABASE_URL", "postgres://postgres:postgres@localhost:5432/mesa_os?sslmode=disable"),
		JWTSecret:       getEnv("JWT_SECRET", "change-me"),
		JWTAccessExpiry: parseDuration(getEnv("JWT_ACCESS_EXPIRY", "15m")),
		JWTRefreshExpiry: parseDuration(getEnv("JWT_REFRESH_EXPIRY", "168h")),
		CORSOrigin:      getEnv("CORS_ORIGIN", "http://localhost:5173"),

		SMTPHost:     getEnv("SMTP_HOST", ""),
		SMTPPort:     getEnv("SMTP_PORT", "587"),
		SMTPUsername: getEnv("SMTP_USERNAME", ""),
		SMTPPassword: getEnv("SMTP_PASSWORD", ""),
		SMTPFrom:     getEnv("SMTP_FROM", ""),

		RESENDAPIKey: getEnv("RESEND_API_KEY", ""),
		EmailFrom:    getEnv("EMAIL_FROM", ""),
		EmailFromName: getEnv("EMAIL_FROM_NAME", "Mesa OS"),
		AppURL:       getEnv("APP_URL", "http://localhost:5173"),
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func parseDuration(s string) time.Duration {
	d, err := time.ParseDuration(s)
	if err != nil {
		return 15 * time.Minute
	}
	return d
}
