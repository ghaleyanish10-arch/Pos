package handler

import (
	"context"
	"log"
	"strings"
	"time"

	"github.com/google/uuid"
)

// contextWithTimeout gives outbound email calls a bounded lifetime so a slow
// provider never hangs a request.
func contextWithTimeout() (context.Context, context.CancelFunc) {
	return context.WithTimeout(context.Background(), 10*time.Second)
}

// ginLog logs server-side diagnostics without ever logging tokens or keys.
func ginLog(msg string) {
	log.Println("[email] " + msg)
}

// strPtrOrNil converts an empty string to nil; used for nullable uuid columns
// (branch_id) when the request supplies no value.
func strPtrOrNil(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

// actorString extracts the acting user's id from the auth context for audit
// attribution; empty when called from an unauthenticated route.
func actorString(v interface{}) string {
	if s, ok := v.(string); ok {
		return s
	}
	return ""
}

// validUUID reports whether s is a well-formed UUIDv4. Empty never passes, so
// callers use it after deciding the field is required.
func validUUID(s string) bool {
	if s == "" {
		return false
	}
	_, err := uuid.Parse(strings.TrimSpace(s))
	return err == nil
}
