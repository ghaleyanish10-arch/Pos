package middleware

import (
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
)

// VERIFICATION_DISABLED is a local/demo kill switch for email verification.
// It is OFF in production intent: Corporate Admin (owner) accounts must have
// a verified email before the admin dashboard opens. Staff roles were never
// gated and remain untouched.
const VERIFICATION_DISABLED = false

// RequireEmailVerified gates admin-dashboard routes behind a verified email
// for Corporate Admin (owner) accounts. While VERIFICATION_DISABLED is true
// this passes everyone through untouched so signup lands directly in the
// dashboard; staff roles were never gated anyway.
func RequireEmailVerified(db *pgxpool.Pool) gin.HandlerFunc {
	_ = db // kept for the real gate; see VERIFICATION_DISABLED above
	return func(c *gin.Context) {
		if VERIFICATION_DISABLED {
			c.Next()
			return
		}

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
			c.JSON(403, gin.H{
				"error": "your email is not verified — check your inbox for the verification code",
				"code":  "EMAIL_NOT_VERIFIED",
			})
			c.Abort()
			return
		}
		c.Next()
	}
}
