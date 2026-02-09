# AlarmToComplaintSync Service (v2.0)

A robust, fault-tolerant Node.js service that synchronizes industrial telemetry data (Analog & Digital) from SQL Server to an Enterprise Complaint Management System (PostgreSQL).

## 🚀 Key Features
- **FaultSync Architecture**: Audit-first design using `FaultSync` intermediate table.
- **Config-Driven**: Rules, thresholds, and mappings defined in `sync-config.json`.
- **Raw Logging**: Full audit trail of raw telemetry data in `./log/`.
- **Cross-Platform**: Ready for Windows Task Scheduler or Linux Systemd/PM2.

## 📂 Project Structure
```
.
├── docs/                 # Detailed Documentation
├── logs/                 # Runtime logs
├── prisma/               # Database Schema
├── src/
│   ├── db/               # MSSQL & Prisma Connectors
│   ├── logic/            # Rules, Dedup, Mapper
│   └── utils/            # Logger
├── sync-config.json      # Main Configuration
├── index.js              # Entry Point
└── README.md
```

## 📖 Documentation
We have extensive documentation available in the `docs/` folder:

- **[00. Overview](docs/00_overview.md)**: High-level purpose and goals.
- **[01. Architecture](docs/01_architecture.md)**: System design and data flow diagrams.
- **[02. Workflow](docs/02_workflow.md)**: Step-by-step sequence of operations.
- **[03. Modules](docs/03_modules.md)**: Codebase organization and module responsibilities.
- **[04. Rule Engine](docs/04_rule_engine.md)**: How to configure alarms and thresholds.
- **[05. FaultSync Design](docs/05_faultsync_design.md)**: Role of the intermediate audit table.
- **[06. Complaint Integration](docs/06_complaint_integration.md)**: How faults become complaints.
- **[07. Testing](docs/07_testing.md)**: Guide to running unit tests.
- **[08. Modification Guide](docs/08_modification_guide.md)**: How to extend the service.

## 🛠️ Setup & Usage

### 1. Installation
```bash
npm install
```

### 2. Configuration
Edit `sync-config.json` in the root directory.
```json
{
  "sourceDb": { ... },
  "syncRules": {
    "tagRules": [
      { "tag": "Tag1", "condition": "gt", "value": 50, "alarmType": "CRITICAL" }
    ]
  }
}
```

### 3. Database Migration
Ensure your target PostgreSQL database is accessible and run:
```bash
npx prisma db push
```

### 4. Running
```bash
# Start Service (Production)
npm start

# Start Service (Development - logs to dev_payloads)
npm run dev

# Run Tests
npm test
```

## 📜 License
Private / Proprietary
