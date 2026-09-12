package handler

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/mesa-os/backend/internal/model"
	"github.com/mesa-os/backend/internal/repo"
)

type BookingHandler struct {
	repo *repo.BookingRepo
}

func NewBookingHandler(r *repo.BookingRepo) *BookingHandler {
	return &BookingHandler{repo: r}
}

func (h *BookingHandler) ListTables(c *gin.Context) {
	branchID := c.Query("branch_id")

	tables, err := h.repo.ListTables(c.Request.Context(), branchID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": tables})
}

func (h *BookingHandler) ListReservations(c *gin.Context) {
	branchID := c.Query("branch_id")

	reservations, err := h.repo.ListReservations(c.Request.Context(), branchID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": reservations})
}

func (h *BookingHandler) CreateReservation(c *gin.Context) {
	var req model.CreateReservationRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	branchID, _ := c.Get("branch_id")
	startTime, _ := time.Parse(time.RFC3339, req.StartTime)

	if req.Duration == 0 {
		req.Duration = 60
	}

	res := &model.Reservation{
		GuestID:   strPtr(req.GuestID),
		GuestName: req.GuestName,
		Covers:    req.Covers,
		TableID:   strPtr(req.TableID),
		StartTime: startTime,
		Duration:  req.Duration,
		Status:    "Confirmed",
		BranchID:  strPtr(branchID.(string)),
	}

	if err := h.repo.CreateReservation(c.Request.Context(), res); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, res)
}

func (h *BookingHandler) UpdateReservation(c *gin.Context) {
	var req struct {
		Status string `json:"status"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := h.repo.UpdateReservation(c.Request.Context(), c.Param("id"), req.Status); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "reservation updated"})
}

func (h *BookingHandler) SeatReservation(c *gin.Context) {
	var req struct {
		TableID string `json:"table_id" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := h.repo.SeatReservation(c.Request.Context(), c.Param("id"), req.TableID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "guest seated"})
}

func (h *BookingHandler) ListWaitlist(c *gin.Context) {
	branchID := c.Query("branch_id")

	entries, err := h.repo.ListWaitlist(c.Request.Context(), branchID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": entries})
}

func (h *BookingHandler) CreateWaitlist(c *gin.Context) {
	var req model.CreateWaitlistRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	branchID, _ := c.Get("branch_id")

	entry := &model.WaitlistEntry{
		GuestID:   strPtr(req.GuestID),
		GuestName: req.GuestName,
		Covers:    req.Covers,
		BranchID:  strPtr(branchID.(string)),
	}

	if err := h.repo.CreateWaitlist(c.Request.Context(), entry); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, entry)
}

func (h *BookingHandler) NotifyWaitlist(c *gin.Context) {
	if err := h.repo.DeleteWaitlist(c.Request.Context(), c.Param("id")); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "guest notified and removed from waitlist"})
}
