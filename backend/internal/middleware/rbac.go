package middleware

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/mesa-os/backend/internal/repo"
)

var roleHierarchy = map[string]int{
	"Cashier":           1,
	"Store Manager":     2,
	"Inventory Auditor": 3,
	"Corporate Admin":   4,
}

// OrgContext stamps organization_id on every protected request: access is
// scoped organization-first, branch-second inside handlers. Tokens minted
// before the org layer carry no claim, so those requests resolve the org
// from the user's branch (or user record) once per request.
func NewOrgContext(db *pgxpool.Pool) gin.HandlerFunc {
	r := repo.NewOrgRepo(db)
	return func(c *gin.Context) {
		if v, ok := c.Get("org_id"); ok {
			if id, _ := v.(string); id != "" {
				c.Next()
				return
			}
		}

		// Legacy token: try the claimed branch's org, then the user record.
		if v, ok := c.Get("branch_id"); ok {
			if branchID, _ := v.(string); branchID != "" {
				if org, err := r.BranchOrg(c.Request.Context(), branchID); err == nil && org != "" {
					c.Set("org_id", org)
					c.Next()
					return
				}
			}
		}
		if v, ok := c.Get("user_id"); ok {
			if userID, _ := v.(string); userID != "" {
				if org, err := r.UserOrg(c.Request.Context(), userID); err == nil && org != "" {
					c.Set("org_id", org)
					c.Next()
					return
				}
			}
		}

		c.Set("org_id", "")
		c.Next()
	}
}

// OrgID extracts the resolved organization id in handlers.
func OrgID(c *gin.Context) string {
	v, ok := c.Get("org_id")
	if !ok {
		return ""
	}
	id, _ := v.(string)
	return id
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
