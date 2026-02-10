
import { PrismaClient } from '@prisma/client';

// Singleton pattern to prevent multiple instances
const prisma = new PrismaClient();

export default prisma;
