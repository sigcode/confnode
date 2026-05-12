package handlers

import (
	"os"
	"path/filepath"

	"github.com/sigcode/confnode/agent/config"
	"github.com/sigcode/confnode/agent/validator"
)

func CertbotIssue(cfg *config.Config, domain, webroot string) (string, error) {
	if err := validator.ValidateDomain(domain); err != nil {
		return "", err
	}
	email := cfg.Certbot.Email
	if email == "" {
		return "", errorf("certbot email not configured")
	}
	if webroot == "" {
		webroot = "/var/www/html"
	}
	// Ensure the challenge dir exists in the webroot
	challengeDir := filepath.Join(webroot, ".well-known", "acme-challenge")
	if err := os.MkdirAll(challengeDir, 0755); err != nil {
		return "", errorf("cannot create challenge dir %s: %v", challengeDir, err)
	}
	// certonly --webroot: never touches Apache config, we patch the vhost ourselves
	return runCmd("certbot", "certonly", "--webroot", "-w", webroot,
		"--non-interactive", "--agree-tos", "--keep-until-expiring",
		"-d", domain, "-m", email)
}
