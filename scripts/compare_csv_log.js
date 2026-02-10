
import fs from 'fs';
import path from 'path';

// Paths
const csvPath = '/home/harihar/Desktop/backup UV/sync-service/FEEDER DETAIL REPORT FOR COMMUNICATION FAIL (1).csv';
const logPath = '/home/harihar/Desktop/backup UV/sync-service/logs/cms_payload_2026-02-10.log';

function parseCsv(filePath) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').filter(l => l.trim() !== '');
    const rtus = new Set();
    // Skip header
    for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(',');
        // "FEEDER ID" is 1st column. Remove quotes.
        if (parts.length > 0) {
            const rtu = parts[0].replace(/"/g, '').trim();
            if (rtu) rtus.add(rtu);
        }
    }
    return rtus;
}

function parseLog(filePath) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').filter(l => l.trim() !== '');
    const rtus = new Set();

    for (const line of lines) {
        try {
            const json = JSON.parse(line);
            // Check tags for faultType
            if (json.tags) {
                const tags = JSON.parse(json.tags);
                if (tags.faultType === 'COMMUNICATION_FAIL') {
                    rtus.add(String(tags.rtuId));
                }
            }
        } catch (e) {
            console.error('Error parsing log line:', e);
        }
    }
    return rtus;
}

function compare() {
    console.log('Reading CSV...');
    const csvRtus = parseCsv(csvPath);
    console.log(`CSV contains ${csvRtus.size} RTUs.`);

    console.log('Reading Logs...');
    const logRtus = parseLog(logPath);
    console.log(`Log contains ${logRtus.size} COMMUNICATION_FAIL RTUs.`);

    // 1. Missing in Log (Present in CSV)
    const missing = [];
    for (const rtu of csvRtus) {
        if (!logRtus.has(rtu)) {
            missing.push(rtu);
        }
    }

    // 2. Extra in Log (Not in CSV)
    const extra = [];
    for (const rtu of logRtus) {
        if (!csvRtus.has(rtu)) {
            extra.push(rtu);
        }
    }

    console.log(`\n--- MISMATCH REPORT ---`);
    console.log(`RTUs in CSV but NOT in Logs (Potential False Negatives): ${missing.length}`);
    if (missing.length > 0) {
        console.log(`IDs: ${missing.join(', ')}`);
    }

    console.log(`\nRTUs in Logs but NOT in CSV (Extra/New Faults): ${extra.length}`);
    if (extra.length > 0) {
        console.log(`IDs: ${extra.join(', ')}`);
    }
}

compare();
