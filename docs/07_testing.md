# 07. Testing Guide

The project maintains a high standard of code quality through comprehensive Unit and Integration tests using **Jest**.

## Prerequisite
Ensure dependencies are installed:
```bash
npm install
```

## Running Tests
To run the full suite:
```bash
npm test
```
To check code coverage:
```bash
npm run test:coverage
```

## Test Suites Explained

### 1. `syncJob.test.js` (Integration)
Simulates the entire pipeline.
- **Mocks**: `mssql` (Source), `prisma` (Target), `logger`.
- **Verifies**: 
  - Data is fetched.
  - Raw logs are written.
  - Complaints are created for faults.
  - **Duplicates are skipped** (tests the `isDuplicate` return value).

### 2. `dedupEngine.test.js` (Logic)
Tests the Smart Deduplication logic in isolation.
- **Scenarios**:
  - No previous fault -> Returns `false` (Allow).
  - Previous fault + Open Complaint -> Returns `true` (Block).
  - Previous fault + Closed Complaint -> Returns `false` (Allow).

### 3. `ruleEngine.test.js` (Logic)
Tests the conditional operators (`gt`, `lt`, `equals`, `neq`) against various data interactions.

### 4. `mapper.test.js` (Logic)
Ensures data and templates are correctly merged into the final Complaint object.
