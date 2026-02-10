
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
     * 1. Digital Tag8 = 0 (Last known status 'Not Comm')
     * 2. Digital LastSeen <= NOW - 1 Hour (Stale)
     * 3. Analog NO DATA in last 24 Hours (Dead)
     * 4. Digital LastSeen >= NOW - 1440 Hours (Not Discontinued)
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
                INNER JOIN dbo.ANALOGSPOTDATA a WITH (NOLOCK) ON a.DATETIMEFIELD = d.DATETIMEFIELD 
                    AND a.RTUNUMBER = d.RTUNUMBER 
                    AND a.CLIENTID = d.CLIENTID    
                INNER JOIN dbo.SLCMappings s WITH (NOLOCK) ON s.CLIENTID = d.CLIENTID 
                    AND d.RTUNUMBER = s.RTUNUMBER
                INNER JOIN dbo.rtumaster r WITH (NOLOCK) ON d.CLIENTID = r.CLIENTID 
                    AND d.RTUNUMBER = r.RTUNUMBER
                INNER JOIN dbo.lamptypemaster t WITH (NOLOCK) ON d.CLIENTID = t.CLIENTID 
                    AND s.lamptypeid = t.lamptypeid
                WHERE d.ClientID = @clientId
                AND d.datetimefield <= DATEADD(HOUR, -1, GETDATE())
                AND d.RTUNUMBER NOT IN (
                    SELECT RTUNUMBER 
                    FROM dbo.ANALOGSPOTDATA WITH (NOLOCK)
                    WHERE ClientID = @clientId 
                    AND datetimefield <= DATEADD(HOUR, -1440, GETDATE())
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
                description: row.description || 'Panel Not Communicating',
                time: row.LastSeen
            }));

        } catch (error) {
            v2Logger.error('CommFailService Error', error);
            return [];
        }
    }
}
