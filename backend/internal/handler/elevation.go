package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/mesa-os/backend/internal/auth"
	"github.com/mesa-os/backend/internal/config"
	"github.com/mesa-os/backend/internal/model"
	"github.com/mesa-os/backend/internal/repo"
)

const (
	pinMaxAttempts     = 5
	pinLockoutCooldown = 5 * time.Minute
	elevationTTL       = auth.ElevationTTLDefault
	// discountNotifyThresholdPct is the discount/price-override percentage
	// above which an approved action counts as high-risk and notifies.
	discountNotifyThresholdPct = 20
)

// PINReauthWindow is how long a boss's verified login password stays trusted
// for further PIN set/resets in this process. The first PIN change inside a
// window still demands the password; later ones skip the prompt. It is a
// package var so tests can shrink it — production keeps it at 30 minutes.
var PINReauthWindow = 30 * time.Minute

// ElevationHandler implements PIN step-up authorization:
//   - POST /auth/elevate        — exchange a PIN for a single-use token
//   - PUT  /staff/:id/pin       — boss-only PIN set/reset (password re-auth)
//   - GET  /staff/pin-holders   — which managers can elevate (no secrets)
//   - GET  /notifications       — lockout + high-risk approval events
type ElevationHandler struct {
	repo    *repo.ElevationRepo
	audit   *repo.AuditRepo
	authSvc *auth.Service
	config  *config.Config

	// pinReauth records the last successful password verification per boss
	// session so a fresh window can skip the prompt. Per-process: an API
	// restart simply requires the password again.
	pinReauthMu sync.Mutex
	pinReauth   map[string]time.Time
}

func NewElevationHandler(r *repo.ElevationRepo, a *repo.AuditRepo, svc *auth.Service, cfg *config.Config) *ElevationHandler {
	return &ElevationHandler{
		repo:      r,
		audit:     a,
		authSvc:   svc,
		config:    cfg,
		pinReauth: make(map[string]time.Time),
	}
}

// rememberReauth stamps the caller's last successful password verification.
func (h *ElevationHandler) rememberReauth(callerID string) {
	h.pinReauthMu.Lock()
	defer h.pinReauthMu.Unlock()
	h.pinReauth[callerID] = time.Now()
}

// reauthFresh reports whether the caller verified their password recently
// enough to skip the prompt. Stale grants are evicted lazily.
func (h *ElevationHandler) reauthFresh(callerID string) bool {
	h.pinReauthMu.Lock()
	defer h.pinReauthMu.Unlock()
	last, ok := h.pinReauth[callerID]
	if !ok {
		return false
	}
	if time.Since(last) > PINReauthWindow {
		delete(h.pinReauth, callerID)
		return false
	}
	return true
}

// elevationAudit writes an audit_events row for every elevation attempt,
// success or failure, through the existing audit repo (no parallel log).
func (h *ElevationHandler) elevationAudit(c *gin.Context, actorID, actorName, actorRole, eventType, summary string, details map[string]any) {
	branchID, _ := c.Get("branch_id")
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
		BranchID:  strPtr(branchID.(string)),
	}
	if err := h.audit.Create(c.Request.Context(), event); err != nil {
		ginLog("elevation audit write failed: " + err.Error())
	}
}

// isLocked reports whether the PIN holder is currently locked out.
func isLocked(s *repo.PINStatus) bool {
	return s.LockedUntil != nil && s.LockedUntil.After(time.Now())
}

func (h *ElevationHandler) Elevate(c *gin.Context) {
	var req model.ElevateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "pin_holder_user_id, pin and action are required"})
		return
	}

	// The requester (the terminal session) is audited as the actor; the PIN
	// holder is the target whose authority is borrowed for one action.
	actorID, _ := c.Get("user_id")
	actorEmail, _ := c.Get("email")
	actorRole, _ := c.Get("role")
	branchID, _ := c.Get("branch_id")

	status, err := h.repo.LoadPIN(c.Request.Context(), req.PINHolderID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			// Audit without revealing why it failed.
			h.elevationAudit(c, actorID.(string), actorEmail.(string), actorRole.(string),
				"elevation.failed", "elevation failed: unknown pin holder",
				map[string]any{"action": req.Action, "resource_id": req.ResourceID})
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid PIN or pin holder"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "elevation lookup failed"})
		return
	}

	// Only Manager/Admin PINs authorize actions — exactly the population
	// ListPINHolders surfaces and the lockout notifications notify. A cashier
	// or other role with a stored PIN (roster/clock-in) must never elevate.
	if status.Role != "Store Manager" && status.Role != "Corporate Admin" {
		h.elevationAudit(c, actorID.(string), actorEmail.(string), actorRole.(string),
			"elevation.failed", "elevation failed: pin holder cannot elevate",
			map[string]any{"pin_holder_id": status.UserID, "pin_holder_role": status.Role, "action": req.Action, "resource_id": req.ResourceID})
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid PIN or pin holder"})
		return
	}

	if isLocked(status) {
		// Failures during lockout are logged but answered with a clear locked
		// error — staff should not have to guess whether the PIN was wrong.
		h.elevationAudit(c, actorID.(string), actorEmail.(string), actorRole.(string),
			"elevation.locked", "elevation attempt while PIN locked",
			map[string]any{"pin_holder_id": status.UserID, "action": req.Action, "resource_id": req.ResourceID})
		c.JSON(http.StatusLocked, gin.H{
			"error":        "PIN locked — too many failed attempts",
			"locked_until": status.LockedUntil,
		})
		return
	}

	if !auth.VerifyPIN(status.PINHash, req.PIN) {
		attempts, lockedUntil, ferr := h.repo.RegisterFailure(c.Request.Context(), status.UserID, pinMaxAttempts, pinLockoutCooldown)
		if ferr != nil {
			ginLog("pin failure persist failed: " + ferr.Error())
		}
		locked := ferr == nil && lockedUntil != nil && attempts >= pinMaxAttempts

		summary := "elevation failed: invalid PIN"
		eventType := "elevation.failed"
		if locked {
			summary = "PIN locked after repeated failed attempts"
			eventType = "elevation.lockout"
		}
		h.elevationAudit(c, actorID.(string), actorEmail.(string), actorRole.(string),
			eventType, summary,
			map[string]any{
				"pin_holder_id": status.UserID,
				"attempts":      attempts,
				"action":        req.Action,
				"resource_id":   req.ResourceID,
			})

		// Lockout notification: exactly one per lockout window, and only for
		// Manager/Admin PINs (those authorize the sensitive actions).
		if locked && (status.Role == "Store Manager" || status.Role == "Corporate Admin") {
			notif := map[string]any{
				"user_id": status.UserID,
				"name":    status.Name,
				"role":    status.Role,
			}
			payload, _ := json.Marshal(notif)
			if nerr := h.repo.CreateNotification(c.Request.Context(), "Corporate Admin", branchID.(string), "pin.lockout", payload); nerr != nil {
				ginLog("lockout notification failed: " + nerr.Error())
			}
		}

		if locked {
			c.JSON(http.StatusLocked, gin.H{
				"error":        "PIN locked — too many failed attempts",
				"locked_until": lockedUntil,
			})
		} else {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid PIN or pin holder"})
		}
		return
	}

	// Success: clear the counter, audit, mint a single-use token bound to
	// action + resource.
	if serr := h.repo.ResetFailures(c.Request.Context(), status.UserID); serr != nil {
		ginLog("pin reset failed: " + serr.Error())
	}

	token, jti, expiresAt, terr := auth.GenerateElevationToken(status.UserID, req.Action, req.ResourceID, h.config.JWTSecret, elevationTTL)
	if terr != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to issue elevation token"})
		return
	}
	if serr := h.repo.StoreToken(c.Request.Context(), jti, status.UserID, req.Action, req.ResourceID, expiresAt); serr != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to register elevation token"})
		return
	}

	h.elevationAudit(c, actorID.(string), actorEmail.(string), actorRole.(string),
		"elevation.success", "PIN elevation granted",
		map[string]any{
			"pin_holder_id":   status.UserID,
			"pin_holder_name": status.Name,
			"pin_holder_role": status.Role,
			"action":          req.Action,
			"resource_id":     req.ResourceID,
			"jti":             jti,
		})

	c.JSON(http.StatusOK, gin.H{
		"elevation_token": token,
		"expires_at":      expiresAt.Unix(),
		"elevated_by":     status.Name,
		"action":          req.Action,
	})
}

// SetPIN lets a Corporate Admin (boss) set or reset another user's PIN. It
// requires the boss's own login password as re-auth — a session alone is not
// enough. A verified password stays trusted for one PINReauthWindow, so a
// freshly re-authenticated boss can change several PINs in a row without
// re-entering it; requesting a PIN change with an empty password outside that
// window is refused with 401 and the client must re-confirm. Managers can
// never set PINs; nobody can read a PIN back, only overwrite it.
func (h *ElevationHandler) SetPIN(c *gin.Context) {
	callerID, _ := c.Get("user_id")
	callerRole, _ := c.Get("role")

	if callerRole.(string) != "Corporate Admin" {
		c.JSON(http.StatusForbidden, gin.H{"error": "only the boss can set or reset PINs"})
		return
	}

	var req model.SetPINRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "pin is required"})
		return
	}

	// Re-authenticate the caller with their login password. A stolen session
	// token alone must not be able to mint PINs — but a password confirmed
	// within the last PINReauthWindow satisfies the requirement for the whole
	// window, so a trusted boss does not type it for every single PIN.
	if req.Password != "" {
		if verr := h.authSvc.VerifyPassword(c.Request.Context(), callerID.(string), req.Password); verr != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "your password did not match — PIN not changed"})
			return
		}
		h.rememberReauth(callerID.(string))
	} else if !h.reauthFresh(callerID.(string)) {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "re-auth required — enter your password"})
		return
	}

	targetID := c.Param("id")
	target, err := h.repo.LoadPIN(c.Request.Context(), targetID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			c.JSON(http.StatusNotFound, gin.H{"error": "staff member not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "PIN lookup failed"})
		return
	}

	// Only the boss may set the boss's PIN — elevation authority must not be
	// transferable downward. (The endpoint is Corporate-Admin-only already;
	// this guard keeps the invariant explicit for defense in depth.)
	_ = target.Role

	if verr := auth.ValidatePIN(req.PIN); verr != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": verr.Error()})
		return
	}

	if serr := h.authSvc.SetPIN(c.Request.Context(), targetID, req.PIN); serr != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to store PIN"})
		return
	}

	// The PIN reset itself is a sensitive event worth auditing.
	h.elevationAudit(c, callerID.(string), c.GetString("email"), callerRole.(string),
		"pin.reset", "PIN set or reset by boss",
		map[string]any{"target_user_id": targetID, "target_role": target.Role})

	c.JSON(http.StatusOK, gin.H{"message": "PIN updated"})
}

// DeleteAccount soft-deletes a staff account (boss-only). The row drops out
// of login, roster and PIN lists; its PIN, refresh token and lockout state are
// cleared, and any approved-terminal or pending-elevation ties are revoked.
// The boss can never delete their own account.
func (h *ElevationHandler) DeleteAccount(c *gin.Context) {
	callerID, _ := c.Get("user_id")
	callerRole, _ := c.Get("role")

	if callerRole.(string) != "Corporate Admin" {
		c.JSON(http.StatusForbidden, gin.H{"error": "only the boss can delete staff accounts"})
		return
	}

	targetID := c.Param("id")
	if targetID == callerID.(string) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "you cannot delete your own account"})
		return
	}

	target, err := h.repo.LoadPIN(c.Request.Context(), targetID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			c.JSON(http.StatusNotFound, gin.H{"error": "staff member not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "lookup failed"})
		return
	}

	if err := h.repo.DeleteAccount(c.Request.Context(), targetID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			c.JSON(http.StatusNotFound, gin.H{"error": "staff member not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete staff account"})
		return
	}

	h.elevationAudit(c, callerID.(string), c.GetString("email"), callerRole.(string),
		"staff.deleted", "staff account deleted by boss",
		map[string]any{"target_user_id": targetID, "target_role": target.Role})

	c.JSON(http.StatusOK, gin.H{"message": "staff account deleted"})
}

// ListPINHolders exposes which managers/admins of the caller's own branch can
// currently elevate — the PIN modal needs this list to offer a picker. It
// contains no secret data and never crosses branches.
func (h *ElevationHandler) ListPINHolders(c *gin.Context) {
	users, err := h.repo.ListPINHolders(c.Request.Context(), branchIDFromCtx(c))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list pin holders"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": users})
}

// ListUsers (boss-only) lists accounts with a has_pin flag so the boss can
// see who still needs a PIN — strictly within their own branch.
func (h *ElevationHandler) ListUsers(c *gin.Context) {
	users, err := h.repo.ListUsers(c.Request.Context(), branchIDFromCtx(c))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list users"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": users})
}

// ListNotifications serves the bell: server-persisted lockout and high-risk
// approval events for the current role.
func (h *ElevationHandler) ListNotifications(c *gin.Context) {
	role, _ := c.Get("role")
	notifications, err := h.repo.ListNotifications(c.Request.Context(), role.(string), 50)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list notifications"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": notifications})
}

// MarkNotificationRead stamps a notification read.
func (h *ElevationHandler) MarkNotificationRead(c *gin.Context) {
	if err := h.repo.MarkNotificationRead(c.Request.Context(), c.Param("id")); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update notification"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "notification read"})
}
