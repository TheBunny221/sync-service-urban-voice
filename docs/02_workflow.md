# 02. Workflow Sequence

This sequence diagram illustrates the decision-making process for the promoted V2 logic.

```mermaid
sequenceDiagram
    participant Cron as Scheduler
    participant DB as Source (SQL Server)
    participant FS as File System (logs/)
    participant Logic as V2 Sync Logic
    participant State as State Manager
    participant PG as Target (PostgreSQL)

    Cron->>Logic: Trigger Sync Job
    
    par Fault Detection
        Logic->>DB: Query Power Failures (Tag16=0)
        Logic->>DB: Query Comm Failures (Stale/Missing)
        Logic->>DB: Query Trips & Lamps (New Records)
    end
    
    DB-->>Logic: Return Candidate Faults
    
    Logic->>Logic: Apply Winner-Take-All (Prioritize Critical)
    
    loop For Each Winner Fault
        Logic->>State: Check for State Change
        State-->>Logic: Is New or Recurred?
        
        opt Is Genuine New Fault
            alt Mode: DEVELOPMENT
                Logic->>FS: Save to cms_payload_YYYY-MM-DD.log
            else Mode: PRODUCTION
                Logic->>PG: BEGIN TRANSACTION
                Logic->>PG: Insert FaultSync
                Logic->>PG: Insert Complaint
                Logic->>PG: Insert StatusLog
                Logic->>PG: COMMIT
            end
        end
    end
    
    Logic->>PG: Update LAST_SYNC_TIME in SystemConfig
```

## Decision Steps
1. **Criticality Selection**: If an RTU has multiple issues, the system picks the most severe (e.g., Power Failure masks a Lamp Failure).
2. **State Transition**: A complaint is only generated if the device moves from a "Healthy" state to a "Faulty" state, or if the fault recurred after a closure.
3. **Operational Mode**:
   - **DEV**: Visualizes the payload meant for the CMS without making changes.
   - **PROD**: Directly creates tickets in the live CMS database.
