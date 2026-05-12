package handlers

import (
	"strings"

	"github.com/sigcode/confnode/agent/config"
	"github.com/sigcode/confnode/agent/validator"
)

func GitClone(cfg *config.Config, url, path string) (string, error) {
	url = strings.TrimSpace(url)
	if err := validator.ValidateGitURL(url); err != nil {
		return "", err
	}
	if err := validator.ValidateDeployPath(path); err != nil {
		return "", err
	}
	return runGitCmd("", cfg.Git.SSHKeyPath, "clone", url, path)
}

func GitPull(cfg *config.Config, path string) (string, error) {
	if err := validator.ValidateDeployPath(path); err != nil {
		return "", err
	}
	return runGitCmd(path, cfg.Git.SSHKeyPath, "pull")
}

func GitCheckout(cfg *config.Config, path, branch string) (string, error) {
	if err := validator.ValidateDeployPath(path); err != nil {
		return "", err
	}
	if branch == "" {
		return "", errorf("branch must not be empty")
	}
	return runGitCmd(path, cfg.Git.SSHKeyPath, "checkout", branch)
}
