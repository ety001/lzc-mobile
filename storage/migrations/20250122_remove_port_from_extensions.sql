-- Migration: Remove port column from extensions table
-- Date: 2025-01-22
-- Description: Remove the unused 'port' column from extensions table
-- Reason: PJSIP automatically detects client port from registration, manual specification is not needed

BEGIN TRANSACTION;

-- Remove the port column from extensions table
ALTER TABLE extensions DROP COLUMN port;

COMMIT;
