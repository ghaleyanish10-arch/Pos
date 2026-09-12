package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/mesa-os/backend/internal/model"
	"github.com/mesa-os/backend/internal/repo"
)

type StaffHandler struct {
	repo *repo.StaffRepo
}

func NewStaffHandler(r *repo.StaffRepo) *StaffHandler {
	return &StaffHandler{repo: r}
}

func (h *StaffHandler) List(c *gin.Context) {
	branchID := c.Query("branch_id")

	members, err := h.repo.List(c.Request.Context(), branchID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": members})
}

func (h *StaffHandler) Create(c *gin.Context) {
	var req model.CreateStaffRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	branchID, _ := c.Get("branch_id")

	member := &model.StaffMember{
		Name:     req.Name,
		Role:     req.Role,
		BranchID: strPtr(branchID.(string)),
	}

	if err := h.repo.Create(c.Request.Context(), member); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, member)
}

func (h *StaffHandler) Update(c *gin.Context) {
	var req model.CreateStaffRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := h.repo.Update(c.Request.Context(), c.Param("id"), req.Name, req.Role); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "staff updated"})
}

func (h *StaffHandler) ListShifts(c *gin.Context) {
	branchID := c.Query("branch_id")

	shifts, err := h.repo.ListShifts(c.Request.Context(), branchID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": shifts})
}

func (h *StaffHandler) CreateShift(c *gin.Context) {
	var req model.CreateShiftRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	branchID, _ := c.Get("branch_id")

	shift := &model.Shift{
		StaffID:   req.StaffID,
		Day:       req.Day,
		StartTime: req.StartTime,
		EndTime:   req.EndTime,
		Role:      req.Role,
		BranchID:  strPtr(branchID.(string)),
	}

	if err := h.repo.CreateShift(c.Request.Context(), shift); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, shift)
}

func (h *StaffHandler) UpdateShift(c *gin.Context) {
	var req model.UpdateShiftRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := h.repo.UpdateShift(c.Request.Context(), c.Param("id"), &req); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "shift updated"})
}

func (h *StaffHandler) DeleteShift(c *gin.Context) {
	if err := h.repo.DeleteShift(c.Request.Context(), c.Param("id")); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "shift deleted"})
}
