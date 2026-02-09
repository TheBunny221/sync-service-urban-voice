
import { getPrismaClient } from '../db/prisma.js';
import { getLogger, logSkipped } from '../utils/logger.js';

export async function isDuplicate(dataPoint) {
    const prisma = getPrismaClient();
    const logger = getLogger();

    try {
        // 1. Find the latest FaultSync for this RTU + Tag
        const latestFault = await prisma.faultSync.findFirst({
            where: {
                rtuNumber: BigInt(dataPoint.rtuId),
                tagNo: String(dataPoint.tag)
            },
            orderBy: {
                id: 'desc'
            },
            include: {
                complaints: true // Check linked complaints
            }
        });

        if (!latestFault) {
            // No previous fault history -> Not a duplicate
            return false;
        }

        // 2. Check if linked complaint is active
        // Assuming 1:1 or we check the latest complaint
        const linkedComplaint = latestFault.complaints[0]; // Get the first one since we usually create one per fault

        if (!linkedComplaint) {
            // Fault exists but no complaint? Treat as safe to create new.
            return false;
        }

        const closedStatuses = ['CLOSED', 'RESOLVED', 'REJECTED']; // Define what counts as closed
        const isClosed = closedStatuses.includes(linkedComplaint.status.toUpperCase());

        if (!isClosed) {
            // It is still active (OPEN, IN_PROGRESS, etc.)
            const reason = `Skipping: Active Complaint ${linkedComplaint.id} [${linkedComplaint.status}] exists for RTU ${dataPoint.rtuId} Tag ${dataPoint.tag}`;
            logger.info(reason);

            // Log to specific skipped file
            logSkipped({
                reason: 'Active Complaint Exists',
                rtuId: dataPoint.rtuId,
                tag: dataPoint.tag,
                existingComplaintId: linkedComplaint.id,
                status: linkedComplaint.status,
                value: dataPoint.value
            });

            return true; // Is Duplicate / Block creation
        }

        // If closed, we allow new creation
        return false;

    } catch (err) {
        logger.error('Error checking for duplicates', err);
        // Fail safe: assume NOT duplicate to ensure critical alarms aren't missed on error?
        // Or opposite? Let's stick to safe-create.
        return false;
    }
}
