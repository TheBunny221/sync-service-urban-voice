# 05. FaultSync Database Design

The system relies on two key tables in the PostgreSQL target database. 

## 1. FaultSync Table (The Audit)
This table acts as the "Source of Truth" for all detected anomalies. It is immutable.

```prisma
model FaultSync {
  id         Int      @id @default(autoincrement())
  rtuNumber  BigInt   // The physical device ID
  poleNo     String?  // Optional location metadata
  sourceType String   // 'ANALOG' or 'DIGITAL'
  tagNo      String   // e.g., 'Tag1'
  tagValue   String   // e.g., '55.4' (Stored as string to handle variances)
  eventTime  DateTime // Time of occurrence in Source System
  faultCount Int?     // Number of faulty samples in window (Percentage Engine)
  totalCount Int?     // Total number of samples in window (Percentage Engine)
  faultPercent Float? // Calculated fault rate (Percentage Engine)
  createdAt  DateTime @default(now())

  complaints Complaint[] // Relation to generated complaints
}
```

## 2. Complaint Table (The Action)
This table is actionable and mutable (Human operators change status).

```prisma
model Complaint {
  id          Int       @id @default(autoincrement())
  title       String
  description String
  status      String    // OPEN, CLOSED, IN_PROGRESS
  priority    String
  clientId    String    // Multi-tenant identifier
  
  slmsRef     Int?      // Foreign Key to FaultSync.id
  tags        Json?     // Structured metadata for frontend (RTU, Value)
  
  faultSync   FaultSync? @relation(fields: [slmsRef], references: [id])
}
```

## Relationship
- **One Fault -> One Complaint**: Typically, one detected fault generates one complaint.
- **Reference**: `Complaint.slmsRef` stores the ID of the `FaultSync` record. This allows you to always trace back *why* a complaint was created.
