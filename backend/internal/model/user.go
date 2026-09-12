package model

import (
	"time"
)

type User struct {
	ID           string     `json:"id"`
	Name         string     `json:"name"`
	Email        string     `json:"email"`
	PasswordHash string     `json:"-"`
	Role         string     `json:"role"`
	BranchID     *string    `json:"branch_id"`
	CreatedAt    time.Time  `json:"created_at"`
	DeletedAt    *time.Time `json:"deleted_at"`
}

type LoginRequest struct {
	Email    string `json:"email" binding:"required"`
	Password string `json:"password" binding:"required"`
}

type RegisterRequest struct {
	Name     string `json:"name" binding:"required"`
	Email    string `json:"email" binding:"required"`
	Password string `json:"password" binding:"required"`
	Role     string `json:"role" binding:"required"`
	BranchID string `json:"branch_id"`
}

type RefreshRequest struct {
	RefreshToken string `json:"refresh_token" binding:"required"`
}

type Role struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type Permission struct {
	ID      string `json:"id"`
	Role    string `json:"role"`
	Action  string `json:"action"`
	Granted bool   `json:"granted"`
}

type PermissionRow struct {
	Action string         `json:"action"`
	Group  string         `json:"group"`
	Grants map[string]bool `json:"grants"`
}
