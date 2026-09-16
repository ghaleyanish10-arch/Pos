package model

import "time"

// Device is an approved terminal row in the `devices` table. The id is a
// client-generated UUID the terminal sends in the X-Device-Id header — there
// is no secret material: approval is data, not a credential, and whoever was
// voted in (manager/boss PIN) is recorded for audit.
type Device struct {
	ID              string    `json:"id"`
	BranchID        *string   `json:"branch_id"`
	EnabledAt       time.Time `json:"enabled_at"`
	EnabledByUserID string    `json:"enabled_by_user_id"`
	EnabledByName   string    `json:"enabled_by_name,omitempty"`
}