package model

import "time"

// Payment gateway providers supported in the Nepal market. Values double as
// the DB check constraint and the Settings UI keys.
var GatewayProviders = map[string]bool{"esewa": true, "khalti": true, "imepay": true}

type PaymentGateway struct {
	ID         string   `json:"id"`
	BranchID   *string  `json:"branch_id"`
	Provider   string   `json:"provider"`
	MerchantID string   `json:"merchant_id"`
	APIKey     string   `json:"-"` // never serialized to any client
	Sandbox    bool     `json:"sandbox"`
	Enabled    bool     `json:"enabled"`
}

// SaveGatewayRequest is the body of PUT /gateways/:provider. The API key is
// write-only: an empty value keeps the stored one.
type SaveGatewayRequest struct {
	MerchantID string `json:"merchant_id"`
	APIKey     string `json:"api_key"`
	Sandbox    bool   `json:"sandbox"`
	Enabled    bool   `json:"enabled"`
}

// GatewayStatus is the client-safe shape of a saved gateway (no key material).
type GatewayStatus struct {
	Provider   string `json:"provider"`
	MerchantID string `json:"merchant_id"`
	HasAPIKey  bool   `json:"has_api_key"`
	Sandbox    bool   `json:"sandbox"`
	Enabled    bool   `json:"enabled"`
}

// GatewayChargeRequest is the body of POST /gateways/:provider/charge — the
// STUBBED confirmation flow. Real SDK integration replaces Simulate only.
type GatewayChargeRequest struct {
	OrderID string  `json:"order_id"`
	Amount  float64 `json:"amount" binding:"required"`
	Method  string  `json:"method"`
	Outcome string  `json:"outcome"` // "success" | "failure" (simulated)
}

// --- Payroll ---

type PayrollPeriod struct {
	ID        string    `json:"id"`
	Label     string    `json:"label"`
	StartDate string    `json:"start_date"`
	EndDate   string    `json:"end_date"`
	Status    string    `json:"status"` // draft | approved | paid
	BranchID  *string   `json:"branch_id"`
	CreatedAt time.Time `json:"created_at"`
	Lines     []PayrollLine `json:"lines,omitempty"`
}

type PayrollLine struct {
	ID         string  `json:"id"`
	StaffID    string  `json:"staff_id"`
	StaffName  string  `json:"staff_name"`
	Hours      float64 `json:"hours"`
	HourlyRate float64 `json:"hourly_rate"`
	Amount     float64 `json:"amount"`
}

type CreatePayrollPeriodRequest struct {
	Label     string          `json:"label" binding:"required"`
	StartDate string          `json:"start_date" binding:"required"`
	EndDate   string          `json:"end_date" binding:"required"`
	Lines     []PayrollLineIn `json:"lines" binding:"required"`
}

type PayrollLineIn struct {
	StaffID    string  `json:"staff_id" binding:"required"`
	StaffName  string  `json:"staff_name" binding:"required"`
	Hours      float64 `json:"hours"`
	HourlyRate float64 `json:"hourly_rate"`
}

type UpdatePayrollStatusRequest struct {
	Status string `json:"status" binding:"required"`
}

// --- Printers ---

type PrinterAssignment struct {
	ID       string  `json:"id"`
	BranchID *string `json:"branch_id"`
	Station  string  `json:"station"`
	Printer  string  `json:"printer"`
	Role     string  `json:"role"` // kot | receipt
}

type SavePrinterRequest struct {
	Station string `json:"station" binding:"required"`
	Printer string `json:"printer" binding:"required"`
	Role    string `json:"role" binding:"required"`
}
