package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/mesa-os/backend/internal/model"
	"github.com/mesa-os/backend/internal/repo"
)

// GatewayHandler serves the Nepal payment-gateway configuration and the
// stubbed confirmation flow.
type GatewayHandler struct {
	repo *repo.GatewayRepo
}

func NewGatewayHandler(r *repo.GatewayRepo) *GatewayHandler {
	return &GatewayHandler{repo: r}
}

// List returns the client-safe gateway statuses (no key material).
func (h *GatewayHandler) List(c *gin.Context) {
	branchID, _ := c.Get("branch_id")
	branch, _ := branchID.(string)
	out, err := h.repo.List(c.Request.Context(), branch)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list gateways"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": out})
}

// Save upserts one gateway's credentials. Keys live server-side only.
func (h *GatewayHandler) Save(c *gin.Context) {
	provider := c.Param("provider")
	if !model.GatewayProviders[provider] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "unknown gateway provider"})
		return
	}
	var req model.SaveGatewayRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "merchant_id, api_key, sandbox and enabled are required"})
		return
	}
	branchID, _ := c.Get("branch_id")
	branch, _ := branchID.(string)
	if err := h.repo.Save(c.Request.Context(), branch, provider, req); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save gateway"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": provider + " saved — key stored server-side"})
}

// Charge is the STUBBED payment confirmation flow: it validates the gateway
// is enabled, then simulates success/failure exactly as the UI asked.
//
// TODO(gateway-integration): replace the simulation with the real SDK call —
//   - eSewa:   epay/main?amt=...&scd=MERCHANT_ID (form redirect + status check)
//   - Khalti:  POST https://a.khalti.com/api/v2/epayment/initiate/ (Header: Authorization: Key <live|test> <key>)
//   - IME Pay: tokenized handshake via their merchant API
//   The sandbox/live toggle in payment_gateways picks the base URL when real.
func (h *GatewayHandler) Charge(c *gin.Context) {
	provider := c.Param("provider")
	if !model.GatewayProviders[provider] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "unknown gateway provider"})
		return
	}
	enabled, err := h.repo.IsEnabled(c.Request.Context(), provider)
	if err != nil || !enabled {
		c.JSON(http.StatusConflict, gin.H{"error": provider + " is not enabled — configure it in Settings first"})
		return
	}

	var req model.GatewayChargeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "amount is required"})
		return
	}

	// STUB: simulated outcome, marked in the response so the UI shows it
	// honestly rather than pretending a real charge happened.
	simulated := req.Outcome != "failure"

	c.JSON(http.StatusOK, gin.H{
		"simulated": true,
		"provider":  provider,
		"status":    map[bool]string{true: "Success", false: "Failed"}[simulated],
		"amount":    req.Amount,
		"order_id":  req.OrderID,
	})
}

// PrinterHandler serves the printer-assignment configuration.
type PrinterHandler struct {
	repo *repo.PrinterRepo
}

func NewPrinterHandler(r *repo.PrinterRepo) *PrinterHandler {
	return &PrinterHandler{repo: r}
}

func (h *PrinterHandler) List(c *gin.Context) {
	branchID, _ := c.Get("branch_id")
	branch, _ := branchID.(string)
	out, err := h.repo.List(c.Request.Context(), branch)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list printers"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": out})
}

func (h *PrinterHandler) Save(c *gin.Context) {
	var req model.SavePrinterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "station, printer and role are required"})
		return
	}
	if req.Role != "kot" && req.Role != "receipt" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "role must be kot or receipt"})
		return
	}
	branchID, _ := c.Get("branch_id")
	branch, _ := branchID.(string)
	out, err := h.repo.Save(c.Request.Context(), branch, req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save printer assignment"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": out})
}

func (h *PrinterHandler) Delete(c *gin.Context) {
	if err := h.repo.Delete(c.Request.Context(), c.Param("id")); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete printer assignment"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "printer assignment removed"})
}

// TestPrint is config-only for now: it validates the assignment exists and
// answers honestly that no physical print was sent.
//
// TODO(printer-integration): hand the job to the ESC/POS spawner once the
// real driver layer exists; the assignment rows are already the right shape.
func (h *PrinterHandler) TestPrint(c *gin.Context) {
	branchID, _ := c.Get("branch_id")
	branch, _ := branchID.(string)
	list, err := h.repo.List(c.Request.Context(), branch)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to look up assignment"})
		return
	}
	for _, p := range list {
		if p.ID == c.Param("id") {
			c.JSON(http.StatusOK, gin.H{
				"simulated": true,
				"message":   "test queued for " + p.Printer + " (" + p.Role + ") — config-only, no physical print sent yet",
			})
			return
		}
	}
	c.JSON(http.StatusNotFound, gin.H{"error": "assignment not found"})
}
