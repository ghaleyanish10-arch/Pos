package handler

import (
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/mesa-os/backend/internal/mailer"
	"github.com/mesa-os/backend/internal/model"
	"github.com/mesa-os/backend/internal/repo"
)

var emailRe = regexp.MustCompile(`^[^@\s]+@[^@\s]+\.[^@\s]+$`)

type InvoiceHandler struct {
	repo   *repo.InvoiceRepo
	mailer *mailer.Mailer
}

func NewInvoiceHandler(r *repo.InvoiceRepo) *InvoiceHandler {
	return &InvoiceHandler{repo: r}
}

// SetMailer attaches optional SMTP delivery (nil mailer = email disabled).
func (h *InvoiceHandler) SetMailer(m *mailer.Mailer) { h.mailer = m }

func (h *InvoiceHandler) List(c *gin.Context) {
	status := c.Query("status")

	invoices, err := h.repo.List(c.Request.Context(), status)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": invoices})
}

func (h *InvoiceHandler) GetByID(c *gin.Context) {
	inv, err := h.repo.GetByID(c.Request.Context(), c.Param("id"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "invoice not found"})
		return
	}
	c.JSON(http.StatusOK, inv)
}

func (h *InvoiceHandler) Create(c *gin.Context) {
	var req model.CreateInvoiceRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	branchID, _ := c.Get("branch_id")
	dueDate, err := time.Parse("2006-01-02", req.DueDate)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "due_date must be a valid YYYY-MM-DD date"})
		return
	}

	var total float64
	for _, item := range req.Items {
		total += float64(item.Qty) * item.UnitPrice
	}

	branch := ""
	if b, ok := branchID.(string); ok {
		branch = b
	}

	inv := &model.Invoice{
		Party:    req.Party,
		Amount:   total,
		DueDate:  dueDate,
		BranchID: strPtr(branch),
	}

	if err := h.repo.Create(c.Request.Context(), inv, req.Items); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, inv)
}

func (h *InvoiceHandler) Update(c *gin.Context) {
	var req model.UpdateInvoiceRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	status := req.Status
	var chasedAt *time.Time
	if req.Chased {
		status = "Overdue"
		ts := time.Now()
		chasedAt = &ts
	}

	if status == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "status is required"})
		return
	}

	if err := h.repo.UpdateStatus(c.Request.Context(), c.Param("id"), status, chasedAt); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "invoice updated"})
}

// EmailRequest is the body for the send-by-email endpoint. The recipient
// defaults to the party name for demo invoices; real replies come from the
// mail provider.
type EmailRequest struct {
	To string `json:"to"`
}

// SendByEmail emails the invoice as a receipt via SMTP. Status is upgraded to
// Sent for drafts so the board reflects that the client was contacted.
func (h *InvoiceHandler) SendByEmail(c *gin.Context) {
	var req EmailRequest
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

	inv, err := h.repo.GetByID(c.Request.Context(), c.Param("id"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "invoice not found"})
		return
	}

	ref := inv.ID
	if i := strings.Index(ref, "-"); i > 0 && i < 4 {
		// already a formatted ref like INV-2041
	} else {
		ref = "INV-" + strings.ToUpper(inv.ID[:4])
	}

	lines := make([]mailer.Line, 0, len(inv.Items))
	for _, it := range inv.Items {
		lines = append(lines, mailer.Line{Description: it.Description, Qty: it.Qty, UnitPrice: it.UnitPrice})
	}

	if err := h.mailer.SendInvoiceEmail(to, ref, inv.Party, inv.Amount, inv.DueDate, lines); err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "could not send email: " + err.Error()})
		return
	}

	if inv.Status == "Draft" {
		_ = h.repo.UpdateStatus(c.Request.Context(), inv.ID, "Sent", nil)
	}

	c.JSON(http.StatusOK, gin.H{"message": "receipt emailed to " + to, "to": to})
}
