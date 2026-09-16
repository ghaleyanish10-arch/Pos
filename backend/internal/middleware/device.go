package middleware

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

// DeviceID captures the terminal's self-declared identity — a client-side
// UUID (or any opaque id) in the X-Device-Id header, used for audit
// attribution and the devices approval table. It does not authenticate
// anything: whether a terminal may use the clock-in family is decided
// per-route by the devices table (status/enable) and per-action by the
// staff PIN. This replaces the old static X-Device-Token credential.
func DeviceID() gin.HandlerFunc {
	return func(c *gin.Context) {
		id := strings.TrimSpace(c.GetHeader("X-Device-Id"))
		if id == "" || len(id) > 100 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "missing or invalid X-Device-Id header (opaque client-generated device id required)"})
			c.Abort()
			return
		}
		c.Set("device_id", id)
		c.Next()
	}
}