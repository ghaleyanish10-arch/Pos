package router

import (
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/mesa-os/backend/internal/auth"
	"github.com/mesa-os/backend/internal/config"
	"github.com/mesa-os/backend/internal/email"
	"github.com/mesa-os/backend/internal/handler"
	"github.com/mesa-os/backend/internal/mailer"
	"github.com/mesa-os/backend/internal/middleware"
	"github.com/mesa-os/backend/internal/repo"
)

func Setup(pool *pgxpool.Pool, cfg *config.Config) *gin.Engine {
	gin.SetMode(gin.ReleaseMode)

	r := gin.New()
	r.Use(gin.Logger())
	r.Use(gin.Recovery())
	r.Use(middleware.CORSMiddleware(cfg.CORSOrigin))

	// Repos
	userRepo := repo.NewUserRepo(pool)
	orderRepo := repo.NewOrderRepo(pool)
	ticketRepo := repo.NewTicketRepo(pool)
	txRepo := repo.NewTransactionRepo(pool)
	refundRepo := repo.NewRefundRepo(pool)
	menuRepo := repo.NewMenuRepo(pool)
	inventoryRepo := repo.NewInventoryRepo(pool)
	guestRepo := repo.NewGuestRepo(pool)
	staffRepo := repo.NewStaffRepo(pool)
	bookingRepo := repo.NewBookingRepo(pool)
	invoiceRepo := repo.NewInvoiceRepo(pool)
	smtpMailer := mailer.New(
		cfg.SMTPHost, cfg.SMTPPort, cfg.SMTPUsername, cfg.SMTPPassword, cfg.SMTPFrom,
	)
	loyaltyRepo := repo.NewLoyaltyRepo(pool)
	marketingRepo := repo.NewMarketingRepo(pool)
	storeRepo := repo.NewStoreRepo(pool)
	posRepo := repo.NewPOSRepo(pool)
	fiscalRepo := repo.NewFiscalRepo(pool)
	recipeRepo := repo.NewRecipeRepo(pool)
	poRepo := repo.NewPurchaseOrderRepo(pool)
	transferRepo := repo.NewTransferRepo(pool)
	reviewRepo := repo.NewReviewRepo(pool)
	deliveryRepo := repo.NewDeliveryRepo(pool)
	feedbackRepo := repo.NewFeedbackRepo(pool)
	permissionRepo := repo.NewPermissionRepo(pool)
	elevationRepo := repo.NewElevationRepo(pool)
	deviceRepo := repo.NewDeviceRepo(pool)
	auditRepo := repo.NewAuditRepo(pool)
	reportRepo := repo.NewReportRepo(pool)

	// Auth service & handler
	authSvc := auth.NewService(pool)
	resend := email.New(cfg.RESENDAPIKey, cfg.EmailFrom, cfg.EmailFromName, cfg.AppURL)

	// Handlers
	authH := handler.NewAuthHandler(authSvc, userRepo, cfg)
	authH.SetEmail(resend)
	elevationH := handler.NewElevationHandler(elevationRepo, auditRepo, authSvc, cfg)
	clockinH := handler.NewClockInHandler(elevationRepo, deviceRepo, auditRepo, cfg)
	orderH := handler.NewOrderHandler(orderRepo)
	ticketH := handler.NewTicketHandler(ticketRepo)
	txH := handler.NewTransactionHandler(txRepo)
	txH.SetMailer(smtpMailer)
	txH.SetOrderRepo(orderRepo)
	refundH := handler.NewRefundHandler(refundRepo)
	refundH.SetElevationDeps(elevationRepo, auditRepo)
	menuH := handler.NewMenuHandler(menuRepo)
	inventoryH := handler.NewInventoryHandler(inventoryRepo)
	guestH := handler.NewGuestHandler(guestRepo)
	staffH := handler.NewStaffHandler(staffRepo)
	staffH.SetAuthDeps(authSvc, userRepo)
	bookingH := handler.NewBookingHandler(bookingRepo)
	invoiceH := handler.NewInvoiceHandler(invoiceRepo)
	invoiceH.SetMailer(smtpMailer)
	loyaltyH := handler.NewLoyaltyHandler(loyaltyRepo)
	marketingH := handler.NewMarketingHandler(marketingRepo)
	storeH := handler.NewStoreHandler(storeRepo)
	posH := handler.NewPOSHandler(posRepo)
	fiscalH := handler.NewFiscalHandler(fiscalRepo)
	recipeH := handler.NewRecipeHandler(recipeRepo)
	poH := handler.NewPurchaseOrderHandler(poRepo)
	transferH := handler.NewTransferHandler(transferRepo)
	reviewH := handler.NewReviewHandler(reviewRepo)
	deliveryH := handler.NewDeliveryHandler(deliveryRepo)
	feedbackH := handler.NewFeedbackHandler(feedbackRepo)
	permissionH := handler.NewPermissionHandler(permissionRepo)
	auditH := handler.NewAuditHandler(auditRepo)
	reportH := handler.NewReportHandler(reportRepo)
	healthH := handler.NewHealthHandler()

	// Auth middleware
	authMW := middleware.AuthMiddleware(cfg.JWTSecret)

	// Admin-dashboard gate: Corporate Admin owners must verify their email
	// before these routes open up. Staff roles pass through untouched.
	verified := middleware.RequireEmailVerified(pool)

	api := r.Group("/api/v1")

	// Public routes
	api.POST("/auth/login", authH.Login)
	api.POST("/auth/refresh", authH.Refresh)
	api.GET("/health", healthH.Check)		// Email-verified account flows (public: the user has no session yet)
		api.POST("/auth/verify-email", authH.VerifyEmail)
		api.POST("/auth/forgot-password", authH.ForgotPassword)
		api.POST("/auth/reset-password", authH.ResetPassword)

		// Customer ordering (public: a scanned table QR or storefront link has
		// no session). The order lands in the orders table and KDS as an
		// incoming ticket, so staff Orders/KDS pick it up.
		api.POST("/public/orders", orderH.CreatePublic)

		// Public business-owner signup + 6-digit email verification. The
		// account can sign in immediately; the admin dashboard stays locked
		// until a code is entered.
		api.POST("/auth/signup", authH.Signup)
		api.POST("/auth/verify-code", authH.VerifyCode)
		api.POST("/auth/resend-code", authH.ResendCode)

		// Google OAuth — server-side code exchange; the secret never leaves here.
		api.GET("/auth/google", authH.GoogleRedirect)
		api.GET("/auth/google/callback", authH.GoogleCallback)

		// PIN elevation (protected: requires a terminal session)
		api.POST("/auth/elevate", authMW, elevationH.Elevate)

		// Shared-terminal clock-in family — NOT a staff session: a terminal
		// must be able to clock in before any staff session exists. The
		// DeviceID middleware only captures the client-generated UUID for
		// audit attribution; whether a device may use the family is decided
		// per route by the `devices` approval table and per action by the
		// staff PIN (roster/clock-in require an approved device, enable is
		// how one becomes approved).
		device := api.Group("")
		device.Use(middleware.DeviceID())
		{
			device.GET("/staff/terminal-status", clockinH.TerminalStatus)
			device.POST("/staff/terminal-enable", clockinH.TerminalEnable)
			device.GET("/staff/roster", clockinH.Roster)
			device.POST("/auth/clock-in", clockinH.ClockIn)
			device.POST("/auth/clock-out", clockinH.ClockOut)
		}

	// Protected routes
	protected := api.Group("")
	protected.Use(authMW)
	{
		// Auth
		protected.POST("/auth/register", middleware.RequireRole("Corporate Admin"), authH.Register)
		protected.GET("/auth/me", authH.Me)

		// Orders
		protected.GET("/orders", orderH.List)
		protected.POST("/orders", orderH.Create)
		protected.GET("/orders/:id", orderH.GetByID)
		protected.PUT("/orders/:id", orderH.Update)
		protected.DELETE("/orders/:id", middleware.RequireRole("Store Manager"), orderH.Delete)

		// KDS Tickets
		protected.GET("/kds/tickets", ticketH.List)
		protected.PUT("/kds/tickets/:id/fire", ticketH.Fire)
		protected.PUT("/kds/tickets/:id/bump", ticketH.Bump)

		// Transactions
		protected.GET("/transactions", txH.List)
		protected.POST("/transactions", txH.Create)
		protected.POST("/transactions/manual", txH.ManualPayment)
		protected.PUT("/transactions/:id/email", txH.SendByEmail)

		// Refunds — manager/boss only end to end: filing a refund, listing
		// them, and rescuing a request all require a Store Manager or
		// Corporate Admin session (the role hierarchy admits the boss).
		// Approve/Resolve additionally require PIN step-up plus separation of
		// duties: the elevation token (a manager/boss PIN entered seconds ago)
		// IS the authorization on top of the manager/boss session.
		protected.GET("/refunds", middleware.RequireRole("Store Manager"), refundH.List)
		protected.POST("/refunds", middleware.RequireRole("Store Manager"), refundH.Create)
		protected.PUT("/refunds/:id/approve",
			middleware.RequireRole("Store Manager"),
			middleware.RequireElevation(elevationRepo, cfg.JWTSecret, "refund.approve"),
			refundH.Approve)
		protected.PUT("/refunds/:id/resolve",
			middleware.RequireRole("Store Manager"),
			middleware.RequireElevation(elevationRepo, cfg.JWTSecret, "refund.resolve"),
			refundH.Resolve)

		// Menu
		protected.GET("/menu", menuH.ListItems)
		protected.GET("/menu/categories", menuH.ListCategories)
		protected.GET("/menu/:id", menuH.GetItem)
		protected.POST("/menu", middleware.RequireRole("Store Manager"), menuH.CreateItem)
		protected.PUT("/menu/:id", middleware.RequireRole("Store Manager"), menuH.UpdateItem)
		protected.DELETE("/menu/:id", middleware.RequireRole("Store Manager"), menuH.DeleteItem)

		// Inventory
		protected.GET("/inventory", inventoryH.List)
		protected.GET("/inventory/:id", inventoryH.GetByID)
		protected.POST("/inventory", middleware.RequireRole("Store Manager"), inventoryH.Create)
		protected.PUT("/inventory/:id", middleware.RequireRole("Store Manager"), inventoryH.Update)
		protected.PUT("/inventory/:id/adjust", middleware.RequireRole("Inventory Auditor"), inventoryH.AdjustStock)
		protected.GET("/inventory/reorder-suggestions", middleware.RequireRole("Inventory Auditor"), inventoryH.ReorderSuggestions)

		// Guests
		protected.GET("/guests", guestH.List)
		protected.GET("/guests/:id", guestH.GetByID)
		protected.POST("/guests", guestH.Create)
		protected.PUT("/guests/:id", guestH.Update)
		protected.GET("/guests/:id/timeline", guestH.Timeline)

		// Staff — admin dashboard, owner-verified before these open
		protected.GET("/staff", middleware.RequireRole("Store Manager"), verified, staffH.List)
		protected.POST("/staff", middleware.RequireRole("Store Manager"), verified, staffH.Create)
		protected.PUT("/staff/:id", middleware.RequireRole("Store Manager"), verified, staffH.Update)

		// PIN management — boss-only set/reset with password re-auth
		protected.GET("/staff/pin-holders", elevationH.ListPINHolders)
		protected.GET("/staff/pin-accounts", middleware.RequireRole("Corporate Admin"), verified, elevationH.ListUsers)
		protected.PUT("/staff/:id/pin", middleware.RequireRole("Corporate Admin"), verified, elevationH.SetPIN)

		// Terminal (approved device) management — boss-only. Managers approve
		// terminals with their PIN at the terminal itself; only the boss can
		// revoke an approval.
		protected.GET("/staff/devices", middleware.RequireRole("Corporate Admin"), verified, clockinH.ListDevices)
		protected.DELETE("/staff/devices/:id", middleware.RequireRole("Corporate Admin"), verified, clockinH.DisableDevice)

		// Server notifications (lockouts, high-risk approvals)
		protected.GET("/notifications", elevationH.ListNotifications)
		protected.PUT("/notifications/:id/read", elevationH.MarkNotificationRead)
		protected.GET("/shifts", middleware.RequireRole("Store Manager"), verified, staffH.ListShifts)
		protected.POST("/shifts", middleware.RequireRole("Store Manager"), verified, staffH.CreateShift)
		protected.PUT("/shifts/:id", middleware.RequireRole("Store Manager"), verified, staffH.UpdateShift)
		protected.DELETE("/shifts/:id", middleware.RequireRole("Store Manager"), verified, staffH.DeleteShift)

		// Bookings
		protected.GET("/tables", bookingH.ListTables)
		protected.GET("/reservations", bookingH.ListReservations)
		protected.POST("/reservations", bookingH.CreateReservation)
		protected.PUT("/reservations/:id", bookingH.UpdateReservation)
		protected.PUT("/reservations/:id/seat", bookingH.SeatReservation)
		protected.GET("/waitlist", bookingH.ListWaitlist)
		protected.POST("/waitlist", bookingH.CreateWaitlist)
		protected.PUT("/waitlist/:id/notify", bookingH.NotifyWaitlist)

		// Reports
		protected.GET("/reports/revenue", middleware.RequireRole("Store Manager"), verified, reportH.Revenue)
		protected.GET("/reports/top-sellers", middleware.RequireRole("Store Manager"), verified, reportH.TopSellers)
		protected.GET("/reports/slow-movers", middleware.RequireRole("Store Manager"), verified, reportH.SlowMovers)
		protected.GET("/reports/summary", middleware.RequireRole("Store Manager"), verified, reportH.Summary)

		// Invoices
		protected.GET("/invoices", middleware.RequireRole("Store Manager"), invoiceH.List)
		protected.GET("/invoices/:id", middleware.RequireRole("Store Manager"), invoiceH.GetByID)
		protected.POST("/invoices", middleware.RequireRole("Store Manager"), invoiceH.Create)
		protected.PUT("/invoices/:id", middleware.RequireRole("Store Manager"), invoiceH.Update)
		protected.PUT("/invoices/:id/email", middleware.RequireRole("Store Manager"), invoiceH.SendByEmail)

		// Loyalty
		protected.GET("/loyalty/tiers", loyaltyH.ListTiers)
		protected.GET("/loyalty/ledger", loyaltyH.ListLedger)
		protected.POST("/loyalty/earn", loyaltyH.Earn)
		protected.POST("/loyalty/redeem", loyaltyH.Redeem)

		// Marketing
		protected.GET("/campaigns", middleware.RequireRole("Store Manager"), verified, marketingH.List)
		protected.POST("/campaigns", middleware.RequireRole("Corporate Admin"), verified, marketingH.Create)
		protected.PUT("/campaigns/:id", middleware.RequireRole("Corporate Admin"), verified, marketingH.Update)

		// Online Store
		protected.GET("/store/settings", verified, storeH.GetSettings)
		protected.PUT("/store/settings", middleware.RequireRole("Corporate Admin"), verified, storeH.UpdateSettings)

		// POS
		protected.PUT("/pos/tables/:id", posH.UpdateTableState)
		protected.GET("/pos/tables/:id/bill", posH.GetTableBill)

		// Fiscal
		protected.GET("/fiscal", middleware.RequireRole("Corporate Admin"), verified, fiscalH.List)
		protected.GET("/fiscal/:transaction_id", middleware.RequireRole("Corporate Admin"), verified, fiscalH.GetByTransaction)
		protected.POST("/fiscal", middleware.RequireRole("Corporate Admin"), verified, fiscalH.Create)

		// Recipes
		protected.GET("/recipes", middleware.RequireRole("Store Manager"), recipeH.List)
		protected.GET("/recipes/:id", middleware.RequireRole("Store Manager"), recipeH.GetByID)
		protected.POST("/recipes", middleware.RequireRole("Store Manager"), recipeH.Create)
		protected.PUT("/recipes/:id", middleware.RequireRole("Store Manager"), recipeH.Update)

		// Purchase Orders
		protected.GET("/purchase-orders", middleware.RequireRole("Store Manager"), poH.List)
		protected.GET("/purchase-orders/:id", middleware.RequireRole("Store Manager"), poH.GetByID)
		protected.POST("/purchase-orders", middleware.RequireRole("Store Manager"), poH.Create)
		protected.PUT("/purchase-orders/:id", middleware.RequireRole("Store Manager"), poH.Update)
		protected.PUT("/purchase-orders/:id/receive", middleware.RequireRole("Inventory Auditor"), poH.Receive)

		// Transfers
		protected.GET("/transfers", middleware.RequireRole("Store Manager"), transferH.List)
		protected.POST("/transfers", middleware.RequireRole("Store Manager"), transferH.Create)
		protected.PUT("/transfers/:id/receive", middleware.RequireRole("Store Manager"), transferH.Receive)

		// Reviews
		protected.GET("/reviews", reviewH.List)
		protected.PUT("/reviews/:id/reply", middleware.RequireRole("Store Manager"), reviewH.Reply)

		// Delivery
		protected.GET("/delivery", deliveryH.List)
		protected.PUT("/delivery/:id/status", deliveryH.UpdateStatus)

		// Feedback
		protected.GET("/feedback", feedbackH.List)
		protected.PUT("/feedback/:id/resolve", middleware.RequireRole("Store Manager"), feedbackH.Resolve)
		protected.PUT("/feedback/:id/escalate", middleware.RequireRole("Store Manager"), feedbackH.Escalate)

		// Permissions
		protected.GET("/permissions", middleware.RequireRole("Corporate Admin"), verified, permissionH.List)
		protected.GET("/permissions/:role", middleware.RequireRole("Corporate Admin"), verified, permissionH.GetByRole)
		protected.PUT("/permissions/:role", middleware.RequireRole("Corporate Admin"), verified, permissionH.Update)

		// Audit
		protected.GET("/audit", middleware.RequireRole("Corporate Admin"), verified, auditH.List)

		// System Health
		protected.GET("/health/branches", reportH.SystemHealth)
	}

	_ = time.Now() // keep time import used

	return r
}
