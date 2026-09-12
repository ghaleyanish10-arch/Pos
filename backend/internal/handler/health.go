package handler

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

var startTime = time.Now()

type HealthHandler struct{}

func NewHealthHandler() *HealthHandler {
	return &HealthHandler{}
}

func (h *HealthHandler) Check(c *gin.Context) {
	uptime := time.Since(startTime).String()

	c.JSON(http.StatusOK, gin.H{
		"status":  "ok",
		"uptime":  uptime,
		"message": "Mesa OS API is running",
	})
}
