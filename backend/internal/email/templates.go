package email

import (
	"context"
	"fmt"
	"net/url"
)

// SendVerificationEmail emails the account-verification link pointing at the
// LOCAL app (APP_URL, e.g. http://localhost:5173/verify-email?token=...).
func (s *Service) SendVerificationEmail(ctx context.Context, to, name, token string) (string, error) {
	link := fmt.Sprintf("%s/verify-email?token=%s", s.appURL, url.QueryEscape(token))
	html := shell("Verify your email", fmt.Sprintf(`
      <h1 style="margin:0 0 12px;font-size:24px;color:#111">Welcome, %s</h1>
      <p style="margin:0 0 20px;font-size:15px;color:#333;line-height:1.6">
        Confirm this address to activate your Mesa OS account. The link expires in 24 hours.
      </p>
      %s
      %s`, name, button(link, "Verify my email"), linkFallback(link)))
	text := fmt.Sprintf("Welcome to Mesa OS, %s.\n\nVerify your account: %s\n\nThis link expires in 24 hours.", name, link)
	return s.Send(ctx, to, "Verify your Mesa OS account", html, text)
}

// SendPasswordResetEmail emails the password-reset link (local app URL).
func (s *Service) SendPasswordResetEmail(ctx context.Context, to, name, token string) (string, error) {
	link := fmt.Sprintf("%s/reset-password?token=%s", s.appURL, url.QueryEscape(token))
	html := shell("Reset your password", fmt.Sprintf(`
      <h1 style="margin:0 0 12px;font-size:24px;color:#111">Password reset</h1>
      <p style="margin:0 0 20px;font-size:15px;color:#333;line-height:1.6">
        Hi %s — we received a request to reset your Mesa OS password. The link expires in 1 hour.
        If this wasn't you, you can safely ignore this email.
      </p>
      %s
      %s`, name, button(link, "Choose a new password"), linkFallback(link)))
	text := fmt.Sprintf("Reset your Mesa OS password: %s\n\nThis link expires in 1 hour. If you didn't request this, ignore this email.", link)
	return s.Send(ctx, to, "Reset your Mesa OS password", html, text)
}

// SendWelcomeEmail is sent once an account is verified.
func (s *Service) SendWelcomeEmail(ctx context.Context, to, name string) (string, error) {
	home := s.appURL + "/"
	html := shell("You're all set", fmt.Sprintf(`
      <h1 style="margin:0 0 12px;font-size:24px;color:#111">You're verified, %s</h1>
      <p style="margin:0 0 20px;font-size:15px;color:#333;line-height:1.6">
        Your Mesa OS account is active. Sign in any time — the register, kitchen display
        and reports are ready when you are.
      </p>
      %s`, name, button(home, "Open Mesa OS")))
	text := fmt.Sprintf("Your Mesa OS account is verified. Open the app: %s", home)
	return s.Send(ctx, to, "Welcome to Mesa OS", html, text)
}
