package handlers

import (
	"fmt"
	"strings"

	"github.com/sigcode/confnode/agent/config"
	"github.com/sigcode/confnode/agent/validator"
)

// phpFPMUnit returns the systemd unit name for a PHP-FPM version.
// Arch: php81-fpm (no dot), Debian/Ubuntu: php8.1-fpm (with dot).
// fpm_units in config can override the auto-generated name per version.
func phpFPMUnit(cfg *config.Config, version string) string {
	if unit, ok := cfg.PHP.FpmUnits[version]; ok {
		return unit
	}
	if cfg.Apache.Mode == "arch" {
		return fmt.Sprintf("php%s-fpm", strings.ReplaceAll(version, ".", ""))
	}
	return fmt.Sprintf("php%s-fpm", version)
}

func PHPFPMRestart(cfg *config.Config, version string) (string, error) {
	if err := validator.ValidatePHPVersion(version, cfg.PHP.Versions); err != nil {
		return "", err
	}
	return runCmd("systemctl", "restart", phpFPMUnit(cfg, version))
}

func PHPFPMStatus(cfg *config.Config, version string) (string, error) {
	if err := validator.ValidatePHPVersion(version, cfg.PHP.Versions); err != nil {
		return "", err
	}
	return ServiceStatus(phpFPMUnit(cfg, version))
}
