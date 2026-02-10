# Config: Environment & Ecosystem

## Purpose (WHY)
Secrets (passwords, connection strings) and dynamic environment overrides must be kept out of version control. The `.env` file handles local secrets, while `ecosystem.config.js` manages process orchestration via PM2.

## Responsibilities
- **Secret Management**: Storing database credentials securely.
- **Environment Overrides**: Overriding JSON configuration values at runtime (e.g., changing intervals in production).
- **Process Monitoring**: Ensuring the service auto-restarts on failure via PM2.

## .env Variables
| Variable | WHY it exists |
| :--- | :--- |
| `MSSQL_SERVER` | IP/Hostname of the Source SQL Server. |
| `DATABASE_URL` | Prisma connection string for the Target PostgreSQL DB. |
| `IS_DEVELOPMENT` | Force-overrides the JSON `isDevelopment` flag for safety. |
| `SYNC_INTERVAL_MIN` | Defines the cron schedule frequency (in minutes). |

## ecosystem.config.js (PM2)
This file defines how PM2 should run the service.
- **Process Name**: `v2-sync-service`.
- **Entry point**: `src/index.js`.
- **Restart Policy**: `max_restarts: 10`, `restart_delay: 4000`.
- **Environment Injection**: Passes `SYNC_INTERVAL_MIN` and `IS_DEVELOPMENT` to the node process.

## Mermaid Flow
```mermaid
graph LR
    OS[Operating System / Shell] -->|Injects| P[PM2]
    P -->|Loads| E[.env]
    E -->|Exports| ENV[process.env]
    ENV -->|Merged By| CL[Config Loader]
```
