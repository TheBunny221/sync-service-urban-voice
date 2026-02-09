# Database Validation Queries - Quick Reference

## Purpose
This document provides SQL queries to validate each parameter shown on the summaryN.php dashboard directly in the database.

---

## Prerequisites
```sql
-- Set your client ID
DECLARE @clientid INT = 1;
DECLARE @offset INT = -60; -- minutes
```

---

## 1. OVERALL STATUS VALIDATION

### Total CCMS Panels (Hardcoded: 1506)
```sql
-- Verify actual count in database
SELECT COUNT(DISTINCT d.RTUNUMBER) AS TotalPanels
FROM ANALOGSPOTDATA d 
INNER JOIN SLCMappings s WITH(NOLOCK) ON s.CLIENTID = d.clientid AND d.RTUNUMBER = s.RTUNUMBER
INNER JOIN rtumaster r WITH(NOLOCK) ON d.CLIENTID = r.clientid AND d.RTUNUMBER = r.RTUNUMBER
WHERE d.ClientID = @clientid;
```

### Total Commissioned
```sql
SELECT COUNT(*) AS Commissioned
FROM ANALOGSPOTDATA d 
INNER JOIN DIGITALSPOTDATA a WITH(NOLOCK) ON a.CLIENTID = d.clientid AND d.RTUNUMBER = a.RTUNUMBER
INNER JOIN SLCMappings s WITH(NOLOCK) ON s.CLIENTID = d.clientid AND d.RTUNUMBER = s.RTUNUMBER
INNER JOIN rtumaster r WITH(NOLOCK) ON d.CLIENTID = r.clientid AND d.RTUNUMBER = r.RTUNUMBER
WHERE d.ClientID = @clientid
  AND a.TAG8 = 0 
  AND a.TAG13 = 1 
  AND a.TAG15 = 0;
```

---

## 2. COMMUNICATION STATUS VALIDATION

### Communicating Feeders
```sql
SELECT COUNT(*) AS Communicating
FROM DIGITALSPOTDATA d 
INNER JOIN SLCMappings s WITH(NOLOCK) ON s.CLIENTID = d.clientid AND d.RTUNUMBER = s.RTUNUMBER
INNER JOIN rtumaster r WITH(NOLOCK) ON d.CLIENTID = r.clientid AND d.RTUNUMBER = r.RTUNUMBER
WHERE d.ClientID = @clientid 
  AND d.TAG8 = 1;

-- List communicating feeders
SELECT d.RTUNUMBER, r.description, d.datetimefield
FROM DIGITALSPOTDATA d 
INNER JOIN rtumaster r WITH(NOLOCK) ON d.CLIENTID = r.clientid AND d.RTUNUMBER = r.RTUNUMBER
WHERE d.ClientID = @clientid 
  AND d.TAG8 = 1
ORDER BY d.RTUNUMBER;
```

### Not Communicating Feeders
```sql
SELECT COUNT(*) AS NotCommunicating
FROM DIGITALSPOTDATA d 
INNER JOIN SLCMappings s WITH(NOLOCK) ON s.CLIENTID = d.clientid AND d.RTUNUMBER = s.RTUNUMBER
INNER JOIN rtumaster r WITH(NOLOCK) ON d.CLIENTID = r.clientid AND d.RTUNUMBER = r.RTUNUMBER
WHERE d.ClientID = @clientid  
  AND d.TAG8 = 0 
  AND d.datetimefield <= DATEADD(HOUR, -1, GETDATE()) 
  AND d.RTUNUMBER NOT IN (
    SELECT RTUNUMBER FROM ANALOGSPOTDATA 
    WHERE datetimefield <= DATEADD(HOUR, -1440, GETDATE())
      AND ClientID = @clientid
  );

-- List non-communicating feeders with last seen time
SELECT d.RTUNUMBER, r.description, MAX(d.datetimefield) AS LastSeen
FROM DIGITALSPOTDATA d 
INNER JOIN rtumaster r WITH(NOLOCK) ON d.CLIENTID = r.clientid AND d.RTUNUMBER = r.RTUNUMBER
WHERE d.ClientID = @clientid 
  AND d.TAG8 = 0
GROUP BY d.RTUNUMBER, r.description
ORDER BY LastSeen DESC;
```

---

## 3. FEEDER POWER STATUS VALIDATION

### Power Available
```sql
SELECT COUNT(*) AS PowerAvailable
FROM DIGITALSPOTDATA d 
INNER JOIN SLCMappings s WITH(NOLOCK) ON s.CLIENTID = d.clientid AND d.RTUNUMBER = s.RTUNUMBER
INNER JOIN rtumaster r WITH(NOLOCK) ON d.CLIENTID = r.clientid AND d.RTUNUMBER = r.RTUNUMBER
WHERE d.ClientID = @clientid
  AND TAG16 = 1 
  AND d.datetimefield >= DATEADD(MINUTE, @offset, GETDATE());

-- List feeders with power
SELECT d.RTUNUMBER, r.description, d.datetimefield
FROM DIGITALSPOTDATA d 
INNER JOIN rtumaster r WITH(NOLOCK) ON d.CLIENTID = r.clientid AND d.RTUNUMBER = r.RTUNUMBER
WHERE d.ClientID = @clientid
  AND TAG16 = 1 
  AND d.datetimefield >= DATEADD(MINUTE, @offset, GETDATE())
ORDER BY d.RTUNUMBER;
```

### Power Un-Available
```sql
SELECT COUNT(*) AS PowerFail
FROM DIGITALSPOTDATA d 
INNER JOIN SLCMappings s WITH(NOLOCK) ON s.CLIENTID = d.clientid AND d.RTUNUMBER = s.RTUNUMBER
INNER JOIN rtumaster r WITH(NOLOCK) ON d.CLIENTID = r.clientid AND d.RTUNUMBER = r.RTUNUMBER
WHERE d.ClientID = @clientid
  AND TAG16 = 0 
  AND d.datetimefield >= DATEADD(MINUTE, @offset, GETDATE());

-- List feeders without power
SELECT d.RTUNUMBER, r.description, d.datetimefield
FROM DIGITALSPOTDATA d 
INNER JOIN rtumaster r WITH(NOLOCK) ON d.CLIENTID = r.clientid AND d.RTUNUMBER = r.RTUNUMBER
WHERE d.ClientID = @clientid
  AND TAG16 = 0 
  AND d.datetimefield >= DATEADD(MINUTE, @offset, GETDATE())
ORDER BY d.RTUNUMBER;
```

---

## 4. FEEDER ON/OFF STATUS VALIDATION

### Single Phase (Circuit-1) Status
```sql
-- Circuit-1 ON
SELECT COUNT(*) AS Circuit1_ON
FROM DIGITALSPOTDATA d 
INNER JOIN ANALOGSPOTDATA a WITH(NOLOCK) ON a.DATETIMEFIELD=d.DATETIMEFIELD 
  AND a.RTUNUMBER=d.RTUNUMBER AND a.CLIENTID=d.CLIENTID
INNER JOIN SLCMappings s WITH(NOLOCK) ON s.CLIENTID = d.clientid AND d.RTUNUMBER = s.RTUNUMBER
WHERE d.ClientID = @clientid
  AND d.TAG1 = 0 
  AND a.TAG6 = 1 
  AND d.datetimefield >= DATEADD(MINUTE, @offset, GETDATE());

-- Circuit-1 OFF
SELECT COUNT(*) AS Circuit1_OFF
FROM DIGITALSPOTDATA d 
INNER JOIN ANALOGSPOTDATA a WITH(NOLOCK) ON a.DATETIMEFIELD=d.DATETIMEFIELD 
  AND a.RTUNUMBER=d.RTUNUMBER AND a.CLIENTID=d.CLIENTID
INNER JOIN SLCMappings s WITH(NOLOCK) ON s.CLIENTID = d.clientid AND d.RTUNUMBER = s.RTUNUMBER
WHERE d.ClientID = @clientid
  AND d.TAG1 = 1 
  AND a.TAG6 = 1 
  AND d.datetimefield >= DATEADD(MINUTE, @offset, GETDATE());

-- List Circuit-1 feeders with status
SELECT 
  d.RTUNUMBER, 
  r.description,
  CASE WHEN d.TAG1 = 0 THEN 'ON' ELSE 'OFF' END AS Status,
  d.datetimefield
FROM DIGITALSPOTDATA d 
INNER JOIN ANALOGSPOTDATA a WITH(NOLOCK) ON a.DATETIMEFIELD=d.DATETIMEFIELD 
  AND a.RTUNUMBER=d.RTUNUMBER AND a.CLIENTID=d.CLIENTID
INNER JOIN rtumaster r WITH(NOLOCK) ON d.CLIENTID = r.clientid AND d.RTUNUMBER = r.RTUNUMBER
WHERE d.ClientID = @clientid
  AND a.TAG6 = 1 
  AND d.datetimefield >= DATEADD(MINUTE, @offset, GETDATE())
ORDER BY d.RTUNUMBER;
```

### Three Phase (Circuit-2) Status
```sql
-- Circuit-2 ON
SELECT COUNT(*) AS Circuit2_ON
FROM DIGITALSPOTDATA d 
INNER JOIN ANALOGSPOTDATA a WITH(NOLOCK) ON a.DATETIMEFIELD=d.DATETIMEFIELD 
  AND a.RTUNUMBER=d.RTUNUMBER AND a.CLIENTID=d.CLIENTID
INNER JOIN SLCMappings s WITH(NOLOCK) ON s.CLIENTID = d.clientid AND d.RTUNUMBER = s.RTUNUMBER
WHERE d.ClientID = @clientid
  AND d.TAG3 = 0 
  AND a.TAG6 = 2 
  AND d.datetimefield >= DATEADD(MINUTE, @offset, GETDATE());

-- Circuit-2 OFF
SELECT COUNT(*) AS Circuit2_OFF
FROM DIGITALSPOTDATA d 
INNER JOIN ANALOGSPOTDATA a WITH(NOLOCK) ON a.DATETIMEFIELD=d.DATETIMEFIELD 
  AND a.RTUNUMBER=d.RTUNUMBER AND a.CLIENTID=d.CLIENTID
INNER JOIN SLCMappings s WITH(NOLOCK) ON s.CLIENTID = d.clientid AND d.RTUNUMBER = s.RTUNUMBER
WHERE d.ClientID = @clientid
  AND d.TAG3 = 1 
  AND a.TAG6 = 2 
  AND d.datetimefield >= DATEADD(MINUTE, @offset, GETDATE());

-- List Circuit-2 feeders with status
SELECT 
  d.RTUNUMBER, 
  r.description,
  CASE WHEN d.TAG3 = 0 THEN 'ON' ELSE 'OFF' END AS Status,
  d.datetimefield
FROM DIGITALSPOTDATA d 
INNER JOIN ANALOGSPOTDATA a WITH(NOLOCK) ON a.DATETIMEFIELD=d.DATETIMEFIELD 
  AND a.RTUNUMBER=d.RTUNUMBER AND a.CLIENTID=d.CLIENTID
INNER JOIN rtumaster r WITH(NOLOCK) ON d.CLIENTID = r.clientid AND d.RTUNUMBER = r.RTUNUMBER
WHERE d.ClientID = @clientid
  AND a.TAG6 = 2 
  AND d.datetimefield >= DATEADD(MINUTE, @offset, GETDATE())
ORDER BY d.RTUNUMBER;
```

---

## 5. FEEDER TRIP STATUS VALIDATION

### Circuit-1 Trip Status
```sql
-- Circuit-1 Normal
SELECT COUNT(*) AS Circuit1_Normal
FROM DIGITALSPOTDATA d 
INNER JOIN ANALOGSPOTDATA a WITH(NOLOCK) ON a.DATETIMEFIELD=d.DATETIMEFIELD 
  AND a.RTUNUMBER=d.RTUNUMBER AND a.CLIENTID=d.CLIENTID
INNER JOIN SLCMappings s WITH(NOLOCK) ON s.CLIENTID = d.clientid AND d.RTUNUMBER = s.RTUNUMBER
WHERE d.ClientID = @clientid
  AND d.TAG7 = 0 
  AND a.TAG6 = 1 
  AND d.datetimefield >= DATEADD(MINUTE, @offset, GETDATE());

-- Circuit-1 Trip
SELECT COUNT(*) AS Circuit1_Trip
FROM DIGITALSPOTDATA d 
INNER JOIN ANALOGSPOTDATA a WITH(NOLOCK) ON a.DATETIMEFIELD=d.DATETIMEFIELD 
  AND a.RTUNUMBER=d.RTUNUMBER AND a.CLIENTID=d.CLIENTID
INNER JOIN SLCMappings s WITH(NOLOCK) ON s.CLIENTID = d.clientid AND d.RTUNUMBER = s.RTUNUMBER
WHERE d.ClientID = @clientid
  AND d.TAG7 = 1 
  AND a.TAG6 = 1 
  AND d.datetimefield >= DATEADD(MINUTE, @offset, GETDATE());

-- List Circuit-1 tripped feeders
SELECT d.RTUNUMBER, r.description, d.datetimefield
FROM DIGITALSPOTDATA d 
INNER JOIN ANALOGSPOTDATA a WITH(NOLOCK) ON a.DATETIMEFIELD=d.DATETIMEFIELD 
  AND a.RTUNUMBER=d.RTUNUMBER AND a.CLIENTID=d.CLIENTID
INNER JOIN rtumaster r WITH(NOLOCK) ON d.CLIENTID = r.clientid AND d.RTUNUMBER = r.RTUNUMBER
WHERE d.ClientID = @clientid
  AND d.TAG7 = 1 
  AND a.TAG6 = 1 
  AND d.datetimefield >= DATEADD(MINUTE, @offset, GETDATE())
ORDER BY d.RTUNUMBER;
```

### Circuit-2 Trip Status
```sql
-- Circuit-2 Normal
SELECT COUNT(*) AS Circuit2_Normal
FROM DIGITALSPOTDATA d 
INNER JOIN ANALOGSPOTDATA a WITH(NOLOCK) ON a.DATETIMEFIELD=d.DATETIMEFIELD 
  AND a.RTUNUMBER=d.RTUNUMBER AND a.CLIENTID=d.CLIENTID
INNER JOIN SLCMappings s WITH(NOLOCK) ON s.CLIENTID = d.clientid AND d.RTUNUMBER = s.RTUNUMBER
WHERE d.ClientID = @clientid
  AND d.TAG9 = 0 
  AND a.TAG6 = 2 
  AND d.datetimefield >= DATEADD(MINUTE, @offset, GETDATE());

-- Circuit-2 Trip
SELECT COUNT(*) AS Circuit2_Trip
FROM DIGITALSPOTDATA d 
INNER JOIN ANALOGSPOTDATA a WITH(NOLOCK) ON a.DATETIMEFIELD=d.DATETIMEFIELD 
  AND a.RTUNUMBER=d.RTUNUMBER AND a.CLIENTID=d.CLIENTID
INNER JOIN SLCMappings s WITH(NOLOCK) ON s.CLIENTID = d.clientid AND d.RTUNUMBER = s.RTUNUMBER
WHERE d.ClientID = @clientid
  AND d.TAG9 = 1 
  AND a.TAG6 = 2 
  AND d.datetimefield >= DATEADD(MINUTE, @offset, GETDATE());

-- List Circuit-2 tripped feeders
SELECT d.RTUNUMBER, r.description, d.datetimefield
FROM DIGITALSPOTDATA d 
INNER JOIN ANALOGSPOTDATA a WITH(NOLOCK) ON a.DATETIMEFIELD=d.DATETIMEFIELD 
  AND a.RTUNUMBER=d.RTUNUMBER AND a.CLIENTID=d.CLIENTID
INNER JOIN rtumaster r WITH(NOLOCK) ON d.CLIENTID = r.clientid AND d.RTUNUMBER = r.RTUNUMBER
WHERE d.ClientID = @clientid
  AND d.TAG9 = 1 
  AND a.TAG6 = 2 
  AND d.datetimefield >= DATEADD(MINUTE, @offset, GETDATE())
ORDER BY d.RTUNUMBER;
```

---

## 6. POWER CONSUMED STATUS VALIDATION

### Cumulative Power (Today)
```sql
SELECT SUM(TAG4) AS CumulativeKWH
FROM ANALOGSPOTDATA d 
INNER JOIN SLCMappings s WITH(NOLOCK) ON s.CLIENTID = d.clientid AND d.RTUNUMBER = s.RTUNUMBER
INNER JOIN rtumaster r WITH(NOLOCK) ON d.CLIENTID = r.clientid AND d.RTUNUMBER = r.RTUNUMBER
WHERE d.ClientID = @clientid  
  AND d.datetimefield >= DATEADD(HOUR, -1440, GETDATE());

-- Power consumption by feeder
SELECT 
  d.RTUNUMBER, 
  r.description,
  SUM(d.TAG4) AS KWH,
  COUNT(*) AS ReadingCount
FROM ANALOGSPOTDATA d 
INNER JOIN rtumaster r WITH(NOLOCK) ON d.CLIENTID = r.clientid AND d.RTUNUMBER = r.RTUNUMBER
WHERE d.ClientID = @clientid  
  AND d.datetimefield >= DATEADD(HOUR, -1440, GETDATE())
GROUP BY d.RTUNUMBER, r.description
ORDER BY KWH DESC;
```

### Run Hours
```sql
SELECT (SUM(TAG14) + SUM(TAG13)) AS TotalRunHours
FROM ANALOGSPOTDATA d 
INNER JOIN SLCMappings s WITH(NOLOCK) ON s.CLIENTID = d.clientid AND d.RTUNUMBER = s.RTUNUMBER
INNER JOIN rtumaster r WITH(NOLOCK) ON d.CLIENTID = r.clientid AND d.RTUNUMBER = r.RTUNUMBER
WHERE d.datetimefield >= DATEADD(HOUR, -1440, GETDATE()) 
  AND d.ClientID = @clientid;

-- Run hours by feeder
SELECT 
  d.RTUNUMBER, 
  r.description,
  (SUM(d.TAG14) + SUM(d.TAG13)) AS RunHours
FROM ANALOGSPOTDATA d 
INNER JOIN rtumaster r WITH(NOLOCK) ON d.CLIENTID = r.clientid AND d.RTUNUMBER = r.RTUNUMBER
WHERE d.ClientID = @clientid  
  AND d.datetimefield >= DATEADD(HOUR, -1440, GETDATE())
GROUP BY d.RTUNUMBER, r.description
ORDER BY RunHours DESC;
```

---

## 7. COMPREHENSIVE STATUS SUMMARY

### All Status Counts in One Query
```sql
SELECT 
  -- Communication
  COUNT(CASE WHEN d.TAG8 = 1 THEN 1 END) AS Communicating,
  COUNT(CASE WHEN d.TAG8 = 0 AND d.datetimefield <= DATEADD(HOUR, -1, GETDATE()) THEN 1 END) AS NotCommunicating,
  
  -- Power Status
  COUNT(CASE WHEN d.TAG16 = 1 AND d.datetimefield >= DATEADD(MINUTE, @offset, GETDATE()) THEN 1 END) AS PowerAvailable,
  COUNT(CASE WHEN d.TAG16 = 0 AND d.datetimefield >= DATEADD(MINUTE, @offset, GETDATE()) THEN 1 END) AS PowerFail,
  
  -- Circuit-1 (Single Phase)
  COUNT(CASE WHEN d.TAG1 = 0 AND a.TAG6 = 1 AND d.datetimefield >= DATEADD(MINUTE, @offset, GETDATE()) THEN 1 END) AS Circuit1_ON,
  COUNT(CASE WHEN d.TAG1 = 1 AND a.TAG6 = 1 AND d.datetimefield >= DATEADD(MINUTE, @offset, GETDATE()) THEN 1 END) AS Circuit1_OFF,
  COUNT(CASE WHEN d.TAG7 = 0 AND a.TAG6 = 1 AND d.datetimefield >= DATEADD(MINUTE, @offset, GETDATE()) THEN 1 END) AS Circuit1_Normal,
  COUNT(CASE WHEN d.TAG7 = 1 AND a.TAG6 = 1 AND d.datetimefield >= DATEADD(MINUTE, @offset, GETDATE()) THEN 1 END) AS Circuit1_Trip,
  
  -- Circuit-2 (Three Phase)
  COUNT(CASE WHEN d.TAG3 = 0 AND a.TAG6 = 2 AND d.datetimefield >= DATEADD(MINUTE, @offset, GETDATE()) THEN 1 END) AS Circuit2_ON,
  COUNT(CASE WHEN d.TAG3 = 1 AND a.TAG6 = 2 AND d.datetimefield >= DATEADD(MINUTE, @offset, GETDATE()) THEN 1 END) AS Circuit2_OFF,
  COUNT(CASE WHEN d.TAG9 = 0 AND a.TAG6 = 2 AND d.datetimefield >= DATEADD(MINUTE, @offset, GETDATE()) THEN 1 END) AS Circuit2_Normal,
  COUNT(CASE WHEN d.TAG9 = 1 AND a.TAG6 = 2 AND d.datetimefield >= DATEADD(MINUTE, @offset, GETDATE()) THEN 1 END) AS Circuit2_Trip
  
FROM DIGITALSPOTDATA d 
LEFT JOIN ANALOGSPOTDATA a WITH(NOLOCK) ON a.DATETIMEFIELD=d.DATETIMEFIELD 
  AND a.RTUNUMBER=d.RTUNUMBER AND a.CLIENTID=d.CLIENTID
INNER JOIN SLCMappings s WITH(NOLOCK) ON s.CLIENTID = d.clientid AND d.RTUNUMBER = s.RTUNUMBER
WHERE d.ClientID = @clientid;
```

---

## 8. DATA QUALITY CHECKS

### Check for Missing Data
```sql
-- Feeders with no recent data
SELECT r.RTUNUMBER, r.description, MAX(d.datetimefield) AS LastSeen
FROM rtumaster r
LEFT JOIN DIGITALSPOTDATA d ON r.RTUNUMBER = d.RTUNUMBER AND r.CLIENTID = d.CLIENTID
WHERE r.CLIENTID = @clientid
GROUP BY r.RTUNUMBER, r.description
HAVING MAX(d.datetimefield) < DATEADD(HOUR, -24, GETDATE()) OR MAX(d.datetimefield) IS NULL
ORDER BY LastSeen;
```

### Check TAG Value Distributions
```sql
-- Verify TAG values are within expected ranges
SELECT 
  'TAG1' AS TagName,
  TAG1 AS Value,
  COUNT(*) AS Count
FROM DIGITALSPOTDATA
WHERE CLIENTID = @clientid
GROUP BY TAG1

UNION ALL

SELECT 
  'TAG3' AS TagName,
  TAG3 AS Value,
  COUNT(*) AS Count
FROM DIGITALSPOTDATA
WHERE CLIENTID = @clientid
GROUP BY TAG3

UNION ALL

SELECT 
  'TAG7' AS TagName,
  TAG7 AS Value,
  COUNT(*) AS Count
FROM DIGITALSPOTDATA
WHERE CLIENTID = @clientid
GROUP BY TAG7

UNION ALL

SELECT 
  'TAG8' AS TagName,
  TAG8 AS Value,
  COUNT(*) AS Count
FROM DIGITALSPOTDATA
WHERE CLIENTID = @clientid
GROUP BY TAG8

UNION ALL

SELECT 
  'TAG9' AS TagName,
  TAG9 AS Value,
  COUNT(*) AS Count
FROM DIGITALSPOTDATA
WHERE CLIENTID = @clientid
GROUP BY TAG9

UNION ALL

SELECT 
  'TAG16' AS TagName,
  TAG16 AS Value,
  COUNT(*) AS Count
FROM DIGITALSPOTDATA
WHERE CLIENTID = @clientid
GROUP BY TAG16

ORDER BY TagName, Value;
```

### Check Join Integrity
```sql
-- Verify all RTUs have proper mappings
SELECT 
  d.RTUNUMBER,
  CASE WHEN s.RTUNUMBER IS NULL THEN 'Missing SLCMapping' ELSE 'OK' END AS SLCMapping,
  CASE WHEN r.RTUNUMBER IS NULL THEN 'Missing RTUMaster' ELSE 'OK' END AS RTUMaster,
  CASE WHEN a.RTUNUMBER IS NULL THEN 'Missing AnalogData' ELSE 'OK' END AS AnalogData
FROM (SELECT DISTINCT RTUNUMBER, CLIENTID FROM DIGITALSPOTDATA WHERE CLIENTID = @clientid) d
LEFT JOIN SLCMappings s ON d.RTUNUMBER = s.RTUNUMBER AND d.CLIENTID = s.CLIENTID
LEFT JOIN rtumaster r ON d.RTUNUMBER = r.RTUNUMBER AND d.CLIENTID = r.CLIENTID
LEFT JOIN (SELECT DISTINCT RTUNUMBER, CLIENTID FROM ANALOGSPOTDATA WHERE CLIENTID = @clientid) a 
  ON d.RTUNUMBER = a.RTUNUMBER AND d.CLIENTID = a.CLIENTID
WHERE s.RTUNUMBER IS NULL OR r.RTUNUMBER IS NULL OR a.RTUNUMBER IS NULL
ORDER BY d.RTUNUMBER;
```

---

## 9. PERFORMANCE MONITORING

### Query Execution Time Test
```sql
SET STATISTICS TIME ON;
SET STATISTICS IO ON;

-- Test communication query performance
SELECT COUNT(*) AS Communicating
FROM DIGITALSPOTDATA d 
INNER JOIN SLCMappings s WITH(NOLOCK) ON s.CLIENTID = d.clientid AND d.RTUNUMBER = s.RTUNUMBER
INNER JOIN rtumaster r WITH(NOLOCK) ON d.CLIENTID = r.clientid AND d.RTUNUMBER = r.RTUNUMBER
WHERE d.ClientID = @clientid 
  AND d.TAG8 = 1;

SET STATISTICS TIME OFF;
SET STATISTICS IO OFF;
```

### Index Usage Analysis
```sql
-- Check if indexes are being used
SELECT 
  OBJECT_NAME(s.object_id) AS TableName,
  i.name AS IndexName,
  s.user_seeks,
  s.user_scans,
  s.user_lookups,
  s.user_updates
FROM sys.dm_db_index_usage_stats s
INNER JOIN sys.indexes i ON s.object_id = i.object_id AND s.index_id = i.index_id
WHERE OBJECT_NAME(s.object_id) IN ('DIGITALSPOTDATA', 'ANALOGSPOTDATA')
ORDER BY TableName, IndexName;
```

---

## 10. TROUBLESHOOTING QUERIES

### Find Discrepancies
```sql
-- Compare UI counts with actual database counts
DECLARE @UI_CKT1_ON INT = 150; -- Replace with value from UI
DECLARE @DB_CKT1_ON INT;

SELECT @DB_CKT1_ON = COUNT(*)
FROM DIGITALSPOTDATA d 
INNER JOIN ANALOGSPOTDATA a WITH(NOLOCK) ON a.DATETIMEFIELD=d.DATETIMEFIELD 
  AND a.RTUNUMBER=d.RTUNUMBER AND a.CLIENTID=d.CLIENTID
WHERE d.ClientID = @clientid
  AND d.TAG1 = 0 
  AND a.TAG6 = 1 
  AND d.datetimefield >= DATEADD(MINUTE, @offset, GETDATE());

SELECT 
  'Circuit-1 ON' AS Metric,
  @UI_CKT1_ON AS UI_Value,
  @DB_CKT1_ON AS DB_Value,
  @UI_CKT1_ON - @DB_CKT1_ON AS Difference,
  CASE WHEN @UI_CKT1_ON = @DB_CKT1_ON THEN 'MATCH' ELSE 'MISMATCH' END AS Status;
```

### Recent Data Activity
```sql
-- Check recent data insertion activity
SELECT 
  DATEPART(HOUR, datetimefield) AS Hour,
  COUNT(*) AS RecordCount
FROM DIGITALSPOTDATA
WHERE CLIENTID = @clientid
  AND datetimefield >= DATEADD(HOUR, -24, GETDATE())
GROUP BY DATEPART(HOUR, datetimefield)
ORDER BY Hour;
```

---

## Usage Instructions

1. **Set Variables:** Update `@clientid` and `@offset` at the beginning
2. **Run Queries:** Execute queries individually or in groups
3. **Compare Results:** Match counts with summaryN.php dashboard
4. **Investigate Discrepancies:** Use troubleshooting queries if counts don't match
5. **Monitor Performance:** Use performance queries to optimize slow queries

---

## Notes

- All queries use `WITH(NOLOCK)` to prevent blocking
- Time filters use `DATEADD` for dynamic date ranges
- Replace `@clientid` with your actual client ID
- Adjust `@offset` if using different time windows
- Results should match the dashboard within seconds (due to 1-second refresh)
