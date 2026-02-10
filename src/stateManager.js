
import { getPrismaClient } from './db/prisma.js';
import { getConfig } from './config/configLoader.js';
import { v2Logger } from './logger.js';

export class StateManager {
    constructor() {
        this.prisma = getPrismaClient();
        this.config = getConfig();
        this.syncKey = `V2_LAST_SYNC_TIME_${this.config.syncRules.clientId}`;
    }

    async getLastSyncTime() {
        try {
            const record = await this.prisma.systemConfig.findUnique({
                where: { key: this.syncKey }
            });

            if (!record) {
                // Fallback to lookback hours
                const lookbackMs = this.config.syncRules.lookbackHours * 60 * 60 * 1000;
                return new Date(Date.now() - lookbackMs);
            }

            const lastTime = new Date(record.value);

            // Safety: If future, reset
            if (lastTime > new Date()) {
                v2Logger.warn(`Future sync state detected: ${lastTime.toISOString()}. Resetting.`);
                const lookbackMs = this.config.syncRules.lookbackHours * 60 * 60 * 1000;
                return new Date(Date.now() - lookbackMs);
            }

            return lastTime;
        } catch (error) {
            v2Logger.error('Failed to get last sync time', error);
            // Default safe fallback
            return new Date(Date.now() - 3600000);
        }
    }

    async updateLastSyncTime(date) {
        try {
            await this.prisma.systemConfig.upsert({
                where: { key: this.syncKey },
                update: { value: date.toISOString() },
                create: {
                    key: this.syncKey,
                    value: date.toISOString(),
                    type: 'SYNC_STATE'
                }
            });
        } catch (error) {
            v2Logger.error('Failed to update sync state', error);
        }
    }
}
