package handler_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"github.com/gin-gonic/gin"
)

// doReqJSON mirrors doReq but lives here so these helpers are self-contained.
func doReqJSON(r *gin.Engine, method, path, token string, body any) *httptest.ResponseRecorder {
	var buf bytes.Buffer
	if body != nil {
		_ = json.NewEncoder(&buf).Encode(body)
	}
	req := httptest.NewRequest(method, path, &buf)
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

// userIDs maps test email -> user id, filled by registerAndLogin.
var userIDs sync.Map

// uid returns the stored user id for a test email (set during registerAndLogin).
func uid(email string) string {
	v, _ := userIDs.Load(email)
	s, _ := v.(string)
	return s
}

// loginBoss logs in the seeded admin (boss) and records their user id for
// uid("admin@mesa.os") lookups — loginAdmin does not capture the id.
func loginBoss(t *testing.T, r *gin.Engine) string {
	t.Helper()
	w := doReqJSON(r, http.MethodPost, "/api/v1/auth/login", "", map[string]string{
		"email": "admin@mesa.os", "password": "admin123",
	})
	if w.Code != http.StatusOK {
		t.Fatalf("boss login returned %d: %s", w.Code, w.Body.String())
	}
	var resp struct {
		User struct {
			ID string `json:"id"`
		} `json:"user"`
		Tokens struct {
			AccessToken string `json:"access_token"`
		} `json:"tokens"`
	}
	if err := jsonUnmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode boss login: %v", err)
	}
	if resp.Tokens.AccessToken == "" || resp.User.ID == "" {
		t.Fatal("boss login missing token or user id")
	}
	userIDs.Store("admin@mesa.os", resp.User.ID)
	return resp.Tokens.AccessToken
}

func jsonUnmarshal(b []byte, v any) error {
	return json.Unmarshal(b, v)
}

func contains(haystack, needle string) bool {
	return strings.Contains(haystack, needle)
}

// doReqWithElevation sends a request with both the session token and the
// X-Elevation-Token header, mirroring the frontend's privileged retry.
func doReqWithElevation(r *gin.Engine, method, path, sessionToken, elevationToken string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, nil)
	req.Header.Set("Content-Type", "application/json")
	if sessionToken != "" {
		req.Header.Set("Authorization", "Bearer "+sessionToken)
	}
	if elevationToken != "" {
		req.Header.Set("X-Elevation-Token", elevationToken)
	}
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}
