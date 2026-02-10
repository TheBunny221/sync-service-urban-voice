# 01. Architecture

## System Diagram

```mermaid
graph TD
    subgraph OT_Layer [Source: SQL Server]
        AD[AnalogData3]
        DD[DigitalData3]
    end

    subgraph Service_Layer [Sync Agent: Node.js]
        Reader[Optimized DB Reader]
        PowerSvc[Power Fail Service]
        CommSvc[Comm Fail Service]
        TripSvc[Trip Service]
        LampSvc[Lamp Fail Service]
        Rules[Rule Engine]
        StateManager[State Manager]
        Mapper[CMS Payload Mapper]
    end

    subgraph IT_Layer [Target: PostgreSQL]
        FS[FaultSync Table]
        C[Complaint Table]
    end

    AD --> Reader
    DD --> Reader
    Reader --> PowerSvc
    Reader --> CommSvc
    Reader --> TripSvc
    Reader --> LampSvc
    
    PowerSvc --> Rules
    CommSvc --> Rules
    TripSvc --> Rules
    LampSvc --> Rules
    
    Rules -- Winner-Take-All --> StateManager
    StateManager -- New Fault? --> Mapper
    Mapper -- Transaction --> IT_Layer
```

## Data Flow Pipeline (V2 Optimized)

1. **Polling Cycle**: The service wakes up on a configurable Cron schedule (e.g., `*/1 * * * *`).
2. **Data Fetching**:
   - Connects to SQL Server.
   - **Power Failures**: Scans `DigitalData` for `Tag16=0` in the last hour.
   - **Comm Failures**: Analytical query checking for stale digital data (>1h) and missing analog data (>24h).
   - **Circuit Trips / Lamp Failures**: Queries for newer records since the last processed timestamp.
3. **Rule Evaluation (Tiered Logic)**:
   - Evaluates detections through specialized services (`powerFail.service`, `commFail.service`, etc.).
   - **Winner-Take-All**: For a single RTU, only the most critical fault is promoted:
     - `Power Fail` > `Comm Fail` > `Trip` > `Lamp Fail`.
4. **State Management**:
   - **Deduplication**: Checks against local and remote state to ensure only *new* state changes trigger complaints.
   - Faults are only promoted if the device has transitioned from "Normal" to "Faulty".
5. **CMS Mapping**:
   - `src/cmsMapper.js` transforms normalized fault data into the specific PostgreSQL schema required by the CMS.
   - Resolves `complaintTypeId` and `complaintId` prefixing based on system configuration.
6. **Persistence**:
   - **Transaction**: Inserts are wrapped in Prisma transactions to ensure data consistency between operational logs and complaint tickets.
