package handler

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/mesa-os/backend/internal/model"
	"github.com/mesa-os/backend/internal/repo"
)

type TransferHandler struct {
	repo *repo.TransferRepo
}

func NewTransferHandler(r *repo.TransferRepo) *TransferHandler {
	return &TransferHandler{repo: r}
}

func (h *TransferHandler) List(c *gin.Context) {
	status := c.Query("status")

	transfers, err := h.repo.List(c.Request.Context(), status)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": transfers})
}

func (h *TransferHandler) Create(c *gin.Context) {
	var req model.CreateTransferRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	req.Item = strings.TrimSpace(req.Item)
	if req.Item == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "item is required"})
		return
	}
	if req.Qty <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "quantity must be greater than zero"})
		return
	}
	if !validUUID(req.FromBranchID) || !validUUID(req.ToBranchID) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "from_branch_id and to_branch_id must be valid branch UUIDs"})
		return
	}
	if req.FromBranchID == req.ToBranchID {
		c.JSON(http.StatusBadRequest, gin.H{"error": "from and to branch must differ"})
		return
	}

	ctx := c.Request.Context()
	for _, id := range []string{req.FromBranchID, req.ToBranchID} {
		ok, err := h.repo.BranchExists(ctx, id)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		if !ok {
			c.JSON(http.StatusBadRequest, gin.H{"error": "branch not found: " + id})
			return
		}
	}

	transfer := &model.BranchTransfer{
		Item:         req.Item,
		Qty:          req.Qty,
		FromBranchID: req.FromBranchID,
		ToBranchID:   req.ToBranchID,
	}

	if err := h.repo.Create(ctx, transfer); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, transfer)
}

func (h *TransferHandler) Receive(c *gin.Context) {
	n, err := h.repo.UpdateStatus(c.Request.Context(), c.Param("id"), "Received")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if n == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "transfer not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "transfer received"})
}
