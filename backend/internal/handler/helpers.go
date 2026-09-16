package handler

import (
	"context"
	"log"
	"time"
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
