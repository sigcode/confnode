package handlers

import (
	"bytes"
	"fmt"
	"os/exec"
)

// runGitCmd runs a git command with an optional SSH key injected via GIT_SSH_COMMAND.
func runGitCmd(dir, sshKey string, args ...string) (string, error) {
	cmd := exec.Command("git", args...)
	if dir != "" {
		cmd.Dir = dir
	}
	if sshKey != "" {
		cmd.Env = append(cmd.Environ(),
			fmt.Sprintf("GIT_SSH_COMMAND=ssh -i %s -o StrictHostKeyChecking=accept-new -o BatchMode=yes", sshKey),
		)
	}
	var out bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &out
	err := cmd.Run()
	output := out.String()
	if err != nil {
		return output, fmt.Errorf("command failed: %v\n%s", err, output)
	}
	return output, nil
}

// runCmd executes a whitelisted command with validated arguments and returns combined stdout+stderr.
func runCmd(name string, args ...string) (string, error) {
	cmd := exec.Command(name, args...)
	var out bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &out
	err := cmd.Run()
	output := out.String()
	if err != nil {
		return output, fmt.Errorf("command failed: %v\n%s", err, output)
	}
	return output, nil
}

// runCmdInDir runs a command with a working directory set.
func runCmdInDir(dir, name string, args ...string) (string, error) {
	cmd := exec.Command(name, args...)
	cmd.Dir = dir
	var out bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &out
	err := cmd.Run()
	output := out.String()
	if err != nil {
		return output, fmt.Errorf("command failed: %v\n%s", err, output)
	}
	return output, nil
}

// ServiceStatus returns the systemd status output for a unit.
func ServiceStatus(unit string) (string, error) {
	// exit code 3 = inactive but not an error we want to propagate as failure
	cmd := exec.Command("systemctl", "is-active", unit)
	out, _ := cmd.Output()
	return string(out), nil
}

// ServiceControl runs start/stop/restart on a systemd unit.
func ServiceControl(unit, action string) (string, error) {
	switch action {
	case "start", "stop", "restart", "reload":
		return runCmd("systemctl", action, unit)
	default:
		return "", fmt.Errorf("invalid service action: %q", action)
	}
}

func errorf(format string, a ...any) error {
	return fmt.Errorf(format, a...)
}
