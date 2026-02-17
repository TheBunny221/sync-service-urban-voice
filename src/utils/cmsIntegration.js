
import { v2Logger } from '../logger.js';

/**
 * Generates a unique Complaint ID following the CMS pattern (Prefix + Sequential Number).
 * @param {Object} tx - The Prisma Transaction Client
 * @returns {Promise<string>} - The generated ID (e.g. "KSC0001")
 */
export async function generateComplaintId(tx) {
    // 1. Get configuration
    const configItems = await tx.systemConfig.findMany({
        where: {
            key: {
                in: [
                    "COMPLAINT_ID_PREFIX",
                    "COMPLAINT_ID_START_NUMBER",
                    "COMPLAINT_ID_LENGTH",
                ],
            },
        },
    });

    const settings = configItems.reduce((acc, item) => {
        acc[item.key] = item.value;
        return acc;
    }, {});

    const prefix = settings.COMPLAINT_ID_PREFIX || "KSC";
    const startNumber = parseInt(settings.COMPLAINT_ID_START_NUMBER || "1", 10);
    const idLength = parseInt(settings.COMPLAINT_ID_LENGTH || "4", 10);

    // 2. Find highest existing ID with this prefix
    // We check the single highest ID to avoid scanning everything, assuming sequential
    const lastComplaint = await tx.complaint.findFirst({
        where: {
            complaintId: {
                startsWith: prefix,
            },
        },
        orderBy: {
            complaintId: 'desc',
        },
        select: {
            complaintId: true,
        },
    });

    let nextNumber = startNumber;

    if (lastComplaint && lastComplaint.complaintId) {
        const numberPart = lastComplaint.complaintId.replace(prefix, "");
        const lastNum = parseInt(numberPart, 10);
        if (!isNaN(lastNum)) {
            nextNumber = lastNum + 1;
        }
    }

    // 3. Format & Verify Uniqueness (Loop to prevent collisions)
    let formattedNumber;
    let newId;
    let isUnique = false;
    let attempts = 0;

    while (!isUnique && attempts < 20) {
        attempts++;
        formattedNumber = nextNumber.toString().padStart(idLength, "0");
        newId = `${prefix}${formattedNumber}`;

        // Verify it doesn't exist (Critical for race conditions or sort anomalies)
        const check = await tx.complaint.findUnique({
            where: { complaintId: newId },
            select: { id: true }
        });

        if (!check) {
            isUnique = true;
        } else {
            // Collision detected (or sort issue), force increment
            nextNumber++;
        }
    }

    if (!isUnique) {
        throw new Error(`Failed to generate unique Complaint ID after ${attempts} attempts`);
    }

    return newId;
}

/**
 * Resolves the Complaint Type ID and Name from the DB.
 * logic mirrors CMS createComplaint type resolution.
 * @param {Object} tx - Prisma Transaction
 * @param {string} typeInput - The type name or ID provided in config
 * @returns {Promise<Object>} - { verifiedTypeId, verifiedTypeName, slaHours }
 */
export async function resolveComplaintType(tx, typeInput) {
    let resolvedTypeId = null;
    let resolvedTypeName = null;
    let resolvedSlaHours = 48; // Default
    let resolvedPriority = 'MEDIUM'; // Default

    const inputStr = String(typeInput || "").trim();
    if (!inputStr) return null;

    // 1. Try Lookup in ComplaintType table (by ID or Name)
    const numMaybe = Number(inputStr);
    const ct = Number.isFinite(numMaybe)
        ? await tx.complaintType.findUnique({ where: { id: numMaybe } })
        : await tx.complaintType.findFirst({ where: { name: inputStr } });

    if (ct) {
        resolvedTypeId = ct.id;
        resolvedTypeName = ct.name;
        resolvedSlaHours = Number(ct.slaHours) || 48;
        resolvedPriority = ct.priority || 'MEDIUM';
    } else {
        // 2. Legacy SystemConfig Lookup (COMPLAINT_TYPE_KEY)
        const byKey = await tx.systemConfig.findFirst({
            where: {
                key: `${inputStr.toUpperCase()}`,
                isActive: true,
            },
        });

        if (byKey) {
            try {
                const v = JSON.parse(byKey.value || "{}");
                resolvedTypeName = v.name;
                resolvedSlaHours = Number(v.slaHours);
                resolvedPriority = v.priority || 'MEDIUM';
            } catch (e) {
                // Ignore parse error
            }
        }

        // 3. Legacy Scan all configs if key didn't match directly
        if (!resolvedTypeName) {
            const allTypes = await tx.systemConfig.findMany({
                where: { key: { startsWith: "COMPLAINT_TYPE_" }, isActive: true },
            });
            for (const cfg of allTypes) {
                try {
                    const v = JSON.parse(cfg.value || "{}");
                    if (v.name && v.name.toLowerCase() === inputStr.toLowerCase()) {
                        resolvedTypeName = v.name;
                        resolvedSlaHours = Number(v.slaHours);
                        resolvedPriority = v.priority || 'MEDIUM';
                        break;
                    }
                } catch (e) { }
            }
        }
    }

    if (!resolvedTypeName) return null;

    return {
        id: resolvedTypeId,
        name: resolvedTypeName,
        slaHours: resolvedSlaHours,
        priority: resolvedPriority
    };
}

/**
 * Resolves the System User ID by Email.
 * @param {Object} tx - Prisma Transaction
 * @param {string} email - Email to look up
 * @returns {Promise<string>} - The User ID
 */
export async function resolveSystemUser(tx, email) {
    if (!email) throw new Error("System User Email not configured.");

    const user = await tx.user.findFirst({
        where: { email: email.trim() },
        select: { id: true }
    });

    if (!user) {
        throw new Error(`System User not found for email: ${email}`);
    }

    return user.id;
}