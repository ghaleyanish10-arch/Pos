package handler

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/mesa-os/backend/internal/model"
	"github.com/mesa-os/backend/internal/repo"
)

type POSHandler struct {
	pos    *repo.POSRepo
	tables *repo.BookingRepo
}

func NewPOSHandler(pos *repo.POSRepo, tables *repo.BookingRepo) *POSHandler {
	return &POSHandler{pos: pos, tables: tables}
}

func (h *POSHandler) UpdateTableState(c *gin.Context) {
	var req model.UpdateTableStateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := h.pos.UpdateTableState(c.Request.Context(), c.Param("id"), req.State, req.Detail); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "table state updated"})
}

// tableAfterFlag runs mutator, then returns the table's full DERIVED row (the
// exact state the floor will show, via the shared ListTables CASE) so clients
// can render it instantly. Unknown ids surface as a 404.
func (h *POSHandler) tableAfterFlag(c *gin.Context, mutator func(id string) error) {
	id := c.Param("id")
	if err := mutator(id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	t, err := h.tables.GetTable(c.Request.Context(), id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			c.JSON(http.StatusNotFound, gin.H{"error": "table not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": t})
}

// DropCheck marks a table's check as dropped; the floor shows 'Check dropped'
// while the table still holds an open order.
func (h *POSHandler) DropCheck(c *gin.Context) {
	h.tableAfterFlag(c, func(id string) error {
		return h.pos.SetBillDropped(c.Request.Context(), id, true)
	})
}

// ClearCheck cancels the dropped-check marker. Adding items does not do this
// automatically — the waiter must clear it explicitly.
func (h *POSHandler) ClearCheck(c *gin.Context) {
	h.tableAfterFlag(c, func(id string) error {
		return h.pos.SetBillDropped(c.Request.Context(), id, false)
	})
}

// Flag marks a table as needing attention (allergy, complaint, ...) with an
// optional free-text note. 'Needs attention' always wins the derived state.
func (h *POSHandler) Flag(c *gin.Context) {
	var req model.FlagTableRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	h.tableAfterFlag(c, func(id string) error {
		return h.pos.SetNeedsAttention(c.Request.Context(), id, true, req.Note)
	})
}

// Unflag clears the attention flag (the last note is preserved for reference
// until the table turns over).
func (h *POSHandler) Unflag(c *gin.Context) {
	h.tableAfterFlag(c, func(id string) error {
		return h.pos.SetNeedsAttention(c.Request.Context(), id, false, "")
	})
}

func (h *POSHandler) GetTableBill(c *gin.Context) {
	// GetTableBill returns (orderID, items, total, err) — destructure in that
	// order. Swapping the tuple used to send order_id as a number and total as
	// an array, which broke the FOH bill/pay sheet (it POSTed the numeric
	// order_id to /transactions and got 400).
	orderID, items, total, err := h.pos.GetTableBill(c.Request.Context(), c.Param("id"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "no open bill for this table"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"items":    items,
		"total":    total,
		"order_id": orderID,
	})
}

// CloseTable settles the table: every open order on it is closed so the
// floor plan derives the table back to 'Open'. Called by Front of House
// after payment/turn-away.
func (h *POSHandler) CloseTable(c *gin.Context) {
	n, err := h.pos.CloseTable(c.Request.Context(), c.Param("id"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"closed": n})
}
