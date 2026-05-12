# Notes für .deb Package (Ubuntu 26.04)

## PHP Multi-Version

Auf Ubuntu gibt es offizielle Pakete für mehrere PHP-Versionen via `ondrej/php` PPA:
```
php8.1-fpm, php8.3-fpm, php8.4-fpm
```
Diese können alle direkt in `Depends:` der .deb control file stehen — kein AUR-Problem wie auf Arch.

Systemd-Service-Namen auf Ubuntu: `php8.4-fpm`, `php8.3-fpm`, `php8.1-fpm`
→ ggf. im Agent/Backend prüfen ob Service-Name-Format von Arch (`php84-fpm`) abweicht

## MariaDB / MySQL

Ubuntu hat `mariadb-server` im offiziellen Repo.
Initiales Setup nach Install:
```bash
sudo mysql_secure_installation
```
(kein separates `mariadb-install-db` nötig wie auf Arch — das passiert beim Paket-Install automatisch)

## Apache

Auf Ubuntu: `apache2` statt `httpd`
- `a2ensite` / `a2dissite` vorhanden → `apache.mode: debian` in config.yaml
- `sites-available` / `sites-enabled` Struktur ist Standard

## Certbot

```
apt install certbot python3-certbot-apache
```
→ `certbot-apache` plugin heißt auf Ubuntu `python3-certbot-apache`
