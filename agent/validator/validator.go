package validator

import (
	"fmt"
	"regexp"
	"strings"
)

var safeNameRe = regexp.MustCompile(`^[a-z0-9._-]+$`)
var safePHPVersionRe = regexp.MustCompile(`^[0-9]+\.[0-9]+$`)

// ValidateSiteName ensures an Apache site name contains only safe characters.
func ValidateSiteName(name string) error {
	if name == "" || !safeNameRe.MatchString(name) {
		return fmt.Errorf("invalid site name %q: must match [a-z0-9._-]+", name)
	}
	return nil
}

// ValidatePHPVersion ensures the PHP version is from the allowed list.
func ValidatePHPVersion(version string, allowed []string) error {
	if !safePHPVersionRe.MatchString(version) {
		return fmt.Errorf("invalid PHP version format: %q", version)
	}
	for _, v := range allowed {
		if v == version {
			return nil
		}
	}
	return fmt.Errorf("PHP version %q not in allowed list: %s", version, strings.Join(allowed, ", "))
}

// ValidateDeployPath ensures a deployment path is under /var/www/.
func ValidateDeployPath(path string) error {
	if path == "" {
		return fmt.Errorf("deploy path must not be empty")
	}
	if !strings.HasPrefix(path, "/var/www/") {
		return fmt.Errorf("deploy path %q must be under /var/www/", path)
	}
	// Prevent path traversal
	if strings.Contains(path, "..") {
		return fmt.Errorf("deploy path must not contain '..'")
	}
	return nil
}

// ValidateDomain ensures a domain looks like a valid hostname.
var safeDomainRe = regexp.MustCompile(`^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?)*$`)

func ValidateDomain(domain string) error {
	if domain == "" || !safeDomainRe.MatchString(domain) {
		return fmt.Errorf("invalid domain: %q", domain)
	}
	return nil
}

// ValidateGitURL allows only http(s) and git+ssh URLs.
func ValidateGitURL(url string) error {
	url = strings.TrimSpace(url)
	if strings.HasPrefix(url, "https://") ||
		strings.HasPrefix(url, "http://") ||
		strings.HasPrefix(url, "git@") {
		return nil
	}
	return fmt.Errorf("git URL must use https:// or git@: %q", url)
}
