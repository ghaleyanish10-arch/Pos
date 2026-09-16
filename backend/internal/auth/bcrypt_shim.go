package auth

import "golang.org/x/crypto/bcrypt"

func bcryptCompareHashAndPassword(hash, candidate string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(candidate)) == nil
}

func bcryptHash(secret string) (string, error) {
	b, err := bcrypt.GenerateFromPassword([]byte(secret), 12)
	if err != nil {
		return "", err
	}
	return string(b), nil
}
