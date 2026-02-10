
import { PowerFailService } from './services/powerFail.service.js';
import { CommFailService } from './services/commFail.service.js';
import { TripService } from './services/trip.service.js';
import { LampFailureService } from './services/lampFailure.service.js';
import { v2Logger } from './logger.js';
import { buildPayload } from './payloadBuilder.js';

export class RuleEngine {
    constructor() {
        this.powerService = new PowerFailService();
        this.commService = new CommFailService();
        this.tripService = new TripService();
        this.lampService = new LampFailureService();
    }

    async run(sinceDate) {
        v2Logger.info('Starting Rule Engine Evaluation...');

        // 1. Fetch All Raw Faults (Parallel Fetch)
        const [powerFaults, commFaults, tripFaults, lampFaults] = await Promise.all([
            this.powerService.detect(sinceDate),
            this.commService.detect(), // Comm fail has its own lookback logic
            this.tripService.detect(sinceDate),
            this.lampService.detect(sinceDate)
        ]);

        v2Logger.info(`Raw Detection: Power=${powerFaults.length}, Comm=${commFaults.length}, Trip=${tripFaults.length}, Lamp=${lampFaults.length}`);

        // 2. Aggregate by RTU
        const rtuMap = new Map();

        const addToMap = (faults) => {
            faults.forEach(f => {
                if (!rtuMap.has(f.rtuId)) rtuMap.set(f.rtuId, []);
                rtuMap.get(f.rtuId).push(f);
            });
        };

        addToMap(powerFaults);
        addToMap(commFaults);
        addToMap(tripFaults);
        addToMap(lampFaults);

        // 3. Apply Winner Logic per RTU
        const finalPayloads = [];

        for (const [rtuId, faults] of rtuMap) {
            // Priority Check
            const power = faults.find(f => f.type === 'POWER_FAIL');
            if (power) {
                finalPayloads.push(buildPayload(rtuId, power));
                continue; // Stop for this RTU
            }

            const comm = faults.find(f => f.type === 'COMMUNICATION_FAIL');
            if (comm) {
                finalPayloads.push(buildPayload(rtuId, comm));
                continue; // Stop
            }

            // Trips and Lamps can co-exist? 
            // User requirement: "Multiple TRIP + LAMP may exist together for same RTU"
            // "WinnerLogic: ... Trips and Lamp can co-exist together."

            const trips = faults.filter(f => f.type.includes('TRIP'));
            const lamps = faults.filter(f => f.type === 'LAMP_FAILURE');

            // If only Lamp failure exists, check priority vs single/three phase trip?
            // "Trips and Lamp can co-exist together." -> So allow ALL trip + lamp faults.

            [...trips, ...lamps].forEach(f => {
                finalPayloads.push(buildPayload(rtuId, f));
            });
        }

        return finalPayloads;
    }
}
