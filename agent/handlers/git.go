package handlers

import (
	"strings"

	"github.com/sigcode/confnode/agent/config"
	"github.com/sigcode/confnode/agent/validator"
)

func resolveSSHKey(cfg *config.Config, override string) string {
	if strings.TrimSpace(override) != "" {
		return strings.TrimSpace(override)
	}
	return cfg.Git.SSHKeyPath
}

func GitClone(cfg *config.Config, url, path, sshKeyOverride string) (string, error) {
	url = strings.TrimSpace(url)
	if err := validator.ValidateGitURL(url); err != nil {
		return "", err
	}
	if err := validator.ValidateDeployPath(path); err != nil {
		return "", err
	}
	return runGitCmd("", resolveSSHKey(cfg, sshKeyOverride), "clone", url, path)
}

func GitPull(cfg *config.Config, path, sshKeyOverride string) (string, error) {
	if err := validator.ValidateDeployPath(path); err != nil {
		return "", err
	}
	return runGitCmd(path, resolveSSHKey(cfg, sshKeyOverride), "pull")
}

func GitCheckout(cfg *config.Config, path, branch, sshKeyOverride string) (string, error) {
	if err := validator.ValidateDeployPath(path); err != nil {
		return "", err
	}
	if branch == "" {
		return "", errorf("branch must not be empty")
	}
	return runGitCmd(path, resolveSSHKey(cfg, sshKeyOverride), "checkout", branch)
}
