USE [LGL];
GO

SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

/*******************************************************************************
Stored Procedure: [dbo].[usp_Sync_ValidateFaults]
Description:      Simulates the Sync Service Fault Engine logic directly in SQL Server.
                  Checks Master Rules (P1/P2), DI Rules, AI Rules, and Prerequisites.
                  Uses the latest data from DigitalData3 and AnalogData3.
*******************************************************************************/
CREATE OR ALTER PROCEDURE [dbo].[usp_Sync_ValidateFaults]
AS
BEGIN
    SET NOCOUNT ON;

    -- CTE to get the LATEST readings for each RTU
    WITH LatestDigital AS (
        SELECT * FROM (
            SELECT *, ROW_NUMBER() OVER (PARTITION BY RTUNumber ORDER BY DateTimeField DESC) as rnk
            FROM dbo.DigitalData3
        ) d WHERE rnk = 1
    ),
    LatestAnalog AS (
        SELECT * FROM (
            SELECT *, ROW_NUMBER() OVER (PARTITION BY RTUNumber ORDER BY DateTimeField DESC) as rnk
            FROM dbo.AnalogData3
        ) a WHERE rnk = 1
    ),
    CombinedData AS (
        SELECT 
            ISNULL(d.RTUNumber, a.RTUNumber) as RTUNumber,
            ISNULL(d.DateTimeField, a.DateTimeField) as LastCommunication,
            -- Digital Tags
            d.Tag1, d.Tag7, d.Tag8, d.Tag9, d.Tag16,
            -- Analog Tags
            a.Tag5, a.Tag6
        FROM LatestDigital d
        FULL OUTER JOIN LatestAnalog a ON d.RTUNumber = a.RTUNumber
    ),
    EvaluatedRules AS (
        SELECT 
            RTUNumber,
            LastCommunication,
            Tag1, Tag5, Tag6, Tag8, Tag16, -- DEBUG COLUMNS
            
            -- MASTER RULES (PRIORITY 1)
            CASE 
                WHEN Tag8 = 0 THEN 'MASTER_OVERRIDE (P1): Panel Not Communicating'
                WHEN Tag16 = 0 THEN 'MASTER_OVERRIDE (P1): Power Supply Not Available'
                ELSE NULL
            END as P1_MasterFault,

            -- DI RULES (Only if no P1)
            CASE 
                WHEN Tag8 <> 0 AND Tag16 <> 0 THEN
                    CASE 
                        WHEN Tag7 = 1 THEN 'DI_FAULT: Circuit 1 Trip'
                        WHEN Tag9 = 1 AND Tag6 = 2 THEN 'DI_FAULT: Circuit 2 Trip (Prereq Tag6=2 Met)'
                        ELSE NULL
                    END
                ELSE NULL
            END as DI_Fault,

            -- AI RULES (Only if no P1)
            CASE 
                WHEN Tag8 <> 0 AND Tag16 <> 0 THEN
                    CASE 
                        WHEN Tag5 < 0.10 AND Tag1 = 0 THEN 'AI_FAULT: Lamp Failure (Prereq Tag1=0 Met)'
                        ELSE NULL
                    END
                ELSE NULL
            END as AI_Fault
            
        FROM CombinedData
    )
    -- FINAL RESULTS: Show everything detected
    SELECT 
        RTUNumber,
        LastCommunication,
        Tag1 as [DI:Tag1], 
        Tag5 as [AI:Tag5],
        ISNULL(P1_MasterFault, ISNULL(DI_Fault, ISNULL(AI_Fault, 'OK'))) as Status,
        CASE 
            WHEN P1_MasterFault IS NOT NULL THEN 'CRITICAL'
            WHEN DI_Fault IS NOT NULL THEN 'CRITICAL'
            WHEN AI_Fault IS NOT NULL THEN 'WARNING'
            ELSE 'INFO'
        END as Severity,
        COALESCE(P1_MasterFault, DI_Fault, AI_Fault) as FaultDescription
    FROM EvaluatedRules
    ORDER BY Severity DESC, RTUNumber ASC;
END;
GO
