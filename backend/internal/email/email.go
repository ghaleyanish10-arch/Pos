// Package email is the centralized email service. Real delivery goes through
// the Resend API (https://resend.com) — works entirely from localhost since
// Resend's servers talk to the recipient's inbox, not to your machine.
//
// RESEND_API_KEY lives only on the backend; it is never sent to the frontend
// and never logged.
package email

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

const (
	apiURL        = "https://api.resend.com/emails"
	defaultExpiry = 15 * time.Second
)

type Service struct {
	apiKey  string
	from    string
	appURL  string
	fromName string
	client  *http.Client
}

func New(apiKey, from, fromName, appURL string) *Service {
	return &Service{
		apiKey:  strings.TrimSpace(apiKey),
		from:    strings.TrimSpace(from),
		fromName: strings.TrimSpace(fromName),
		appURL:  strings.TrimRight(strings.TrimSpace(appURL), "/"),
		client:  &http.Client{Timeout: defaultExpiry},
	}
}

// Enabled reports whether real sending is configured. Callers degrade
// gracefully (and say so) when it is false.
func (s *Service) Enabled() bool {
	return s != nil && s.apiKey != "" && s.from != ""
}

// AppURL returns the local application URL used in email links,
// e.g. http://localhost:5173/verify-email?token=...
func (s *Service) AppURL() string { return s.appURL }

type sendRequest struct {
	From    string            `json:"from"`
	To      []string          `json:"to"`
	Subject string            `json:"subject"`
	HTML    string            `json:"html,omitempty"`
	Text    string            `json:"text,omitempty"`
	ReplyTo string            `json:"reply_to,omitempty"`
	Headers map[string]string `json:"headers,omitempty"`
}

type sendResponse struct {
	ID  string `json:"id"`
	Err *struct {
		Type    string `json:"type"`
		Message string `json:"message"`
	} `json:"error,omitempty"`
}

// Send delivers a real email through Resend. It returns the Resend message id
// or a descriptive error. The API key is never included in error strings.
func (s *Service) Send(ctx context.Context, to, subject, html, text string) (string, error) {
	if !s.Enabled() {
		return "", fmt.Errorf("email service is not configured (set RESEND_API_KEY and EMAIL_FROM)")
	}
	if strings.TrimSpace(to) == "" {
		return "", fmt.Errorf("recipient email is empty")
	}

	body, err := json.Marshal(sendRequest{
		From:    s.sender(),
		To:      []string{to},
		Subject: subject,
		HTML:    html,
		Text:    text,
	})
	if err != nil {
		return "", fmt.Errorf("prepare email: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, apiURL, bytes.NewReader(body))
	if err != nil {
		return "", fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+s.apiKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := s.client.Do(req)
	if err != nil {
		// Wrap without ever printing the key (it is only in the header).
		return "", fmt.Errorf("resend request failed: %w", err)
	}
	defer resp.Body.Close()

	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))

	if resp.StatusCode >= 400 {
		msg := strings.TrimSpace(string(raw))
		if len(msg) > 300 {
			msg = msg[:300]
		}
		return "", fmt.Errorf("resend error (status %d): %s", resp.StatusCode, msg)
	}

	var out sendResponse
	if err := json.Unmarshal(raw, &out); err != nil {
		return "", fmt.Errorf("decode resend response: %w", err)
	}
	return out.ID, nil
}

func (s *Service) sender() string {
	if s.fromName != "" {
		return fmt.Sprintf("%s <%s>", s.fromName, s.from)
	}
	return s.from
}

func shell(name string, bodyHTML string) string {
	return fmt.Sprintf(`<!doctype html>
<html><body style="margin:0;padding:24px;background:#f5f5f4;font-family:Arial,Helvetica,sans-serif">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px">
    <p style="margin:0 0 4px;font-size:12px;letter-spacing:2px;color:#8a8a8a;text-transform:uppercase">%s</p>
    %s
    <p style="margin-top:28px;color:#8a8a8a;font-size:12px">Mesa OS · Restaurant POS</p>
  </div>
</body></html>`, name, bodyHTML)
}

func button(href, label string) string {
	return fmt.Sprintf(
		`<a href="%s" style="display:inline-block;background:#111111;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 24px;border-radius:10px">%s</a>`,
		href, label)
}

func linkFallback(href string) string {
	return fmt.Sprintf(
		`<p style="font-size:12px;color:#8a8a8a;word-break:break-all">Or copy this link into your browser:<br/>%s</p>`,
		href)
}
