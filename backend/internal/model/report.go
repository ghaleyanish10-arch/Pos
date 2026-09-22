package model

type RevenueDataPoint struct {
	Date   string  `json:"date"`
	Amount float64 `json:"amount"`
}

type TopSeller struct {
	Name    string  `json:"name"`
	Count   int     `json:"count"`
	Revenue float64 `json:"revenue"`
}

type BranchHealth struct {
	Name        string  `json:"name"`
	Status      string  `json:"status"`
	Latency     float64 `json:"latency"`
	Throughput  []float64 `json:"throughput"`
}

type ReportSummary struct {
	Revenue       []RevenueDataPoint `json:"revenue"`
	TopSellers    []TopSeller        `json:"top_sellers"`
	SlowMovers    []TopSeller        `json:"slow_movers"`
	TotalRevenue  float64            `json:"total_revenue"`
	TotalOrders   int                `json:"total_orders"`
	AvgOrderValue float64            `json:"avg_order_value"`
}

// ReportOverview is the single payload behind the Reports page: money facts
// first (sales, taxes, discounts, refunds, payment mix), then behaviour
// (peak hours, table utilization). All figures respect the ?days= window.
type ReportOverview struct {
	Sales          float64            `json:"sales"`
	Orders         int                `json:"orders"`
	AvgOrderValue  float64            `json:"avg_order_value"`
	TaxCollected   float64            `json:"tax_collected"`
	DiscountsGiven float64            `json:"discounts_given"`
	RefundsTotal   float64            `json:"refunds_total"`
	RefundsCount   int                `json:"refunds_count"`
	NetSales       float64            `json:"net_sales"`
	PaymentMix     []PaymentMixSlice  `json:"payment_mix"`
	TopProducts    []TopSeller        `json:"top_products"`
	PeakHours      []HourSlice        `json:"peak_hours"`
	TableUsage     []TableUsageSlice  `json:"table_usage"`
	DailyRevenue   []RevenueDataPoint `json:"daily_revenue"`
}

// PaymentMixSlice is one payment method's share of successful sales.
type PaymentMixSlice struct {
	Method string  `json:"method"`
	Amount float64 `json:"amount"`
	Count  int     `json:"count"`
}

// HourSlice is the sales volume for one hour of day across the window.
type HourSlice struct {
	Hour   int     `json:"hour"`
	Amount float64 `json:"amount"`
	Orders int     `json:"orders"`
}

// TableUsageSlice is how many transactions settled at each table — the
// utilization proxy from payment data (orders would double-count splits).
type TableUsageSlice struct {
	Table     string  `json:"table"`
	Orders    int     `json:"orders"`
	Revenue   float64 `json:"revenue"`
	AvgTicket float64 `json:"avg_ticket"`
}

type HealthResponse struct {
	Uptime      string         `json:"uptime"`
	Branches    []BranchHealth `json:"branches"`
	TotalOnline int            `json:"total_online"`
}
