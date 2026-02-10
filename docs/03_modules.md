# 03. Modules Reference

This document outlines the responsibility of each source file in the promoted V2 structure.

## Entry Point
- **`src/index.js`**: Core Orchestrator.
  - Controls the execution flow for development vs production modes.
  - Manages the interaction between `StateManager` and `RuleEngine`.

## Detection Services (`src/services/`)
- **`powerFail.service.js`**: Specific detector for RTU Power Loss (Tag16).
- **`commFail.service.js`**: Complex detector for communication timeouts based on data staleness.
- **`trip.service.js`**: Monitors Digital Inputs for circuit/mcb trips.
- **`lampFailure.service.js`**: Advanced detector for partial and total lamp failures using phase status awareness.

## Core Services (`src/`)
- **`ruleEngine.js`**: Dispatches fault detection requests to specialized services and applies "Winner-Take-All" logic.
- **`stateManager.js`**: Handles local state tracking and remote deduplication against the CMS.
- **`cmsMapper.js`**: Logic for transforming raw faults into CMS-compliant complaint payloads.
- **`payloadLogger.js`**: Utility for saving generated payloads to local JSON files in development mode.
- **`logger.js`**: Centralized V2 logging using `winston`.
- **`prismaClient.js`**: Prisma ORM client instance.

## Configuration (`src/config/`)
- **`configLoader.js`**: Loads and validates `v2-config.json` and `.env`.
- **`v2-config.json`**: Primary JSON configuration for V2 rules and mappings.

## Database (`src/db/`)
- **`mssql.js`**: SQL Server driver and specific analytical queries for V2.
- **`prisma.js`**: Singleton management for the target PostgreSQL connection.

## Legacy Code (`/legacy-code/`)
- Contains the original V1 (stream-based) implementation for historical reference or emergency rollback.
