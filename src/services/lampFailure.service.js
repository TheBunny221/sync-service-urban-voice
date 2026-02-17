
import { connectToSourceDb } from '../db/mssql.js';
import { getConfig } from '../config/configLoader.js';
import { v2Logger } from '../logger.js';

export class LampFailureService {
    constructor() {
        this.config = getConfig();
    }

    async detect(sinceDate) {
        try {
            const digitalTable = `DigitalData${this.config.syncRules.clientId}`;
            const analogTable = `AnalogData${this.config.syncRules.clientId}`;

            const pool = await connectToSourceDb();

            const query = `
                WITH LatestDigital AS (
                    SELECT RTUNumber, DateTimeField, Tag1, Tag3,
                           ROW_NUMBER() OVER (PARTITION BY RTUNumber ORDER BY DateTimeField DESC) as rn
                    FROM dbo.[${digitalTable}]
                    WHERE DateTimeField >= DATEADD(HOUR, -24, GETDATE())
                ),
                LatestAnalog AS (
                     SELECT RTUNumber, Tag6, Tag15, Tag16, Tag17,
                            ROW_NUMBER() OVER (PARTITION BY RTUNumber ORDER BY DateTimeField DESC) as rn
                     FROM dbo.[${analogTable}]
                     WHERE DateTimeField >= DATEADD(HOUR, -24, GETDATE())
                )
                SELECT 
                    d.RTUNumber, d.DateTimeField,
                    d.Tag1, d.Tag3,
                    a.Tag6 as CircuitType,
                    a.Tag15, a.Tag16, a.Tag17,
                    m.TotalLED as TotalFixtures
                FROM LatestDigital d
                INNER JOIN LatestAnalog a ON d.RTUNumber = a.RTUNumber AND a.rn = 1
                LEFT JOIN dbo.RtuMaster m ON d.RTUNumber = m.RTUNumber
                WHERE d.rn = 1
            `;

            const result = await pool.request()
                // .input('since', sinceDate) // Not used anymore
                .query(query);

            const faults = [];
            for (const row of result.recordset) {
                const isThreePhase = row.CircuitType == 2;
                const total = row.TotalFixtures || 0;
                if (total === 0) continue;

                let faulty = 0;

                // Phase R (Tag15)
                // Include if Circuit 1 is ON (Tag1==0) OR if it's a 100% failure (Tag15 >= Total)
                const rVal = Number(row.Tag15) || 0;
                if (row.Tag1 == 0 || rVal >= total) {
                    faulty += rVal;
                }

                if (isThreePhase) {
                    // Phase Y/B (Tag16/17)
                    // Include if Circuit 2 is ON (Tag3==0) OR if it's a 100% failure (Tag16+Tag17 >= Total)
                    const yVal = Number(row.Tag16) || 0;
                    const bVal = Number(row.Tag17) || 0;

                    if (row.Tag3 == 0 || (yVal + bVal >= total)) {
                        faulty += yVal + bVal;
                    }
                }

                let percent = (faulty * 100) / total;
                if (percent > 100) percent = 100; // Cap at 100%

                if (percent > 0) {
                    faults.push({
                        rtuId: String(row.RTUNumber),
                        type: 'LAMP_FAILURE',
                        tag: 'Tag26', // Virtual tag for the calc
                        val: percent,
                        pct: Math.round(percent),
                        description: `Lamp Failure detected – ${Math.round(percent)}% fixtures down`,
                        time: row.DateTimeField
                    });
                }
            }
            return faults;

        } catch (error) {
            v2Logger.error('LampFailureService Error', error);
            return [];
        }
    }
}
