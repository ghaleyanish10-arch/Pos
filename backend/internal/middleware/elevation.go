package middleware

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/mesa-os/backend/internal/auth"
	"github.com/mesa-os/backend/internal/repo"
)

const elevationHeader = "X-Elevation-Token"

// ElevationRequired is the response shape the frontend pattern-matches to
// decide whether to pop the PIN modal (error + missing action).
func elevationRequired(action string) gin.H {
	return gin.H{"error": "elevation required", "action": action, "code": "ELEVATION_REQUIRED"}
}

// RequireElevation guards a privileged endpoint with a single-use, short-lived
// elevation token issued by POST /auth/elevate. It mirrors RequireRole:
//
//	protected.PUT("/refunds/:id/approve",
//	    middleware.RequireElevation(elevRepo, cfg.JWTSecret, "refund.approve"),
//	    refundH.Approve)
//
// Contract:
//   - X-Elevation-Token header must carry a valid elevation JWT
//   - token action must equal the required action (and resource, if bound)
//   - the jti must still be unconsumed and unexpired — it is consumed
//     atomically here, making the token single-use
//   - on success, sets elevated_by / elevated_by_role for handler attribution
func RequireElevation(elevRepo *repo.ElevationRepo, secret, action string) gin.HandlerFunc {
	return func(c *gin.Context) {
		tokenStr := c.GetHeader(elevationHeader)
		if tokenStr == "" {
			c.JSON(http.StatusForbidden, elevationRequired(action))
			c.Abort()
			return
		}

		resourceID := c.Param("id")
		claims, err := auth.ValidateElevationToken(tokenStr, secret, action, resourceID)
		if err != nil {
			// Wrong action/resource binding or bad signature — do not consume.
			c.JSON(http.StatusForbidden, gin.H{"error": "elevation token is not valid for this action", "code": "ELEVATION_MISMATCH"})
			c.Abort()
			return
		}

		// Single use: consume the jti atomically. Replay (or expiry) fails here.
		if err := elevRepo.ConsumeToken(c.Request.Context(), claims.ID); err != nil {
			switch {
			case errors.Is(err, repo.ErrTokenUsed):
				c.JSON(http.StatusUnauthorized, gin.H{"error": "elevation token already used", "code": "ELEVATION_REPLAY"})
			case errors.Is(err, pgx.ErrNoRows):
				c.JSON(http.StatusUnauthorized, gin.H{"error": "elevation token expired or unknown", "code": "ELEVATION_EXPIRED"})
			default:
				c.JSON(http.StatusInternalServerError, gin.H{"error": "elevation validation failed"})
			}
			c.Abort()
			return
		}

		c.Set("elevated_by", claims.UserID)
		c.Next()
	}
}
