package auth

import (
	"fmt"
	"strings"
)

// Weak PINs are rejected outright: repeated digits, straight sequences (both
// directions) and a small blocklist of the most-guessed codes. The PIN is a
// single action-authorization secret on a shared terminal, so a 4–6 digit
// numeric code with these exclusions is the deliberate trade-off (high
// entropy comes from the lockout + audit, not from length).
var weakPINBlocklist = map[string]bool{
	"0000": true, "1111": true, "2222": true, "3333": true, "4444": true,
	"5555": true, "6666": true, "7777": true, "8888": true, "9999": true,
	"1234": true, "4321": true, "2580": true, "0852": true, "1004": true,
	"1122": true, "1212": true, "6969": true, "1379": true, "9137": true,
	"000000": true, "111111": true, "123456": true, "654321": true,
}

// ValidatePIN enforces format and weakness rules. Returns a human-readable
// reason so the client can show exactly why a PIN was rejected.
func ValidatePIN(pin string) error {
	pin = strings.TrimSpace(pin)
	if len(pin) < 4 || len(pin) > 6 {
		return fmt.Errorf("PIN must be 4 to 6 digits")
	}
	for _, r := range pin {
		if r < '0' || r > '9' {
			return fmt.Errorf("PIN must contain only digits")
		}
	}
	if weakPINBlocklist[pin] {
		return fmt.Errorf("that PIN is too common — choose a different one")
	}
	// All same digit (covers lengths outside the blocklist too).
	same := true
	for i := 1; i < len(pin); i++ {
		if pin[i] != pin[0] {
			same = false
			break
		}
	}
	if same {
		return fmt.Errorf("that PIN is too common — choose a different one")
	}
	// Straight ascending/descending sequences (e.g. 1234, 8765, 0123).
	asc, desc := true, true
	for i := 1; i < len(pin); i++ {
		if pin[i] != pin[i-1]+1 {
			asc = false
		}
		if pin[i] != pin[i-1]-1 {
			desc = false
		}
	}
	if asc || desc {
		return fmt.Errorf("that PIN is too common — choose a different one")
	}
	return nil
}

// VerifyPIN compares a candidate PIN against a stored bcrypt hash. A missing
// hash (no PIN set yet) always fails — managers must be given a PIN before
// they can elevate anything.
func VerifyPIN(hash *string, pin string) bool {
	if hash == nil || *hash == "" {
		return false
	}
	return bcryptCompareHashAndPassword(*hash, pin)
}
