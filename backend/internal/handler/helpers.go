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
