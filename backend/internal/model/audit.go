package model

import (
	"encoding/json"
	"time"
)

type AuditEvent struct {
	ID          string          `json:"id"`
	ActorID     *string         `json:"actor_id"`
	ActorName   string          `json:"actor_name"`
	ActorRole   string          `json:"actor_role"`
	EventType   string          `json:"event_type"`
	Summary     string          `json:"summary"`
	BeforeJSON  json.RawMessage `json:"before_json"`
	AfterJSON   json.RawMessage `json:"after_json"`
	BranchID    *string         `json:"branch_id"`
	CreatedAt   time.Time       `json:"created_at"`
}
