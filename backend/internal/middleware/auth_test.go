package middleware

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/mesa-os/backend/internal/auth"
)

func setupAuthMiddleware(secret string) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.GET("/test", AuthMiddleware(secret), func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"user_id":   c.GetString("user_id"),
			"email":     c.GetString("email"),
			"role":      c.GetString("role"),
			"branch_id": c.GetString("branch_id"),
		})
	})
	return r
}

func TestAuthMiddlewareMissingHeader(t *testing.T) {
	r := setupAuthMiddleware("secret")
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	r.ServeHTTP(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("got %d, want 401", w.Code)
	}
	if w.Body.String() == "" {
		t.Error("expected error body")
	}
}

func TestAuthMiddlewareInvalidFormat(t *testing.T) {
	r := setupAuthMiddleware("secret")
	for _, h := range []string{"Token abc", "Bearer", "Bearer a b", "Basic abc"} {
		w := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, "/test", nil)
		req.Header.Set("Authorization", h)
		r.ServeHTTP(w, req)
		if w.Code != http.StatusUnauthorized {
			t.Errorf("header %q got %d, want 401", h, w.Code)
		}
	}
}

func TestAuthMiddlewareInvalidToken(t *testing.T) {
	r := setupAuthMiddleware("real-secret")
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	req.Header.Set("Authorization", "Bearer garbage")
	r.ServeHTTP(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("got %d, want 401", w.Code)
	}

	// Token signed with a different secret must also be rejected.
	tokens, err := auth.GenerateTokenPair("u1", "a@b.c", "Cashier", "b1", "other-secret", 5*time.Minute, time.Hour)
	if err != nil {
		t.Fatalf("generate token: %v", err)
	}
	w = httptest.NewRecorder()
	req = httptest.NewRequest(http.MethodGet, "/test", nil)
	req.Header.Set("Authorization", "Bearer "+tokens.AccessToken)
	r.ServeHTTP(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Errorf("wrong-secret token got %d, want 401", w.Code)
	}
}

func TestAuthMiddlewareValidToken(t *testing.T) {
	r := setupAuthMiddleware("secret")
	tokens, err := auth.GenerateTokenPair("user-1", "cashier@mesa.os", "Cashier", "branch-1", "secret", 5*time.Minute, time.Hour)
	if err != nil {
		t.Fatalf("generate token: %v", err)
	}

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	req.Header.Set("Authorization", "Bearer "+tokens.AccessToken)
	r.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("got %d: %s", w.Code, w.Body.String())
	}
	body := w.Body.String()
	for _, want := range []string{`"user_id":"user-1"`, `"email":"cashier@mesa.os"`, `"role":"Cashier"`, `"branch_id":"branch-1"`} {
		if !strings.Contains(body, want) {
			t.Errorf("body missing %s: %s", want, body)
		}
	}
}
