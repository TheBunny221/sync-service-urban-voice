# 03. Modules Reference

This document outlines the responsibility of each source file.

## Root Directory
- **`index.js`**: Application Entry Point.
  - Initializes `configLoader`.
  - Sets up the `winston` logger.
  - Validates DB connections on startup.
  - Starts the `node-cron` scheduler.
- **`sync-config.json`**: Central configuration file (moved to root in v2.0).

## Core Logic (`src/logic/`)
- **`configLoader.js`**: 
  - Loads `sync-config.json`.
  - Validates schema using `zod`.
  - Provides a global `getConfig()` accessor.
- **`dataProcessor.js`**: 
  - **Normalization**: Handles the "Unpivot" logic. Iterates `Tag1` to `Tag64` for each row and emits normalized objects.
- **`ruleEngine.js`**: 
  - **Evaluation**: Compares normalized values against configured thresholds. Handles `gt`, `lt`, `equals`, `neq`, etc.
- **`dedupEngine.js`** (Vital): 
  - **Smart Dedup**: Checks if an active complaint exists for the given RTU/Tag.
  - Returns `true` if operation should be skipped.
- **`mapper.js`**: 
  - **Transformation**: Maps a `{DataPoint, Rule}` pair into the Prisma `Complaint` data structure, filling in templates.

## Database (`src/db/`)
- **`mssql.js`**: 
  - SQL Server connection pool.
  - Specific query functions for `AnalogData3` and `DigitalData3`.
- **`prisma.js`**: 
  - Singleton `PrismaClient` instance for PostgreSQL interactions.

## Utilities (`src/utils/`)
- **`logger.js`**: 
  - Wraps `winston`.
  - `logRawData(type, data)`: Handles high-volume raw logging.
  - `logSkipped(data)`: Handles structured logging for skipped/duplicate faults.
