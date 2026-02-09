# 00. Overview: Alarm to Complaint Sync Service (v2.0)

## Introduction
The **AlarmToComplaintSync Service** is a high-reliability middleware solution designed to bridge the gap between an industrial **SCADA/OT system** (Microsoft SQL Server) and an enterprise **Complaint Management System** (NLC-CMS / PostgreSQL).

Version **2.0** introduces the **FaultSync Architecture**, ensuring every operational fault is audited, normalized, and intelligently promoted to a complaint ticket without duplication.

## Key Features
- **FaultSync Audit Trail**: An immutable ledger (`FaultSync` table) records every detected fault before it becomes a complaint, ensuring 100% data lineage.
- **Smart Deduplication**: Prevents duplicate tickets by checking not just the time window, but the **live status** of existing complaints. If a complaint is OPEN or IN_PROGRESS, new faults are skipped and logged separately.
- **Config-Driven Logic**: All business rules (e.g., `Tag1 > 50`, `Tag5 == 'ON'`) are defined in `sync-config.json` without requiring code changes.
- **Forensic Logging**:
  - **Raw Data**: Every row fetched from SCADA is logged to `log/raw_data_*.log`.
  - **Skipped Faults**: Every skipped duplicate is logged to `log/skipped_faults_*.log` with the reason.
- **Cross-Platform**: Designed to run as a reliable background service on Windows (Task Scheduler) or Linux (PM2/Systemd).

## Architecture High-Level
1. **Source**: SQL Server Tables (`AnalogData3`, `DigitalData3`)—containing unpivoted sensor data.
2. **Process**: Node.js Service (Fetch -> Log -> Normalize -> Rule Engine -> Smart Dedup).
3. **Audit**: PostgreSQL (`FaultSync` Table)—Immutable record of the event.
4. **Action**: PostgreSQL (`Complaint` Table)—Operational ticket for maintenance teams.
