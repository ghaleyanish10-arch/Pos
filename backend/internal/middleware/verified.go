package middleware

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
)

// RequireEmailVerified gates admin-dashboard routes behind email verification
// for Corporate Admin (business-owner) accounts only. Staff roles created by
// the owner within the app have no inbox of their own, so the block is
// role-scoped: it can never lock out a POS terminal or a manager session.
// Unverified owners get a 403 with a code the frontend can turn into the
// "verify your email" interstitial.
func RequireEmailVerified(db *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		if role := c.GetString("role"); role != "Corporate Admin" {
			c.Next()
			return
		}

		var verified bool
		err := db.QueryRow(c.Request.Context(),
			`SELECT email_verified_at IS NOT NULL FROM users WHERE id = $1 AND deleted_at IS NULL`,
			c.GetString("user_id"),
		).Scan(&verified)
		if err != nil || !verified {
			c.JSON(http.StatusForbidden, gin.H{
				"error": "your email is not verified — check your inbox for the verification code",
				"code":  "EMAIL_NOT_VERIFIED",
			})
			c.Abort()
			return
		}
		c.Next()
	}
}