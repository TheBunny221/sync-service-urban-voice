
import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from root
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const configSchema = z.object({
    service: z.object({
        schedule: z.string().default('*/5 * * * *'),
        systemUserEmail: z.string().optional(),
        dryRun: z.boolean().default(false),
        isDevelopment: z.boolean().default(false),
        oneTimeCatchUp: z.boolean().default(false),
    }),
    sourceDb: z.object({
        server: z.string(),
        port: z.number().optional(),
        database: z.string(),
        user: z.string(),
        password: z.string(),
        options: z.object({
            encrypt: z.boolean().default(true),
            trustServerCertificate: z.boolean().default(true),
            requestTimeout: z.number().optional(),
            enableArithAbort: z.boolean().optional()
        }).optional(),
    }),

    syncRules: z.object({
        batchSize: z.number().int().positive(),
        lookbackHours: z.number().int().positive(),
        clientId: z.string(),
        deduplicationWindowHours: z.number().int().positive()
    }),
    cmsMapping: z.object({
        defaultPriority: z.string(),
        defaultStatus: z.string(),
        defaults: z.object({
            submittedById: z.string(),
            slaStatus: z.string().optional(),
            isAnonymous: z.boolean().optional(),
            wardId: z.string().nullable().optional(),
            subZoneId: z.string().nullable().optional(),
            contactPhone: z.string().default("9876543210")
        }).optional(),
        complaintTypeMap: z.record(z.string()).optional()
    }),
    targetDb: z.object({
        url: z.string()
    })
});

export let config = null;

export function loadConfig(configPath) {
    try {
        const resolvedPath = configPath || path.resolve(__dirname, 'v2-config.json');
        const rawData = fs.readFileSync(resolvedPath, 'utf-8');
        const jsonData = JSON.parse(rawData);

        // Merge Strategy
        const tempConfig = {
            ...jsonData,
            service: {
                ...jsonData.service,
                schedule: process.env.SYNC_SCHEDULE || jsonData.service?.schedule || '*/5 * * * *',
                systemUserEmail: process.env.SYNC_SYSTEM_USER_EMAIL,
                isDevelopment: process.env.IS_DEVELOPMENT === 'true',
                oneTimeCatchUp: jsonData.service?.oneTimeCatchUp === true,
            },
            sourceDb: {
                ...jsonData.sourceDb,
                server: process.env.MSSQL_SERVER,
                user: process.env.MSSQL_USER,
                password: process.env.MSSQL_PASSWORD,
                database: process.env.MSSQL_DATABASE,
            },
            targetDb: {
                url: process.env.DATABASE_URL
            }
        };

        if (tempConfig.sourceDb.server && tempConfig.sourceDb.server.includes(':')) {
            const [host, port] = tempConfig.sourceDb.server.split(':');
            tempConfig.sourceDb.server = host;
            tempConfig.sourceDb.port = parseInt(port, 10);
        }

        config = configSchema.parse(tempConfig);
        return config;
    } catch (error) {
        if (error instanceof z.ZodError) {
            console.error('V2 Configuration validation failed:', JSON.stringify(error.errors, null, 2));
        } else {
            console.error('Failed to load V2 configuration:', error.message);
        }
        throw error;
    }
}

export function getConfig() {
    if (!config) {
        try {
            return loadConfig();
        } catch (e) {
            throw new Error('V2 Config not loaded and auto-load failed.');
        }
    }
    return config;
}
