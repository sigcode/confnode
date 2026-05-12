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
	case "apache.start":
		return ApacheControl(cfg, "start")
	case "apache.stop":
		return ApacheControl(cfg, "stop")
	case "apache.reload":
		return ApacheControl(cfg, "reload")
	case "apache.restart":
		return ApacheControl(cfg, "restart")
	case "apache.configtest":
		return ApacheConfigtest()
	case "apache.delete_vhost":
		return ApacheDeleteVhost(cfg, p("name"))
	case "apache.read_vhost":
		return ApacheReadVhost(cfg, p("name"))
	case "apache.write_vhost":
		return ApacheWriteVhost(cfg, p("name"), p("content"))

	// PHP-FPM
	case "phpfpm.restart":
		return PHPFPMRestart(cfg, p("version"))
	case "phpfpm.status":
		return PHPFPMStatus(cfg, p("version"))

	// MariaDB
	case "mariadb.status":
		return ServiceStatus("mariadb")
	case "mariadb.start":
		return ServiceControl("mariadb", "start")
	case "mariadb.stop":
		return ServiceControl("mariadb", "stop")
	case "mariadb.restart":
		return ServiceControl("mariadb", "restart")

	// Certbot
	case "certbot.issue":
		return CertbotIssue(cfg, p("domain"))

	// Git
	case "git.clone":
		return GitClone(cfg, p("url"), p("path"))
	case "git.pull":
		return GitPull(cfg, p("path"))
	case "git.checkout":
		return GitCheckout(cfg, p("path"), p("branch"))

	// Systemd (generic)
	case "systemd.status":
		return ServiceStatus(p("unit"))

	default:
		return "", fmt.Errorf("unknown command: %q", cmd)
	}
}
