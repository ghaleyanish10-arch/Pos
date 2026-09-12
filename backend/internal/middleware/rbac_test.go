package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func runRequireRole(userRole, minRole string) (statusCode int, allowed bool) {
	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	if userRole != "" {
		c.Set("role", userRole)
	}
	RequireRole(minRole)(c)
	return w.Code, !c.IsAborted()
}

func TestRequireRole_Hierarchy(t *testing.T) {
	cases := []struct {
		name     string
		userRole string
		minRole  string
		allowed  bool
		status   int
	}{
		{"cashier allowed cashier", "Cashier", "Cashier", true, http.StatusOK},
		{"store manager allowed cashier", "Store Manager", "Cashier", true, http.StatusOK},
		{"corporate admin allowed cashier", "Corporate Admin", "Cashier", true, http.StatusOK},
		{"corporate admin allowed corporate admin", "Corporate Admin", "Corporate Admin", true, http.StatusOK},
		{"inventory auditor allowed cashier", "Inventory Auditor", "Cashier", true, http.StatusOK},

		{"cashier denied store manager", "Cashier", "Store Manager", false, http.StatusForbidden},
		{"store manager denied corporate admin", "Store Manager", "Corporate Admin", false, http.StatusForbidden},
		{"cashier denied inventory auditor", "Cashier", "Inventory Auditor", false, http.StatusForbidden},
		{"inventory auditor denied corporate admin", "Inventory Auditor", "Corporate Admin", false, http.StatusForbidden},

		{"missing role denied", "", "Cashier", false, http.StatusForbidden},
		{"unknown role denied", "Owner", "Cashier", false, http.StatusForbidden},
		{"invalid requirement is server error", "Corporate Admin", "CEO", false, http.StatusInternalServerError},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			status, allowed := runRequireRole(tc.userRole, tc.minRole)
			if allowed != tc.allowed {
				t.Errorf("allowed = %v, want %v", allowed, tc.allowed)
			}
			if status != tc.status {
				t.Errorf("status = %d, want %d", status, tc.status)
			}
		})
	}
}