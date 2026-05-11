package handlers

import (
	"github.com/sigcode/confnode/agent/config"
	"github.com/sigcode/confnode/agent/validator"
)

func CertbotIssue(cfg *config.Config, domain string) (string, error) {
	if err := validator.ValidateDomain(domain); err != nil {
		return "", err
	}
	email := cfg.Certbot.Email
	if email == "" {
		return "", errorf("certbot email not configured")
	}
	// --apache plugin handles the challenge automatically without stopping Apache
	return runCmd("certbot", "--non-interactive", "--agree-tos",
		"--apache", "-d", domain, "-m", email)
}
