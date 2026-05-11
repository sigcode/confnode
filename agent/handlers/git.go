package handlers

import (
	"github.com/sigcode/confnode/agent/validator"
)

func GitClone(url, path string) (string, error) {
	if err := validator.ValidateGitURL(url); err != nil {
		return "", err
	}
	if err := validator.ValidateDeployPath(path); err != nil {
		return "", err
	}
	return runCmd("git", "clone", url, path)
}

func GitPull(path string) (string, error) {
	if err := validator.ValidateDeployPath(path); err != nil {
		return "", err
	}
	return runCmdInDir(path, "git", "pull")
}

func GitCheckout(path, branch string) (string, error) {
	if err := validator.ValidateDeployPath(path); err != nil {
		return "", err
	}
	if branch == "" {
		return "", errorf("branch must not be empty")
	}
	return runCmdInDir(path, "git", "checkout", branch)
}
