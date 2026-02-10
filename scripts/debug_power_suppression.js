
import { connectToSourceDb } from '../src/db/mssql.js';
import { v2Logger } from '../src/v2/logger.js';

const rtuList = [17, 21, 74, 25, 192, 437];
const clientId = '3';
const dTable = `DigitalData${clientId}`;

async function debugCommFail() {
    try {
        const pool = await connectToSourceDb();
        console.log(`Connected to DB. Checking RTUs: ${rtuList.join(', ')}`);

        for (const rtuId of rtuList) {
            console.log(`\n--- Analyzing RTU ${rtuId} ---`);

            // 1. Check Power Fail Status (Tag16=0 in last 60 mins)
            // Note: PowerFailService lookback is only 60 mins.
            // If the device hasn't comm'd in days, it won't have a Power Fail record in last 60 mins.
            // So Power Fail shouldn't suppress it.

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
