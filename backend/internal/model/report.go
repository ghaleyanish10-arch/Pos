package model

type RevenueDataPoint struct {
	Date   string  `json:"date"`
	Amount float64 `json:"amount"`
}

type TopSeller struct {
	Name  string `json:"name"`
	Count int    `json:"count"`
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

type HealthResponse struct {
	Uptime      string         `json:"uptime"`
	Branches    []BranchHealth `json:"branches"`
	TotalOnline int            `json:"total_online"`
}
