# Alumni Influencers API

A full-stack university alumni platform with a blind-bidding system, developer API keys, analytics, and a server-rendered web dashboard.

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Architecture Overview](#architecture-overview)
3. [Technology Stack](#technology-stack)
4. [Prerequisites](#prerequisites)
5. [Installation — Part 1 (API)](#installation--part-1-api)
6. [Installation — Part 2 (Analytics Dashboard)](#installation--part-2-analytics-dashboard)
7. [Environment Variables](#environment-variables)
8. [Database Schema](#database-schema)
9. [API Endpoint Reference](#api-endpoint-reference)
10. [API Key Scopes](#api-key-scopes)
11. [Dashboard Features](#dashboard-features)
12. [Security Features](#security-features)
13. [Rate Limits](#rate-limits)

---

## Project Overview

**Alumni Influencers** is a university platform where:

- **Alumni** register with a university email, build detailed professional profiles, and place daily blind bids for the "Alumni of the Day" spotlight.
- **Developers** generate scoped API keys to integrate alumni data into external applications (e.g. AR/VR apps).
- **University staff** access an analytics dashboard showing skills gaps, employment trends, and a filterable alumni browser — all exported to CSV/PDF.

---

## Architecture Overview

```
                  Browser (Dashboard)
                       │
                  /dashboard/* (EJS, Bootstrap, Chart.js)
                       │ server-side proxy (API key never sent to browser)
                       ▼
          Express Server (port 5000)
               ├── /api/auth/*         — Registration, Login, Password Reset
               ├── /api/profile/*      — Alumni Profile CRUD
               ├── /api/bidding/*      — Blind Bidding System
               ├── /api/developer/*    — API Key Management
               ├── /api/analytics/*    — Aggregated Intelligence Endpoints
               ├── /api/alumni         — Alumni Browse & Export
               ├── /api/alumni-of-the-day — Public Endpoint (API key)
               └── /api-docs           — Swagger UI
                       │
                  Sequelize ORM
                       │
                  MySQL (XAMPP)
```

---

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js (LTS) |
| Framework | Express 4 |
| Database | MySQL via XAMPP (MariaDB) |
| ORM | Sequelize 6 |
| Auth | express-session (in-memory store) |
| Templating | EJS |
| Frontend charts | Chart.js 4 |
| UI | Bootstrap 5.3 |
| PDF generation | PDFKit |
| CSV generation | json2csv |
| Email | Nodemailer (Ethereal for dev) |
| Docs | swagger-jsdoc + swagger-ui-express |
| Security | Helmet, CSRF (csurf), express-rate-limit |

---

## Prerequisites

1. **XAMPP** — [Download](https://www.apachefriends.org/)
   - Start the **MySQL** service from the XAMPP Control Panel.
   - Default port: **3307** (adjust in `.env` if different).

2. **Create the database via phpMyAdmin**
   - Open `http://localhost/phpmyadmin`
   - Click **New** → database name: `alumni_influencers` → collation: `utf8mb4_general_ci`
   - Sequelize creates all tables automatically on first run.

3. **Node.js (LTS)** — [Download](https://nodejs.org/)

---

## Installation — Part 1 (API)

```bash
# 1. Clone and install
git clone <repo-url>
cd claude-server-side-cwk-2-main
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env — set DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME
# SESSION_SECRET and JWT_SECRET should be changed to random strings

# 3. Seed sample data (creates 3 alumni + 1 developer user)
npm run seed

# 4. Start the server
npm start
# Or for development with auto-restart:
npm run dev
```

**Verify:**
- `GET http://localhost:5000/health` → `{ "status": "ok" }`
- `GET http://localhost:5000/api-docs` → Interactive Swagger UI

### Default Seed Users

| Email | Password | Role |
|-------|----------|------|
| `alice.smith@eastminster.ac.uk` | `Password1!` | alumnus |
| `bob.jones@eastminster.ac.uk` | `Password1!` | alumnus |
| `carol.white@eastminster.ac.uk` | `Password1!` | alumnus |
| `dev@eastminster.ac.uk` | `Password1!` | developer |

---

## Installation — Part 2 (Analytics Dashboard)

> Requires Part 1 to be running.

```bash
# 1. Log in as a developer account
POST /api/auth/login
{ "email": "dev@eastminster.ac.uk", "password": "Password1!" }

# 2. Generate the Analytics Dashboard API key
POST /api/developer/api-keys
Authorization: <session cookie>
{ "name": "Analytics Dashboard", "permissions": ["read:alumni", "read:analytics"] }
# ⚠️  Copy the returned key — it is shown ONLY ONCE

# 3. Add the key to .env
ANALYTICS_API_KEY=<paste key here>

# Optional for demos: serve dashboard analytics from local dummy JSON
DASHBOARD_DEMO_MODE=true

# 4. Restart the server
npm start

# 5. Open the dashboard
http://localhost:5000/dashboard
# Register a new dashboard account or use any verified user account
```

If `DASHBOARD_DEMO_MODE=true`, dashboard analytics endpoints are served from `analytics-dashboard-demo-data.json`, so charts can be demonstrated without relying on live aggregated DB data.

---

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DB_HOST` | MySQL host | `localhost` |
| `DB_PORT` | MySQL port | `3307` |
| `DB_USER` | MySQL user | `root` |
| `DB_PASSWORD` | MySQL password | *(empty)* |
| `DB_NAME` | Database name | `alumni_influencers` |
| `PORT` | Express server port | `5000` |
| `NODE_ENV` | Environment | `development` |
| `BASE_URL` | Full server URL (used in verification & password-reset emails, Swagger) | `http://localhost:5000` or your droplet `http://IP:5000` |
| `SESSION_SECRET` | Session signing secret | *(change this)* |
| `JWT_SECRET` | JWT signing secret | *(change this)* |
| `EMAIL_HOST` | SMTP host | `smtp.ethereal.email` |
| `EMAIL_PORT` | SMTP port | `587` |
| `EMAIL_USER` | SMTP username | *(empty → Ethereal auto-config)* |
| `EMAIL_PASS` | SMTP password | *(empty → Ethereal auto-config)* |
| `EMAIL_FROM` | From address | `noreply@eastminster.ac.uk` |
| `UNIVERSITY_DOMAIN` | Allowed email domain | `@eastminster.ac.uk` |
| `CORS_ORIGIN` | Allowed browser origin (must match how users open the app) | Same host as `BASE_URL` |
| `ANALYTICS_API_KEY` | API key for dashboard proxy | *(generate via API)* |
| `DASHBOARD_DEMO_MODE` | Serve dashboard analytics from local demo JSON (`analytics-dashboard-demo-data.json`) | `false` |
| `AR_APP_API_KEY` | API key for AR App | *(generate via API)* |

> **Email:** Leave `EMAIL_USER` and `EMAIL_PASS` empty for development — the app automatically creates an Ethereal test account and logs preview URLs to the console.

---

## Database Schema

```
users
  id, email, password, role(alumnus|developer), isVerified,
  verificationToken, verificationTokenExpiry,
  resetPasswordToken, resetPasswordTokenExpiry,
  appearanceCount, attendedEvent, lastAppearanceReset,
  createdAt, updatedAt

profiles (1:1 → users)
  id, userId FK, firstName, lastName, biography,
  linkedInUrl, profileImagePath, profileComplete

degrees (M:1 → profiles)
  id, profileId FK, name, university, officialUrl, completionDate

certifications (M:1 → profiles)
  id, profileId FK, name, issuingBody, courseUrl, completionDate

licences (M:1 → profiles)
  id, profileId FK, name, awardingBody, licenceUrl, completionDate

professional_courses (M:1 → profiles)
  id, profileId FK, name, provider, courseUrl, completionDate

employments (M:1 → profiles)
  id, profileId FK, company, role, startDate, endDate

bids (M:1 → users)
  id, userId FK, amount, bidDate, status(active|won|lost|cancelled),
  createdAt, updatedAt

featured_alumni (M:1 → users, M:1 → profiles)
  id, userId FK, profileId FK, featuredDate(unique), winningBidAmount, activatedAt

api_keys (M:1 → users)
  id, developerId FK, key(unique), name, permissions(JSON), isRevoked, createdAt

api_key_usage_logs (M:1 → api_keys)
  id, apiKeyId FK, endpoint, method, timestamp, ipAddress
```

**Relationships:**
- `users` 1→1 `profiles`
- `profiles` 1→M `degrees`, `certifications`, `licences`, `professional_courses`, `employments`
- `users` 1→M `bids`, `featured_alumni`, `api_keys`
- `api_keys` 1→M `api_key_usage_logs`

---

## API Endpoint Reference

### Authentication (`/api/auth`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/register` | — | Register with university email |
| GET | `/verify-email?token=` | — | Verify email address |
| POST | `/login` | — | Log in (returns session cookie) |
| POST | `/logout` | Session | Log out |
| POST | `/forgot-password` | — | Request password reset email |
| POST | `/reset-password?token=` | — | Reset password |
| GET | `/me` | Session | Get current user info |

### Profile (`/api/profile`) — requires `isAlumnus`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Get full profile with all associations |
| PUT | `/` | Update personal info (firstName, lastName, bio, LinkedIn) |
| POST | `/image` | Upload profile image (JPEG/PNG, max 5MB) |
| GET | `/completion` | Get profile completion breakdown |
| POST/GET/PUT/DELETE | `/degrees/:id?` | Degree CRUD |
| POST/GET/PUT/DELETE | `/certifications/:id?` | Certification CRUD |
| POST/GET/PUT/DELETE | `/licences/:id?` | Licence CRUD |
| POST/GET/PUT/DELETE | `/courses/:id?` | Professional Course CRUD |
| POST/GET/PUT/DELETE | `/employment/:id?` | Employment History CRUD |

### Bidding (`/api/bidding`) — requires `isAlumnus`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/slot` | View tomorrow's slot info |
| POST | `/bid` | Place a blind bid |
| PUT | `/bid/:id` | Increase a bid (only upward) |
| DELETE | `/bid/:id` | Cancel a bid |
| GET | `/bid/:id/status` | Check winning/not-winning status |
| GET | `/history` | Paginated bid history |
| GET | `/monthly-status` | Monthly win limit status |

### Developer (`/api/developer`) — requires `isDeveloper`

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api-keys` | Generate new API key (shown once) |
| GET | `/api-keys` | List all keys (prefix only) |
| DELETE | `/api-keys/:id` | Revoke a key |
| GET | `/api-keys/:id/stats` | Usage statistics for a key |

### Public API — requires Bearer API key

| Method | Path | Scope | Description |
|--------|------|-------|-------------|
| GET | `/api/alumni-of-the-day` | `read:alumni_of_day` | Today's featured alumnus |
| GET | `/api/alumni` | `read:alumni` | Paginated alumni browse |
| GET | `/api/alumni/:userId` | `read:alumni` | Single alumni profile |
| GET | `/api/alumni/export?format=csv` | `read:alumni` | Export up to 5000 alumni as CSV |

### Analytics — requires Bearer API key with `read:analytics`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/analytics/overview` | High-level counts |
| GET | `/api/analytics/skills-gap` | Cert + course frequencies |
| GET | `/api/analytics/employment-by-sector` | Employment grouped by company |
| GET | `/api/analytics/job-titles` | Top job titles |
| GET | `/api/analytics/top-employers` | Top employers by alumni count |
| GET | `/api/analytics/career-trends` | 12-month cert + featured trends |
| GET | `/api/analytics/profile-completion-rate` | Completion breakdown |
| GET | `/api/analytics/export/skills-gap?format=csv\|pdf` | Export skills gap |
| GET | `/api/analytics/export/employment?format=csv\|pdf` | Export employment data |

All analytics endpoints accept optional filters: `?programme=`, `?graduationYear=`, `?industrySector=`

---

## API Key Scopes

| Scope | Grants Access To | Intended Client |
|-------|-----------------|-----------------|
| `read:alumni_of_day` | `GET /api/alumni-of-the-day` | Mobile AR App |
| `read:alumni` | `GET /api/alumni`, `GET /api/alumni/:userId`, `GET /api/alumni/export` | Analytics Dashboard |
| `read:analytics` | `GET /api/analytics/*` | Analytics Dashboard |

Generate keys via `POST /api/developer/api-keys`:
```json
{
  "name": "Analytics Dashboard",
  "permissions": ["read:alumni", "read:analytics"]
}
```

---

## Dashboard Features

Access at `http://localhost:5000/dashboard` after setting `ANALYTICS_API_KEY` in `.env`.

| Page | URL | Description |
|------|-----|-------------|
| Overview | `/dashboard` | 4 stat cards + 2 quick charts |
| Charts | `/dashboard/charts` | 8 interactive analytics charts with filters |
| Alumni Browser | `/dashboard/alumni` | Filterable, paginated alumni table with CSV export |

**Charts available:**
1. Top 10 Certifications (Bar)
2. Top 10 Professional Courses (Horizontal Bar)
3. Employment by Sector (Pie)
4. Certifications Trend — 12 months (Line)
5. Top 6 Employers (Radar)
6. Profile Completion Rate (Doughnut)
7. Top 15 Job Titles (Bar)
8. Featured Alumni by Month (Line)

**Export buttons** on each chart card allow downloading:
- **CSV** — structured tabular data
- **PDF** — formatted report with section headings

The dashboard never exposes the `ANALYTICS_API_KEY` to the browser — all API requests are proxied server-side.

---

## Security Features

- **Helmet.js** — security headers (CSP, HSTS, X-Frame-Options, etc.)
- **CSRF** — csurf tokens on all dashboard HTML forms
- **Sessions** — httpOnly, SameSite=strict, 30-minute rolling timeout
- **Password hashing** — bcrypt with 12 salt rounds
- **Token hashing** — verification and reset tokens stored as SHA-256 hashes
- **API key scoping** — `hasPermission(scope)` middleware per endpoint
- **Usage logging** — every API key request logged to `api_key_usage_logs`
- **CSV injection prevention** — values starting with `=`, `+`, `-`, `@` are prefixed with `'`
- **Sequelize parameterised queries** — no raw string interpolation in SQL
- **Input validation** — express-validator on every route

---

## Rate Limits

| Route group | Limit |
|-------------|-------|
| `POST /api/auth/login` | 5 per 15 min per IP |
| `POST /api/auth/forgot-password` | 3 per hour per IP |
| `POST /api/auth/register` | 10 per 15 min per IP |
| `POST /api/bidding/bid` | 20 per hour per IP |
| `GET /api/analytics/*` (non-export) | 60 per 15 min per IP |
| `GET /api/*/export/*` | 10 per 15 min per IP |
| `GET /api/alumni-of-the-day` | 100 per hour per API key |
| General | 200 per 15 min per IP |

---

## Cron Jobs

| Schedule | Job |
|----------|-----|
| Daily at 18:00 | Selects highest bidder → creates `FeaturedAlumnus`, sends win/loss emails |
| 1st of month at 00:01 | Resets `appearanceCount` and `attendedEvent` for all users |

---

## Interactive API Docs

Full interactive Swagger UI with "Try it out" for every endpoint:

```
http://localhost:5000/api-docs
```

Authenticate using the **Authorize** button:
- **sessionAuth** — paste your `connect.sid` cookie value
- **bearerAuth** — paste your API key

---

## Deployment (DigitalOcean Droplet via GitHub Actions)

### Architecture

The CI/CD pipeline uses GitHub Actions to automatically build a Docker image, push it to GitHub Container Registry (GHCR), and deploy it to a DigitalOcean droplet running Docker Compose (Node.js app + MySQL 8.0).

### Prerequisites

1. **DigitalOcean Droplet** with Docker and Docker Compose installed (root password auth)
2. **GitHub repository** with Actions enabled

### Droplet Setup (one-time)

SSH into your droplet and run:

```bash
# Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# Create the app directory
sudo mkdir -p /opt/alumni-api
sudo chown $USER:$USER /opt/alumni-api
```

### Required GitHub Secrets

Go to your repo **Settings > Secrets and variables > Actions** and add:

| Secret | Description | Example |
|--------|-------------|---------|
| `DROPLET_HOST` | Droplet IP address | `164.90.xxx.xxx` |
| `DROPLET_PASSWORD` | Root password for the droplet | `your-root-password` |
| `GH_PAT` | GitHub PAT with `read:packages` scope | `ghp_xxxxxxxxxxxx` |
| `DB_USER` | MySQL username | `alumni_user` |
| `DB_PASSWORD` | MySQL password | `strong-password-here` |
| `DB_NAME` | MySQL database name | `w1871486_alumni_influencers` |
| `SESSION_SECRET` | Express session secret | `random-64-char-string` |
| `JWT_SECRET` | JWT signing secret | `random-64-char-string` |
| `ANALYTICS_API_KEY` | Dashboard analytics key | `your-api-key` |
| `EMAIL_HOST` | SMTP host (optional) | `smtp.gmail.com` |
| `EMAIL_PORT` | SMTP port (optional) | `587` |
| `EMAIL_USER` | SMTP username (optional) | `you@gmail.com` |
| `EMAIL_PASS` | SMTP password (optional) | `app-password` |
| `EMAIL_FROM` | Sender address (optional) | `noreply@eastminster.ac.uk` |
| `CORS_ORIGIN` | Allowed CORS origin | `https://yourdomain.com` |
| `BASE_URL` | Public base URL | `https://yourdomain.com` |

### How It Works

1. **Push to `main`** triggers the workflow
2. **Build job** — installs dependencies and checks for syntax errors
3. **Docker job** — builds and pushes the image to `ghcr.io`
4. **Deploy job** — SSHs into the droplet, pulls the latest image, and restarts via Docker Compose

### Manual Deployment

If you need to deploy manually on the droplet:

```bash
cd /opt/alumni-api

# Pull latest image
docker compose pull app

# Start/restart
docker compose up -d

# View logs
docker compose logs -f app

# Seed the database (first time)
node utils/vm-seed-dummies.js
```

### Health Check

The app exposes a `/health` endpoint. Docker uses it to verify the container is running correctly:

```bash
curl http://your-droplet-ip/health
# {"status":"ok"}
```
