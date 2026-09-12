package handler

import (
	"net/http"

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

	transfer := &model.BranchTransfer{
		Item:         req.Item,
		Qty:          req.Qty,
		FromBranchID: req.FromBranchID,
		ToBranchID:   req.ToBranchID,
	}

	if err := h.repo.Create(c.Request.Context(), transfer); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, transfer)
}

func (h *TransferHandler) Receive(c *gin.Context) {
	if err := h.repo.UpdateStatus(c.Request.Context(), c.Param("id"), "Received"); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "transfer received"})
}
