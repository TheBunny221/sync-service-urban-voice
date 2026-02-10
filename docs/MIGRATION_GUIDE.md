# Migration Guide: V2 Sync Promotion

This document details the transition from the stream-based V1 sync to the optimized V2 sync engine.

## Overview
As of February 2026, the **V2 Sync Logic** has been promoted to the primary implementation. The original V1 code has been isolated in the `/legacy-code/` directory.

## Key Structural Changes
| Area | Old (V1) | New (V2 promoted) |
|------|----------|-------------------|
| Entry Point | `src/index.js` (Legacy) | `src/index.js` (V2) |
| Configuration | `sync-config.json` | `src/config/v2-config.json` |
| Sync Engine | `src/syncJob.js` | `src/index.js` + `src/services/` |
| Fault Mapping | `src/logic/mapper.js` | `src/cmsMapper.js` |
| State Storage | `LAST_SYNC_TIME_...` | `V2_LAST_SYNC_TIME_...` |

## Migration Steps for Operations

### 1. Update PM2 Configurations
If you were using PM2 to manage the service, update your `ecosystem.config.js`. A new template is provided in the project root.
- The default script is now `src/index.js`.
- Use the `:prod` and `:dev` suffixes for scripts to ensure correct environment variables.

### 2. Environment Variables
V2 relies more heavily on standard `.env` variables for database connectivity:
- `MSSQL_SERVER`: Source SQL Server.
- `DATABASE_URL`: Target PostgreSQL.
- `IS_DEVELOPMENT`: Controls whether to insert to DB or log payloads to files.

### 3. Switching back to Legacy (Rollback)
If issues are encountered with the V2 promoter, you can temporarily revert to the old logic:
```bash
npm run start:legacy
```
This runs the code in `/legacy-code/src/index.js`. It uses the `legacy-code/sync-config.json` for rules.

## Technical Improvements in V2
- **Query Optimization**: Replaced row-by-row streaming with targeted SQL queries for Comm Fail and Power Fail detection.
- **Improved Comm Fail Filter**: Added specific logic to ignore devices that haven't sent data in over 60 days (Discontinued RTUs).
- **Consolidated Payload Builder**: Centralized CMS payload logic in `src/cmsMapper.js` for easier maintenance.
- **Robust Error Handling**: Added explicit transaction management for database writes.
