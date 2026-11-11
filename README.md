# FPED Unified System

Iisang system para sa Planning Division (FPED): Travel Orders, Procurement, Gmail at Calendar ng office account, at links papunta sa FIND at FAST.

Papalitan nito ang dalawang Google Apps Script app (Travel Order System at Procurement System). Ililipat ang data mula Google Sheets papunta sa MariaDB para tuloy-tuloy ang records.

## Stack

| Bahagi | Gamit |
|---|---|
| Backend | Spring Boot 3, Java 21 |
| Database | MariaDB 10.11 (Flyway migrations) |
| Frontend | React 19 + TypeScript (Vite) |
| Server | Ubuntu, Nginx sa harap (HTTPS) |
| Gmail at Calendar | Google Workspace API (OAuth "Internal" app, office account) |

## Modules

1. **Portal** – home dashboard, menu ng lahat ng system, settings
2. **Travel Orders** – encode, overlap at duplicate check, reschedule, cancel/restore, personnel
3. **Procurement** – proposal, PR, SPPMP, routing, budgets, repeat check
4. **Gmail** – basa, label, print, "Gawing event" (walang reply)
5. **Calendar** – month/week view, add/edit/delete

Roles: Admin, Encoder, Viewer. Admin at Encoder lang ang may Gmail at Calendar.

## Ayos ng repository

```
backend/              Spring Boot: API, login, database migrations
frontend/             React + TypeScript: mga screen
deploy/               sample na Nginx config, systemd service, env file, backup script
docs/                 plano at mga gabay
legacy/apps-script/   ang dalawang lumang Apps Script app, para sa reference at data migration
```

## Kalagayan

| Phase | Ano | Kalagayan |
|---|---|---|
| 1 | Pundasyon: login, roles, users, audit log, portal shell at menu | Tapos (hindi pa naka-deploy sa server) |
| 2 | Travel Orders | Susunod |
| 3 | Procurement | |
| 4 | Gmail at Calendar | |
| 5 | Import ng data at testing | |
| 6 | Go-live | |

## Mga gabay

- [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) – paano patakbuhin sa sariling computer
- [docs/DEPLOY.md](docs/DEPLOY.md) – paano i-deploy sa Ubuntu server, at paano i-import ang users
- [docs/PLAN.md](docs/PLAN.md) – buod ng phases at mga tanong na hindi pa nasasagot

Ang buong detalyadong plano ay nasa Claude doc na "Planning Division Portal – Detalyadong Plano".

## Paalala

Huwag mag-commit ng passwords, Google client secret, o `.env` files. Lahat ng sikreto ay sa environment variables ng server.
