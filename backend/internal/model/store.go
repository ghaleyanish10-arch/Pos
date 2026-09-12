package model

import (
	"encoding/json"
	"time"
)

type StoreSettings struct {
	ID             string          `json:"id"`
	BranchID       *string         `json:"branch_id"`
	Theme          string          `json:"theme"`
	DeliveryZones  json.RawMessage `json:"delivery_zones"`
	PaymentMethods json.RawMessage `json:"payment_methods"`
	UpdatedAt      time.Time       `json:"updated_at"`
}

type UpdateStoreSettingsRequest struct {
	Theme          string          `json:"theme"`
	DeliveryZones  json.RawMessage `json:"delivery_zones"`
	PaymentMethods json.RawMessage `json:"payment_methods"`
}
