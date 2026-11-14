# cPanel deployment guide (Git + MySQL)

This project is a Next.js 16 application that stores records in MySQL and keeps uploaded files in `storage/` with temporary uploads in `quarantine/`.

This guide targets a cPanel account with:

- **Setup Node.js App** (CloudLinux/Passenger) and **Terminal** access
- MySQL or MariaDB via **MySQL Databases**
- **Git Version Control**
- Node.js **20.9 or newer** (22.x preferred)
- A domain or subdomain with HTTPS (AutoSSL)

The application is still a fictional-data demo. Review the security notes in `README.md` before storing real BMU data.

> Replace these placeholders throughout:
> - `CPANELUSER` — your cPanel username
> - `example.com` — your real domain or subdomain
> - `bmu_registry` — the folder name you choose for the app

---

## 1. Create the MySQL database

1. Open **cPanel → Databases → MySQL Databases**.
2. Under **Create New Database**, enter `bmu_registry`. cPanel will show the full name as `CPANELUSER_bmu_registry`.
3. Under **Add New User**, create a user such as `bmu_user` with a strong password. The full name will be `CPANELUSER_bmu_user`.
4. Under **Add User to Database**, select the user and database, then grant **All Privileges**.
5. Note these values:
   - Host: `localhost`
   - Port: `3306`
   - Database: `CPANELUSER_bmu_registry`
   - User: `CPANELUSER_bmu_user`
   - Password: the password you chose

If the password contains characters such as `@`, `:`, `/`, `#`, or `?`, URL-encode them in `DATABASE_URL`. For example, `p@ss` becomes `p%40ss`.

---

## 2. Clone the repository with cPanel Git

1. Open **cPanel → Files → Git Version Control**.
2. Click **Create** and choose **Clone a New Repository**.
3. **Clone URL**: `https://github.com/reginald87/bmu_database.git`
4. **Repository Path**: `/home/CPANELUSER/bmu_registry`
5. Click **Create**.

The repository is private. If the clone fails, use one of these options:

- **Fine-grained personal access token (PAT):** create a GitHub PAT with read-only **Contents** access to `reginald87/bmu_database`, then clone with:
  `https://YOUR_TOKEN@github.com/reginald87/bmu_database.git`
- **Deploy key (better):** add an SSH public key to **GitHub → repository → Settings → Deploy keys**, then clone with:
  `git@github.com:reginald87/bmu_database.git`

Do not paste a token into source files, README, or commits. If you use a token in the clone URL, change the remote after cloning so the token is not stored in `.git/config`:

```bash
cd /home/CPANELUSER/bmu_registry
git remote set-url origin https://github.com/reginald87/bmu_database.git
```

For later pulls, use the cPanel Git UI or provide credentials through your SSH agent/deploy key.

> Keep the app outside `public_html` when possible. `storage/` and `quarantine/` contain private files. The repository includes `.htaccess` deny rules for those folders, but the strongest protection is to keep the application root outside the web root.

---

## 3. Create the Node.js application

1. Open **cPanel → Software → Setup Node.js App**.
2. Click **Create Application**.
3. Set:
   - **Node.js version**: 20.9+ (prefer 22.x)
   - **Application mode**: Production
   - **Application root**: `bmu_registry`
   - **Application URL**: your domain or subdomain, for example `https://example.com`
   - **Application startup file**: `server.js`
4. Click **Create**.

If cPanel refuses an application root that already contains files, create the Node.js app in a new empty folder, then move the repository contents into it. The important settings are the application root and the startup file `server.js`.

`server.js` is included so Passenger/cPanel can start Next.js on the port cPanel assigns. Do not set `PORT` yourself in the environment variables.

---

## 4. Add environment variables

In **Setup Node.js App → your application → Environment variables**, add:

| Variable | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `DATABASE_URL` | `mysql://CPANELUSER_bmu_user:PASSWORD@localhost:3306/CPANELUSER_bmu_registry?connection_limit=5` |
| `SESSION_SECRET` | 64 random hex characters |
| `APP_URL` | `https://example.com` |
| `BMU_BOOTSTRAP_TOKEN` | a strong one-time setup token |
| `BMU_ALLOW_UNSCANNED_UPLOADS` | `true` only for a fictional demo without ClamAV; otherwise `false` |
| `GMAIL_USER` | optional, for invitation email |
| `GMAIL_APP_PASSWORD` | optional, Google App Password |
| `MAIL_FROM_NAME` | optional, for example `BMU Registry` |

Generate `SESSION_SECRET` locally with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Set `BMU_BOOTSTRAP_TOKEN` before seeding so you can read it from the cPanel dashboard. Remove it after the first administrator account is created. `BMU_ALLOW_UNSCANNED_UPLOADS=true` allows documents to be uploaded without malware scanning and records the scan status as `Skipped`. Do not enable it for a real records system.

Do not add `PORT`; cPanel/Passenger sets it. Click **Save**, then restart the application if cPanel offers a restart action.

---

## 5. Install dependencies

In **Setup Node.js App**, click **Run NPM Install**.

The build needs development dependencies (TypeScript and the Prisma CLI). If cPanel installs only production dependencies, use cPanel **Terminal** instead:

```bash
cd /home/CPANELUSER/bmu_registry
source /home/CPANELUSER/nodevenv/bmu_registry/22/bin/activate
npm install --include=dev
```

The `postinstall` script runs `prisma generate`, which downloads the correct Prisma engine for the hosting server.

If `prisma generate` reports an engine or OpenSSL error, try adding `PRISMA_CLIENT_ENGINE_TYPE=binary` to the environment variables and rerun:

```bash
npm install --include=dev
```

---

## 6. Create the database schema and seed demo data

From **Terminal**, with the Node virtual environment activated:

```bash
cd /home/CPANELUSER/bmu_registry
npm run db:deploy
npm run db:seed
```

- `db:deploy` applies `prisma/migrations/` to the MySQL database.
- `db:seed` inserts fictional demo records and creates the one-time bootstrap token hash.

**Important:** `db:seed` clears demo registry tables (`Person`, `Document`, `ReviewItem`, `AuditEvent`, `Notification`) but keeps user accounts and sessions. Run it only on a fresh demo install. Do not run it after entering records you want to keep. For production, remove or replace the seed step.

If you use an existing MySQL database with tables already created by `prisma db push`, the initial migration may report that tables already exist. For a clean deployment, start with an empty database. If you must keep existing tables, baseline the migration or continue using `npm run db:push` instead of `db:deploy`; do not mix both approaches casually.

---

## 7. Build the application

```bash
cd /home/CPANELUSER/bmu_registry
npm run build
```

If the build is killed for memory, retry with:

```bash
NODE_OPTIONS=--max-old-space-size=1024 npm run build
```

The build writes `.next/` in the application root. Passenger runs `server.js`, which serves the built application.

---

## 8. Restart the Node.js application

In **Setup Node.js App**, click **Restart**. If the app does not restart, create a restart file:

```bash
mkdir -p /home/CPANELUSER/bmu_registry/tmp
touch /home/CPANELUSER/bmu_registry/tmp/restart.txt
```

Check the application's error log (often `stderr.log` in the application root) if the site returns a 503 or 500 error.

---

## 9. Complete first-run setup

1. Open `https://example.com/setup`.
2. Enter the `BMU_BOOTSTRAP_TOKEN` value and create the first **System administrator** with a password of at least 12 characters.
3. Sign in.
4. Go back to **Setup Node.js App → Environment variables** and remove `BMU_BOOTSTRAP_TOKEN`.
5. Restart the application.

If the setup page says the token is invalid, confirm that you ran `npm run db:seed` after setting `BMU_BOOTSTRAP_TOKEN`. If the token was not set, the seed prints a generated token to the terminal output.

---

## 10. Verify the deployment

- Sign in and open **Home**, **Students**, **Staff**, **Document vault**, **Review**, and **Audit**.
- Create a fictional test record.
- Upload a small test document. If `BMU_ALLOW_UNSCANNED_UPLOADS=false`, uploads require a working ClamAV scanner at `BMU_CLAMSCAN_PATH`.
- Confirm `storage/` and `quarantine/` are writable by the cPanel user:

```bash
cd /home/CPANELUSER/bmu_registry
chmod 755 storage quarantine
touch storage/.write-test quarantine/.write-test
rm storage/.write-test quarantine/.write-test
```

- Confirm users cannot browse to `https://example.com/storage/...` or `https://example.com/quarantine/...`. Keep the app root outside `public_html` whenever possible.
- Use HTTPS. In production, session cookies are `Secure`; login will not persist over plain HTTP.

---

## 11. Deploy updates after changing the code locally

From your local machine:

```bash
git add .
git commit -m "Describe the change"
git push origin main
```

On cPanel:

1. **Git Version Control → Manage → Update from Remote** (or run `git pull` in Terminal).
2. If dependencies changed: `npm install --include=dev`
3. If `prisma/schema.prisma` changed: `npm run db:deploy` (and create/commit a new migration from your local development environment).
4. If you changed only UI/server code: `npm run build`
5. Restart the Node.js application.

Do not run `npm run db:seed` on a database that already contains records you want to keep.

---

## Troubleshooting

| Symptom | Check |
| --- | --- |
| 503 or "Application failed to start" | Node version is 20.9+, Application startup file is `server.js`, `npm run build` has been run, and the app error log |
| `Cannot find module '.next/...'` | Run `npm run build` in the application root |
| Prisma `P1001` / can't reach database | `DATABASE_URL` host `localhost`, port `3306`, full cPanel DB/user names, URL-encoded password, user has All Privileges |
| Prisma `P1000` authentication failed | Database user/password mismatch or URL encoding issue |
| `Too many connections` | Add or lower `?connection_limit=5` in `DATABASE_URL` |
| Prisma engine/OpenSSL error | Regenerate with `npm install --include=dev`; optionally set `PRISMA_CLIENT_ENGINE_TYPE=binary` |
| Login succeeds but session does not persist | Use HTTPS and `NODE_ENV=production`; `Secure` cookies are not sent over HTTP |
| Document upload returns 503 | No malware scanner. Install/configure ClamAV and set `BMU_CLAMSCAN_PATH`, or set `BMU_ALLOW_UNSCANNED_UPLOADS=true` for a fictional demo only |
| Build runs out of memory | `NODE_OPTIONS=--max-old-space-size=1024 npm run build` |
| Git pull asks for credentials | Use a GitHub deploy key or a read-only PAT through the cPanel Git UI; avoid committing tokens |
