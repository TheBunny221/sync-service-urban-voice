# AlarmToComplaintSync Service

**Single Source of Truth** for the Industrial IoT Fault Synchronization System.

## 1. System Overview
The **AlarmToComplaintSync Service** bridges the gap between the **OT Layer** (SCADA/SQL Server) and the **IT Layer** (Complaint Management System/PostgreSQL). It monitors industrial telemetry data (Analog & Digital) for faults and automatically generates complaint tickets.

### Core Architecture
- **Source**: Microsoft SQL Server (`AnalogData`, `DigitalData`).
- **Service**: Node.js (Background Agent).
- **Target**: PostgreSQL (NLC-CMS) via Prisma ORM.
- **State**: Database-managed state (`SystemConfig` table) for incremental sync and deduplication.

---

## 2. Sync Logic (V2 - Current)

The system now runs the **V2 Logic** by default. This implementation is designed for **strict data validation**, **robust detection**, and **optimized performance**.

**Entry Point**: `src/index.js`
**Default Command**: `npm start`

### Key Features:
1.  **Tiered Fault Detection**:
    *   **Priority 1: Power Failures** (`Tag16=0` in `DigitalData`).
    *   **Priority 2: Communication Failures** (`Tag8=0`).
        *   **Robustness**: Checks for "Stale Digital Data" (>1 hour old) *AND* "Missing Analog Data" (>24 hours).
        *   **Discontinued RTU Filter**: Automatically ignores RTUs that have been inactive for > **60 days** (1440 hours).
    *   **Priority 3: AI/DI Faults** (Circuit Trips, Lamp Failures).
        *   **Phase Awareness**: Smart calculation of Lamp Failure percentages based on Phase Status.

2.  **Winner-Take-All**: For any given RTU in a sync window, only the *highest priority* fault is persisted. This prevents cascading alerts.

3.  **State Management**:
    *   Uses `V2_LAST_SYNC_TIME_[ID]` key in `SystemConfig` table.
    *   Ensures sync continuity across restarts.

4.  **Transaction Safety**: Database insertions are wrapped in transactions to ensure atomicity between fault audit logs and complaint tickets.

---

## 3. Configuration (`sync-config.json`)

The system behavior is defined by `sync-config.json` and `.env` variables.

### Environment Variables (.env)
| Variable | Description |
|----------|-------------|
| `MSSQL_SERVER` | Source SQL Server address |
| `DATABASE_URL` | Target PostgreSQL connection string |
| `SYNC_SCHEDULE` | Cron schedule (e.g., `*/5 * * * *`) |
| `IS_DEVELOPMENT` | Set to `true` for file-based logging, `false` for DB insertion |

---

## 4. Operational Guide

### Running the Service

**Production Mode**
```bash
npm run start:prod
```
*Runs the service with production settings (inserts into DB).*

**Development Mode**
```bash
npm run start:dev
```
*Runs the service in Development mode (logs payloads to `logs/` directory instead of DB).*

**Legacy Rollback**
```bash
npm run start:legacy
```
*Runs the old V1 logic preserved in `/legacy-code/` for emergency use.*

### Deployment

#### PM2 Deployment
```bash
pm2 start ecosystem.config.js --env production
```

#### Windows Deployment
1. Open PowerShell as Administrator.
2. Run `.\scripts\deploy-windows.ps1`.
3. Follow the prompts to create the scheduled task.

### Logs
*   **Application Logs**: `logs/v2-sync.log`
*   **Payload Logs (Dev Mode)**: `logs/cms_payload_YYYY-MM-DD.log`
*   **PM2 Logs**: `logs/pm2-out.log` and `logs/pm2-error.log`

---

## 5. Legacy Code Isolation
The original V1 code has been moved to the `/legacy-code/` directory. It is considered deprecated and will be removed in future releases. Refer to [Migration Guide](docs/MIGRATION_GUIDE.md) for details.
