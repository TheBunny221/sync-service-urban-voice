
import { connectToSourceDb } from '../db/mssql.js';
import { getConfig } from '../config/configLoader.js';
import { v2Logger } from '../logger.js';

export class CommFailService {
    constructor() {
        this.config = getConfig();
    }

    /**
     * Detects Communication Failures.
     * Logic:
     * 1. Digital LastSeen <= NOW - 1 Hour (Stale)
     * 2. Digital LastSeen >= NOW - 1440 Hours (Not Discontinued/Decommissioned)
     * 3. Analog NO DATA in last 24 Hours (No recent activity on other channels)
     */
    async detect() {
        try {
            const pool = await connectToSourceDb();
            const clientId = this.config.syncRules.clientId;

            const query = `
                SELECT 
                    d.RTUNUMBER, 
                    r.description, 
                    d.datetimefield as LastSeen
                FROM dbo.DIGITALSPOTDATA d WITH (NOLOCK)
                INNER JOIN dbo.rtumaster r WITH (NOLOCK) ON d.CLIENTID = r.CLIENTID 
                    AND d.RTUNUMBER = r.RTUNUMBER
                WHERE d.ClientID = @clientId
                AND d.datetimefield <= DATEADD(HOUR, -1, GETDATE())
                AND d.datetimefield >= DATEADD(HOUR, -1440, GETDATE())
                AND d.RTUNUMBER NOT IN (
                    SELECT RTUNUMBER 
                    FROM dbo.ANALOGSPOTDATA WITH (NOLOCK)
                    WHERE ClientID = @clientId 
                    AND datetimefield >= DATEADD(HOUR, -24, GETDATE())
                )
                ORDER BY d.datetimefield DESC
            `;

            const request = pool.request();
            request.input('clientId', clientId);

            const result = await request.query(query);

            return result.recordset.map(row => ({
                rtuId: String(row.RTUNUMBER),
                type: 'COMMUNICATION_FAIL',
                tag: 'Tag8',
                val: 0,
                description: 'Panel Not Communicating',
                time: row.LastSeen
            }));

        } catch (error) {
            v2Logger.error('CommFailService Error', error);
            return [];
        }
    }
}
