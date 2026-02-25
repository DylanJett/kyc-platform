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
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id         UUID NOT NULL REFERENCES users(id),
    business_name       VARCHAR(255),
    business_type       VARCHAR(100),
    country             VARCHAR(100),
    website             VARCHAR(255),
    business_description TEXT,
    monthly_volume      VARCHAR(50),
    contact_phone       VARCHAR(50),
    contact_address     TEXT,
    status              application_status DEFAULT 'draft',
    reviewer_id         UUID REFERENCES users(id),
    reviewer_comment    TEXT,
    created_at          TIMESTAMP DEFAULT NOW(),
    updated_at          TIMESTAMP DEFAULT NOW()
);

CREATE TYPE document_type AS ENUM (
    'passport',
    'business_license',
    'bank_statement',
    'utility_bill',
    'other'
);

CREATE TABLE documents (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    application_id  UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    doc_type        document_type NOT NULL,
    original_name   VARCHAR(255) NOT NULL,
    storage_path    VARCHAR(500) NOT NULL,
    mime_type       VARCHAR(100),
    file_size       BIGINT,
    uploaded_at     TIMESTAMP DEFAULT NOW()
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
CREATE INDEX idx_status_history_application_id ON status_history(application_id);

-- Тестовые пользователи (пароль: password123)
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