package handlers

import (
	"fmt"
	"os"
	"path/filepath"
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
	if err := validator.ValidateDeployPath(path, cfg.Git.DeployRoots); err != nil {
		return "", err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return "", fmt.Errorf("cannot create parent directory: %v", err)
	}
	return runGitCmd("", resolveSSHKey(cfg, sshKeyOverride), "clone", url, path)
}

func GitPull(cfg *config.Config, path, sshKeyOverride string) (string, error) {
	if err := validator.ValidateDeployPath(path, cfg.Git.DeployRoots); err != nil {
		return "", err
	}
	return runGitCmd(path, resolveSSHKey(cfg, sshKeyOverride), "pull")
}

// GitRepoExists reports whether path already contains a git working tree
// (i.e. a "<path>/.git" entry). Used by the build queue to decide clone vs.
// pull from actual filesystem state instead of inferring it from whether a
// pull happened to succeed — a pull can fail for reasons that have nothing
// to do with "repo doesn't exist yet" (missing branch tracking, git's
// safe.directory ownership check, a network blip, ...), and blindly cloning
// into an already-populated deploy_path on any such failure just crashes
// with "destination path ... already exists and is not an empty directory."
func GitRepoExists(cfg *config.Config, path string) (string, error) {
	if err := validator.ValidateDeployPath(path, cfg.Git.DeployRoots); err != nil {
		return "", err
	}
	if _, err := os.Stat(filepath.Join(path, ".git")); err != nil {
		if os.IsNotExist(err) {
			return "false", nil
		}
		return "", fmt.Errorf("cannot stat %q: %v", path, err)
	}
	return "true", nil
}

func GitCheckout(cfg *config.Config, path, branch, sshKeyOverride string) (string, error) {
	if err := validator.ValidateDeployPath(path, cfg.Git.DeployRoots); err != nil {
		return "", err
	}
	if branch == "" {
		return "", errorf("branch must not be empty")
	}
	return runGitCmd(path, resolveSSHKey(cfg, sshKeyOverride), "checkout", branch)
}

func GitSubmoduleUpdate(cfg *config.Config, path, sshKeyOverride string) (string, error) {
	if err := validator.ValidateDeployPath(path, cfg.Git.DeployRoots); err != nil {
		return "", err
	}
	key := resolveSSHKey(cfg, sshKeyOverride)
	if _, err := runGitCmd(path, key, "submodule", "init"); err != nil {
		return "", err
	}
	return runGitCmd(path, key, "submodule", "update", "--recursive")
}
