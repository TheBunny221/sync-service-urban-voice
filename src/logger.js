
import winston from 'winston';
import path from 'path';
import fs from 'fs';

const LOG_DIR = 'logs';
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR);

const { combine, timestamp, printf, json } = winston.format;

// Standard Logger (Console + File)
const appFormat = printf(({ level, message, timestamp, ...meta }) => {
    return `${timestamp} [${level.toUpperCase()}]: ${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ''}`;
});

export const v2Logger = winston.createLogger({
    level: 'info',
    format: combine(timestamp(), appFormat),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: path.join(LOG_DIR, 'v2-sync.log') })
    ]
});

// Payload Logger (JSON only for UI/Forensics)
const payloadLogger = winston.createLogger({
    level: 'info',
    format: combine(timestamp(), json()),
    transports: [
        new winston.transports.File({ filename: path.join(LOG_DIR, 'v2-payloads.log') })
    ]
});

export function logV2Payload(payload) {
    // Log structure for UI parsing: { timestamp, payload: { table: 'V2_FAULT', data: ... } }
    // We wrap it to match the V1/V2 UI expectation
    payloadLogger.info({
        table: 'V2_FAULT',
        data: payload
    });
}
