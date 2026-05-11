package handlers

import (
	"fmt"

	"github.com/sigcode/confnode/agent/config"
	"github.com/sigcode/confnode/agent/validator"
)

func PHPFPMRestart(cfg *config.Config, version string) (string, error) {
	if err := validator.ValidatePHPVersion(version, cfg.PHP.Versions); err != nil {
		return "", err
	}
	unit := fmt.Sprintf("php%s-fpm", version)
	return runCmd("systemctl", "restart", unit)
}

func PHPFPMStatus(cfg *config.Config, version string) (string, error) {
	if err := validator.ValidatePHPVersion(version, cfg.PHP.Versions); err != nil {
		return "", err
	}
	unit := fmt.Sprintf("php%s-fpm", version)
	return ServiceStatus(unit)
}
