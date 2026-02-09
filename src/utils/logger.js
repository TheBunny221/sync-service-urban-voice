
import winston from 'winston';
import path from 'path';
import fs from 'fs';
import { getConfig } from '../logic/configLoader.js';

let loggerInstance = null;

export function initLogger() {
    const config = getConfig();

    // Ensure log directory exists
    const logDir = 'log';
    if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir);
    }

    loggerInstance = winston.createLogger({
        level: config.service.logLevel || 'info',
        format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.json()
        ),
        transports: [
            new winston.transports.Console({
                format: winston.format.combine(
                    winston.format.colorize(),
                    winston.format.simple()
                ),
            }),
            new winston.transports.File({ filename: path.join('log', 'error.log'), level: 'error' }),
            new winston.transports.File({ filename: path.join('log', 'combined.log') }),
        ],
    });

    return loggerInstance;
}

export function getLogger() {
    if (!loggerInstance) {
        // If accessed before init, try to init with defaults (safe fallback)
        try {
            return initLogger();
        } catch (e) {
            // If config isn't loaded yet, return a basic console logger
            return winston.createLogger({
                transports: [new winston.transports.Console()],
            });
        }
    }
    return loggerInstance;
}

export function logRawData(type, data) {
    const logDir = 'log';
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = path.join(logDir, `data_extracted_${type}_${dateStr}.log`);

    // Format: JSON line
    const line = JSON.stringify({ timestamp: new Date().toISOString(), ...data }) + '\n';

    try {
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir);
        }
        fs.appendFileSync(filename, line);
    } catch (e) {
        console.error('Failed to write raw log', e);
    }
}

export function logSkipped(data) {
    const logDir = 'log';
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = path.join(logDir, `skipped_faults_${dateStr}.log`);

    const line = JSON.stringify({ timestamp: new Date().toISOString(), ...data }) + '\n';

    try {
        if (!fs.existsSync(logDir)) fs.mkdirSync(logDir);
        fs.appendFileSync(filename, line);
    } catch (e) {
        console.error('Failed to write skipped log', e);
    }
}

export function logDevelopmentData(payload) {
    const logDir = 'log';
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = path.join(logDir, `dev_payloads_${dateStr}.log`);

    // Log the exact structure meant for DB
    const line = JSON.stringify({ timestamp: new Date().toISOString(), payload }) + '\n';

    try {
        if (!fs.existsSync(logDir)) fs.mkdirSync(logDir);
        fs.appendFileSync(filename, line);
    } catch (e) {
        console.error('Failed to write dev payload log', e);
    }
}
