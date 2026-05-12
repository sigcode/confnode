package handlers

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/sigcode/confnode/agent/config"
	"github.com/sigcode/confnode/agent/validator"
)

func ApacheEnableSite(cfg *config.Config, name string) (string, error) {
	if err := validator.ValidateSiteName(name); err != nil {
		return "", err
	}

	if cfg.Apache.Mode == "arch" {
		return apacheEnableSiteArch(cfg, name)
	}
	return runCmd("a2ensite", name)
}

func ApacheDisableSite(cfg *config.Config, name string) (string, error) {
	if err := validator.ValidateSiteName(name); err != nil {
		return "", err
	}

	if cfg.Apache.Mode == "arch" {
		return apacheDisableSiteArch(cfg, name)
	}
	return runCmd("a2dissite", name)
}

// arch mode: manage symlinks manually
func apacheEnableSiteArch(cfg *config.Config, name string) (string, error) {
	src := filepath.Join(cfg.Apache.SitesAvailable, name+".conf")
	dst := filepath.Join(cfg.Apache.SitesEnabled, name+".conf")

	if _, err := os.Stat(src); err != nil {
		return "", fmt.Errorf("site config not found: %s", src)
	}
	if err := os.MkdirAll(cfg.Apache.SitesEnabled, 0755); err != nil {
		return "", fmt.Errorf("cannot create sites-enabled dir: %v", err)
	}
	os.Remove(dst) // remove stale symlink if exists
	if err := os.Symlink(src, dst); err != nil {
		return "", fmt.Errorf("failed to enable site: %v", err)
	}
	return fmt.Sprintf("enabled %s", name), nil
}

func apacheDisableSiteArch(cfg *config.Config, name string) (string, error) {
	dst := filepath.Join(cfg.Apache.SitesEnabled, name+".conf")
	if err := os.Remove(dst); err != nil && !os.IsNotExist(err) {
		return "", fmt.Errorf("failed to disable site: %v", err)
	}
	return fmt.Sprintf("disabled %s", name), nil
}

func ApacheControl(cfg *config.Config, action string) (string, error) {
	switch action {
	case "reload", "restart", "start", "stop":
		unit := "apache2"
		if cfg.Apache.Mode == "arch" {
			unit = "httpd"
		}
		return runCmd("systemctl", action, unit)
	default:
		return "", fmt.Errorf("invalid apache action: %q", action)
	}
}

func ApacheConfigtest() (string, error) {
	return runCmd("apachectl", "configtest")
}

func ApacheReadVhost(cfg *config.Config, name string) (string, error) {
	if err := validator.ValidateSiteName(name); err != nil {
		return "", err
	}
	path := filepath.Join(cfg.Apache.SitesAvailable, name+".conf")
	data, err := os.ReadFile(path)
	if err != nil {
		return "", fmt.Errorf("cannot read vhost %q: %v", name, err)
	}
	return string(data), nil
}

func ApacheWriteVhost(cfg *config.Config, name, content string) (string, error) {
	if err := validator.ValidateSiteName(name); err != nil {
		return "", err
	}
	if content == "" {
		return "", fmt.Errorf("content must not be empty")
	}
	if err := os.MkdirAll(cfg.Apache.SitesAvailable, 0755); err != nil {
		return "", fmt.Errorf("cannot create sites-available dir: %v", err)
	}
	path := filepath.Join(cfg.Apache.SitesAvailable, name+".conf")
	if err := os.WriteFile(path, []byte(content), 0644); err != nil {
		return "", fmt.Errorf("cannot write vhost %q: %v", name, err)
	}
	return fmt.Sprintf("written %s", path), nil
}
