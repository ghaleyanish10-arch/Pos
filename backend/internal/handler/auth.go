package handler

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/mesa-os/backend/internal/auth"
	"github.com/mesa-os/backend/internal/config"
	"github.com/mesa-os/backend/internal/model"
	"github.com/mesa-os/backend/internal/repo"
)

type AuthHandler struct {
	svc    *auth.Service
	repo   *repo.UserRepo
	config *config.Config
}

func NewAuthHandler(svc *auth.Service, r *repo.UserRepo, cfg *config.Config) *AuthHandler {
	return &AuthHandler{svc: svc, repo: r, config: cfg}
}

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
			"id":       userID,
			"email":    email,
			"role":     role,
			"branch_id": branchID,
		},
		"tokens": tokens,
	})
}

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

	c.JSON(http.StatusCreated, gin.H{"id": userID, "message": "user registered"})
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
