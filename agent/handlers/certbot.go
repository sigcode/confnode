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
	// certonly --webroot: never touches Apache config, we patch the vhost ourselves
	return runCmd("certbot", "certonly", "--webroot", "-w", "/var/www/html",
		"--non-interactive", "--agree-tos", "--keep-until-expiring",
		"-d", domain, "-m", email)
}
