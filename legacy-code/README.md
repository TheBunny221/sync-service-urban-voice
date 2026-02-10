# Legacy Code (V1)

## ⚠️ DEPRECATED

This directory contains the **legacy V1** implementation of the sync service. It has been replaced by the V2 architecture which is now the main codebase in `/src/`.

## Purpose

This code is preserved for:
- **Emergency Rollback**: In case critical issues are discovered with V2
- **Reference**: For understanding the evolution of the system
- **Historical Context**: Documentation of the original implementation

## Usage

### Emergency Rollback Only

To run the legacy V1 code:

```bash
npm run start:legacy
```

> **WARNING**: The V1 code is no longer maintained and should only be used as a temporary fallback while V2 issues are resolved.

## Migration to V2

The V2 implementation offers significant improvements over V1:

### Key Improvements
- **Better Architecture**: Cleaner separation of concerns with dedicated service classes
- **Robust Detection Logic**: More accurate fault detection with multi-criteria checks
- **Improved Logging**: Structured logging with better debugging capabilities
- **State Management**: Proper tracking of sync state via database
- **Development Mode**: File-based payload logging for testing
- **Production Mode**: Direct database insertion with transaction safety

### What Changed
- **Entry Point**: `src/index.js` now runs V2 logic
- **Services**: Fault detection moved to dedicated service classes in `src/services/`
- **Configuration**: V2 uses `src/config/` for configuration loading
- **Logging**: V2 uses `src/logger.js` with structured logging
- **CMS Mapping**: V2 uses `src/cmsMapper.js` with improved payload generation

## Migration Guide

For detailed migration information, see:
- [Migration Guide](../docs/MIGRATION_GUIDE.md) (to be created)
- [V2 Architecture](../docs/v2-sync-service.md)

## Removal Timeline

This legacy code will be removed in a future release once V2 has been proven stable in production for at least 3 months.

**Deprecation Date**: 2026-02-10  
**Planned Removal**: 2026-05-10 (or later based on stability)

---

**For current development, always use the main `/src/` directory which contains the V2 implementation.**
