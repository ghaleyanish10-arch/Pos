package model

import (
	"time"
)

type User struct {
	ID              string     `json:"id"`
	Name            string     `json:"name"`
	Email           string     `json:"email"`
	PasswordHash    string     `json:"-"`
	Role            string     `json:"role"`
	BranchID        *string    `json:"branch_id"`
	EmailVerifiedAt *time.Time `json:"email_verified_at,omitempty"`
	HasPIN          bool       `json:"has_pin"`
	CreatedAt       time.Time  `json:"created_at"`
	DeletedAt       *time.Time `json:"deleted_at"`
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

// SignupRequest is the public business-owner signup: name, email and password
// create a Corporate Admin account (the existing top role). The account is
// verified by 6-digit code before the admin dashboard unlocks.
type SignupRequest struct {
	Name     string `json:"name" binding:"required"`
	Email    string `json:"email" binding:"required"`
	Password string `json:"password" binding:"required"`
}

// VerifyCodeRequest submits the 6-digit code emailed at signup.
type VerifyCodeRequest struct {
	Email string `json:"email" binding:"required"`
	Code  string `json:"code" binding:"required"`
}

// ResendCodeRequest asks for a fresh 6-digit code (throttled to 1/60s).
type ResendCodeRequest struct {
	Email string `json:"email" binding:"required"`
}

type RefreshRequest struct {
	RefreshToken string `json:"refresh_token" binding:"required"`
}

type VerifyEmailRequest struct {
	Token string `json:"token" binding:"required"`
}

type ForgotPasswordRequest struct {
	Email string `json:"email" binding:"required"`
}

type ResetPasswordRequest struct {
	Token       string `json:"token" binding:"required"`
	NewPassword string `json:"new_password" binding:"required"`
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

// --- PIN elevation (step-up authorization) ---

// ElevateRequest is the body of POST /auth/elevate: a privileged action
// authorized by a manager/boss PIN rather than the terminal session's role.
type ElevateRequest struct {
	PINHolderID string `json:"pin_holder_user_id" binding:"required"`
	PIN         string `json:"pin" binding:"required"`
	Action      string `json:"action" binding:"required"`
	ResourceID  string `json:"resource_id"`
}

// SetPINRequest is the body of PUT /staff/:id/pin. password is the CALLER's
// own login password used to re-authenticate - the session alone is not
// enough, and the target's password is never involved.
type SetPINRequest struct {
	PIN      string `json:"pin" binding:"required"`
	Password string `json:"password" binding:"required"`
}

// --- PIN clock-in (shared-terminal staff identity) ---

// ClockInRequest is the body of POST /auth/clock-in. The device_id is a
// client-generated UUID device id; it is an addressable label for audit
// attribution, not a credential.
type ClockInRequest struct {
	UserID   string `json:"user_id" binding:"required"`
	PIN      string `json:"pin" binding:"required"`
	DeviceID string `json:"device_id"`
}

// ClockOutRequest is the body of POST /auth/clock-out.
type ClockOutRequest struct {
	UserID   string `json:"user_id" binding:"required"`
	DeviceID string `json:"device_id"`
}

// RosterMember is the deliberately bare staff-identity surface shown on the
// clock-in screen. It carries name/role/branch only - never a PIN hash,
// lockout state, attempt counts, or even a has_pin flag (test-covered).
type RosterMember struct {
	ID       string  `json:"id"`
	Name     string  `json:"name"`
	Role     string  `json:"role"`
	BranchID *string `json:"branch_id,omitempty"`
}

// EnableTerminalRequest is the body of POST /staff/terminal-enable: a manager
// or boss approves this specific device for clock-in by presenting their PIN.
// branch_id is optional — when empty the approval applies to every branch the
// device later claims (the shared-terminal default today).
type EnableTerminalRequest struct {
	UserID   string `json:"user_id" binding:"required"`
	PIN      string `json:"pin" binding:"required"`
	BranchID string `json:"branch_id"`
}
