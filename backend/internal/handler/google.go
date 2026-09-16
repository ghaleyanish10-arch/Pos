package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/mesa-os/backend/internal/auth"
)

const (
	googleAuthURL     = "https://accounts.google.com/o/oauth2/v2/auth"
	googleTokenURL    = "https://oauth2.googleapis.com/token"
	googleUserInfoURL = "https://www.googleapis.com/oauth2/v2/userinfo"
	googleTimeout     = 15 * time.Second
)

// GoogleRedirect points the browser at Google's consent screen. The OAuth
// secret never leaves the server: the exchange happens entirely in the
// callback below.
func (h *AuthHandler) GoogleRedirect(c *gin.Context) {
	if h.config.GoogleClientID == "" || h.config.GoogleClientSecret == "" {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Google sign-in is not configured on the server (set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET)"})
		return
	}

	authURL := fmt.Sprintf(
		"%s?client_id=%s&redirect_uri=%s&response_type=code&scope=openid%%20email%%20profile&prompt=select_account",
		googleAuthURL,
		url.QueryEscape(h.config.GoogleClientID),
		url.QueryEscape(h.config.GoogleRedirectURL),
	)
	c.Redirect(http.StatusTemporaryRedirect, authURL)
}

// GoogleCallback exchanges Google's authorization code for the user's profile,
// finds or creates the matching Mesa OS account (role Corporate Admin — the
// business owner), mints a JWT pair and bounces back to the frontend with the
// token. Codes are single-use by design: Google rotates each authorization code.
func (h *AuthHandler) GoogleCallback(c *gin.Context) {
	if h.config.GoogleClientID == "" || h.config.GoogleClientSecret == "" {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Google sign-in is not configured on the server (set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET)"})
		return
	}

	code := c.Query("code")
	if code == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "missing authorization code"})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), googleTimeout)
	defer cancel()

	info, err := exchangeGoogleCode(ctx, h.config.GoogleClientID, h.config.GoogleClientSecret, h.config.GoogleRedirectURL, code)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "google sign-in failed: " + err.Error()})
		return
	}

	if info.Email == "" {
		c.JSON(http.StatusBadGateway, gin.H{"error": "google sign-in failed: no email returned by Google"})
		return
	}

	// 1. Fast path: this Google identity is already bound to an account.
	userID, bound, err := h.svc.FindOAuthAccount(ctx, "google", info.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to look up google account"})
		return
	}

	// 2. No Google binding — is there a users row with this email?
	if !bound {
		if existing, gerr := h.repo.GetByEmail(ctx, info.Email); gerr == nil {
			if err := h.svc.BindOAuthAccount(ctx, existing.ID, "google", info.ID, info.Email); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to link google account"})
				return
			}
			userID = existing.ID
			bound = true
			// Google only returns addresses it has verified.
			if info.VerifiedEmail && existing.EmailVerifiedAt == nil {
				_ = h.svc.MarkEmailVerified(ctx, existing.ID)
			}
		}
	}

	// 3. Brand-new owner: user + oauth binding in one transaction.
	if !bound {
		branchID, berr := h.svc.EnsureDefaultBranch(ctx)
		if berr != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to initialise business branch"})
			return
		}
		createdID, taken, oerr := h.svc.RegisterOAuthUser(ctx, info.Name, info.Email, "google", info.ID, branchID)
		if oerr != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create account"})
			return
		}
		if taken {
			c.JSON(http.StatusConflict, gin.H{"error": "an account with that email already exists — sign in with your password instead"})
			return
		}
		userID = createdID
	}

	// Every account gets a branch (their business/tenant), even pre-existing ones.
	if branchID, berr := h.svc.EnsureDefaultBranch(ctx); berr == nil {
		_ = h.svc.SetBranch(ctx, userID, branchID)
	}

	// Load the canonical profile so the session carries the real role/email.
	user, err := h.repo.GetByID(ctx, userID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "account not found"})
		return
	}
	branchID := ""
	if user.BranchID != nil {
		branchID = *user.BranchID
	}
	tokens, err := auth.GenerateTokenPair(userID, user.Email, user.Role, branchID, h.config.JWTSecret, h.config.JWTAccessExpiry, h.config.JWTRefreshExpiry)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate tokens"})
		return
	}

	// Bounce back to the frontend with the session token; the SPA stores it and
	// hydrates the profile from /auth/me.
	redirect := fmt.Sprintf("%s/auth/callback?token=%s&email=%s",
		h.appURLOrLocal(), tokens.AccessToken, url.QueryEscape(user.Email))
	c.Redirect(http.StatusFound, redirect)
}

// appURLOrLocal prefers the configured APP_URL and falls back to the backend
// origin when unset — both point at the frontend in the default dev setup.
func (h *AuthHandler) appURLOrLocal() string {
	app := strings.TrimRight(strings.TrimSpace(h.config.AppURL), "/")
	if app == "" {
		return "http://localhost:5173"
	}
	return app
}

// googleUserInfo is the slice of the Google /oauth2/v2/userinfo response the
// signup flow consumes.
type googleUserInfo struct {
	ID            string `json:"id"`
	Email         string `json:"email"`
	Name          string `json:"name"`
	VerifiedEmail bool   `json:"verified_email"`
}

// exchangeGoogleCode trades an authorization code for an access token, then
// fetches the profile. Both calls keep the client secret in the request body
// or header — it is never composed into a URL, and never returned.
func exchangeGoogleCode(ctx context.Context, clientID, clientSecret, redirectURL, code string) (*googleUserInfo, error) {
	form := url.Values{}
	form.Set("code", code)
	form.Set("client_id", clientID)
	form.Set("client_secret", clientSecret)
	form.Set("redirect_uri", redirectURL)
	form.Set("grant_type", "authorization_code")

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, googleTokenURL, strings.NewReader(form.Encode()))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	client := &http.Client{Timeout: googleTimeout}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("token exchange: %w", err)
	}
	defer resp.Body.Close()

	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("token exchange (status %d)", resp.StatusCode)
	}

	var tokenResp struct {
		AccessToken string `json:"access_token"`
	}
	if err := json.Unmarshal(raw, &tokenResp); err != nil {
		return nil, fmt.Errorf("decode token response: %w", err)
	}
	if tokenResp.AccessToken == "" {
		return nil, fmt.Errorf("no access token in exchange response")
	}

	ureq, err := http.NewRequestWithContext(ctx, http.MethodGet, googleUserInfoURL, nil)
	if err != nil {
		return nil, err
	}
	ureq.Header.Set("Authorization", "Bearer "+tokenResp.AccessToken)

	uresp, err := client.Do(ureq)
	if err != nil {
		return nil, fmt.Errorf("fetch profile: %w", err)
	}
	defer uresp.Body.Close()

	uraw, _ := io.ReadAll(io.LimitReader(uresp.Body, 1<<20))
	if uresp.StatusCode >= 400 {
		return nil, fmt.Errorf("fetch profile (status %d)", uresp.StatusCode)
	}

	var info googleUserInfo
	if err := json.Unmarshal(uraw, &info); err != nil {
		return nil, fmt.Errorf("decode profile: %w", err)
	}
	return &info, nil
}