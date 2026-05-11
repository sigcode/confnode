package handlers

import (
	"fmt"

	"github.com/sigcode/confnode/agent/config"
)

func Dispatch(cfg *config.Config, cmd string, params map[string]string) (string, error) {
	p := func(k string) string { return params[k] }

	switch cmd {
	// Apache
	case "apache.enable_site":
		return ApacheEnableSite(cfg, p("name"))
	case "apache.disable_site":
		return ApacheDisableSite(cfg, p("name"))
	case "apache.reload":
		return ApacheControl("reload")
	case "apache.restart":
		return ApacheControl("restart")
	case "apache.configtest":
		return ApacheConfigtest()
	case "apache.read_vhost":
		return ApacheReadVhost(cfg, p("name"))
	case "apache.write_vhost":
		return ApacheWriteVhost(cfg, p("name"), p("content"))

	// PHP-FPM
	case "phpfpm.restart":
		return PHPFPMRestart(cfg, p("version"))
	case "phpfpm.status":
		return PHPFPMStatus(cfg, p("version"))

	// MySQL
	case "mysql.status":
		return ServiceStatus("mysql")
	case "mysql.start":
		return ServiceControl("mysql", "start")
	case "mysql.stop":
		return ServiceControl("mysql", "stop")

	// Certbot
	case "certbot.issue":
		return CertbotIssue(cfg, p("domain"))

	// Git
	case "git.clone":
		return GitClone(p("url"), p("path"))
	case "git.pull":
		return GitPull(p("path"))
	case "git.checkout":
		return GitCheckout(p("path"), p("branch"))

	// Systemd (generic)
	case "systemd.status":
		return ServiceStatus(p("unit"))

	default:
		return "", fmt.Errorf("unknown command: %q", cmd)
	}
}
