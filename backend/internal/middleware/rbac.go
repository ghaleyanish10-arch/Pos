package middleware

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

var roleHierarchy = map[string]int{
	"Cashier":           1,
	"Store Manager":     2,
	"Inventory Auditor": 3,
	"Corporate Admin":   4,
}

func RequireRole(minRole string) gin.HandlerFunc {
	return func(c *gin.Context) {
		userRole, exists := c.Get("role")
		if !exists {
			c.JSON(http.StatusForbidden, gin.H{"error": "no role assigned"})
			c.Abort()
			return
		}

		role := userRole.(string)
		userLevel, ok := roleHierarchy[role]
		if !ok {
			c.JSON(http.StatusForbidden, gin.H{"error": "unknown role"})
			c.Abort()
			return
		}

		requiredLevel, ok := roleHierarchy[minRole]
		if !ok {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "invalid role requirement"})
			c.Abort()
			return
		}

		if userLevel < requiredLevel {
			c.JSON(http.StatusForbidden, gin.H{"error": "insufficient permissions"})
			c.Abort()
			return
		}

		c.Next()
	}
}
