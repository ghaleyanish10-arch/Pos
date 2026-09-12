package model

type CartLine struct {
	SKU   string  `json:"sku"`
	Name  string  `json:"name"`
	Qty   int     `json:"qty"`
	Price float64 `json:"price"`
}

type UpdateTableStateRequest struct {
	State  string `json:"state"`
	Detail string `json:"detail"`
}

type CheckoutRequest struct {
	TableID string `json:"table_id"`
	Method  string `json:"method" binding:"required"`
}
