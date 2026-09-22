package handler

import (
	"encoding/json"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/mesa-os/backend/internal/model"
	"github.com/mesa-os/backend/internal/repo"
)

type RefundHandler struct {
	repo      *repo.RefundRepo
	elevRepo  *repo.ElevationRepo
	auditRepo *repo.AuditRepo
}

func NewRefundHandler(r *repo.RefundRepo) *RefundHandler {
	return &RefundHandler{repo: r}
}

// SetElevationDeps attaches the repos needed for separation-of-duties checks
// and approval auditing (nil-safe: demo routers may omit them).
func (h *RefundHandler) SetElevationDeps(elev *repo.ElevationRepo, audit *repo.AuditRepo) {
	h.elevRepo = elev
	h.auditRepo = audit
}

func (h *RefundHandler) List(c *gin.Context) {
	status := c.Query("status")

	refunds, err := h.repo.List(c.Request.Context(), status)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": refunds})
}

func (h *RefundHandler) Create(c *gin.Context) {
	var req model.CreateRefundRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if !validUUID(req.TransactionID) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "transaction_id must be a valid UUID"})
		return
	}
	if req.Amount <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "amount must be greater than zero"})
		return
	}
	if exists, err := h.repo.TransactionExists(c.Request.Context(), req.TransactionID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	} else if !exists {
		c.JSON(http.StatusBadRequest, gin.H{"error": "transaction not found"})
		return
	}

	branchID, _ := c.Get("branch_id")
	userID, _ := c.Get("user_id")
	items, _ := json.Marshal(req.Items)

	branch := ""
	if s, ok := branchID.(string); ok {
		branch = s
	}
	byUser := ""
	if s, ok := userID.(string); ok {
		byUser = s
	}

	rf := &model.Refund{
		TransactionID: req.TransactionID,
		Items:         items,
		Reason:        req.Reason,
		Amount:        req.Amount,
		BranchID:      strPtr(branch),
		CreatedBy:     byUser,
	}

	if err := h.repo.Create(c.Request.Context(), rf); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, rf)
}

// Approve elevates a refund from Requested to Approved. It requires a valid,
// unconsumed elevation token (RequireElevation middleware, action
// refund.approve) and enforces separation of duties: the person PERFORMING the
// approval (the session user, who borrowed the PIN holder's authority) must
// not be the person who created the refund. Comparing against the PIN holder
// would be wrong — the manager who filed the refund must not approve it even
// with the boss's PIN in hand.
func (h *RefundHandler) Approve(c *gin.Context) {
	userID, _ := c.Get("user_id")
	elevatedBy, _ := c.Get("elevated_by")
	refundID := c.Param("id")

	// Separation of duties: the acting session user must differ from the
	// refund's creator.
	if h.elevRepo != nil && elevatedBy != nil {
		creator, err := h.repo.GetCreator(c.Request.Context(), refundID)
		if err != nil {
			if err == pgx.ErrNoRows {
				c.JSON(http.StatusNotFound, gin.H{"error": "refund not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "refund lookup failed"})
			return
		}
		if creator != "" && creator == userID.(string) {
			c.JSON(http.StatusForbidden, gin.H{
				"error": "separation of duties: the refund creator cannot approve their own refund",
				"code":  "SELF_APPROVAL_BLOCKED",
			})
			return
		}
	}

	if err := h.repo.Lock(c.Request.Context(), refundID, elevatedByString(elevatedBy, userID)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if err := h.repo.UpdateStatus(c.Request.Context(), refundID, "Approved"); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Refund approval is a high-risk approved action: audit unconditionally and
	// notify managers through the server notifications table.
	if h.auditRepo != nil {
		branchID, _ := c.Get("branch_id")
		after, _ := json.Marshal(map[string]any{
			"refund_id":   refundID,
			"elevated_by": elevatedBy,
		})
		event := &model.AuditEvent{
			ActorID:   strPtr(userID.(string)),
			ActorName: c.GetString("email"),
			ActorRole: c.GetString("role"),
			EventType: "refund.approved",
			Summary:   "refund approved with PIN elevation",
			AfterJSON: after,
			BranchID:  strPtr(branchID.(string)),
		}
		if err := h.auditRepo.Create(c.Request.Context(), event); err != nil {
			ginLog("refund approval audit failed: " + err.Error())
		}
	}
	if h.elevRepo != nil {
		branchID, _ := c.Get("branch_id")
		payload, _ := json.Marshal(map[string]any{
			"refund_id":   refundID,
			"elevated_by": elevatedBy,
			"kind":        "refund.approval",
		})
		if err := h.elevRepo.CreateNotification(c.Request.Context(), "Store Manager", branchID.(string), "refund.approval", payload); err != nil {
			ginLog("refund approval notification failed: " + err.Error())
		}
	}

	c.JSON(http.StatusOK, gin.H{"message": "refund approved"})
}

func (h *RefundHandler) Resolve(c *gin.Context) {
	if err := h.repo.UpdateStatus(c.Request.Context(), c.Param("id"), "Resolved"); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "refund resolved"})
}

func elevatedString(v any) string {
	s, ok := v.(string)
	if !ok || s == "" {
		return ""
	}
	return s
}

func elevatedByString(elevatedBy, fallback any) string {
	if s := elevatedString(elevatedBy); s != "" {
		return s
	}
	if s, ok := fallback.(string); ok {
		return s
	}
	return ""
}
