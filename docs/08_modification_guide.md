# 08. Modification Guide

## Common Scenarios

### Adding a New Sensor / Tag to Monitor
1. **No Code Changes Required**.
2. Open `sync-config.json`.
3. Add a new entry to `tagRules` array.
4. Restart the service.

### Changing the Deduplication Logic
1. Open `src/logic/dedupEngine.js`.
2. Locate the `isDuplicate` function.
3. Modify the statuses considered "Closed":
   ```javascript
   const closedStatuses = ['CLOSED', 'RESOLVED', 'REJECTED', 'ARCHIVED']; // Add statuses here
   ```

### Adding a New Data Source Table
1. **DB Reader**: Update `src/db/mssql.js` to add `fetchNewTable()`.
2. **Processor**: Ensure `src/logic/dataProcessor.js` can handle the table schema (or write a new processor).
3. **Orchestrator**: Update `src/syncJob.js` to call the new fetcher and pass data to the processor.

### Changing Log Locations
1. Open `src/utils/logger.js`.
2. Modify the `logDir` variable in `initLogger`, `logRawData`, and `logSkipped`.

## Deployment
- **Method**: Use PM2 or Windows Task Scheduler.
- **Command**: `npm start` (or `npm run dev` for testing)
- **Restart Policy**: Ensure auto-restart is enabled as the cron job runs inside the process.
