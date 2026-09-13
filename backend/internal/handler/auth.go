package handler

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/mesa-os/backend/internal/auth"
	"github.com/mesa-os/backend/internal/config"
	"github.com/mesa-os/backend/internal/email"
	"github.com/mesa-os/backend/internal/model"
	"github.com/mesa-os/backend/internal/repo"
)

type AuthHandler struct {
	svc    *auth.Service
	repo   *repo.UserRepo
	config *config.Config
	email  *email.Service
}

func NewAuthHandler(svc *auth.Service, r *repo.UserRepo, cfg *config.Config) *AuthHandler {
	return &AuthHandler{svc: svc, repo: r, config: cfg}
}

// SetEmail attaches the centralized email service (nil = email disabled and
// endpoints respond honestly instead of pretending).
func (h *AuthHandler) SetEmail(e *email.Service) { h.email = e }

func (h *AuthHandler) Login(c *gin.Context) {
	var req model.LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	userID, email, role, branchID, err := h.svc.Login(c.Request.Context(), req.Email, req.Password)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials"})
		return
	}

	tokens, err := auth.GenerateTokenPair(userID, email, role, branchID, h.config.JWTSecret, h.config.JWTAccessExpiry, h.config.JWTRefreshExpiry)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate tokens"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"user": gin.H{
			"id":        userID,
			"email":     email,
			"role":      role,
			"branch_id": branchID,
		},
		"tokens": tokens,
	})
}

// Register creates the account and emails the verification link to the user's
// real inbox. The account can sign in immediately but stays unverified until
// the emailed link is used.
func (h *AuthHandler) Register(c *gin.Context) {
	var req model.RegisterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	userID, err := h.svc.Register(c.Request.Context(), req.Name, req.Email, req.Password, req.Role, req.BranchID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	verificationSent := false
	if h.email != nil && h.email.Enabled() {
		raw, terr := h.svc.IssueToken(c.Request.Context(), userID, auth.TokenVerifyEmail, auth.VerifyTTL())
		if terr == nil {
			ctx, cancel := contextWithTimeout()
			defer cancel()
			if _, serr := h.email.SendVerificationEmail(ctx, req.Email, req.Name, raw); serr == nil {
				verificationSent = true
			} else {
				ginLog("failed to send verification email: " + serr.Error())
			}
		} else {
			ginLog("failed to issue verification token: " + terr.Error())
		}
	}

	c.JSON(http.StatusCreated, gin.H{
		"id":      userID,
		"message": "user registered",
		"email_verification_sent": verificationSent,
	})
}

// VerifyEmail consumes the emailed token and marks the account verified,
// then sends the welcome email.
func (h *AuthHandler) VerifyEmail(c *gin.Context) {
	var req model.VerifyEmailRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "verification token is required"})
		return
	}

	userID, err := h.svc.ConsumeToken(c.Request.Context(), req.Token, auth.TokenVerifyEmail)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid or expired verification link"})
		return
	}

	if err := h.svc.MarkEmailVerified(c.Request.Context(), userID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to verify account"})
		return
	}

	// Welcome email is best-effort; verification itself already succeeded.
	if u, gerr := h.repo.GetByID(c.Request.Context(), userID); gerr == nil && h.email != nil && h.email.Enabled() {
		ctx, cancel := contextWithTimeout()
		defer cancel()
		if _, serr := h.email.SendWelcomeEmail(ctx, u.Email, u.Name); serr != nil {
			ginLog("welcome email failed: " + serr.Error())
		}
	}

	c.JSON(http.StatusOK, gin.H{"message": "email verified"})
}

// ForgotPassword always answers 200 (never reveals whether an account exists)
// and emails a reset link when the address is registered.
func (h *AuthHandler) ForgotPassword(c *gin.Context) {
	var req model.ForgotPasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "email is required"})
		return
	}

	if h.email == nil || !h.email.Enabled() {
		c.JSON(http.StatusServiceUnavailable, gin.H{
			"error": "email is not configured on the server (set RESEND_API_KEY and EMAIL_FROM)",
		})
		return
	}

	user, err := h.repo.GetByEmail(c.Request.Context(), req.Email)
	if err == nil && user != nil && user.DeletedAt == nil {
		if raw, terr := h.svc.IssueToken(c.Request.Context(), user.ID, auth.TokenResetPassword, auth.ResetTTL()); terr == nil {
			ctx, cancel := contextWithTimeout()
			defer cancel()
			if _, serr := h.email.SendPasswordResetEmail(ctx, user.Email, user.Name, raw); serr != nil {
				ginLog("reset email failed: " + serr.Error())
			}
		}
	}

	c.JSON(http.StatusOK, gin.H{"message": "if that address is registered, a reset link is on its way"})
}

// ResetPassword consumes the emailed token and sets the new password.
func (h *AuthHandler) ResetPassword(c *gin.Context) {
	var req model.ResetPasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "token and new password are required"})
		return
	}
	if len(req.NewPassword) < 8 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "new password must be at least 8 characters"})
		return
	}

	userID, err := h.svc.ConsumeToken(c.Request.Context(), req.Token, auth.TokenResetPassword)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid or expired reset link"})
		return
	}

	if err := h.svc.UpdatePassword(c.Request.Context(), userID, req.NewPassword); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update password"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "password updated — you can sign in with the new password"})
}

func (h *AuthHandler) Refresh(c *gin.Context) {
	var req model.RefreshRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	claims, err := auth.ValidateToken(req.RefreshToken, h.config.JWTSecret)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid refresh token"})
		return
	}

	tokens, err := auth.GenerateTokenPair(claims.UserID, claims.Email, claims.Role, claims.BranchID, h.config.JWTSecret, h.config.JWTAccessExpiry, h.config.JWTRefreshExpiry)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate tokens"})
		return
	}

	_ = time.Now() // keep time import used
	c.JSON(http.StatusOK, gin.H{"tokens": tokens})
}
