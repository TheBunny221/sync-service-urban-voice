
import { connectToSourceDb } from '../db/mssql.js';
import { getConfig } from '../config/configLoader.js';
import { v2Logger } from '../logger.js';

export class TripService {
    constructor() {
        this.config = getConfig();
    }

    async detect(sinceDate) {
        try {
            const table = `DigitalData${this.config.syncRules.clientId}`;
            const aTable = `AnalogData${this.config.syncRules.clientId}`; // For Phase check (Tag6)
            const pool = await connectToSourceDb();

            // We need to join Digital and Analog to check Phase status?
            // Or typically they come in pairs?
            // "Digital TAG7=1 AND Analog TAG6=1"
            // The timestamps might slighty differ. 
            // Better approach: Get Digital Trips in window, then check latest Analog for that RTU?

            // Look back 24 hours to match UI "daily status" view and catch persistent trips
            // NOT relying on 'since' ensures we report active trips even if sync restarted.
            const lookback = new Date(Date.now() - 24 * 60 * 60 * 1000);

            const query = `
                 WITH LatestDigital AS (
                    SELECT RTUNumber, Tag7, Tag9, DateTimeField,
                           ROW_NUMBER() OVER (PARTITION BY RTUNumber ORDER BY DateTimeField DESC) as rn
                    FROM dbo.[${table}]
                    WHERE DateTimeField >= @lookback
                ),
                LatestAnalog AS (
                    SELECT RTUNumber, Tag6
                    FROM dbo.[${aTable}]
                    WHERE DateTimeField >= DATEADD(HOUR, -24, GETDATE()) -- Recent analog status
                ) -- Wait, getting *latest* analog for the *entire* set is expensive inside CTE if table is huge.
                
                -- Let's optimize: Fetch Digital Candidates, then check Analog in JS or via specific subquery?
                -- Subquery is safer for consistency.
                
                SELECT 
                    d.RTUNumber, d.DateTimeField, d.Tag7, d.Tag9,
                    (SELECT TOP 1 Tag6 FROM dbo.[${aTable}] a WHERE a.RTUNumber = d.RTUNumber ORDER BY DateTimeField DESC) as PhaseStatus
                FROM LatestDigital d
                WHERE d.rn = 1 AND (d.Tag7 = 1 OR d.Tag9 = 1)
            `;

            const result = await pool.request()
                .input('lookback', lookback)
                .query(query);

            const faults = [];
            for (const row of result.recordset) {
                const rtuId = String(row.RTUNumber);
                const tag6 = row.PhaseStatus;

                // Single Phase Trip
                // Loose equality (==) to handle BIT fields returning true/1
                if (row.Tag7 == 1 && tag6 == 1) {
                    faults.push({
                        rtuId,
                        type: 'SINGLE_PHASE_TRIP',
                        tag: 'Tag7',
                        val: 1,
                        description: 'Single Phase Circuit Trip',
                        time: row.DateTimeField
                    });
                }

                // Three Phase Trip
                if (row.Tag9 == 1 && tag6 == 2) {
                    faults.push({
                        rtuId,
                        type: 'THREE_PHASE_TRIP',
                        tag: 'Tag9',
                        val: 1,
                        description: 'Three Phase Circuit Trip',
                        time: row.DateTimeField
                    });
                }
            }
            return faults;

        } catch (error) {
            v2Logger.error('TripService Error', error);
            return [];
        }
    }
}
