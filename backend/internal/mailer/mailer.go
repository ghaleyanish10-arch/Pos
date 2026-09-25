// Package mailer sends real emails over SMTP. It stays out of the way when
// SMTP is not configured: callers check Configured() first and degrade.
//
// Gmail specifically: use smtp.gmail.com:587 with an App Password
// (myaccount.google.com → Security → 2-Step Verification → App passwords).
// The account password itself will NOT work — Google rejects plain login.
package mailer

import (
	"crypto/tls"
	"fmt"
	"net"
	"net/smtp"
	"strings"
	"time"
)

type Mailer struct {
	host     string
	port     string
	username string
	password string
	from     string
}

func New(host, port, username, password, from string) *Mailer {
	return &Mailer{host: host, port: port, username: username, password: password, from: from}
}

// Configured reports whether SMTP delivery is available. Without it the API
// keeps working; invoice emailing simply reports an honest error instead of
// pretending a receipt went out.
func (m *Mailer) Configured() bool {
	return m != nil && m.host != "" && m.from != ""
}

func (m *Mailer) addr() string { return m.host + ":" + m.port }

// Send delivers a plain-text + HTML email to a single recipient.
func (m *Mailer) Send(to, subject, textBody, htmlBody string) error {
	if !m.Configured() {
		return fmt.Errorf("smtp is not configured")
	}
	if to == "" {
		return fmt.Errorf("recipient email is empty")
	}
	msg := buildMessage(m.from, to, subject, textBody, htmlBody)

	// AUTH is only attempted when a username is configured. Go's PlainAuth
	// refuses to authenticate over an unencrypted connection unless the
	// server is "localhost", so anonymous relays (local MailHog/devboxes,
	// unauthenticated gateways) must not be handed an Auth at all — sending
	// with auth=nil skips the AUTH verb entirely. Real providers always pair
	// credentials with TLS (implicit 465 or STARTTLS on 587), where Go
	// negotiates the secure channel before authenticating.
	var auth smtp.Auth
	if m.username != "" {
		auth = smtp.PlainAuth("", m.username, m.password, m.host)
	}
	return smtp.SendMail(m.addr(), auth, m.from, []string{to}, msg)
}

// SendWithTLS delivers over an explicit TLS connection (implicit TLS on the
// submission port 465). Gmail's 587 path is STARTTLS, which smtp.SendMail
// already negotiates; some corporate networks block 587, so 465 is the
// fallback. Used by the OTP verification flow, which must actually deliver.
func (m *Mailer) SendWithTLS(to, subject, textBody, htmlBody string) error {
	if !m.Configured() {
		return fmt.Errorf("smtp is not configured")
	}
	if to == "" {
		return fmt.Errorf("recipient email is empty")
	}

	host, _, err := net.SplitHostPort(m.addr())
	if err != nil {
		host = m.host
	}
	conn, err := tls.Dial("tcp", m.host+":465", &tls.Config{ServerName: host})
	if err != nil {
		// 465 blocked — fall back to the STARTTLS path on the configured port.
		return m.Send(to, subject, textBody, htmlBody)
	}
	defer conn.Close()

	client, err := smtp.NewClient(conn, m.host)
	if err != nil {
		return fmt.Errorf("smtp client: %w", err)
	}
	defer client.Close()

	if ok, _ := client.Extension("AUTH"); ok && m.username != "" {
		if err = client.Auth(smtp.PlainAuth("", m.username, m.password, m.host)); err != nil {
			return fmt.Errorf("smtp auth: %w", err)
		}
	}
	if err = client.Mail(m.from); err != nil {
		return err
	}
	if err = client.Rcpt(to); err != nil {
		return err
	}
	w, err := client.Data()
	if err != nil {
		return err
	}
	if _, err = w.Write(buildMessage(m.from, to, subject, textBody, htmlBody)); err != nil {
		return err
	}
	if err = w.Close(); err != nil {
		return err
	}
	return client.Quit()
}

// SendVerificationCode emails the 6-digit OTP for account verification.
// The code renders as large letter-spaced digits — easy to read from a phone
// held in one hand. Copy states the 10-minute expiry and single-use rule.
func (m *Mailer) SendVerificationCode(to, name, code string) error {
	subject := "Your Mesa OS verification code"
	text := fmt.Sprintf("Hey %s,\n\nYour Mesa OS verification code is %s.\nIt expires in 10 minutes and can only be used once.\n\nIf you didn't request this, ignore this email.\n", name, code)
	html := fmt.Sprintf(`<!DOCTYPE html>
<html><body style="margin:0;padding:24px;background:#f5f5f4;font-family:-apple-system,Segoe UI,Roboto,sans-serif">
  <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px">
    <h1 style="margin:0 0 12px;font-size:24px;color:#111">Hey %s</h1>
    <p style="margin:0 0 20px;font-size:15px;color:#333;line-height:1.6">
      Enter this code to activate your Mesa OS account. It expires in 10 minutes
      and can only be used once.
    </p>
    <div style="margin:24px 0;padding:20px;background:#f5f5f4;border-radius:12px;text-align:center;font-family:monospace;font-size:34px;font-weight:bold;letter-spacing:10px;color:#111">%s</div>
    <p style="margin:0;font-size:12px;color:#888">If you didn't request this code, you can safely ignore this email.</p>
  </div>
</body></html>`, name, code)
	return m.SendWithTLS(to, subject, text, html)
}

// SendInvoiceEmail composes and sends the invoice receipt for an invoice.
func (m *Mailer) SendInvoiceEmail(to, invoiceRef, party string, amount float64, dueDate time.Time, lines []Line) error {
	subject := fmt.Sprintf("Invoice %s — %s", invoiceRef, FormatRs(amount))
	return m.Send(to, subject, invoiceText(invoiceRef, party, amount, dueDate, lines), invoiceHTML(invoiceRef, party, amount, dueDate, lines))
}

// SendReceiptEmail sends a payment receipt for a POS transaction.
// tableName is the dine-in table the order was served at ("" for takeaway/delivery).
func (m *Mailer) SendReceiptEmail(to, ref, method, tableName string, amount float64, when time.Time, lines []Line, fiscalID string) error {
	subject := fmt.Sprintf("Payment receipt %s — %s", ref, FormatRs(amount))
	return m.Send(to, subject, ReceiptText(ref, method, tableName, amount, when, lines, fiscalID), ReceiptHTML(ref, method, tableName, amount, when, lines, fiscalID))
}

// ReceiptText builds the plain-text payment receipt body. Unexported in one
// place so the Resend path (email.Service) and the SMTP path share the same
// content instead of maintaining two versions.
func ReceiptText(ref, method, tableName string, amount float64, when time.Time, lines []Line, fiscalID string) string {
	var b strings.Builder
	fmt.Fprintf(&b, "Hello,\n\nThank you for your payment. Here is your receipt.\n\n")
	fmt.Fprintf(&b, "Receipt: %s\n", ref)
	fmt.Fprintf(&b, "Date: %s\n", when.Format("02 Jan 2006, 15:04"))
	fmt.Fprintf(&b, "Payment method: %s\n", method)
	if tableName != "" {
		fmt.Fprintf(&b, "Table: %s\n", tableName)
	}
	if len(lines) > 0 {
		b.WriteString("\nItems:\n")
		for _, l := range lines {
			fmt.Fprintf(&b, "  - %s x%d = %s\n", l.Description, l.Qty, FormatRs(l.UnitPrice*float64(l.Qty)))
		}
	}
	fmt.Fprintf(&b, "\nTotal paid: %s\n", FormatRs(amount))
	if fiscalID != "" {
		fmt.Fprintf(&b, "Fiscal ID: %s\n", fiscalID)
	}
	b.WriteString("\nMesa OS · Restaurant POS\n")
	return b.String()
}

func ReceiptHTML(ref, method, tableName string, amount float64, when time.Time, lines []Line, fiscalID string) string {
	var rows strings.Builder
	for _, l := range lines {
		fmt.Fprintf(&rows,
			"<tr><td style=\"padding:6px 12px;border-bottom:1px solid #eee\">%s</td><td style=\"padding:6px 12px;border-bottom:1px solid #eee;text-align:center\">%d</td><td style=\"padding:6px 12px;border-bottom:1px solid #eee;text-align:right\">%s</td></tr>",
			l.Description, l.Qty, FormatRs(l.UnitPrice*float64(l.Qty)))
	}
	itemsTable := ""
	if rows.Len() > 0 {
		itemsTable = "<h3 style=\"margin:16px 0 8px\">Items</h3>" +
			"<table style=\"border-collapse:collapse;width:100%;font-size:14px\"><tr>" +
			"<th style=\"text-align:left;padding:6px 12px\">Description</th><th style=\"padding:6px 12px\">Qty</th>" +
			"<th style=\"text-align:right;padding:6px 12px\">Amount</th></tr>" +
			rows.String() + "</table>"
	}
	fiscal := ""
	if fiscalID != "" {
		fiscal = fmt.Sprintf("<br/>Fiscal ID: %s", fiscalID)
	}
	table := ""
	if tableName != "" {
		table = fmt.Sprintf("Table: <strong>%s</strong><br/>", tableName)
	}
	return fmt.Sprintf(`<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#111">
  <h2 style="margin:0 0 4px">Payment receipt %s</h2>
  <p style="margin:0;color:#666">Mesa OS · Restaurant POS</p>
  <p style="font-size:15px">Date: %s<br/>
  Payment method: <strong>%s</strong><br/>
  %s
  Total paid: <strong style="font-size:18px">%s</strong>%s</p>
  %s
  <p style="color:#666;font-size:13px">Thank you for dining with us.</p>
</div>`, ref, when.Format("02 Jan 2006, 15:04"), method, table, FormatRs(amount), fiscal, itemsTable)
}

// Line is a minimal invoice line item so this package does not import models.
type Line struct {
	Description string
	Qty         int
	UnitPrice   float64
}

func buildMessage(from, to, subject, text, html string) []byte {
	boundary := "mesa-boundary-42"
	var b strings.Builder
	fmt.Fprintf(&b, "From: %s\r\n", from)
	fmt.Fprintf(&b, "To: %s\r\n", to)
	fmt.Fprintf(&b, "Subject: %s\r\n", subject)
	fmt.Fprintf(&b, "MIME-Version: 1.0\r\n")
	fmt.Fprintf(&b, "Content-Type: multipart/alternative; boundary=%q\r\n", boundary)
	b.WriteString("\r\n")
	fmt.Fprintf(&b, "--%s\r\n", boundary)
	b.WriteString("Content-Type: text/plain; charset=utf-8\r\n\r\n")
	b.WriteString(text)
	b.WriteString("\r\n")
	fmt.Fprintf(&b, "--%s\r\n", boundary)
	b.WriteString("Content-Type: text/html; charset=utf-8\r\n\r\n")
	b.WriteString(html)
	b.WriteString("\r\n")
	fmt.Fprintf(&b, "--%s--\r\n", boundary)
	return []byte(b.String())
}

func FormatRs(v float64) string {
	return fmt.Sprintf("Rs %.0f", v)
}

func invoiceText(ref, party string, amount float64, due time.Time, lines []Line) string {
	var b strings.Builder
	fmt.Fprintf(&b, "Hello,\n\nHere is your invoice %s from Mesa OS.\n\n", ref)
	fmt.Fprintf(&b, "Billed to: %s\n", party)
	fmt.Fprintf(&b, "Amount due: %s\n", FormatRs(amount))
	fmt.Fprintf(&b, "Due date: %s\n", due.Format("02 Jan 2006"))
	if len(lines) > 0 {
		b.WriteString("\nItems:\n")
		for _, l := range lines {
			fmt.Fprintf(&b, "  - %s x%d = %s\n", l.Description, l.Qty, FormatRs(l.UnitPrice*float64(l.Qty)))
		}
	}
	b.WriteString("\nThank you for your business.\n")
	return b.String()
}

func invoiceHTML(ref, party string, amount float64, due time.Time, lines []Line) string {
	var rows strings.Builder
	for _, l := range lines {
		fmt.Fprintf(&rows,
			"<tr><td style=\"padding:6px 12px;border-bottom:1px solid #eee\">%s</td><td style=\"padding:6px 12px;border-bottom:1px solid #eee;text-align:center\">%d</td><td style=\"padding:6px 12px;border-bottom:1px solid #eee;text-align:right\">%s</td></tr>",
			l.Description, l.Qty, FormatRs(l.UnitPrice*float64(l.Qty)))
	}
	itemsTable := ""
	if rows.Len() > 0 {
		itemsTable = "<h3 style=\"margin:16px 0 8px\">Items</h3>" +
			"<table style=\"border-collapse:collapse;width:100%;font-size:14px\"><tr>" +
			"<th style=\"text-align:left;padding:6px 12px\">Description</th><th style=\"padding:6px 12px\">Qty</th>" +
			"<th style=\"text-align:right;padding:6px 12px\">Amount</th></tr>" +
			rows.String() + "</table>"
	}
	return fmt.Sprintf(`<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#111">
  <h2 style="margin:0 0 4px">Invoice %s</h2>
  <p style="margin:0;color:#666">Mesa OS · Restaurant POS</p>
  <p style="font-size:15px">Billed to: <strong>%s</strong><br/>
  Amount due: <strong style="font-size:18px">%s</strong><br/>
  Due date: %s</p>
  %s
  <p style="color:#666;font-size:13px">Thank you for your business.</p>
</div>`, ref, party, FormatRs(amount), due.Format("02 Jan 2006"), itemsTable)
}
