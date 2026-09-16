package handler

import (
	"net/http"
	"strings"
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

	emailVerified := false
	if u, gerr := h.repo.GetByID(c.Request.Context(), userID); gerr == nil {
		emailVerified = u.EmailVerifiedAt != nil
	}

	c.JSON(http.StatusOK, gin.H{
		"user": gin.H{
			"id":             userID,
			"email":          email,
			"role":           role,
			"branch_id":      branchID,
			"email_verified": emailVerified,
		},
		"tokens": tokens,
	})
}

// sendVerificationCode issues a fresh 6-digit code and emails it. Returns
// whether the email actually went out (false = email not configured, or the
// send failed — the account is still created either way).
func (h *AuthHandler) sendVerificationCode(c *gin.Context, userID, emailAddr, name string) bool {
	if h.email == nil || !h.email.Enabled() {
		return false
	}
	code, err := h.svc.IssueCode(c.Request.Context(), userID)
	if err != nil {
		ginLog("failed to issue verification code: " + err.Error())
		return false
	}
	ctx, cancel := contextWithTimeout()
	defer cancel()
	if _, serr := h.email.SendVerificationCode(ctx, emailAddr, name, code); serr != nil {
		ginLog("failed to send verification code: " + serr.Error())
		return false
	}
	return true
}

// Signup is the public business-owner flow: a name, email and password create
// a Corporate Admin (the existing top role) plus attach them to their branch
// (the business/tenant). The account is then verified by a 6-digit code mailed
// by Resend before the admin dashboard unlocks.
func (h *AuthHandler) Signup(c *gin.Context) {
	var req model.SignupRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	req.Email = strings.TrimSpace(req.Email)
	if len(req.Password) < 8 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "password must be at least 8 characters"})
		return
	}
	if !strings.Contains(req.Email, "@") {
		c.JSON(http.StatusBadRequest, gin.H{"error": "enter a valid email address"})
		return
	}

	userID, err := h.svc.Register(c.Request.Context(), req.Name, req.Email, req.Password, "Corporate Admin", "")
	if err != nil {
		c.JSON(http.StatusConflict, gin.H{"error": "an account with that email already exists"})
		return
	}

	// Business/tenant = branch. Claim the default branch for the new owner.
	if branchID, berr := h.svc.EnsureDefaultBranch(c.Request.Context()); berr == nil {
		_ = h.svc.SetBranch(c.Request.Context(), userID, branchID)
	}

	verificationSent := h.sendVerificationCode(c, userID, req.Email, req.Name)

	c.JSON(http.StatusCreated, gin.H{
		"message":               "account created — check your email for the 6-digit verification code",
		"email_verification_sent": verificationSent,
	})
}

// VerifyCode checks the submitted 6-digit code against the stored one,
// validates expiry and single-use, then marks the account verified.
func (h *AuthHandler) VerifyCode(c *gin.Context) {
	var req model.VerifyCodeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "email and code are required"})
		return
	}
	req.Email = strings.TrimSpace(req.Email)
	req.Code = strings.TrimSpace(req.Code)

	user, err := h.repo.GetByEmail(c.Request.Context(), req.Email)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid or expired verification code"})
		return
	}
	if user.EmailVerifiedAt != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "email already verified"})
		return
	}

	if err := h.svc.ConsumeCode(c.Request.Context(), user.ID, req.Code); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid or expired verification code"})
		return
	}

	if err := h.svc.MarkEmailVerified(c.Request.Context(), user.ID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to verify account"})
		return
	}

	// Welcome email is best-effort; verification itself already succeeded.
	if h.email != nil && h.email.Enabled() {
		ctx, cancel := contextWithTimeout()
		defer cancel()
		if _, serr := h.email.SendWelcomeEmail(ctx, user.Email, user.Name); serr != nil {
			ginLog("welcome email failed: " + serr.Error())
		}
	}

	c.JSON(http.StatusOK, gin.H{"message": "email verified — welcome to Mesa OS"})
}

// ResendCode sends a fresh 6-digit code, throttled to one per 60 seconds.
// Unknown addresses get the same "on its way" answer so the endpoint never
// reveals whether an account exists.
func (h *AuthHandler) ResendCode(c *gin.Context) {
	var req model.ResendCodeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "email is required"})
		return
	}
	req.Email = strings.TrimSpace(req.Email)

	user, err := h.repo.GetByEmail(c.Request.Context(), req.Email)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"message": "if that address is registered, a new code is on its way"})
		return
	}
	if user.EmailVerifiedAt != nil {
		c.JSON(http.StatusOK, gin.H{"message": "that email is already verified"})
		return
	}

	ok, err := h.svc.CanResend(c.Request.Context(), user.ID)
	if err != nil || !ok {
		c.JSON(http.StatusTooManyRequests, gin.H{"error": "please wait 60 seconds before requesting another code"})
		return
	}

	sent := h.sendVerificationCode(c, user.ID, user.Email, user.Name)
	c.JSON(http.StatusOK, gin.H{
		"message":                 "if that address is registered, a new code is on its way",
		"email_verification_sent": sent,
	})
}

// Me returns the current session's profile — used after the Google OAuth
// redirect lands on the frontend, and by the verify gate.
func (h *AuthHandler) Me(c *gin.Context) {
	userID := c.GetString("user_id")
	user, err := h.repo.GetByID(c.Request.Context(), userID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}
	branchID := ""
	if user.BranchID != nil {
		branchID = *user.BranchID
	}
	c.JSON(http.StatusOK, gin.H{"user": gin.H{
		"id":             user.ID,
		"name":           user.Name,
		"email":          user.Email,
		"role":           user.Role,
		"branch_id":      branchID,
		"email_verified": user.EmailVerifiedAt != nil,
	}})
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
