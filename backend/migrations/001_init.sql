CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TYPE user_role AS ENUM ('merchant', 'reviewer');

CREATE TABLE users (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email         VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role          user_role NOT NULL,
    full_name     VARCHAR(255),
    created_at    TIMESTAMP DEFAULT NOW(),
    updated_at    TIMESTAMP DEFAULT NOW()
);

CREATE TYPE application_status AS ENUM (
    'draft',
    'pending',
    'approved',
    'rejected',
    'needs_more_docs'
);

CREATE TABLE applications (
    id                             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id                    UUID NOT NULL REFERENCES users(id),
    business_name                  VARCHAR(255),
    business_type                  VARCHAR(100),
    business_category              VARCHAR(100),
    business_subcategory           VARCHAR(255),
    free_zone                      BOOLEAN DEFAULT false,
    country                        VARCHAR(100),
    website                        VARCHAR(255),
    business_description           TEXT,
    monthly_volume                 VARCHAR(50),
    owner_name                     VARCHAR(255),
    contact_phone                  VARCHAR(50),
    contact_address                TEXT,
    -- Store Onboarding API fields
    mcc                            VARCHAR(10),
    store_type                     VARCHAR(50),
    contact_email                  VARCHAR(255),
    city                           VARCHAR(100),
    address_line1                  TEXT,
    address_line2                  TEXT,
    business_activities            VARCHAR(255),
    accept_international_payments  BOOLEAN DEFAULT false,
    settlement_currency            VARCHAR(10),
    settlement_bank_name           VARCHAR(255),
    settlement_bank_iban           VARCHAR(100),
    settlement_frequency           VARCHAR(100),
    -- Status & review
    status                         application_status DEFAULT 'draft',
    reviewer_id                    UUID REFERENCES users(id),
    reviewer_comment               TEXT,
    created_at                     TIMESTAMP DEFAULT NOW(),
    updated_at                     TIMESTAMP DEFAULT NOW()
);

CREATE TYPE document_type AS ENUM (
    'passport',
    'visa',
    'identity_document',
    'business_license',
    'memorandum_of_association',
    'business_documents',
    'trade_license',
    'tax',
    'bank_statement',
    'utility_bill',
    'other'
);

CREATE TABLE documents (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    application_id  UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    doc_type        VARCHAR(50) NOT NULL,
    original_name   VARCHAR(255) NOT NULL,
    storage_path    VARCHAR(500) NOT NULL,
    mime_type       VARCHAR(100),
    file_size       BIGINT,
    validation_status  VARCHAR(20) DEFAULT 'pending',
    validation_details TEXT,
    uploaded_at     TIMESTAMP DEFAULT NOW()
);

CREATE TABLE owners (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    application_id          UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    ownership_type          VARCHAR(50) NOT NULL,
    owner_type              VARCHAR(50),
    first_name              VARCHAR(255),
    last_name               VARCHAR(255),
    company_name            VARCHAR(255),
    email                   VARCHAR(255),
    identity_type           VARCHAR(50),
    identity_doc_id         UUID REFERENCES documents(id),
    created_at              TIMESTAMP DEFAULT NOW()
);

CREATE TABLE status_history (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    application_id  UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    changed_by      UUID NOT NULL REFERENCES users(id),
    old_status      application_status,
    new_status      application_status NOT NULL,
    comment         TEXT,
    changed_at      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_applications_merchant_id ON applications(merchant_id);
CREATE INDEX idx_applications_status ON applications(status);
CREATE INDEX idx_documents_application_id ON documents(application_id);
CREATE INDEX idx_owners_application_id ON owners(application_id);
CREATE INDEX idx_status_history_application_id ON status_history(application_id);

-- Test users (password: password123)
INSERT INTO users (email, password_hash, role, full_name) VALUES
(
    'merchant@test.com',
    '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
    'merchant',
    'Test Merchant'
),
(
    'reviewer@test.com',
    '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
    'reviewer',
    'Test Reviewer'
);
