package middleware

import (
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

// RateLimitByIP throttles public endpoints per client IP: at most max hits
// per sliding window. It is deliberately in-memory (no Redis dependency) —
// sized for a single-node POS backend; a multi-node deployment would move
// the counter into Postgres or Redis. Used on the verification-code
// endpoints so a stolen inbox-flow can't be brute-forced at line rate; the
// per-account 60s resend cooldown and the single-use hashed code remain the
// real gate — this blunts credential-stuffing across many accounts.
func RateLimitByIP(max int, window time.Duration) gin.HandlerFunc {
	type bucket struct {
		hits []time.Time
	}
	var (
		mu      sync.Mutex
		visitors = map[string]*bucket{}
	)

	// Lazy cleanup so the map cannot grow without bound.
	go func() {
		for range time.Tick(window) {
			mu.Lock()
			cutoff := time.Now().Add(-window)
			for ip, b := range visitors {
				kept := b.hits[:0]
				for _, h := range b.hits {
					if h.After(cutoff) {
						kept = append(kept, h)
					}
				}
				if len(kept) == 0 {
					delete(visitors, ip)
				} else {
					b.hits = kept
				}
			}
			mu.Unlock()
		}
	}()

	return func(c *gin.Context) {
		ip := c.ClientIP()
		now := time.Now()
		cutoff := now.Add(-window)

		mu.Lock()
		b := visitors[ip]
		if b == nil {
			b = &bucket{}
			visitors[ip] = b
		}
		kept := b.hits[:0]
		for _, h := range b.hits {
			if h.After(cutoff) {
				kept = append(kept, h)
			}
		}
		if len(kept) >= max {
			mu.Unlock()
			c.Header("Retry-After", "60")
			c.JSON(http.StatusTooManyRequests, gin.H{"error": "too many attempts — wait a minute and try again"})
			c.Abort()
			return
		}
		b.hits = append(kept, now)
		mu.Unlock()
		c.Next()
	}
}
