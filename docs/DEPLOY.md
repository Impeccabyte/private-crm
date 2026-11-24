# Deploying

Production is https://app.impeccabyte.com, on the same Vultr server as the marketing site (45.76.238.138). The CRM is its own Compose project in `/srv/impeccabyte-crm`, separate from the site in `/srv/impeccabyte`.

## How it fits together

- `docker-compose.prod.yml` runs four services: `db` (Postgres 17), `migrate` (one-shot), `app` and `worker`. Never load `docker-compose.yml` on the server: it publishes Postgres and Mailpit on the host.
- Nothing is published on the host. The marketing site's Caddy (the `Impeccabyte/public-website` repo) owns ports 80 and 443, gets the certificate for app.impeccabyte.com and proxies to `crm-app:3000` over the shared Docker network `edge`. The host name is `CRM_ADDRESS` in `/srv/impeccabyte/.env`.
- The server has 2 GB of memory, so the image is built elsewhere and loaded, and ClamAV is left out. Uploads are stored as "unscanned". On a server with 4 GB or more, copy the `clamav` service from `docker-compose.yml` into the production file and set `CLAMAV_HOST: clamav` and `CLAMAV_PORT: "3310"`.

## Deploy a new version

From a checkout of the commit to ship, on a machine with Docker and SSH access to the server:

```bash
DEPLOY_SSH="ssh -i ~/.ssh/<key> root@45.76.238.138" scripts/deploy.sh
```

It builds the image for linux/amd64, sends it over SSH, updates the compose file, runs migrations and the seed, restarts the app and worker and prints the health check. Deploying the CRM does not touch the marketing site.

## The server's .env

`/srv/impeccabyte-crm/.env` (owner `deploy`, mode 600) is written once and never replaced by a deploy:

- `COMPOSE_PROJECT_NAME=impeccabyte-crm` and `COMPOSE_FILE=docker-compose.prod.yml`, so plain `docker compose` works in that folder.
- `APP_URL=https://app.impeccabyte.com`. Lead form snippets and email links use it.
- `APP_ENCRYPTION_KEY`. Changing it makes every stored EIN, bank number and integration secret unreadable. Keep a copy somewhere safe off the server.
- `DB_PASSWORD`, used by Postgres and the app's `DATABASE_URL`. Postgres only reads it when the volume is first created.
- `SEED_ADMIN_*`, the first admin. The seed never overwrites an existing password.

The first admin's starting password is in `/root/impeccabyte-crm-credentials.txt` on the server.

## After the first deploy

- Sign in and change the admin password (Account → Change password).
- Set the SMTP relay in Settings → Email. Until then invite and password-reset emails are not delivered.
- For newsletters, also set a real From address, your postal address and the send rate there; sending is blocked until they are set. Add SPF and DKIM records for the From domain at your mail provider, or newsletters will land in spam. Newsletter links (unsubscribe, tracking, pictures) are built from `APP_URL`.
- Paste the Maverick token and webhook secret in Settings → Integrations.

## Useful commands

On the server, in `/srv/impeccabyte-crm`:

```bash
docker compose ps
docker compose logs -f app worker
docker compose exec -T db pg_dump -U crm crm | gzip > /srv/impeccabyte-backups/crm-$(date -u +%Y%m%d-%H%M%S).sql.gz
```

## Not set up yet

- Scheduled backups of the database and the `uploads` volume.
- Virus scanning (see above).
