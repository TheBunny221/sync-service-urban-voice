
import { PrismaClient } from '@prisma/client';
import { getConfig } from '../config/configLoader.js';

let prisma = null;

export function getPrismaClient() {
    if (!prisma) {
        const config = getConfig();
        prisma = new PrismaClient({
            datasources: {
                db: {
                    url: config.targetDb.url,
                },
            },
        });
    }
    return prisma;
}

export async function disconnectPrisma() {
    if (prisma) {
        await prisma.$disconnect();
        prisma = null;
    }
}
