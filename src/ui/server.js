
import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { loadConfig } from '../logic/configLoader.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../../');
const configPath = path.resolve(rootDir, 'sync-config.json');

const app = express();
const port = 3005;
const HOST = '0.0.0.0';

// Disable caching for HTML files to prevent stale UI
app.use((req, res, next) => {
    if (req.url.endsWith('.html') || req.url === '/') {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
    }
    next();
});

app.use(express.static(path.join(rootDir, 'public')));
app.use(express.json());

// Get Config
app.get('/api/config', (req, res) => {
    try {
        const rawData = fs.readFileSync(configPath, 'utf-8');
        res.json(JSON.parse(rawData));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Update Config
app.post('/api/config', (req, res) => {
    try {
        const newConfig = req.body;
        // Validate by trying to parse with loader? 
        // For now, just save. Ideally we validate against schema.
        fs.writeFileSync(configPath, JSON.stringify(newConfig, null, 4));

        // Reload in memory
        loadConfig(configPath);

        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Get Logs
// Get list of log files
app.get('/api/logs/files', (req, res) => {
    try {
        const logDir = path.resolve(rootDir, 'log');
        if (!fs.existsSync(logDir)) {
            return res.json({ files: [] });
        }
        const files = fs.readdirSync(logDir).filter(f => (f.startsWith('dev_payloads_') || f.startsWith('data_extracted_')) && f.endsWith('.log'));
        files.sort().reverse();
        res.json({ files });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Get logs from a specific file
app.get('/api/logs', (req, res) => {
    try {
        const logDir = path.resolve(rootDir, 'log');
        if (!fs.existsSync(logDir)) {
            return res.json({ files: [], logs: [] });
        }

        const files = fs.readdirSync(logDir).filter(f => (f.startsWith('dev_payloads_') || f.startsWith('data_extracted_')) && f.endsWith('.log'));

        // Sort files to get latest
        files.sort().reverse();

        const requestedFile = req.query.file || files[0];

        if (!requestedFile || !files.includes(requestedFile)) {
            return res.json({ files, logs: [] });
        }

        const content = fs.readFileSync(path.resolve(logDir, requestedFile), 'utf-8');
        // Parse logs: Each line is a JSON object
        const logs = content.trim().split('\n').map(line => {
            try {
                const parsed = JSON.parse(line);
                // Case 1: Payload Wrapper
                if (parsed.payload) {
                    const payload = parsed.payload || {};
                    const data = payload.data || {};

                    // Parse 'tags' string if it exists in Complaint data
                    let extraTags = {};
                    if (typeof data.tags === 'string') {
                        try { extraTags = JSON.parse(data.tags); } catch (e) { }
                    }

                    return {
                        timestamp: parsed.timestamp,
                        table: payload.table || 'Unknown',
                        rtu: data.rtuNumber || data.rtuId || extraTags.rtuId || 'N/A',
                        tag: data.tagNo || data.tag || extraTags.tag || 'N/A',
                        type: data.type || extraTags.rawType || 'INFO',
                        value: data.tagValue || data.value || extraTags.value || '-',
                        faultPercent: data.faultPercent || null,
                        raw: parsed
                    };
                }
                // Case 2: Extracted Data (Direct Row)
                else if (parsed.RTUNumber) {
                    return {
                        timestamp: parsed.timestamp || parsed.DateTimeField,
                        table: 'Extracted Data',
                        rtu: parsed.RTUNumber,
                        tag: 'Multiple Tags',
                        type: 'DATA',
                        value: 'View JSON',
                        raw: parsed
                    };
                }

                return null;
            } catch (e) {
                return null;
            }
        }).filter(Boolean); // Filter out parse errors

        res.json({ files, currentFile: requestedFile, logs });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});


// DOCS VIEWER API
const docDir = path.resolve(rootDir, 'docs');

// List Docs
app.get('/api/docs/list', (req, res) => {
    try {
        if (!fs.existsSync(docDir)) {
            return res.json({ files: [] });
        }

        // Simple recursive scan or just top level? 
        // Plan said "Scans DOCS_ROOT". Let's do simple top level + 1 depth maybe?
        // Or just Flat list for now as per "List of all .md files" requirement.
        // Let's do recursive reading helper if user wants "Folder tree" later, 
        // but for now, let's just read the directory.
        const files = fs.readdirSync(docDir).filter(f => f.endsWith('.md'));
        res.json({ files });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Get Doc Content
app.get('/api/docs/content', (req, res) => {
    try {
        const fileName = req.query.file;
        if (!fileName) return res.status(400).json({ error: 'File required' });

        // Security: Prevent traversal
        const safeName = path.basename(fileName);
        const filePath = path.resolve(docDir, safeName);

        // Allow reading subdirectories if passed as "folder/file.md"?
        // If I strict on `basename`, subfolders won't work.
        // But user requirements said "Folder path must be configurable...".
        // Let's implement safe check: must be inside docDir.
        const resolvedPath = path.resolve(docDir, fileName);
        if (!resolvedPath.startsWith(docDir)) {
            return res.status(403).json({ error: 'Access denied' });
        }

        if (!fs.existsSync(resolvedPath)) {
            return res.status(404).json({ error: 'Not found' });
        }

        const content = fs.readFileSync(resolvedPath, 'utf-8');
        res.json({ content });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.listen(port, HOST, () => {
    console.log(`Config UI running on http://${HOST}:${port}`);
});
