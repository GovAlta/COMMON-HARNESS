-- Migration: 009_service_location
-- Description: Create service_location table for office/service location data

CREATE TABLE IF NOT EXISTS service_location (
    pk_service_location                     UUID          NOT NULL DEFAULT gen_random_uuid(),
    fk_service_location_service_category    UUID,
    location_name                           VARCHAR(255)  NOT NULL,
    location_address                        VARCHAR(500),
    location_city                           VARCHAR(100),
    location_region                         VARCHAR(100),
    location_latitude                       DECIMAL(10,7),
    location_longitude                      DECIMAL(10,7),
    location_phone                          VARCHAR(50),
    location_email                          VARCHAR(255),
    location_hours                          VARCHAR(500),
    location_services_offered               TEXT,
    location_accessibility_info             VARCHAR(500),
    location_status                         VARCHAR(20)   NOT NULL DEFAULT 'open',
    metadata                                JSONB         DEFAULT '{}'::jsonb,
    created_at                              TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at                              TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    created_by                              UUID,
    updated_by                              UUID,
    is_deleted                              BOOLEAN       NOT NULL DEFAULT false,
    deleted_at                              TIMESTAMPTZ,

    CONSTRAINT pk_service_location                  PRIMARY KEY (pk_service_location),
    CONSTRAINT fk_service_location_service_category FOREIGN KEY (fk_service_location_service_category)
        REFERENCES service_category (pk_service_category),
    CONSTRAINT fk_service_location_created_by       FOREIGN KEY (created_by)
        REFERENCES user_account (pk_user_account),
    CONSTRAINT fk_service_location_updated_by       FOREIGN KEY (updated_by)
        REFERENCES user_account (pk_user_account),
    CONSTRAINT ck_service_location_status           CHECK (location_status IN ('open', 'closed', 'limited'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS ix_service_location_region     ON service_location (location_region);
CREATE INDEX IF NOT EXISTS ix_service_location_status     ON service_location (location_status);
CREATE INDEX IF NOT EXISTS ix_service_location_category   ON service_location (fk_service_location_service_category);
CREATE INDEX IF NOT EXISTS ix_service_location_lat_lng    ON service_location (location_latitude, location_longitude);
CREATE INDEX IF NOT EXISTS ix_service_location_is_deleted ON service_location (is_deleted);
CREATE INDEX IF NOT EXISTS ix_service_location_city       ON service_location (location_city);

-- Auto-update updated_at
DROP TRIGGER IF EXISTS trg_service_location_set_updated_at ON service_location;
CREATE TRIGGER trg_service_location_set_updated_at
    BEFORE UPDATE ON service_location
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
