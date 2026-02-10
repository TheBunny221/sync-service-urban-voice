
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const payloadLogger = {
    log: (payload) => {
        try {
            const dateStr = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
            const logDir = path.resolve(__dirname, '../../logs');
            const logFile = path.join(logDir, `cms_payload_${dateStr}.log`);

            // Ensure log directory exists
            if (!fs.existsSync(logDir)) {
                fs.mkdirSync(logDir, { recursive: true });
            }

            const logEntry = JSON.stringify({
                timestamp: new Date().toISOString(),
                ...payload
            }) + '\n';

            fs.appendFileSync(logFile, logEntry);
        } catch (error) {
            console.error('Failed to log CMS payload:', error);
        }
    }
};
