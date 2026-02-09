# 02. Workflow Sequence

This sequence diagram illustrates the decision-making process for a single polling cycle.

```mermaid
sequenceDiagram
    participant Cron as Scheduler
    participant DB as Source (SQL Server)
    participant FS as File System
    participant Logic as Sync Logic
    participant PG as Target (PostgreSQL)

    Cron->>Logic: Trigger Sync Job
    Logic->>DB: Fetch New Data > LastSyncTime
    DB-->>Logic: Return Rows (Analog/Digital)
    
    loop Forensic Logging
        Logic->>FS: Append to raw_data.log
    end

    Logic->>Logic: Normalize (Unpivot 64 Tags)
    
    loop For Each Data Point
        Logic->>Logic: Evaluate Rules (sync-config.json)
        
        opt Rule Matched
            Logic->>PG: Find Latest FaultSync (RTU + Tag)
            PG-->>Logic: Return Fault + Linked Complaint
            
            alt Complaint is ACTIVE (Open/Progress)
                Logic->>FS: Append to skipped_faults.log
                Note right of Logic: SKIP CREATION
            else Complaint is CLOSED or NULL
                Logic->>PG: BEGIN TRANSACTION
                Logic->>PG: Insert FaultSync
                PG-->>Logic: New Fault ID
                Logic->>PG: Insert Complaint (slmsRef = Fault ID)
                Logic->>PG: Insert StatusLog
                Logic->>PG: COMMIT
            end
        end
    end
```

## Decision Steps
1. **Is it a Fault?** Determined by `ruleEngine.js`.
2. **Is it a Duplicate?** Determined by `dedupEngine.js` querying PostgreSQL.
3. **Action**: Write to DB or Write to Skipped Log.
