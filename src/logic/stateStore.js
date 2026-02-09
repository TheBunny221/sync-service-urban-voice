import fs from 'fs';
import path from 'path';
import { getLogger } from '../utils/logger.js';

const STATE_FILE = path.join(process.cwd(), 'data', 'fault_state.json');

class StateStore {
    constructor() {
        this.state = {
            faultStarts: {}, // Key: "rtuId-tag-value", Value: timestamp (ISO string)
        };
        this.logger = getLogger();
        this.load();
    }

    load() {
        try {
            if (fs.existsSync(STATE_FILE)) {
                const data = fs.readFileSync(STATE_FILE, 'utf8');
                this.state = JSON.parse(data);
                this.logger.info(`Loaded fault state from ${STATE_FILE}`);
            }
        } catch (err) {
            this.logger.error('Failed to load fault state', err);
        }
    }

    save() {
        try {
            const dir = path.dirname(STATE_FILE);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(STATE_FILE, JSON.stringify(this.state, null, 2));
        } catch (err) {
            this.logger.error('Failed to save fault state', err);
        }
    }

    /**
     * Records the start of a condition if it's not already tracked.
     * Returns the start time.
     */
    trackCondition(rtuId, tag, value, timestamp) {
        const key = `${rtuId}-${tag}-${value}`;
        // Normalize timestamp to Date object
        const eventDate = new Date(timestamp);

        if (!this.state.faultStarts[key]) {
            this.state.faultStarts[key] = eventDate.toISOString();
            this.save();
            this.logger.info(`Started tracking condition: ${key} at ${this.state.faultStarts[key]}`);
        }
        return new Date(this.state.faultStarts[key]);
    }

    /**
     * Clears tracking for a condition (e.g. when it's resolved/no longer matching).
     */
    clearCondition(rtuId, tag, value) {
        const key = `${rtuId}-${tag}-${value}`;
        if (this.state.faultStarts[key]) {
            delete this.state.faultStarts[key];
            this.save();
            this.logger.debug(`Cleared tracking for: ${key}`);
        }
    }

    getStartTime(rtuId, tag, value) {
        const key = `${rtuId}-${tag}-${value}`;
        const startTime = this.state.faultStarts[key];
        return startTime ? new Date(startTime) : null;
    }
}

export const stateStore = new StateStore();
