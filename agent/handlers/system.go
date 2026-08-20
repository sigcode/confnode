package handlers

import (
	"bytes"
	"fmt"
	"os"
	"os/exec"
	"os/user"
	"strconv"
	"strings"
	"syscall"

	"github.com/sigcode/confnode/agent/validator"
)

// runGitCmd runs a git command with an optional SSH key injected via
// GIT_SSH_COMMAND. If runAsUser is non-empty, the git child process drops
// privileges to that user (setuid/setgid) before exec — the agent itself
// stays root throughout (needed for its Apache/certbot/systemd duties), but
// there's no reason the files git creates need to inherit that. Without
// this, a deploy_path that's otherwise owned by the webserver user (e.g.
// www-data, for Apache/PHP to read/write) ends up with root-owned files
// mixed in from every git operation — inconsistent ownership, and a
// potential permission problem for anything Apache/PHP later needs to write.
func runGitCmd(dir, sshKey, runAsUser string, args ...string) (string, error) {
	cmd := exec.Command("git", args...)
	if dir != "" {
		cmd.Dir = dir
	}
	env := cmd.Environ()
	if sshKey != "" {
		env = append(env, fmt.Sprintf("GIT_SSH_COMMAND=ssh -i %s -o StrictHostKeyChecking=accept-new -o BatchMode=yes", sshKey))
	}
	if runAsUser != "" {
		u, err := user.Lookup(runAsUser)
		if err != nil {
			return "", fmt.Errorf("deploy user %q not found: %v", runAsUser, err)
		}
		uid, err := strconv.ParseUint(u.Uid, 10, 32)
		if err != nil {
			return "", fmt.Errorf("invalid uid for deploy user %q: %v", runAsUser, err)
		}
		gid, err := strconv.ParseUint(u.Gid, 10, 32)
		if err != nil {
			return "", fmt.Errorf("invalid gid for deploy user %q: %v", runAsUser, err)
		}
		cmd.SysProcAttr = &syscall.SysProcAttr{
			Credential: &syscall.Credential{Uid: uint32(uid), Gid: uint32(gid)},
		}
		// Root's HOME (e.g. /root) would leak into the dropped-privilege
		// process otherwise — git tries to stat $HOME/.gitconfig, which
		// runAsUser typically can't even read, and it's simply the wrong
		// identity's config to consult anyway.
		env = replaceEnvVar(env, "HOME", u.HomeDir)
	}
	cmd.Env = env
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

// replaceEnvVar returns env with any existing "key=..." entries removed and
// a single "key=value" appended.
func replaceEnvVar(env []string, key, value string) []string {
	prefix := key + "="
	out := make([]string, 0, len(env)+1)
	for _, e := range env {
		if !strings.HasPrefix(e, prefix) {
			out = append(out, e)
		}
	}
	return append(out, prefix+value)
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

// FsRemoveDir removes a directory and all its contents after validating the path.
func FsRemoveDir(path string, allowedRoots []string) (string, error) {
	if err := validator.ValidateDeployPath(path, allowedRoots); err != nil {
		return "", err
	}
	if err := os.RemoveAll(path); err != nil {
		return "", fmt.Errorf("failed to remove %q: %w", path, err)
	}
	return fmt.Sprintf("removed %s", path), nil
}
