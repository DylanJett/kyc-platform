-- Migration 002: Extend schema for Store Onboarding API fields
-- Adds MCC, city, address lines, business activities, settlement info, owners, etc.

-- Add missing columns to applications (some may already exist from code)
DO $$
BEGIN
    -- Core fields that code already references but may be missing from initial schema
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='applications' AND column_name='business_category') THEN
        ALTER TABLE applications ADD COLUMN business_category VARCHAR(100);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='applications' AND column_name='business_subcategory') THEN
        ALTER TABLE applications ADD COLUMN business_subcategory VARCHAR(255);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='applications' AND column_name='free_zone') THEN
        ALTER TABLE applications ADD COLUMN free_zone BOOLEAN DEFAULT false;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='applications' AND column_name='owner_name') THEN
        ALTER TABLE applications ADD COLUMN owner_name VARCHAR(255);
    END IF;

    -- New fields from Store Onboarding API
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='applications' AND column_name='mcc') THEN
        ALTER TABLE applications ADD COLUMN mcc VARCHAR(10);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='applications' AND column_name='store_type') THEN
        ALTER TABLE applications ADD COLUMN store_type VARCHAR(50);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='applications' AND column_name='contact_email') THEN
        ALTER TABLE applications ADD COLUMN contact_email VARCHAR(255);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='applications' AND column_name='city') THEN
        ALTER TABLE applications ADD COLUMN city VARCHAR(100);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='applications' AND column_name='address_line1') THEN
        ALTER TABLE applications ADD COLUMN address_line1 TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='applications' AND column_name='address_line2') THEN
        ALTER TABLE applications ADD COLUMN address_line2 TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='applications' AND column_name='business_activities') THEN
        ALTER TABLE applications ADD COLUMN business_activities VARCHAR(255);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='applications' AND column_name='accept_international_payments') THEN
        ALTER TABLE applications ADD COLUMN accept_international_payments BOOLEAN DEFAULT false;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='applications' AND column_name='settlement_currency') THEN
        ALTER TABLE applications ADD COLUMN settlement_currency VARCHAR(10);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='applications' AND column_name='settlement_bank_name') THEN
        ALTER TABLE applications ADD COLUMN settlement_bank_name VARCHAR(255);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='applications' AND column_name='settlement_bank_iban') THEN
        ALTER TABLE applications ADD COLUMN settlement_bank_iban VARCHAR(100);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='applications' AND column_name='settlement_frequency') THEN
        ALTER TABLE applications ADD COLUMN settlement_frequency VARCHAR(100);
    END IF;
END $$;

-- Extend document_type enum with new types
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'visa' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'document_type')) THEN
        ALTER TYPE document_type ADD VALUE 'visa';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'identity_document' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'document_type')) THEN
        ALTER TYPE document_type ADD VALUE 'identity_document';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'memorandum_of_association' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'document_type')) THEN
        ALTER TYPE document_type ADD VALUE 'memorandum_of_association';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'business_documents' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'document_type')) THEN
        ALTER TYPE document_type ADD VALUE 'business_documents';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'trade_license' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'document_type')) THEN
        ALTER TYPE document_type ADD VALUE 'trade_license';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'tax' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'document_type')) THEN
        ALTER TYPE document_type ADD VALUE 'tax';
    END IF;
END $$;

-- Add validation columns to documents
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='documents' AND column_name='validation_status') THEN
        ALTER TABLE documents ADD COLUMN validation_status VARCHAR(20) DEFAULT 'pending';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='documents' AND column_name='validation_details') THEN
        ALTER TABLE documents ADD COLUMN validation_details TEXT;
    END IF;
END $$;

-- Owners table
CREATE TABLE IF NOT EXISTS owners (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    application_id          UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    ownership_type          VARCHAR(50) NOT NULL,  -- authorizedSignatory, shareHolder
    owner_type              VARCHAR(50),           -- individual, corporate (for shareholders only)
    first_name              VARCHAR(255),
    last_name               VARCHAR(255),
    company_name            VARCHAR(255),          -- for corporate shareholders
    email                   VARCHAR(255),
    identity_type           VARCHAR(50),           -- emiratesId, passport, tradeLicense
    identity_doc_id         UUID REFERENCES documents(id),
    created_at              TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_owners_application_id ON owners(application_id);
