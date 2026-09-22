package handler

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/mesa-os/backend/internal/auth"
	"github.com/mesa-os/backend/internal/config"
	"github.com/mesa-os/backend/internal/model"
	"github.com/mesa-os/backend/internal/repo"
)

// ClockInHandler implements shared-terminal staff identity:
//   - GET  /staff/terminal-status — is THIS device approved for clock-in?
//   - POST /staff/terminal-enable — manager/boss approves the device via PIN
//   - GET  /staff/roster          — who can clock in at this branch (no secrets)
//   - POST /auth/clock-in         — verify PIN, mint a shift-length session token
//   - POST /auth/clock-out        — end the shift (audited; client clears its state)
//
// The endpoints live behind the DeviceID middleware (a self-declared UUID for
// audit attribution only), not AuthMiddleware: a terminal must be able to
// clock in before any staff session exists. Whether a device may use the
// clock-in family is data — an approved row in the `devices` table, voted in
// by a manager/boss PIN — not a secret the frontend bakes into its build. The
// PIN infrastructure (bcrypt hashes, lockout counters, elevation) is shared
// with the elevation feature — a brute-force attempt against someone's PIN is
// the same event regardless of which flow tripped it.
type ClockInHandler struct {
	repo    *repo.ElevationRepo
	devices *repo.DeviceRepo
	audit   *repo.AuditRepo
	authSvc *auth.Service
	config  *config.Config
}

func NewClockInHandler(r *repo.ElevationRepo, d *repo.DeviceRepo, a *repo.AuditRepo, s *auth.Service, cfg *config.Config) *ClockInHandler {
	return &ClockInHandler{repo: r, devices: d, audit: a, authSvc: s, config: cfg}
}

// clockAudit writes one audit_events row per clock-in/out event. actorID is
// the staff member acting at the terminal (nil when the id is unknown, e.g.
// an attempt against a nonexistent account). deviceID comes from the request.
func (h *ClockInHandler) clockAudit(c *gin.Context, actorID, actorName, actorRole, eventType, summary string, details map[string]any) {
	branchRaw, _ := c.Get("branch_id")
	branchID, _ := branchRaw.(string)
	after, err := json.Marshal(details)
	if err != nil {
		after = []byte("{}")
	}
	var actorPtr *string
	if actorID != "" {
		actorPtr = &actorID
	}
	event := &model.AuditEvent{
		ActorID:   actorPtr,
		ActorName: actorName,
		ActorRole: actorRole,
		EventType: eventType,
		Summary:   summary,
		AfterJSON: after,
		BranchID:  strPtr(branchID),
	}
	if err := h.audit.Create(c.Request.Context(), event); err != nil {
		ginLog("clock audit write failed: " + err.Error())
	}
}

// noPIN responds for an account that has never had a PIN set (typically an
// owner who signed up with Google, so there is no login password from which
// a PIN could have been derived). Without this guard, VerifyPIN treats "no
// PIN" as a wrong PIN and burns lockout attempts on something the user can
// never get right. It answers 409 with code NO_PIN_SET so the frontend can
// offer first-time PIN creation instead of a dead-end error.
func (h *ClockInHandler) noPIN(c *gin.Context, status *repo.PINStatus, flow string) bool {
	if status.PINHash != nil {
		return false
	}
	h.clockAudit(c, status.UserID, status.Name, status.Role, "pin.missing",
		flow+" attempt on account without a PIN", map[string]any{"flow": flow})
	c.JSON(http.StatusConflict, gin.H{
		"error": "No PIN is set for your account yet. Create one to continue.",
		"code":  "NO_PIN_SET",
	})
	return true
}

// pinFailure handles a wrong-PIN attempt identically for every flow that
// verifies a PIN (clock-in, terminal enable): it increments the shared
// lockout counter, writes the audit row, notifies the boss when a
// manager/admin PIN locks, and answers the request. flow labels the audit
// events ("clockin", "terminal", ...). This is THE single PIN-failure code
// path — flows must not grow their own counters or audit formats.
func pinFailure(c *gin.Context, pins *repo.ElevationRepo, audit func(*gin.Context, string, string, string, string, string, map[string]any), status *repo.PINStatus, base map[string]any, flow string) {
	attempts, lockedUntil, ferr := pins.RegisterFailure(c.Request.Context(), status.UserID, pinMaxAttempts, pinLockoutCooldown)
	if ferr != nil {
		ginLog("pin failure persist failed: " + ferr.Error())
	}
	locked := ferr == nil && lockedUntil != nil && attempts >= pinMaxAttempts
	summary := flow + " failed: invalid PIN"
	eventType := flow + ".failed"
	if locked {
		summary = "PIN locked after repeated " + flow + " failures"
		eventType = flow + ".lockout"
	}
	details := map[string]any{"attempts": attempts}
	for k, v := range base {
		details[k] = v
	}
	audit(c, status.UserID, status.Name, status.Role, eventType, summary, details)

	// Lockouts of manager/admin PINs always notify the boss regardless of
	// which flow tripped them.
	if locked && (status.Role == "Store Manager" || status.Role == "Corporate Admin") {
		notif, _ := json.Marshal(map[string]any{"user_id": status.UserID, "name": status.Name, "role": status.Role})
		branchRaw, _ := c.Get("branch_id")
		branchID, _ := branchRaw.(string)
		if nerr := pins.CreateNotification(c.Request.Context(), "Corporate Admin", branchID, "pin.lockout", notif); nerr != nil {
			ginLog("lockout notification failed: " + nerr.Error())
		}
	}

	if locked {
		c.JSON(http.StatusLocked, gin.H{
			"error":        "PIN locked — too many failed attempts",
			"locked_until": lockedUntil,
		})
	} else {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid PIN or staff member"})
	}
}

// requireEnabled is the shared-terminal gate: the device must have been
// approved for clock-in (a `devices` row). This replaces the old static
// device token — enablement is now data voted in by a manager/boss PIN.
// branchID "" means the device is enabled globally (any branch it claims).
func (h *ClockInHandler) requireEnabled(c *gin.Context, branchID string) (string, bool) {
	deviceID, _ := c.Get("device_id")
	id, _ := deviceID.(string)
	if id == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "missing device id"})
		return "", false
	}
	enabled, err := h.devices.IsEnabled(c.Request.Context(), id, branchID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "terminal enablement check failed"})
		return "", false
	}
	if !enabled {
		c.JSON(http.StatusForbidden, gin.H{
			"error":  "this terminal is not enabled for clock-in",
			"code":   "TERMINAL_NOT_ENABLED",
			"action": "setup",
		})
		return "", false
	}
	return id, true
}

// Roster lists the staff eligible to clock in at the current branch. It is
// intentionally bare — id, name, role, branch — with no PIN material of any
// kind (test-covered). Only an approved terminal may fetch it.
func (h *ClockInHandler) Roster(c *gin.Context) {
	branchID := c.Query("branch_id")
	if _, ok := h.requireEnabled(c, branchID); !ok {
		return
	}
	users, err := h.repo.ListRoster(c.Request.Context(), branchID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load staff roster"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": users})
}

// ClockIn verifies a staff member's PIN and, on success, mints the
// shift-length session token that AuthMiddleware accepts exactly like a login
// token. Every attempt — unknown user, locked, wrong PIN, success — writes an
// audit row. Failures go through the SAME lockout counter as elevation, so a
// brute-force attempt is throttled once, regardless of which flow triggered it.
func (h *ClockInHandler) ClockIn(c *gin.Context) {
	var req model.ClockInRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "user_id and pin are required"})
		return
	}

	deviceID, _ := c.Get("device_id")
	if req.DeviceID == "" && deviceID != nil {
		req.DeviceID = deviceID.(string)
	}

	// Only an approved terminal may clock anyone in.
	if _, ok := h.requireEnabled(c, ""); !ok {
		return
	}

	status, err := h.repo.LoadPIN(c.Request.Context(), req.UserID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			// Audit without revealing whether the account exists.
			h.clockAudit(c, "", "", "", "clockin.failed", "clock-in failed: unknown staff member",
				map[string]any{"device_id": req.DeviceID})
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid PIN or staff member"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "clock-in lookup failed"})
		return
	}

	base := map[string]any{"user_id": status.UserID, "name": status.Name, "role": status.Role, "device_id": req.DeviceID}

	if isLocked(status) {
		h.clockAudit(c, status.UserID, status.Name, status.Role, "clockin.locked",
			"clock-in attempt while PIN locked", base)
		c.JSON(http.StatusLocked, gin.H{
			"error":        "PIN locked — too many failed attempts. Ask the boss to reset it.",
			"locked_until": status.LockedUntil,
		})
		return
	}

	if h.noPIN(c, status, "clockin") {
		return
	}
	if !auth.VerifyPIN(status.PINHash, req.PIN) {
		pinFailure(c, h.repo, h.clockAudit, status, base, "clockin")
		return
	}

	if serr := h.repo.ResetFailures(c.Request.Context(), status.UserID); serr != nil {
		ginLog("clock-in pin reset failed: " + serr.Error())
	}

	token, expiresAt, terr := auth.GenerateSessionToken(status.UserID, status.Email, status.Role, status.BranchID, h.config.JWTSecret, h.config.ShiftTTL)
	if terr != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to issue session token"})
		return
	}

	details := map[string]any{
		"user_id":     status.UserID,
		"name":        status.Name,
		"role":        status.Role,
		"device_id":   req.DeviceID,
		"shift_until": expiresAt,
	}
	h.clockAudit(c, status.UserID, status.Name, status.Role, "clockin.success",
		"staff clocked in and shift session started", details)

	c.JSON(http.StatusOK, gin.H{
		"user": gin.H{
			"id":        status.UserID,
			"name":      status.Name,
			"email":     status.Email,
			"role":      status.Role,
			"branch_id": status.BranchID,
		},
		"token":      token,
		"expires_at": expiresAt,
	})
}

// ClockOut ends the shift. There is no server-side session registry to revoke
// yet (login/refresh tokens are plain JWTs with no revocation table), so this
// clears nothing server-side beyond the audit row: the client drops its token
// and the natural TTL bound is the backstop. This is an explicitly flagged
// gap — a future refresh/session revocation table belongs here.
func (h *ClockInHandler) ClockOut(c *gin.Context) {
	var req model.ClockOutRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "user_id is required"})
		return
	}
	deviceID, _ := c.Get("device_id")
	if req.DeviceID == "" && deviceID != nil {
		req.DeviceID = deviceID.(string)
	}

	name, role := "", ""
	var actorPtr *string
	if req.UserID != "" {
		actorPtr = &req.UserID
		if status, err := h.repo.LoadPIN(c.Request.Context(), req.UserID); err == nil {
			name, role = status.Name, status.Role
		}
	}
	after, _ := json.Marshal(map[string]any{"device_id": req.DeviceID})
	event := &model.AuditEvent{
		ActorID:   actorPtr,
		ActorName: name,
		ActorRole: role,
		EventType: "clockout",
		Summary:   "staff clocked out; shift session ended on the terminal",
		AfterJSON: after,
	}
	if err := h.audit.Create(c.Request.Context(), event); err != nil {
		ginLog("clock-out audit write failed: " + err.Error())
		c.JSON(http.StatusInternalServerError, gin.H{"error": "clock-out audit failed"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "clocked out"})
}

// TerminalStatus reports whether THIS device (its X-Device-Id) is approved
// for clock-in, and — when it is not — which staff can approve it: managers
// and bosses only. It is deliberately ungated: the setup screen has to be
// reachable before a terminal is enabled.
func (h *ClockInHandler) TerminalStatus(c *gin.Context) {
	deviceID, _ := c.Get("device_id")
	id, _ := deviceID.(string)
	branchID := c.Query("branch_id")

	enabled, err := h.devices.IsEnabled(c.Request.Context(), id, branchID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "terminal enablement check failed"})
		return
	}

	approvers := []model.RosterMember{}
	if !enabled {
		users, lerr := h.repo.ListRoster(c.Request.Context(), branchID)
		if lerr != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load approvers"})
			return
		}
		for _, u := range users {
			if u.Role == "Store Manager" || u.Role == "Corporate Admin" {
				approvers = append(approvers, u)
			}
		}
	}

	c.JSON(http.StatusOK, gin.H{"enabled": enabled, "approvers": approvers})
}

// TerminalEnable lets a manager or boss approve THIS device for clock-in by
// presenting their own PIN. It mirrors ClockIn exactly: the same LoadPIN /
// lockout / VerifyPIN path, the same shared failure counter (flow="terminal"),
// the same audit conventions. The only difference is the role gate applied
// AFTER a correct PIN: a Cashier/Kitchen PIN proves identity, not authority —
// rejected 403 with no lockout (lockouts are for wrong PINs, not for
// legitimate staff who lack the right role).
func (h *ClockInHandler) TerminalEnable(c *gin.Context) {
	var req model.EnableTerminalRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "user_id and pin are required"})
		return
	}
	deviceID, _ := c.Get("device_id")
	deviceIDStr, _ := deviceID.(string)

	status, err := h.repo.LoadPIN(c.Request.Context(), req.UserID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			// Audit without revealing whether the account exists.
			h.clockAudit(c, "", "", "", "terminal.failed",
				"terminal enable failed: unknown staff member",
				map[string]any{"device_id": deviceIDStr})
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid PIN or staff member"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "terminal enable lookup failed"})
		return
	}

	base := map[string]any{"user_id": status.UserID, "name": status.Name, "role": status.Role, "device_id": deviceIDStr}

	if isLocked(status) {
		h.clockAudit(c, status.UserID, status.Name, status.Role, "terminal.locked",
			"terminal enable attempt while PIN locked", base)
		c.JSON(http.StatusLocked, gin.H{
			"error":        "PIN locked — too many failed attempts. Ask the boss to reset it.",
			"locked_until": status.LockedUntil,
		})
		return
	}

	if h.noPIN(c, status, "terminal") {
		return
	}
	if !auth.VerifyPIN(status.PINHash, req.PIN) {
		pinFailure(c, h.repo, h.clockAudit, status, base, "terminal")
		return
	}

	// Correct PIN → identity proven. Authority next: only a manager or boss
	// may approve a terminal. No lockout here — the PIN was right.
	if status.Role != "Store Manager" && status.Role != "Corporate Admin" {
		h.clockAudit(c, status.UserID, status.Name, status.Role, "terminal.forbidden",
			"terminal enable denied: "+status.Role+" cannot approve a terminal", base)
		c.JSON(http.StatusForbidden, gin.H{
			"error": "only a manager or boss can approve this terminal",
			"code":  "TERMINAL_SETUP_FORBIDDEN",
		})
		return
	}

	if serr := h.repo.ResetFailures(c.Request.Context(), status.UserID); serr != nil {
		ginLog("terminal enable pin reset failed: " + serr.Error())
	}

	if err := h.devices.Enable(c.Request.Context(), deviceIDStr, req.BranchID, status.UserID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to enable terminal"})
		return
	}

	h.clockAudit(c, status.UserID, status.Name, status.Role, "terminal.enabled",
		"terminal enabled by "+status.Name, base)

	c.JSON(http.StatusOK, gin.H{
		"enabled": true,
		"message": "terminal approved for clock-in",
		"device":  gin.H{"id": deviceIDStr, "enabled_by_user_id": status.UserID},
	})
}

// ListDevices (boss-only) lists the terminals approved for clock-in at a
// branch — the management surface that backs the boss's "Disable this
// terminal" action.
func (h *ClockInHandler) ListDevices(c *gin.Context) {
	devices, err := h.devices.List(c.Request.Context(), c.Query("branch_id"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list terminals"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": devices})
}

// DisableDevice (boss-only) revokes a terminal's approval so it shows the
// setup screen again on its next load. Only the boss (Corporate Admin) may
// disable — managers can approve, but once enabled a terminal stays until the
// boss revokes it.
func (h *ClockInHandler) DisableDevice(c *gin.Context) {
	deviceID := c.Param("id")
	if err := h.devices.Disable(c.Request.Context(), deviceID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to disable terminal"})
		return
	}

	actorID := c.GetString("user_id")
	actorName, actorRole := c.GetString("email"), c.GetString("role")
	if s, err := h.repo.LoadPIN(c.Request.Context(), actorID); err == nil {
		actorName, actorRole = s.Name, s.Role
	}

	h.clockAudit(c, actorID, actorName, actorRole, "terminal.disabled",
		"terminal disabled by "+actorName, map[string]any{"device_id": deviceID})

	c.JSON(http.StatusOK, gin.H{"message": "terminal disabled"})
}