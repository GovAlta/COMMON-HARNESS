-- Migration: 001_extensions_and_functions
-- Description: Enable required PostgreSQL extensions and create reusable trigger function

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enable cryptographic functions (gen_random_uuid, token hashing)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create reusable trigger function for auto-updating updated_at timestamp
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
