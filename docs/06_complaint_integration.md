# 06. Complaint Integration Details

This document details the logic used when upgrading a `FaultSync` record to a `Complaint`.

## 1. Status Mapping
New complaints are created with a default status defined in `sync-config.json` (usually `OPEN`).

## 2. Dynamic Linking
- When a `FaultSync` record is created, its `id` is returned.
- This `id` is legally written into the `slmsRef` field of the new `Complaint`.

## 3. Duplicate Prevention (The "Smart Loop")
Before creation, the system looks backwards:
1. **Query**: `findFirst(FaultSync)` matching current RTU + Tag.
2. **Expand**: Include `complaints` relation.
3. **Check**: 
   - Is `complaints[0].status` in `['CLOSED', 'RESOLVED', 'REJECTED']`?
   - **Yes**: Safe to create NEW complaint.
   - **No**: The issue is known and active. **ABORT**.

## 4. Status Logging
Every auto-generated complaint also receives an initial entry in the `StatusLog` table:
- **From**: `null`
- **To**: `OPEN` (or configured default)
- **Comment**: `FaultSync Auto-Creation`
- **CreatedBy**: `SYNC_AGENT_V2`

This ensures the CMS history shows the automated nature of the ticket.
