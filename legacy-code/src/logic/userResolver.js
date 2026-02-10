
import { getPrismaClient } from '../db/prisma.js';
import { getLogger } from '../utils/logger.js';

let cachedSystemUserId = null;

export async function getSystemUserId(email) {
    if (cachedSystemUserId) return cachedSystemUserId;

    const prisma = getPrismaClient();
    const logger = getLogger();

    if (!email) {
        logger.warn('System User Email is not defined in configuration.');
        return null;
    }

    try {
        const user = await prisma.user.findUnique({
            where: { email: email },
            select: { id: true }
        });

        if (user) {
            cachedSystemUserId = user.id;
            logger.info(`Resolved System User ID: ${cachedSystemUserId} for email: ${email}`);
            return cachedSystemUserId;
        } else {
            logger.info(`System User not found for email: ${email}. Creating it...`);
            const newUser = await prisma.user.create({
                data: {
                    email: email,
                    name: 'Sync System Agent'
                }
            });
            cachedSystemUserId = newUser.id;
            logger.info(`Created System User with ID: ${cachedSystemUserId}`);
            return cachedSystemUserId;
        }
    } catch (error) {
        logger.error('Error resolving system user:', error);
        return null;
    }
}
