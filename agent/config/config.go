package config

import (
	"os"

	"gopkg.in/yaml.v3"
)

type Config struct {
	Apache  ApacheConfig  `yaml:"apache"`
	PHP     PHPConfig     `yaml:"php"`
	Certbot CertbotConfig `yaml:"certbot"`
	Git     GitConfig     `yaml:"git"`
	Agent   AgentConfig   `yaml:"agent"`
}

type GitConfig struct {
	SSHKeyPath  string   `yaml:"ssh_key"`      // path to private key, e.g. /root/.ssh/id_ed25519
	DeployRoots []string `yaml:"deploy_roots"` // allowed deploy path prefixes
}

type ApacheConfig struct {
	Mode           string `yaml:"mode"`            // "debian" or "arch"
	SitesAvailable string `yaml:"sites_available"`
	SitesEnabled   string `yaml:"sites_enabled"`
	DefaultWebroot string `yaml:"default_webroot"`
}

type PHPConfig struct {
	Versions []string          `yaml:"versions"`
	Default  string            `yaml:"default"`
	FpmUnits map[string]string `yaml:"fpm_units"` // version → unit name override
}

type CertbotConfig struct {
	Email string `yaml:"email"`
}

type AgentConfig struct {
	Socket string `yaml:"socket"`
}

func Load(path string) (*Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var cfg Config
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return nil, err
	}
	setDefaults(&cfg)
	return &cfg, nil
}

func setDefaults(cfg *Config) {
	if cfg.Apache.Mode == "" {
		cfg.Apache.Mode = "debian"
	}
	if cfg.Apache.SitesAvailable == "" {
		cfg.Apache.SitesAvailable = "/etc/apache2/sites-available"
	}
	if cfg.Apache.SitesEnabled == "" {
		cfg.Apache.SitesEnabled = "/etc/apache2/sites-enabled"
	}
	if cfg.Apache.DefaultWebroot == "" {
		cfg.Apache.DefaultWebroot = "/var/www"
	}
	if cfg.Agent.Socket == "" {
		cfg.Agent.Socket = "/run/configurator-agent.sock"
	}
	if len(cfg.PHP.Versions) == 0 {
		cfg.PHP.Versions = []string{"8.1", "8.3", "8.4"}
	}
	if cfg.PHP.Default == "" {
		cfg.PHP.Default = "8.4"
	}
	if len(cfg.Git.DeployRoots) == 0 {
		cfg.Git.DeployRoots = []string{"/var/www/", "/srv/http/", "/srv/"}
	}
}
