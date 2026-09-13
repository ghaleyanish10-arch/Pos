package handler

import (
	"net/http"
	"regexp"

	"github.com/gin-gonic/gin"
	"github.com/mesa-os/backend/internal/model"
	"github.com/mesa-os/backend/internal/repo"
)

var tableUUIDRe = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)

type OrderHandler struct {
	repo *repo.OrderRepo
}

func NewOrderHandler(r *repo.OrderRepo) *OrderHandler {
	return &OrderHandler{repo: r}
}

func (h *OrderHandler) List(c *gin.Context) {
	branchID := c.Query("branch_id")
	status := c.Query("status")

	orders, err := h.repo.List(c.Request.Context(), branchID, status)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": orders})
}

func (h *OrderHandler) GetByID(c *gin.Context) {
	order, err := h.repo.GetByID(c.Request.Context(), c.Param("id"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "order not found"})
		return
	}
	c.JSON(http.StatusOK, order)
}

func (h *OrderHandler) Create(c *gin.Context) {
	var req model.CreateOrderRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	branchID, _ := c.Get("branch_id")

	tableID := req.TableID
	if tableID != "" && !tableUUIDRe.MatchString(tableID) {
		if resolved, err := h.repo.ResolveTableID(c.Request.Context(), tableID); err == nil {
			tableID = resolved
		} else {
			tableID = ""
		}
	}

	order := &model.Order{
		Type:     req.Type,
		TableID:  &tableID,
		GuestID:  &req.GuestID,
		BranchID: strPtr(branchID.(string)),
	}

	if err := h.repo.Create(c.Request.Context(), order, req.Items); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, order)
}

func (h *OrderHandler) Update(c *gin.Context) {
	var req model.UpdateOrderRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := h.repo.Update(c.Request.Context(), c.Param("id"), req.Status); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "order updated"})
}

func (h *OrderHandler) Delete(c *gin.Context) {
	if err := h.repo.Delete(c.Request.Context(), c.Param("id")); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "order deleted"})
}

func strPtr(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}
