package handler

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/mesa-os/backend/internal/mailer"
	"github.com/mesa-os/backend/internal/model"
	"github.com/mesa-os/backend/internal/repo"
)

type TransactionHandler struct {
	repo   *repo.TransactionRepo
	orders *repo.OrderRepo
	mailer *mailer.Mailer
}

func NewTransactionHandler(r *repo.TransactionRepo) *TransactionHandler {
	return &TransactionHandler{repo: r}
}

// SetMailer attaches optional SMTP delivery (nil mailer = email disabled).
func (h *TransactionHandler) SetMailer(m *mailer.Mailer) { h.mailer = m }

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

	branchID, _ := c.Get("branch_id")

	tx := &model.Transaction{
		OrderID:  &req.OrderID,
		Ref:      req.Ref,
		Method:   req.Method,
		Amount:   req.Amount,
		BranchID: strPtr(branchID.(string)),
	}

	if err := h.repo.Create(c.Request.Context(), tx); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, tx)
}

// TxEmailRequest is the body for the transaction receipt-email endpoint.
type TxEmailRequest struct {
	To string `json:"to"`
}

// SendByEmail emails a payment receipt for a transaction via real SMTP.
// With the API offline (mock data on the frontend) the frontend degrades to
// a prefilled mailto: link, mirroring the invoice flow.
func (h *TransactionHandler) SendByEmail(c *gin.Context) {
	var req TxEmailRequest
	_ = c.ShouldBindJSON(&req)
	to := strings.TrimSpace(req.To)
	if to == "" || !emailRe.MatchString(to) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "a valid recipient email is required"})
		return
	}

	if h.mailer == nil || !h.mailer.Configured() {
		c.JSON(http.StatusServiceUnavailable, gin.H{
			"error": "email is not configured on the server (set SMTP_HOST and SMTP_FROM)",
		})
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
	if err := h.mailer.SendReceiptEmail(to, ref, tx.Method, tx.TableName, tx.Amount, tx.CreatedAt, lines, tx.FiscalID); err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "could not send email: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "receipt emailed to " + to, "to": to})
}

func (h *TransactionHandler) ManualPayment(c *gin.Context) {
	var req model.ManualPaymentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	branchID, _ := c.Get("branch_id")

	tx := &model.Transaction{
		Method:   req.Method,
		Amount:   req.Amount,
		BranchID: strPtr(branchID.(string)),
	}

	if err := h.repo.Create(c.Request.Context(), tx); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, tx)
}
