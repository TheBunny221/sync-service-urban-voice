
import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv'; // Load env vars

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env explicitly if needed, or assume preloaded. 
// Standard practice: load from root .env
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const configSchema = z.object({
    service: z.object({
        name: z.string().default('AlarmToComplaintSync'),
        schedule: z.string().default('*/5 * * * *'),
        systemUserEmail: z.string().optional(),
        logLevel: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
        dryRun: z.boolean().default(false),
        isDevelopment: z.boolean().default(false),
        oneTimeCatchUp: z.boolean().default(false),
        useNewLogic: z.boolean().default(false),
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
        }).optional(),
    }),
    targetDb: z.object({
        provider: z.literal('postgresql').default('postgresql'),
        url: z.string(),
    }),
    syncRules: z.object({
        batchSize: z.number().int().positive(),
        lookbackHours: z.number().int().positive(),
        clientId: z.string(),
        deduplicationWindowHours: z.number().int().positive(),
        ruleSets: z.object({
            diRules: z.object({
                enabled: z.boolean().default(true),
                description: z.string().optional(),
                rules: z.array(z.object({
                    tag: z.union([z.string(), z.number()]),
                    condition: z.enum(['gt', 'lt', 'equals', 'gte', 'lte', 'neq']),
                    value: z.union([z.string(), z.number()]),
                    alarmType: z.string(),
                    description: z.string(),
                    enabled: z.boolean().default(true),
                    faultType: z.string().optional(),
                    complaintType: z.string().optional(),
                    prerequisite: z.object({
                        tag: z.string(),
                        table: z.string().optional(),
                        value: z.union([z.string(), z.number()]),
                        condition: z.enum(['equals', 'neq', 'gt', 'lt']).default('equals')
                    }).optional(),
                    duration: z.object({
                        value: z.string(),
                        mode: z.enum(['instant', 'continuous']).default('continuous')
                    }).optional(),
                    thresholdPercent: z.number().min(0).max(100).optional(),
                    windowHours: z.number().int().positive().default(48).optional()
                })).default([])
            }),
            aiRules: z.object({
                enabled: z.boolean().default(true),
                description: z.string().optional(),
                rules: z.array(z.object({
                    tag: z.union([z.string(), z.number()]),
                    condition: z.enum(['gt', 'lt', 'equals', 'gte', 'lte', 'neq']),
                    value: z.union([z.string(), z.number()]),
                    alarmType: z.string(),
                    description: z.string(),
                    enabled: z.boolean().default(true),
                    faultType: z.string().optional(),
                    complaintType: z.string().optional(),
                    prerequisite: z.object({
                        tag: z.string(),
                        table: z.string().optional(),
                        value: z.union([z.string(), z.number()]),
                        condition: z.enum(['equals', 'neq', 'gt', 'lt']).default('equals')
                    }).optional(),
                    duration: z.object({
                        value: z.string(),
                        mode: z.enum(['instant', 'continuous']).default('continuous')
                    }).optional(),
                    thresholdPercent: z.number().min(0).max(100).optional(),
                    windowHours: z.number().int().positive().default(48).optional()
                })).default([])
            })
        }),
        masterRules: z.array(z.object({
            tag: z.union([z.string(), z.number()]),
            table: z.string().optional(),
            value: z.union([z.string(), z.number()]),
            duration: z.union([
                z.string(),
                z.object({
                    value: z.string(),
                    mode: z.enum(['instant', 'continuous']).default('continuous')
                })
            ]).optional(),
            description: z.string(),
            condition: z.enum(['gt', 'lt', 'equals', 'gte', 'lte', 'neq']).default('equals'),
            alarmType: z.string().default('CRITICAL'),
            enabled: z.boolean().default(true),
            faultType: z.string().optional(),
            complaintType: z.string().optional(),
            priority: z.number().int().default(1),
            thresholdPercent: z.number().min(0).max(100).optional(),
            windowHours: z.number().int().positive().default(48).optional()
        })).optional().default([])
    }),
    cmsMapping: z.object({
        defaultPriority: z.string(),
        defaultStatus: z.string(),
        defaults: z.object({
            wardId: z.string().nullable().optional(),
            subZoneId: z.string().nullable().optional(),
            submittedById: z.string(),
        }).optional(),
        titleTemplate: z.string(),
        descriptionTemplate: z.string(),
        tagMap: z.record(z.string()).optional(),
    }),
    errorHandling: z.object({
        retryCount: z.number().int().min(0),
        retryDelayMs: z.number().int().min(0),
    }),
    heartbeat: z.object({
        thresholdHours: z.number().int().positive().default(24)
    }).optional()
});

export let config = null;

export function loadConfig(configPath) {
    try {
        const resolvedPath = configPath || path.resolve(__dirname, '../../sync-config.json');
        const rawData = fs.readFileSync(resolvedPath, 'utf-8');
        const jsonData = JSON.parse(rawData);

        // Merge Strategy: Env Vars take precedence or fill gaps
        // We construct the full object to validate against Zod
        const tempConfig = {
            ...jsonData,
            service: {
                ...jsonData.service,
                name: process.env.SERVICE_NAME || jsonData.service?.name,
                schedule: process.env.SYNC_SCHEDULE || jsonData.service?.schedule || '*/5 * * * *', // Env var > Config File > Default
                systemUserEmail: process.env.SYNC_SYSTEM_USER_EMAIL,
                logLevel: process.env.LOG_LEVEL || jsonData.service?.logLevel || 'info',
                isDevelopment: process.env.IS_DEVELOPMENT === 'true',
                oneTimeCatchUp: jsonData.service?.oneTimeCatchUp === true,
                useNewLogic: process.env.useNewLogic === 'true' || jsonData.service?.useNewLogic === true,
            },
            sourceDb: {
                server: process.env.MSSQL_SERVER,
                user: process.env.MSSQL_USER,
                password: process.env.MSSQL_PASSWORD,
                database: process.env.MSSQL_DATABASE,
                // Options likely remain hardcoded or defaults unless we add env vars for them too
                options: {
                    encrypt: true,
                    trustServerCertificate: true
                }
            },
            targetDb: {
                provider: 'postgresql',
                url: process.env.DATABASE_URL
            }
        };

        // Handle Host:Port splitting for MSSQL
        if (tempConfig.sourceDb.server && tempConfig.sourceDb.server.includes(':')) {
            const [host, port] = tempConfig.sourceDb.server.split(':');
            tempConfig.sourceDb.server = host;
            tempConfig.sourceDb.port = parseInt(port, 10);
        }

        config = configSchema.parse(tempConfig);

        return config;
    } catch (error) {
        if (error instanceof z.ZodError) {
            console.error('Configuration validation failed:', JSON.stringify(error.errors, null, 2));
        } else {
            console.error('Failed to load configuration:', error.message);
        }
        throw error;
    }
}

export function getConfig() {
    if (!config) {
        // Auto-load if accessed (useful for tests or imports that need it static, 
        // though calling loadConfig() explicitly at startup is better)
        // Note: In tests we often mock this, but in real app 'index.js' calls loadConfig.
        try {
            return loadConfig();
        } catch (e) {
            throw new Error('Config not loaded and auto-load failed.');
        }
    }
    return config;
}
