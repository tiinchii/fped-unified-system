-- Phase 3: procurement records (step 1), purchase requests (step 2), SPPMP items (step 3), routing (step 4)
-- and the budget of each office per year. The IDs already written on papers are kept as "code":
-- PROC-2027-00001 and PR-2027-00001.

-- Offices of the old Procurement System that are not in the list yet. Offices spelled differently in the two
-- old systems (ADJU / ADJUDICATION, ENGR / ENGINEERING, LIB / LIBRARY, …) are matched when the data is moved.
INSERT INTO offices (name) VALUES ('EPSDP'), ('FINANCE'), ('FISHCORE'), ('IAS'), ('IPRG'), ('USEC');

CREATE TABLE procurements (
    id                  BIGINT        NOT NULL AUTO_INCREMENT,
    code                VARCHAR(20)   NOT NULL,
    date_received       DATE          NULL,               -- empty on a few rows of the 2026 file; the year is then taken from the code
    office_id           BIGINT        NOT NULL,
    prepared_by         VARCHAR(150)  NULL,
    proposal_type       VARCHAR(20)   NOT NULL,           -- ACTIVITY_PROPOSAL, PROJECT_PROPOSAL, NONE
    with_atc            BOOLEAN       NOT NULL DEFAULT FALSE,
    proc_type           VARCHAR(20)   NOT NULL,           -- EVENT, EQUIPMENT, REPAIR, HIRING, OTHERS
    title               VARCHAR(500)  NOT NULL,
    item_details        VARCHAR(2000) NULL,               -- what equipment / what is repaired, one item per line
    venue               VARCHAR(500)  NULL,
    start_date          DATE          NULL,               -- event dates, or the contract of a hiring
    end_date            DATE          NULL,
    amount              DECIMAL(15,2) NULL,
    proposal_status     VARCHAR(30)   NULL,               -- FOR_REVIEW, SIGNED_WITHOUT_REVIEW, SIGNED_WITH_REVIEW
    atc_status          VARCHAR(30)   NULL,
    dts_no              VARCHAR(100)  NULL,
    logbook_no          VARCHAR(100)  NULL,
    status              VARCHAR(20)   NOT NULL,           -- ACTIVE, CANCELLED
    cancelled_at        DATETIME(6)   NULL,
    cancel_requested_by VARCHAR(150)  NULL,
    cancel_reason       VARCHAR(500)  NULL,
    cancelled_by        VARCHAR(60)   NULL,
    repeat_type         VARCHAR(20)   NULL,               -- REPEAT, RESUBMISSION, SAME_ACTIVITY, DIFFERENT
    repeat_of_id        BIGINT        NULL,
    repeat_note         VARCHAR(500)  NULL,
    remarks             VARCHAR(2000) NULL,
    source              VARCHAR(40)   NULL,               -- "Import 2026" on rows from the 2026 file
    encoded_by          VARCHAR(60)   NOT NULL,
    encoded_at          DATETIME(6)   NOT NULL,
    updated_by          VARCHAR(60)   NOT NULL,
    updated_at          DATETIME(6)   NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT uq_procurements_code UNIQUE (code),
    CONSTRAINT fk_procurements_office FOREIGN KEY (office_id) REFERENCES offices (id),
    CONSTRAINT fk_procurements_repeat_of FOREIGN KEY (repeat_of_id) REFERENCES procurements (id)
);
CREATE INDEX ix_procurements_received ON procurements (date_received);

CREATE TABLE purchase_requests (
    id                     BIGINT        NOT NULL AUTO_INCREMENT,
    code                   VARCHAR(20)   NOT NULL,
    procurement_id         BIGINT        NOT NULL,
    dts_no                 VARCHAR(100)  NULL,
    date_received          DATE          NULL,
    pr_date                DATE          NULL,
    requisitioner          VARCHAR(150)  NULL,
    title                  VARCHAR(500)  NOT NULL,
    venue                  VARCHAR(500)  NULL,
    start_date             DATE          NULL,
    end_date               DATE          NULL,
    amount                 DECIMAL(15,2) NOT NULL,
    plan                   VARCHAR(10)   NULL,            -- PPMP, SPPMP; empty = neither attached
    sppmp_justification    VARCHAR(2000) NULL,
    facility               VARCHAR(20)   NULL,            -- GOVERNMENT, NON_GOVERNMENT (events only)
    facility_justification VARCHAR(2000) NULL,
    pr_status              VARCHAR(30)   NULL,
    status                 VARCHAR(20)   NOT NULL,
    cancelled_at           DATETIME(6)   NULL,
    cancel_requested_by    VARCHAR(150)  NULL,
    cancel_reason          VARCHAR(500)  NULL,
    cancelled_by           VARCHAR(60)   NULL,
    replaces_id            BIGINT        NULL,            -- the cancelled PR this one takes the place of
    remarks                VARCHAR(2000) NULL,
    source                 VARCHAR(40)   NULL,
    encoded_by             VARCHAR(60)   NOT NULL,
    encoded_at             DATETIME(6)   NOT NULL,
    updated_by             VARCHAR(60)   NOT NULL,
    updated_at             DATETIME(6)   NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT uq_purchase_requests_code UNIQUE (code),
    CONSTRAINT fk_pr_procurement FOREIGN KEY (procurement_id) REFERENCES procurements (id),
    CONSTRAINT fk_pr_replaces FOREIGN KEY (replaces_id) REFERENCES purchase_requests (id)
);
CREATE INDEX ix_pr_procurement ON purchase_requests (procurement_id);

CREATE TABLE sppmp_items (
    id                  BIGINT        NOT NULL AUTO_INCREMENT,
    purchase_request_id BIGINT        NOT NULL,
    line_no             INT           NOT NULL,
    description         VARCHAR(1000) NOT NULL,
    amount              DECIMAL(15,2) NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_sppmp_pr FOREIGN KEY (purchase_request_id) REFERENCES purchase_requests (id)
);
CREATE INDEX ix_sppmp_pr ON sppmp_items (purchase_request_id);

CREATE TABLE routing_entries (
    id                  BIGINT        NOT NULL AUTO_INCREMENT,
    procurement_id      BIGINT        NOT NULL,
    purchase_request_id BIGINT        NULL,               -- empty = the proposal / the whole procurement
    happened_at         DATETIME(6)   NOT NULL,
    action              VARCHAR(30)   NOT NULL,           -- FORWARDED, REVIEWED, SIGNED, RETURNED, RECEIVED_BACK, OTHER
    person              VARCHAR(150)  NOT NULL,
    remarks             VARCHAR(1000) NULL,
    encoded_by          VARCHAR(60)   NOT NULL,
    encoded_at          DATETIME(6)   NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_routing_procurement FOREIGN KEY (procurement_id) REFERENCES procurements (id),
    CONSTRAINT fk_routing_pr FOREIGN KEY (purchase_request_id) REFERENCES purchase_requests (id)
);
CREATE INDEX ix_routing_procurement ON routing_entries (procurement_id);

CREATE TABLE budgets (
    id          BIGINT        NOT NULL AUTO_INCREMENT,
    budget_year INT           NOT NULL,
    office_id   BIGINT        NOT NULL,
    amount      DECIMAL(15,2) NOT NULL,
    updated_by  VARCHAR(60)   NOT NULL,
    updated_at  DATETIME(6)   NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT uq_budgets_year_office UNIQUE (budget_year, office_id),
    CONSTRAINT fk_budgets_office FOREIGN KEY (office_id) REFERENCES offices (id)
);

INSERT INTO app_locks (name) VALUES ('procurement');
