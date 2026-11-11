-- Phase 1: logins, audit log and the links in the portal menu.

CREATE TABLE users (
    id              BIGINT       NOT NULL AUTO_INCREMENT,
    username        VARCHAR(30)  NOT NULL,
    full_name       VARCHAR(150) NOT NULL,
    role            VARCHAR(20)  NOT NULL,              -- ADMIN, ENCODER, VIEWER
    active          BOOLEAN      NOT NULL DEFAULT TRUE,
    password_hash   VARCHAR(100) NULL,                  -- BCrypt
    legacy_salt     VARCHAR(64)  NULL,                  -- from the old Google Sheet, until the first login here
    legacy_hash     VARCHAR(64)  NULL,
    failed_attempts INT          NOT NULL DEFAULT 0,
    locked_until    DATETIME(6)  NULL,
    last_login_at   DATETIME(6)  NULL,
    created_at      DATETIME(6)  NOT NULL,
    updated_at      DATETIME(6)  NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT uq_users_username UNIQUE (username)
);

CREATE TABLE audit_log (
    id        BIGINT        NOT NULL AUTO_INCREMENT,
    logged_at DATETIME(6)   NOT NULL,
    username  VARCHAR(60)   NOT NULL,
    action    VARCHAR(40)   NOT NULL,
    record_id VARCHAR(60)   NULL,
    details   VARCHAR(1000) NULL,
    PRIMARY KEY (id)
);
CREATE INDEX ix_audit_log_logged_at ON audit_log (logged_at);

CREATE TABLE portal_links (
    id          BIGINT       NOT NULL AUTO_INCREMENT,
    code        VARCHAR(20)  NOT NULL,
    name        VARCHAR(80)  NOT NULL,
    description VARCHAR(255) NULL,
    url         VARCHAR(500) NULL,                      -- set by an Admin in Settings
    roles       VARCHAR(60)  NOT NULL,                  -- who sees it: ADMIN,ENCODER,VIEWER
    color       VARCHAR(7)   NOT NULL,
    sort_order  INT          NOT NULL,
    active      BOOLEAN      NOT NULL DEFAULT TRUE,
    PRIMARY KEY (id),
    CONSTRAINT uq_portal_links_code UNIQUE (code)
);

-- The two other systems of the division. Their addresses are entered in Settings, not kept in the code.
INSERT INTO portal_links (code, name, description, url, roles, color, sort_order, active) VALUES
    ('find', 'FIND', NULL,                             NULL, 'ADMIN,ENCODER,VIEWER', '#117a65', 1, TRUE),
    ('fast', 'FAST', 'File, Asset and Supply Tracker', NULL, 'ADMIN,ENCODER,VIEWER', '#b9770e', 2, TRUE);
