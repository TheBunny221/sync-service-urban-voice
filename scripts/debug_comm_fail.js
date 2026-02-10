
import { connectToSourceDb } from '../src/db/mssql.js';
import { v2Logger } from '../src/v2/logger.js';

const rtuList = [17, 21, 74, 25, 192, 437];
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

                if (digital.Tag8 !== 0) {
                    console.warn(`[WARNING] Tag8 is ${digital.Tag8} (Expected 0 for Comm Fail logic)`);
                }
                if (hoursSinceLastSeen < 1) {
                    console.warn(`[WARNING] Less than 1 hour since last seen (Not Stale)`);
                }
                if (hoursSinceLastSeen > 1440) { // 60 days
                    console.warn(`[WARNING] More than 1440 hours (60 days) since last seen (Discontinued/Ignored)`);
                }
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
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        process.exit();
    }
}

debugCommFail();
