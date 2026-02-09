# SummaryN.php - Complete Technical Documentation

## Overview
This document provides a comprehensive analysis of the LED Streetlight Project's summary dashboard system, including fault identification logic, database filtration parameters, and data flow architecture.

---

## System Architecture

### Files Involved
1. **summaryN.php** - Frontend dashboard display
2. **sgetdata.php** - Backend data aggregation API
3. **summaryajax.js** - AJAX polling and UI updates
4. **sreport.php** - Detailed report generation
5. **dbconnect.php** - Database connection configuration

### Data Flow
```
Browser → summaryN.php (UI)
    ↓
summaryajax.js (AJAX every 1 second)
    ↓
sgetdata.php (SQL Queries)
    ↓
SQL Server Database (DIGITALSPOTDATA, ANALOGSPOTDATA tables)
    ↓
JSON Response → Update UI Elements
```

---

## Database Schema

### Primary Tables

#### 1. DIGITALSPOTDATA
Stores digital sensor readings (binary states: ON/OFF, TRIP/NORMAL, etc.)

**Key Columns:**
- `RTUNUMBER` - Feeder/RTU identifier
- `CLIENTID` - Client identifier
- `datetimefield` - Timestamp of reading
- `TAG1` - Circuit-1 Status (0=ON, 1=OFF)
- `TAG2` - Photocell Status (0=ACTIVE, 1=NORMAL)
- `TAG3` - Circuit-2 Status (0=ON, 1=OFF)
- `TAG5` - Door Status
- `TAG6` - ELR Status
- `TAG7` - Circuit-1 Trip Status (0=NORMAL, 1=TRIP)
- `TAG8` - Communication Status (0=FAIL, 1=OK)
- `TAG9` - Circuit-2 Trip Status (0=NORMAL, 1=TRIP)
- `TAG16` - Power Status (0=FAIL, 1=NORMAL)
- `TAG26` - Low Power Factor Flag
- `TAG30` - Low Power Factor Circuit

#### 2. ANALOGSPOTDATA
Stores analog sensor readings (voltage, current, power, etc.)

**Key Columns:**
- `RTUNUMBER` - Feeder/RTU identifier
- `CLIENTID` - Client identifier
- `datetimefield` - Timestamp of reading
- `TAG4` - Cumulative KWH
- `TAG6` - Circuit Type (1=Single Phase, 2=Three Phase)
- `TAG13` - Dimming Level
- `TAG14` - Run Hours
- `TAG16` - Power Reading

#### 3. Supporting Tables
- **SLCMappings** - Maps RTU to lamp types
- **rtumaster** - RTU/Feeder master data (description, location)
- **lamptypemaster** - Lamp type specifications

---

## Fault Identification Logic

### Time-Based Filtering
**Global Time Offset:** `-60 minutes` (last 1 hour of data)

```php
$offset = -60;
// Used in queries as: DATEADD(MINUTE, -60, GETDATE())
```

### Status Categories

## 1. OVERALL STATUS

### Total CCMS Panels
**Display ID:** `#int`
**Value:** Hardcoded `1506`
**Logic:** Static count of total installed panels

### Total Commissioned
**Display ID:** `#ope`
**SQL Query:**
```sql
SELECT count(*) as operational
FROM ANALOGSPOTDATA d 
INNER JOIN DIGITALSPOTDATA a ON a.CLIENTID = d.clientid AND d.RTUNUMBER = a.RTUNUMBER
INNER JOIN SLCMappings s ON s.CLIENTID = d.clientid AND d.RTUNUMBER = s.RTUNUMBER
INNER JOIN rtumaster r ON d.CLIENTID = r.clientid AND d.RTUNUMBER = r.RTUNUMBER
INNER JOIN lamptypemaster t ON d.CLIENTID = t.clientid AND s.lamptypeid = t.lamptypeid
WHERE d.ClientID = {clientid}
  AND a.TAG8 = 0 
  AND a.TAG13 = 1 
  AND a.TAG15 = 0
```

**Validation Parameters:**
- `TAG8 = 0` - DCU Normal
- `TAG13 = 1` - Dimming Active
- `TAG15 = 0` - Specific operational flag

---

## 2. COMMUNICATION STATUS

### Communicating
**Display ID:** `#COMOK_DI8`
**SQL Query:**
```sql
SELECT count(*) AS [COMOK] 
FROM DIGITALSPOTDATA d 
INNER JOIN SLCMappings s ON s.CLIENTID = d.clientid AND d.RTUNUMBER = s.RTUNUMBER
INNER JOIN rtumaster r ON d.CLIENTID = r.clientid AND d.RTUNUMBER = r.RTUNUMBER
INNER JOIN lamptypemaster t ON d.CLIENTID = t.clientid AND s.lamptypeid = t.lamptypeid
WHERE d.ClientID = {clientid} 
  AND d.TAG8 = 1
```

**Validation Parameters:**
- `TAG8 = 1` - Communication OK

### Not Communicating
**Display ID:** `#COMFAIL_DI8`
**SQL Query:**
```sql
SELECT count(*) AS [COMFAIL] 
FROM DIGITALSPOTDATA d 
INNER JOIN SLCMappings s ON s.CLIENTID = d.clientid AND d.RTUNUMBER = s.RTUNUMBER
INNER JOIN rtumaster r ON d.CLIENTID = r.clientid AND d.RTUNUMBER = r.RTUNUMBER
INNER JOIN lamptypemaster t ON d.CLIENTID = t.clientid AND s.lamptypeid = t.lamptypeid
WHERE d.ClientID = {clientid}  
  AND d.TAG8 = 0 
  AND d.datetimefield <= DATEADD(HOUR, -1, GETDATE()) 
  AND d.RTUNUMBER NOT IN (
    SELECT RTUNUMBER FROM ANALOGSPOTDATA 
    WHERE datetimefield <= DATEADD(HOUR, -1440, GETDATE())
      AND ClientID = {clientid}
  )
```

**Validation Parameters:**
- `TAG8 = 0` - Communication Failed
- `datetimefield <= -1 hour` - No data in last hour
- `NOT IN (last 1440 hours)` - Exclude very old inactive devices

---

## 3. FEEDER POWER STATUS

### Power Available
**Display ID:** `#pono`
**SQL Query:**
```sql
SELECT count(*) AS [PWNORMAL] 
FROM DIGITALSPOTDATA d 
INNER JOIN SLCMappings s ON s.CLIENTID = d.clientid AND d.RTUNUMBER = s.RTUNUMBER
INNER JOIN rtumaster r ON d.CLIENTID = r.clientid AND d.RTUNUMBER = r.RTUNUMBER
INNER JOIN lamptypemaster t ON d.CLIENTID = t.clientid AND s.lamptypeid = t.lamptypeid
WHERE s.LampTypeId IN ('{lamptypeid}', '{lamptypeid3}') 
  AND d.ClientID = {clientid}
  AND TAG16 = 1 
  AND d.datetimefield >= DATEADD(MINUTE, -60, GETDATE())
```

**Validation Parameters:**
- `TAG16 = 1` - Power Normal
- Last 60 minutes data

### Power Un-Available
**Display ID:** `#pof`
**SQL Query:**
```sql
SELECT count(*) AS [PWFAIL] 
FROM DIGITALSPOTDATA d 
INNER JOIN SLCMappings s ON s.CLIENTID = d.clientid AND d.RTUNUMBER = s.RTUNUMBER
INNER JOIN rtumaster r ON d.CLIENTID = r.clientid AND d.RTUNUMBER = r.RTUNUMBER
INNER JOIN lamptypemaster t ON d.CLIENTID = t.clientid AND s.lamptypeid = t.lamptypeid
WHERE d.ClientID = {clientid}
  AND TAG16 = 0 
  AND d.datetimefield >= DATEADD(MINUTE, -60, GETDATE())
```

**Validation Parameters:**
- `TAG16 = 0` - Power Fail
- Last 60 minutes data

---

## 4. FEEDER ON/OFF STATUS

### Single Phase ON (Circuit-1 ON)
**Display ID:** `#OnCKT1_DI1`
**SQL Query:**
```sql
SELECT count(*) AS [ON] 
FROM DIGITALSPOTDATA d 
INNER JOIN ANALOGSPOTDATA a ON a.DATETIMEFIELD=d.DATETIMEFIELD 
  AND a.RTUNUMBER=d.RTUNUMBER 
  AND a.CLIENTID=d.CLIENTID
INNER JOIN SLCMappings s ON s.CLIENTID = d.clientid AND d.RTUNUMBER = s.RTUNUMBER
INNER JOIN rtumaster r ON d.CLIENTID = r.clientid AND d.RTUNUMBER = r.RTUNUMBER
INNER JOIN lamptypemaster t ON d.CLIENTID = t.clientid AND s.lamptypeid = t.lamptypeid
WHERE d.ClientID = {clientid}
  AND d.TAG1 = 0 
  AND a.TAG6 = 1 
  AND d.datetimefield >= DATEADD(MINUTE, -60, GETDATE())
```

**Validation Parameters:**
- `TAG1 = 0` - Circuit-1 ON
- `TAG6 = 1` - Single Phase Circuit
- Last 60 minutes data

### Single Phase OFF (Circuit-1 OFF)
**Display ID:** `#OffCKT1_DI1`
**SQL Query:**
```sql
SELECT count(*) AS [OFF] 
FROM DIGITALSPOTDATA d 
INNER JOIN ANALOGSPOTDATA a ON a.DATETIMEFIELD=d.DATETIMEFIELD 
  AND a.RTUNUMBER=d.RTUNUMBER 
  AND a.CLIENTID=d.CLIENTID
INNER JOIN SLCMappings s ON s.CLIENTID = d.clientid AND d.RTUNUMBER = s.RTUNUMBER
INNER JOIN rtumaster r ON d.CLIENTID = r.clientid AND d.RTUNUMBER = r.RTUNUMBER
INNER JOIN lamptypemaster t ON d.CLIENTID = t.clientid AND s.lamptypeid = t.lamptypeid
WHERE d.ClientID = {clientid}
  AND d.TAG1 = 1 
  AND a.TAG6 = 1 
  AND d.datetimefield >= DATEADD(MINUTE, -60, GETDATE())
```

**Validation Parameters:**
- `TAG1 = 1` - Circuit-1 OFF
- `TAG6 = 1` - Single Phase Circuit
- Last 60 minutes data

### Three Phase ON (Circuit-2 ON)
**Display ID:** `#OnCKT2_DI3`
**SQL Query:**
```sql
SELECT count(*) AS [ON] 
FROM DIGITALSPOTDATA d 
INNER JOIN ANALOGSPOTDATA a ON a.DATETIMEFIELD=d.DATETIMEFIELD 
  AND a.RTUNUMBER=d.RTUNUMBER 
  AND a.CLIENTID=d.CLIENTID
INNER JOIN SLCMappings s ON s.CLIENTID = d.clientid AND d.RTUNUMBER = s.RTUNUMBER
INNER JOIN rtumaster r ON d.CLIENTID = r.clientid AND d.RTUNUMBER = r.RTUNUMBER
INNER JOIN lamptypemaster t ON d.CLIENTID = t.clientid AND s.lamptypeid = t.lamptypeid
WHERE d.ClientID = {clientid}
  AND d.TAG3 = 0 
  AND a.TAG6 = 2 
  AND d.datetimefield >= DATEADD(MINUTE, -60, GETDATE())
```

**Validation Parameters:**
- `TAG3 = 0` - Circuit-2 ON
- `TAG6 = 2` - Three Phase Circuit
- Last 60 minutes data

### Three Phase OFF (Circuit-2 OFF)
**Display ID:** `#OffCKT2_DI3`
**SQL Query:**
```sql
SELECT count(*) AS [OFF] 
FROM DIGITALSPOTDATA d 
INNER JOIN ANALOGSPOTDATA a ON a.DATETIMEFIELD=d.DATETIMEFIELD 
  AND a.RTUNUMBER=d.RTUNUMBER 
  AND a.CLIENTID=d.CLIENTID
INNER JOIN SLCMappings s ON s.CLIENTID = d.clientid AND d.RTUNUMBER = s.RTUNUMBER
INNER JOIN rtumaster r ON d.CLIENTID = r.clientid AND d.RTUNUMBER = r.RTUNUMBER
INNER JOIN lamptypemaster t ON d.CLIENTID = t.clientid AND s.lamptypeid = t.lamptypeid
WHERE d.ClientID = {clientid}
  AND d.TAG3 = 1 
  AND a.TAG6 = 2 
  AND d.datetimefield >= DATEADD(MINUTE, -60, GETDATE())
```

**Validation Parameters:**
- `TAG3 = 1` - Circuit-2 OFF
- `TAG6 = 2` - Three Phase Circuit
- Last 60 minutes data

---

## 5. FEEDER TRIP STATUS

### Single Phase Normal (Circuit-1 Normal)
**Display ID:** `#CKT1TripNormal`
**SQL Query:**
```sql
SELECT count(*) AS [CKT1TripNormal] 
FROM DIGITALSPOTDATA d 
INNER JOIN ANALOGSPOTDATA a ON a.DATETIMEFIELD=d.DATETIMEFIELD 
  AND a.RTUNUMBER=d.RTUNUMBER 
  AND a.CLIENTID=d.CLIENTID
INNER JOIN SLCMappings s ON s.CLIENTID = d.clientid AND d.RTUNUMBER = s.RTUNUMBER
INNER JOIN rtumaster r ON d.CLIENTID = r.clientid AND d.RTUNUMBER = r.RTUNUMBER
INNER JOIN lamptypemaster t ON d.CLIENTID = t.clientid AND s.lamptypeid = t.lamptypeid
WHERE d.ClientID = {clientid}
  AND d.TAG7 = 0 
  AND a.TAG6 = 1 
  AND d.datetimefield >= DATEADD(MINUTE, -60, GETDATE())
```

**Validation Parameters:**
- `TAG7 = 0` - Circuit-1 Trip Normal
- `TAG6 = 1` - Single Phase Circuit
- Last 60 minutes data

### Single Phase Trip (Circuit-1 Trip)
**Display ID:** `#CKT1Trip`
**SQL Query:**
```sql
SELECT count(*) AS [CKT1Trip] 
FROM DIGITALSPOTDATA d 
INNER JOIN ANALOGSPOTDATA a ON a.DATETIMEFIELD=d.DATETIMEFIELD 
  AND a.RTUNUMBER=d.RTUNUMBER 
  AND a.CLIENTID=d.CLIENTID
INNER JOIN SLCMappings s ON s.CLIENTID = d.clientid AND d.RTUNUMBER = s.RTUNUMBER
INNER JOIN rtumaster r ON d.CLIENTID = r.clientid AND d.RTUNUMBER = r.RTUNUMBER
INNER JOIN lamptypemaster t ON d.CLIENTID = t.clientid AND s.lamptypeid = t.lamptypeid
WHERE d.ClientID = {clientid}
  AND d.TAG7 = 1 
  AND a.TAG6 = 1 
  AND d.datetimefield >= DATEADD(MINUTE, -60, GETDATE())
```

**Validation Parameters:**
- `TAG7 = 1` - Circuit-1 Trip Fault
- `TAG6 = 1` - Single Phase Circuit
- Last 60 minutes data

### Three Phase Normal (Circuit-2 Normal)
**Display ID:** `#CKT2TripNormal`
**SQL Query:**
```sql
SELECT count(*) AS [CKT2TripNormal] 
FROM DIGITALSPOTDATA d 
INNER JOIN ANALOGSPOTDATA a ON a.DATETIMEFIELD=d.DATETIMEFIELD 
  AND a.RTUNUMBER=d.RTUNUMBER 
  AND a.CLIENTID=d.CLIENTID
INNER JOIN SLCMappings s ON s.CLIENTID = d.clientid AND d.RTUNUMBER = s.RTUNUMBER
INNER JOIN rtumaster r ON d.CLIENTID = r.clientid AND d.RTUNUMBER = r.RTUNUMBER
INNER JOIN lamptypemaster t ON d.CLIENTID = t.clientid AND s.lamptypeid = t.lamptypeid
WHERE d.ClientID = {clientid}
  AND d.TAG9 = 0 
  AND a.TAG6 = 2 
  AND d.datetimefield >= DATEADD(MINUTE, -60, GETDATE())
```

**Validation Parameters:**
- `TAG9 = 0` - Circuit-2 Trip Normal
- `TAG6 = 2` - Three Phase Circuit
- Last 60 minutes data

### Three Phase Trip (Circuit-2 Trip)
**Display ID:** `#CKT2Trip`
**SQL Query:**
```sql
SELECT count(*) AS [CKT2Trip] 
FROM DIGITALSPOTDATA d 
INNER JOIN ANALOGSPOTDATA a ON a.DATETIMEFIELD=d.DATETIMEFIELD 
  AND a.RTUNUMBER=d.RTUNUMBER 
  AND a.CLIENTID=d.CLIENTID
INNER JOIN SLCMappings s ON s.CLIENTID = d.clientid AND d.RTUNUMBER = s.RTUNUMBER
INNER JOIN rtumaster r ON d.CLIENTID = r.clientid AND d.RTUNUMBER = r.RTUNUMBER
INNER JOIN lamptypemaster t ON d.CLIENTID = t.clientid AND s.lamptypeid = t.lamptypeid
WHERE d.ClientID = {clientid}
  AND d.TAG9 = 1 
  AND a.TAG6 = 2 
  AND d.datetimefield >= DATEADD(MINUTE, -60, GETDATE())
```

**Validation Parameters:**
- `TAG9 = 1` - Circuit-2 Trip Fault
- `TAG6 = 2` - Three Phase Circuit
- Last 60 minutes data

---

## 6. POWER CONSUMED STATUS

### Cumulative Power Consumed (Today)
**Display ID:** `#rtu_m3`
**SQL Query:**
```sql
SELECT SUM(TAG4) AS [FLOW] 
FROM ANALOGSPOTDATA d 
INNER JOIN SLCMappings s ON s.CLIENTID = d.clientid AND d.RTUNUMBER = s.RTUNUMBER
INNER JOIN rtumaster r ON d.CLIENTID = r.clientid AND d.RTUNUMBER = r.RTUNUMBER
INNER JOIN lamptypemaster t ON d.CLIENTID = t.clientid AND s.lamptypeid = t.lamptypeid
WHERE d.ClientID = {clientid}  
  AND d.datetimefield >= DATEADD(HOUR, -1440, GETDATE())
```

**Validation Parameters:**
- `SUM(TAG4)` - Total cumulative KWH
- Last 1440 hours (60 days) data

---

## Database Validation Parameters Summary

### Critical TAG Mappings

| TAG | Table | Meaning | Values |
|-----|-------|---------|--------|
| TAG1 | DIGITALSPOTDATA | Circuit-1 Status | 0=ON, 1=OFF |
| TAG2 | DIGITALSPOTDATA | Photocell Status | 0=ACTIVE, 1=NORMAL |
| TAG3 | DIGITALSPOTDATA | Circuit-2 Status | 0=ON, 1=OFF |
| TAG4 | ANALOGSPOTDATA | Cumulative KWH | Numeric |
| TAG5 | DIGITALSPOTDATA | Door Status | 0=CLOSED, 1=OPEN |
| TAG6 | ANALOGSPOTDATA | Circuit Type | 1=Single Phase, 2=Three Phase |
| TAG7 | DIGITALSPOTDATA | Circuit-1 Trip | 0=NORMAL, 1=TRIP |
| TAG8 | DIGITALSPOTDATA | Communication | 0=FAIL, 1=OK |
| TAG9 | DIGITALSPOTDATA | Circuit-2 Trip | 0=NORMAL, 1=TRIP |
| TAG13 | ANALOGSPOTDATA | Dimming Level | Numeric (>0 = Dimmed) |
| TAG14 | ANALOGSPOTDATA | Run Hours | Numeric |
| TAG15 | ANALOGSPOTDATA | Operational Flag | 0=Operational |
| TAG16 | DIGITALSPOTDATA | Power Status | 0=FAIL, 1=NORMAL |
| TAG26 | DIGITALSPOTDATA | Low Power Factor | 0=NORMAL, 1=LOW |
| TAG30 | DIGITALSPOTDATA | Circuit Low PF | 0=NORMAL, 1=LOW |

### Time-Based Filters

| Filter | SQL Expression | Purpose |
|--------|---------------|---------|
| Last 1 Hour | `DATEADD(HOUR, -1, GETDATE())` | Recent communication check |
| Last 60 Minutes | `DATEADD(MINUTE, -60, GETDATE())` | Real-time status |
| Last 60 Days | `DATEADD(HOUR, -1440, GETDATE())` | Historical data, power consumption |

### Join Conditions

All queries use these standard joins:
```sql
INNER JOIN SLCMappings s ON s.CLIENTID = d.clientid AND d.RTUNUMBER = s.RTUNUMBER
INNER JOIN rtumaster r ON d.CLIENTID = r.clientid AND d.RTUNUMBER = r.RTUNUMBER
INNER JOIN lamptypemaster t ON d.CLIENTID = t.clientid AND s.lamptypeid = t.lamptypeid
```

**Purpose:**
- Filter by lamp type
- Get feeder descriptions
- Ensure data integrity across tables

---

## AJAX Polling Mechanism

### Refresh Rate
**Interval:** 1000ms (1 second)

### JavaScript Function
```javascript
function repeatAjaxsa() {
    $.ajax({
        url: "sgetData.php",
        method: "POST",
        success: function (data) {
            var responsedata = JSON.parse(data);
            // Update all UI elements
            $('#OnCKT1_DI1').text(responsedata.CKT1ondata[0].ON);
            $('#COMOK_DI8').text(responsedata.COMOK[0].COMOK);
            // ... more updates
        },
        complete: function () {
            setTimeout(repeatAjaxsa, 1000);
        }
    });
}
```

---

## Report Generation (sreport.php)

### URL Parameters
Reports are accessed via JSON-encoded parameters:
```javascript
redirectWithJson('sreport.php', {
    tagname: 'CIRCUIT-1 ON',
    tagnum: 'TAG1',
    tagv: 0
})
```

### Report Types

1. **INSTALLATION** - All installed feeders
2. **OPERATIONAL** - Currently operational feeders
3. **CIRCUIT-1 ON/OFF** - Single phase status
4. **CIRCUIT-2 ON/OFF** - Three phase status
5. **CIRCUIT-1/2 NORMAL/TRIP** - Trip status
6. **COMMUNICATION OK/FAIL** - Communication status
7. **POWER NORMAL/FAIL** - Power availability
8. **RUNhours** - Operating hours
9. **CUMULATIVE KWH** - Power consumption

---

## Database Query Optimization

### Performance Considerations

1. **NOLOCK Hints:** All queries use `WITH (NOLOCK)` to prevent blocking
2. **Indexed Columns:** Queries filter on:
   - `CLIENTID`
   - `RTUNUMBER`
   - `datetimefield`
   - Various TAG columns

3. **Time-Based Partitioning:** Data filtered by recent timestamps

### Recommended Indexes
```sql
CREATE INDEX IX_DIGITALSPOTDATA_ClientRTUTime 
ON DIGITALSPOTDATA(CLIENTID, RTUNUMBER, datetimefield DESC);

CREATE INDEX IX_ANALOGSPOTDATA_ClientRTUTime 
ON ANALOGSPOTDATA(CLIENTID, RTUNUMBER, datetimefield DESC);

CREATE INDEX IX_DIGITALSPOTDATA_Tags 
ON DIGITALSPOTDATA(TAG1, TAG3, TAG7, TAG8, TAG9, TAG16);
```

---

## Testing & Validation Checklist

### Database Validation Steps

1. **Verify TAG Values:**
```sql
-- Check TAG value distributions
SELECT TAG1, COUNT(*) FROM DIGITALSPOTDATA 
WHERE CLIENTID = {clientid} 
GROUP BY TAG1;
```

2. **Validate Time Filters:**
```sql
-- Check data freshness
SELECT MAX(datetimefield), MIN(datetimefield) 
FROM DIGITALSPOTDATA 
WHERE CLIENTID = {clientid};
```

3. **Test Join Integrity:**
```sql
-- Verify all RTUs have mappings
SELECT d.RTUNUMBER 
FROM DIGITALSPOTDATA d
LEFT JOIN SLCMappings s ON d.RTUNUMBER = s.RTUNUMBER
WHERE s.RTUNUMBER IS NULL;
```

4. **Count Validation:**
```sql
-- Compare counts with UI
SELECT 
  COUNT(CASE WHEN TAG1=0 AND TAG6=1 THEN 1 END) AS CKT1_ON,
  COUNT(CASE WHEN TAG1=1 AND TAG6=1 THEN 1 END) AS CKT1_OFF
FROM DIGITALSPOTDATA d
INNER JOIN ANALOGSPOTDATA a ON d.RTUNUMBER=a.RTUNUMBER
WHERE d.CLIENTID = {clientid}
  AND d.datetimefield >= DATEADD(MINUTE, -60, GETDATE());
```

---

## Troubleshooting Guide

### Common Issues

1. **Zero Counts Displayed**
   - Check database connectivity
   - Verify `$clientid` variable in dbconnect.php
   - Confirm data exists in last 60 minutes

2. **Incorrect Counts**
   - Validate TAG value mappings
   - Check time zone settings
   - Verify JOIN conditions

3. **Slow Performance**
   - Add recommended indexes
   - Check query execution plans
   - Consider data archival strategy

4. **Communication Failures Not Showing**
   - Verify TAG8 values
   - Check time-based exclusion logic
   - Confirm ANALOGSPOTDATA has recent entries

---

## Configuration Variables

### dbconnect.php Required Variables
```php
$clientid = 1;              // Client identifier
$LampTypeid1 = 1;           // Primary lamp type
$LampTypeid3 = 3;           // Secondary lamp type
$serverName = "server";     // SQL Server name
$connectionInfo = [...];    // Connection details
$token = "123";             // API token
```

---

## API Response Format

### sgetdata.php JSON Structure
```json
{
  "CKT1ondata": [{"ON": 150}],
  "CKT2ondata": [{"ON": 200}],
  "CKT1offdata": [{"OFF": 50}],
  "CKT2offdata": [{"OFF": 30}],
  "COMOK": [{"COMOK": 1400}],
  "COMFAIL": [{"COMFAIL": 106}],
  "pwnodata": [{"PWNORMAL": 1450}],
  "faildata": [{"PWFAIL": 56}],
  "CKT1TripNormal": [{"CKT1TripNormal": 180}],
  "CKT2TripNormal": [{"CKT2TripNormal": 220}],
  "CKT1Trip": [{"CKT1Trip": 20}],
  "CKT2Trip": [{"CKT2Trip": 10}],
  "flow": [{"FLOW": 12345.67}],
  "twrh": [{"TWRH": 8765.43}]
}
```

---

## Conclusion

This system provides real-time monitoring of LED streetlight infrastructure with:
- **1-second refresh rate** for live status
- **Multiple fault categories** for comprehensive monitoring
- **Time-based filtering** for relevant data
- **Detailed drill-down reports** for investigation
- **Optimized SQL queries** for performance

All counts are validated through specific TAG combinations and time-based filters to ensure accurate fault identification and status reporting.
