# 04. Rule Engine & Configuration (v2.0)

The service behavior is controlled entirely by `sync-config.json`. This allows changing thresholds, logic, or message templates without redeploying code.

## Configuration File Structure

```json
{
  "syncRules": {
    "batchSize": 500,
    "lookbackHours": 24,
    "clientId": "3",
    
    // MASTER RULES (Blocking Logic)
    "masterRules": [
       {
          "tag": "Tag8",
          "condition": "equals",
          "value": 0,
          "duration": "24h",
          "description": "Panel Not Communicating",
          "alarmType": "CRITICAL"
       }
    ],

    // REGULAR RULE SETS
    "ruleSets": {
      "diRules": {
        "enabled": true,
        "rules": [
          {
            "tag": "Tag1",
            "condition": "gt",
            "value": 50,
            "alarmType": "CRITICAL",
            "description": "High Temp",
            // OPTIONAL: Duration Check
            "duration": {
               "value": "5m",
               "mode": "continuous"
            },
            // OPTIONAL: Prerequisite
            "prerequisite": {
               "tag": "Tag6",
               "value": 1,
               "condition": "equals"
            }
          }
        ]
      },
      "aiRules": {
        "enabled": true,
        "rules": [ ... ]
      }
    }
  }
}
```

## Rule Features

### 1. Dual Rule Sets
Rules are split into `diRules` (Digital) and `aiRules` (Analog) to prevent evaluating incorrect data types.
- **DI Rules**: Evaluate data from `DigitalData` table.
- **AI Rules**: Evaluate data from `AnalogData` table.

### 2. Duration Checks
Rules can enforce a time-persistence check before triggering.
- **Configuration**: `"duration": { "value": "10m", "mode": "continuous" }`
- **Logic**: The system checks the Source DB history to verify if the value has been present for > 10 minutes.
- **Usage**: Useful for preventing alarms on momentary spikes.

- **Example**: "Trigger 'Circuit Trip' on Tag9 ONLY IF 'Circuit Count' (Tag6) == 2".
- **Config**: `"prerequisite": { "tag": "Tag6", "value": 2 }`

### 4. Cross-Table Support (AI/DI)
Rules can check prerequisites across DIFFERENT tables (Analog vs Digital).
- **Example**: Trigger "Lamp Failure" (Analog) only if "Power is ON" (Digital).
- **Configuration**:
  ```json
  "prerequisite": {
     "tag": "Tag16",
     "value": 1,
     "table": "DIGITALDATA" // Options: DIGITALDATA, ANALOGDATA
  }
  ```
- **Logic**: If `table` is specified, the system searches all data points for that RTU in the current cycle for a match. If omitted, it looks in the same database row.

### 4. Master Rules (Prioritized Blocking)
Master rules take precedence over all other logic. They are evaluated **before** AI/DI rules for each RTU.

- **Priority 1 (Blocking)**:
  - If a Priority 1 master rule matches and is active (duration met), it triggers a complaint and **BLOCKS** all further processing for that RTU (including other master rules).
  - **Behavior**: Creates 1 Complaint (Master). Skips infinite subordinate faults.
  - **Use Case**: "Panel Power Failure" - if panel is dead, all other signals are invalid.

- **Priority > 1 (Window/Notification)**:
  - If a Priority 2+ master rule matches, it triggers a complaint.
  - It **BLOCKS** all normal AI/DI rules (Priority Window).
  - It **ALLOWS** other P2 master rules to be evaluated.
  - **Behavior**: Creates Complaint for Master Rule. Skips AI/DI faults.
  - **Use Case**: "Maintenance Mode" - Log the mode, but ignore individual circuit trips.

```

## Percentage-Based Evaluation (v2.1)

Introduced as an alternative to duration-based logic, this engine evaluates fault frequency over a rolling window. This is highly effective for intermittent signals or "chatty" sensors.

### 1. Enabling the Engine
The percentage engine is controlled by an environment variable. If disabled, the service falls back to standard duration-based matching.
- **Env Flag**: `useNewLogic=true`

### 2. Logic Flow
1. **History Collection**: For every record in a batch, the service fetches the last **48 hours** of data for that RTU+Tag.
2. **Frequency Check**:
   - `Total Samples (N)`: Number of records found in the 48h window.
   - `Faulty Samples (F)`: Number of records where condition (e.g., `Value == 0`) is met.
   - `Percentage (P)`: `(F * 100) / N`.
3. **Trigger**: If `P >= thresholdPercent`, a complaint is created.
   - **Default Threshold**: 80% (if not explicitly configured).

### 3. Configuration Extension
Rules in `sync-config.json` can now include specific percentage fields:
```json
{
  "tag": "Tag16",
  "thresholdPercent": 80,   // Trigger if fault occurs in >= 80% of samples (Default)
  "windowHours": 48,        // Rolling window size (Default: 48)
  "description": "Unstable Power Supply"
}
```

> *Fault Identified: Unstable Power Supply (Tag16) — Occurred in 12/48 samples (25.00%) over last 48h*
>
### 4. UI Configuration (v2.3)
Users can now configure the **Threshold (%)** directly from the UI for Master, AI, and DI rules.
- **Location**: Sync Rules Settings > Rule Editor.
- **Field**: `Threshold (%)` input box next to `Trigger Value`.
### 5. Enhanced Logging & Persistence (v2.2)- **Live Logging**: A specific log entry is generated upon successful complaint registration.
  - *Format*: `Complaint Registered: {{Title}} | RTU: {{ID}} | Tag: {{Tag}} | FaultRate: {{Percent}}% ({{F}}/{{N}} samples in 48h) | ID: {{ComplaintId}}`

### 6. Strict SQL Validation (v2.4)
The Percentage Engine now supports strict prerequisite checking (Cross-Table) to align with SQL validation logic.
- **Goal**: Prevent complaints for faults if the circuit is disabled (e.g., Circuit Trip Tag7 requires Circuit Enabled Tag6=1).
- **Behavior**: If a prerequisite condition is NOT met in the *current batch*, the fault history is ignored, and no complaint is registered, regardless of frequency.
To facilitate better monitoring and debugging, the system now persists and logs specific fault rate metrics:
- **Persistence**: `FaultSync` records now store `faultCount`, `totalCount`, and `faultPercent`.
- **Live Logging**: A specific log entry is generated upon successful complaint registration.
  - *Format*: `Complaint Registered: {{Title}} | RTU: {{ID}} | Tag: {{Tag}} | FaultRate: {{Percent}}% ({{F}}/{{N}} samples in 48h) | ID: {{ComplaintId}}`

---

## Rule Operators
| Operator | Logic | Example |
|:---:|---|---|
| `gt` | Value > Threshold | Temperature > 60 |
| `lt` | Value < Threshold | Pressure < 10 |
| `gte` | Value >= Threshold | Battery >= 100 |
| `lte` | Value <= Threshold | Flow <= 0 |
| `equals` | Value == Threshold | PumpStatus == "OFF" |
| `neq` | Value != Threshold | Status != "OK" |

## Database-Level Validation (Stored Procedure)
For troubleshooting or auditing, a Stored Procedure is available in the source SQL Server that replicates the Sync Service logic.

- **File**: `scripts/usp_Sync_ValidateFaults.sql`
- **Purpose**: Identify faults in real-time across all RTUs without waiting for the sync job.
- **Hierarchy**:
    - Checks **Master Rules (P1)** first (e.g., Comm Fail, Power Fail).
    - Checks **DI/AI rules** with **Cross-Table Prerequisites**.
- **Usage**:
  ```sql
  EXEC [dbo].[usp_Sync_ValidateFaults];
  ```

## See Also
- [End-to-End Rule Engine Flow](09_rule_engine_flow.md) - A detailed guide on the data lifecycle from SQL to CMS.
