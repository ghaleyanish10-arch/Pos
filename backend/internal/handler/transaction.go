package handler

import (
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/mesa-os/backend/internal/email"
	"github.com/mesa-os/backend/internal/mailer"
	"github.com/mesa-os/backend/internal/model"
	"github.com/mesa-os/backend/internal/repo"
)

type TransactionHandler struct {
	repo     *repo.TransactionRepo
	orders   *repo.OrderRepo
	mailer   *mailer.Mailer
	emailSvc *email.Service
}

// paymentMethods is the allowlist of tender types the POS accepts. The
// frontend sends lowercase values (cash/card/qr/split/esewa/khalti/imepay);
// values are normalized to lowercase before this check.
var paymentMethods = map[string]bool{
	"cash":    true,
	"card":    true,
	"qr":      true,
	"split":   true,
	"esewa":   true,
	"khalti":  true,
	"imepay":  true,
	"fonepay": true,
	"wallet":  true,
	"bank":    true,
}

func NewTransactionHandler(r *repo.TransactionRepo) *TransactionHandler {
	return &TransactionHandler{repo: r}
}

// SetMailer attaches optional SMTP delivery (nil mailer = email disabled).
func (h *TransactionHandler) SetMailer(m *mailer.Mailer) { h.mailer = m }

// SetEmail attaches the configured Resend service. The receipt endpoint
// prefers it, falling back to SMTP, so the one body format is shared.
func (h *TransactionHandler) SetEmail(s *email.Service) { h.emailSvc = s }

// SetOrderRepo lets the receipt email include the order's line items.
func (h *TransactionHandler) SetOrderRepo(o *repo.OrderRepo) { h.orders = o }

func (h *TransactionHandler) List(c *gin.Context) {
	branchID := c.Query("branch_id")

	txs, err := h.repo.List(c.Request.Context(), branchID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": txs})
}

func (h *TransactionHandler) Create(c *gin.Context) {
	var req model.CreateTransactionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if req.Amount <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "amount must be greater than zero"})
		return
	}
	req.Method = strings.ToLower(strings.TrimSpace(req.Method))
	if !paymentMethods[req.Method] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "unsupported payment method: " + req.Method})
		return
	}
	if req.OrderID != "" {
		if !validUUID(req.OrderID) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "order_id must be a valid UUID"})
			return
		}
		if h.orders != nil {
			if _, err := h.orders.GetByID(c.Request.Context(), req.OrderID); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "order not found"})
				return
			}
		}
	}

	branchID, _ := c.Get("branch_id")
	branch := ""
	if s, ok := branchID.(string); ok {
		branch = s
	}

	tx := &model.Transaction{
		OrderID:   &req.OrderID,
		Ref:       req.Ref,
		Method:    req.Method,
		Amount:    req.Amount,
		SplitID:   req.SplitID,
		SplitNote: req.SplitNote,
		BranchID:  strPtr(branch),
	}

	orderFullyPaid, err := h.repo.Create(c.Request.Context(), tx)
	if err != nil {
		if errors.Is(err, repo.ErrPaymentExceedsOrder) {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Auto-vacate the table ONLY when this payment settled the last rupee of
	// the order. Split bills post one transaction per guest against the same
	// order_id — guest 1 of 3 paying in must NOT close the party out, so the
	// close is gated on the fully-paid signal, not on "a payment arrived".
	// Closing flips the order to 'closed', which is what the floor derives the
	// table back to 'Open' from. If that close misfires the money is still
	// recorded — we log it loudly and tell this POS in the response, instead
	// of silently leaving a paid table 'Seated' until someone notices smoke.
	orderClosed := false
	warning := ""
	if orderFullyPaid {
		if h.orders == nil {
			ginLog("order " + req.OrderID + " fully paid but order store is not wired — left seated")
			warning = "payment recorded, but the order could not be closed on the server — please close the table manually"
		} else if cerr := h.orders.Update(c.Request.Context(), req.OrderID, "closed"); cerr != nil {
			ginLog("CRITICAL: payment recorded for order " + req.OrderID + " but closing the order FAILED: " + cerr.Error() + " — table may stay Seated")
			warning = "payment recorded, but failed to auto-close this order — please close the table manually"
		} else {
			orderClosed = true
		}
	}

	resp := gin.H{"data": tx, "order_closed": orderClosed}
	if warning != "" {
		resp["warning"] = warning
	}
	c.JSON(http.StatusCreated, resp)
}

// TxEmailRequest is the body for the transaction receipt-email endpoint.
type TxEmailRequest struct {
	To string `json:"to"`
}

// SendByEmail emails a payment receipt for a transaction. The Resend service
// (email.Service) is preferred because it is the configured transport in
// production; SMTP is the legacy fallback. With neither configured the API
// answers 503 and the frontend says so honestly.
func (h *TransactionHandler) SendByEmail(c *gin.Context) {
	var req TxEmailRequest
	_ = c.ShouldBindJSON(&req)
	to := strings.TrimSpace(req.To)
	if to == "" || !emailRe.MatchString(to) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "a valid recipient email is required"})
		return
	}

	tx, err := h.repo.GetByID(c.Request.Context(), c.Param("id"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "transaction not found"})
		return
	}

	lines := []mailer.Line{}
	if h.orders != nil && tx.OrderID != nil && *tx.OrderID != "" {
		if order, oerr := h.orders.GetByID(c.Request.Context(), *tx.OrderID); oerr == nil {
			for _, it := range order.Items {
				lines = append(lines, mailer.Line{Description: it.Name, Qty: it.Qty, UnitPrice: it.Price})
			}
		}
	}

	ref := tx.Ref
	if ref == "" {
		ref = "TXN-" + strings.ToUpper(tx.ID[:8])
	}

	if h.emailSvc != nil && h.emailSvc.Enabled() {
		subject := fmt.Sprintf("Payment receipt %s — %s", ref, mailer.FormatRs(tx.Amount))
		html := mailer.ReceiptHTML(ref, tx.Method, tx.TableName, tx.Amount, tx.CreatedAt, lines, tx.FiscalID)
		text := mailer.ReceiptText(ref, tx.Method, tx.TableName, tx.Amount, tx.CreatedAt, lines, tx.FiscalID)
		id, serr := h.emailSvc.Send(c.Request.Context(), to, subject, html, text)
		if serr != nil {
			ginLog("receipt email to " + to + " failed: " + serr.Error())
			c.JSON(http.StatusBadGateway, gin.H{"error": "could not send email: " + serr.Error()})
			return
		}
		ginLog("receipt emailed to " + to + " (resend id: " + id + ")")
		c.JSON(http.StatusOK, gin.H{"message": "receipt emailed to " + to, "to": to})
		return
	}

	if h.mailer != nil && h.mailer.Configured() {
		if merr := h.mailer.SendReceiptEmail(to, ref, tx.Method, tx.TableName, tx.Amount, tx.CreatedAt, lines, tx.FiscalID); merr != nil {
			c.JSON(http.StatusBadGateway, gin.H{"error": "could not send email: " + merr.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "receipt emailed to " + to, "to": to})
		return
	}

	c.JSON(http.StatusServiceUnavailable, gin.H{
		"error": "email is not configured on the server (set RESEND_API_KEY and EMAIL_FROM, or SMTP_HOST and SMTP_FROM)",
	})
}

func (h *TransactionHandler) ManualPayment(c *gin.Context) {
	var req model.ManualPaymentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if req.Amount <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "amount must be greater than zero"})
		return
	}
	req.Method = strings.ToLower(strings.TrimSpace(req.Method))
	if !paymentMethods[req.Method] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "unsupported payment method: " + req.Method})
		return
	}

	branchID, _ := c.Get("branch_id")
	branch := ""
	if s, ok := branchID.(string); ok {
		branch = s
	}

	tx := &model.Transaction{
		Method:   req.Method,
		Amount:   req.Amount,
		BranchID: strPtr(branch),
	}

	if _, err := h.repo.Create(c.Request.Context(), tx); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, tx)
}
