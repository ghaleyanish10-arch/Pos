package handler

import (
	"errors"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/mesa-os/backend/internal/auth"
	"github.com/mesa-os/backend/internal/config"
	"github.com/mesa-os/backend/internal/email"
	"github.com/mesa-os/backend/internal/mailer"
	"github.com/mesa-os/backend/internal/model"
	"github.com/mesa-os/backend/internal/repo"
)

type AuthHandler struct {
	svc    *auth.Service
	repo   *repo.UserRepo
	config *config.Config
	email  *email.Service
	smtp   *mailer.Mailer
}

func NewAuthHandler(svc *auth.Service, r *repo.UserRepo, cfg *config.Config) *AuthHandler {
	return &AuthHandler{svc: svc, repo: r, config: cfg}
}

// SetEmail attaches the centralized email service (nil = email disabled and
// endpoints respond honestly instead of pretending).
func (h *AuthHandler) SetEmail(e *email.Service) { h.email = e }

// SetSMTP attaches the Gmail SMTP mailer used for OTP verification codes.
func (h *AuthHandler) SetSMTP(m *mailer.Mailer) { h.smtp = m }

// Providers tells the landing page which sign-in options the server can
// actually honor, so buttons for unconfigured flows never render. It exposes
// no secrets — only booleans derived from env presence.
func (h *AuthHandler) Providers(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"google":     h.config.GoogleClientID != "" && h.config.GoogleClientSecret != "",
		"password":   true,
		"email_ready": h.email != nil && h.email.Enabled(),
	})
}

func (h *AuthHandler) Login(c *gin.Context) {
	var req model.LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	userID, email, role, branchID, tokenVersion, err := h.svc.Login(c.Request.Context(), req.Email, req.Password)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials"})
		return
	}

	tokens, err := auth.GenerateTokenPair(userID, email, role, branchID, tokenVersion, h.config.JWTSecret, h.config.JWTAccessExpiry, h.config.JWTRefreshExpiry)
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

// sendVerificationCode issues a fresh 6-digit code and emails it. Delivery
// prefers Gmail SMTP (explicit TLS with a 587 STARTTLS fallback); the Resend
// service is the alternate path when SMTP is not configured. Returns whether
// the email actually went out (false = neither transport configured, or the
// send failed — the account is still created either way).
func (h *AuthHandler) sendVerificationCode(c *gin.Context, userID, emailAddr, name string) bool {
	code, err := h.svc.IssueCode(c.Request.Context(), userID)
	if err != nil {
		ginLog("failed to issue verification code: " + err.Error())
		return false
	}

	// Gmail SMTP first — the OTP flow's primary transport.
	if h.smtp != nil && h.smtp.Configured() {
		err := h.smtp.SendVerificationCode(emailAddr, name, code)
		if err == nil {
			ginLog("verification code sent to " + emailAddr + " via smtp")
			return true
		}
		ginLog("smtp verification code send failed: " + err.Error())
		// fall through to Resend before giving up
	}

	if h.email != nil && h.email.Enabled() {
		ctx, cancel := contextWithTimeout()
		defer cancel()
		if id, serr := h.email.SendVerificationCode(ctx, emailAddr, name, code); serr == nil {
			// The Resend message id is the receipt: it proves api.resend.com
			// accepted the email, not just that we attempted a request.
			ginLog("verification code sent to " + emailAddr + " (resend id: " + id + ")")
			return true
		} else {
			ginLog("failed to send verification code to " + emailAddr + ": " + serr.Error())
		}
	}
	return false
}

// Signup is the public business-owner flow: a name, email and password create
// a Corporate Admin (the existing top role) plus attach them to their branch
// (the business/tenant). Email verification is removed for now, so the account
// is created pre-verified and the owner lands straight on the dashboard.
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

	// OTP email verification: the account is created verified (Register stamps
	// email_verified_at now). It is moved to the UNVERIFIED state only when a
	// 6-digit code was actually delivered via Gmail SMTP or the Resend service.
	// Without a working transport no owner could ever complete the step, so
	// leaving the flag set would permanently lock the account out of the
	// verified-gated reports/payroll routes.
	sent := h.sendVerificationCode(c, userID, req.Email, req.Name)
	if sent {
		if verr := h.svc.MarkEmailUnverified(c.Request.Context(), userID); verr != nil {
			ginLog("failed to clear verified flag on signup: " + verr.Error())
		}
	}

	c.JSON(http.StatusCreated, gin.H{
		"message":                 "account created — check your inbox for the 6-digit code",
		"email":                   req.Email,
		"needs_verification":      sent,
		"email_verification_sent": sent,
	})
}

// SendVerificationCode is the standalone code request endpoint: it (re)sends
// a 6-digit OTP to the given address. Same 60-second per-account cooldown and
// IP throttling as ResendCode; same opaque answer for unknown addresses.
func (h *AuthHandler) SendVerificationCode(c *gin.Context) {
	var req model.ResendCodeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "email is required"})
		return
	}
	req.Email = strings.TrimSpace(req.Email)

	user, err := h.repo.GetByEmail(c.Request.Context(), req.Email)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"message": "if that address is registered, a code is on its way"})
		return
	}
	if user.EmailVerifiedAt != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "that email is already verified"})
		return
	}

	ok, rerr := h.svc.CanResend(c.Request.Context(), user.ID)
	if rerr != nil || !ok {
		c.JSON(http.StatusTooManyRequests, gin.H{"error": "please wait 60 seconds before requesting another code"})
		return
	}

	sent := h.sendVerificationCode(c, user.ID, user.Email, user.Name)
	c.JSON(http.StatusOK, gin.H{
		"message":                 "if that address is registered, a code is on its way",
		"email_verification_sent": sent,
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
		if errors.Is(err, auth.ErrCodeExpired) {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": "this code has expired — request a new one",
				"code":  "CODE_EXPIRED",
			})
			return
		}
		// Distinguish "wrong" from "locked": after 5 wrong guesses the live
		// code is burned and only a fresh code (60s cooldown) works.
		if attempts, burned, aerr := h.svc.CodeAttempts(c.Request.Context(), user.ID); aerr == nil {
			if burned || attempts >= auth.MaxCodeAttempts() {
				c.JSON(http.StatusBadRequest, gin.H{
					"error": "too many wrong attempts — request a new code",
					"code":  "CODE_BURNED",
				})
				return
			}
			remaining := auth.MaxCodeAttempts() - attempts
			c.JSON(http.StatusBadRequest, gin.H{
				"error":     "invalid or expired verification code",
				"code":      "CODE_INVALID",
				"remaining": remaining,
			})
			return
		}
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

	// Verification doubles as sign-in: mint the session now so the newly
	// verified owner lands straight on their dashboard instead of typing a
	// password they just proved ownership of the inbox for.
	branchID := ""
	if user.BranchID != nil {
		branchID = *user.BranchID
	}
	tokenVersion, verr := h.svc.CurrentTokenVersion(c.Request.Context(), user.ID)
	if verr != nil {
		tokenVersion = 0
	}
	tokens, terr := auth.GenerateTokenPair(user.ID, user.Email, user.Role, branchID, tokenVersion, h.config.JWTSecret, h.config.JWTAccessExpiry, h.config.JWTRefreshExpiry)
	if terr != nil {
		// Verification still stands — the client falls back to the login page.
		c.JSON(http.StatusOK, gin.H{"message": "email verified — welcome to Mesa OS"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "email verified — welcome to Mesa OS",
		"user": gin.H{
			"id":             user.ID,
			"email":          user.Email,
			"role":           user.Role,
			"branch_id":      branchID,
			"email_verified": true,
		},
		"tokens": tokens,
	})
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

	// A Corporate Admin may only mint accounts with an RBAC-known role; an
	// arbitrary label would bypass the role hierarchy on every gateway.
	req.Role = strings.TrimSpace(req.Role)
	if req.Role == "" {
		req.Role = "Cashier"
	}
	if !allowedStaffRoles[req.Role] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "unsupported role — pick Cashier, Store Manager, Inventory Auditor or Corporate Admin"})
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

// VerifyEmail consumes the emailed proof and marks the account verified,
// then sends the welcome email. Two proof shapes are accepted: the long
// single-use link token (token field) or the 6-digit OTP (email + code).
func (h *AuthHandler) VerifyEmail(c *gin.Context) {
	var req model.VerifyEmailRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "verification token or email+code is required"})
		return
	}

	var userID string
	if strings.TrimSpace(req.Code) != "" {
		// OTP path — same validation as VerifyCode's code branch.
		emailAddr := strings.TrimSpace(req.Email)
		if emailAddr == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "email is required with a code"})
			return
		}
		user, uerr := h.repo.GetByEmail(c.Request.Context(), emailAddr)
		if uerr != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid or expired verification code"})
			return
		}
		if user.EmailVerifiedAt != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "email already verified"})
			return
		}
		if cerr := h.svc.ConsumeCode(c.Request.Context(), user.ID, strings.TrimSpace(req.Code)); cerr != nil {
			if errors.Is(cerr, auth.ErrCodeExpired) {
				c.JSON(http.StatusBadRequest, gin.H{
					"error": "this code has expired — request a new one",
					"code":  "CODE_EXPIRED",
				})
				return
			}
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid or expired verification code"})
			return
		}
		userID = user.ID
	} else if strings.TrimSpace(req.Token) != "" {
		// Link-token path.
		uid, terr := h.svc.ConsumeToken(c.Request.Context(), strings.TrimSpace(req.Token), auth.TokenVerifyEmail)
		if terr != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid or expired verification link"})
			return
		}
		userID = uid
	} else {
		c.JSON(http.StatusBadRequest, gin.H{"error": "verification token or email+code is required"})
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

	// The token must be a genuine typ=refresh token (never a session token)
	// AND belong to a still-existing, non-deleted account. ValidateRefreshToken
	// enforces both before any new pair is minted.
	if err := h.svc.ValidateRefreshToken(c.Request.Context(), req.RefreshToken, h.config.JWTSecret); err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid refresh token"})
		return
	}

	claims, err := auth.ValidateToken(req.RefreshToken, h.config.JWTSecret)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid refresh token"})
		return
	}

	tokenVersion, verr := h.svc.CurrentTokenVersion(c.Request.Context(), claims.UserID)
	if verr != nil {
		tokenVersion = 0
	}
	tokens, err := auth.GenerateTokenPair(claims.UserID, claims.Email, claims.Role, claims.BranchID, tokenVersion, h.config.JWTSecret, h.config.JWTAccessExpiry, h.config.JWTRefreshExpiry)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate tokens"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"tokens": tokens})
}
