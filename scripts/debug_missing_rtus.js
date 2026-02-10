
import { connectToSourceDb } from '../src/db/mssql.js';
import { v2Logger } from '../src/v2/logger.js';

const rtuList = [651, 708, 723, 1403];
const clientId = '3';
const dTable = `DigitalData${clientId}`;
const aTable = `AnalogData${clientId}`;

async function debugCommFail() {
    try {
        const pool = await connectToSourceDb();
        console.log(`Connected to DB. Checking RTUs: ${rtuList.join(', ')}`);

        for (const rtuId of rtuList) {
            console.log(`\n--- Analyzing RTU ${rtuId} ---`);

            // 1. Get Latest Digital Record
            const latestDigitalQuery = `
                SELECT TOP 1 *
                FROM dbo.[${dTable}]
                WHERE RTUNumber = ${rtuId}
                ORDER BY DateTimeField DESC
            `;
            const digitalResult = await pool.request().query(latestDigitalQuery);
            const digital = digitalResult.recordset[0];

            if (!digital) {
                console.log(`[DIGITAL] No records found.`);
            } else {
                console.log(`[DIGITAL] Last Seen: ${digital.DateTimeField.toISOString()}`);
                console.log(`[DIGITAL] Tag8 Value: ${digital.Tag8}`);

                const hoursSinceLastSeen = (new Date() - digital.DateTimeField) / (1000 * 60 * 60);
                console.log(`[DIGITAL] Hours Since Last Seen: ${hoursSinceLastSeen.toFixed(2)}`);
            }

            // 2. Check Analog Data in last 24 hours
            const analogQuery = `
                SELECT TOP 1 *
                FROM dbo.[${aTable}]
                WHERE RTUNumber = ${rtuId}
                AND DateTimeField >= DATEADD(HOUR, -24, GETDATE())
            `;
            const analogResult = await pool.request().query(analogQuery);
            const analog = analogResult.recordset[0];

            if (analog) {
                console.warn(`[ANALOG] Found Analog Data in last 24h: ${analog.DateTimeField.toISOString()} (Alive)`);
            } else {
                console.log(`[ANALOG] No Analog Data in last 24h (Confirming Dead)`);
            }

            // 3. Check Power Fail Status
            const powerQuery = `
                 SELECT TOP 1 *
                 FROM dbo.[${dTable}]
                 WHERE RTUNumber = ${rtuId}
                 AND DateTimeField >= DATEADD(MINUTE, -60, GETDATE())
                 AND Tag16 = 0
            `;
            const powerResult = await pool.request().query(powerQuery);
            if (powerResult.recordset.length > 0) {
                console.log(`[POWER] Power Fail Detected (Tag16=0 in last 60m). This SUPPRESSES Comm Fail.`);
            } else {
                console.log(`[POWER] No Power Fail in last 60m.`);
            }
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        process.exit();
    }
}

debugCommFail();
