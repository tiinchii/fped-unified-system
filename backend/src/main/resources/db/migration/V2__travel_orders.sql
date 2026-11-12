-- Phase 2: offices, personnel and travel orders.
-- The IDs people already write on paper are kept as "code": P0001, TO-2026-00001.

CREATE TABLE offices (
    id     BIGINT      NOT NULL AUTO_INCREMENT,
    name   VARCHAR(60) NOT NULL,
    active BOOLEAN     NOT NULL DEFAULT TRUE,
    PRIMARY KEY (id),
    CONSTRAINT uq_offices_name UNIQUE (name)
);

INSERT INTO offices (name) VALUES
    ('VOC'), ('FRMD'), ('LEGAL'), ('NFDC'), ('NFLD'), ('FIMC'), ('IFAD'), ('FPHTD'), ('NFFTC'), ('ADJUDICATION'),
    ('FIQD'), ('CFD'), ('IFCU'), ('NBFTC'), ('PROPERTY'), ('NMC'), ('NIFTC'), ('MFDC'), ('NSTDC'), ('FRLD'),
    ('SEAWEEDS'), ('NFARMC'), ('ADMIN/HRMS'), ('IMEMS'), ('NAPC'), ('ADOTECH'), ('HIPON'), ('SAAD'), ('BAC'),
    ('GSS'), ('ENGINEERING'), ('ARS'), ('FIDSSD'), ('FSP'), ('FRPG'), ('VMS'), ('DO'), ('LIBRARY'), ('CASHIER'),
    ('GAD'), ('ADAS');

CREATE TABLE personnel (
    id            BIGINT       NOT NULL AUTO_INCREMENT,
    code          VARCHAR(12)  NOT NULL,                -- P0001
    name          VARCHAR(150) NOT NULL,
    name_key      VARCHAR(150) NOT NULL,                -- name without dots, commas and extra spaces: one person, one row
    office_id     BIGINT       NULL,
    position_title VARCHAR(150) NULL,
    employment    VARCHAR(20)  NULL,                    -- PERMANENT, COS
    active        BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at    DATETIME(6)  NOT NULL,
    updated_at    DATETIME(6)  NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT uq_personnel_code UNIQUE (code),
    CONSTRAINT uq_personnel_name_key UNIQUE (name_key),
    CONSTRAINT fk_personnel_office FOREIGN KEY (office_id) REFERENCES offices (id)
);

CREATE TABLE travel_orders (
    id             BIGINT        NOT NULL AUTO_INCREMENT,
    code           VARCHAR(20)   NOT NULL,              -- TO-2026-00001; numbering starts again every year
    date_filed     DATE          NOT NULL,
    office_id      BIGINT        NOT NULL,
    destination    VARCHAR(500)  NOT NULL,
    purpose        VARCHAR(2000) NOT NULL,
    start_date     DATE          NOT NULL,
    end_date       DATE          NOT NULL,
    dts_no         VARCHAR(100)  NULL,
    to_no          VARCHAR(100)  NULL,
    status         VARCHAR(20)   NOT NULL,              -- ACTIVE, CANCELLED
    remarks        VARCHAR(2000) NULL,
    overlap_reason VARCHAR(1000) NULL,                  -- why it was saved although a traveler had other travel
    encoded_by     VARCHAR(60)   NOT NULL,
    encoded_at     DATETIME(6)   NOT NULL,
    updated_by     VARCHAR(60)   NOT NULL,
    updated_at     DATETIME(6)   NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT uq_travel_orders_code UNIQUE (code),
    CONSTRAINT fk_travel_orders_office FOREIGN KEY (office_id) REFERENCES offices (id)
);
CREATE INDEX ix_travel_orders_dates ON travel_orders (start_date, end_date);

CREATE TABLE travel_order_travelers (
    travel_order_id BIGINT NOT NULL,
    personnel_id    BIGINT NOT NULL,
    PRIMARY KEY (travel_order_id, personnel_id),
    CONSTRAINT fk_tot_travel_order FOREIGN KEY (travel_order_id) REFERENCES travel_orders (id),
    CONSTRAINT fk_tot_personnel FOREIGN KEY (personnel_id) REFERENCES personnel (id)
);
CREATE INDEX ix_tot_personnel ON travel_order_travelers (personnel_id);

-- One row per change of dates and/or place (the old "Reschedule History" column).
CREATE TABLE travel_order_changes (
    id              BIGINT        NOT NULL AUTO_INCREMENT,
    travel_order_id BIGINT        NOT NULL,
    old_start_date  DATE          NOT NULL,
    old_end_date    DATE          NOT NULL,
    new_start_date  DATE          NOT NULL,
    new_end_date    DATE          NOT NULL,
    old_destination VARCHAR(500)  NOT NULL,
    new_destination VARCHAR(500)  NOT NULL,
    reason          VARCHAR(1000) NOT NULL,
    changed_by      VARCHAR(60)   NOT NULL,
    changed_at      DATETIME(6)   NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_toc_travel_order FOREIGN KEY (travel_order_id) REFERENCES travel_orders (id)
);
CREATE INDEX ix_toc_travel_order ON travel_order_changes (travel_order_id);

-- A row is locked while a record is saved, so two people saving at the same moment are handled one after
-- the other (overlap check, next TO number, duplicate name).
CREATE TABLE app_locks (
    name VARCHAR(40) NOT NULL,
    PRIMARY KEY (name)
);
INSERT INTO app_locks (name) VALUES ('travel');
