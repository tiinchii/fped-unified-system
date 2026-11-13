-- Document checklist of a travel order. The list of documents is kept by an Admin in Settings (it starts empty:
-- the division has not listed the documents yet). One checklist per travel order: a row = that document is there.

CREATE TABLE to_document_types (
    id         BIGINT       NOT NULL AUTO_INCREMENT,
    name       VARCHAR(150) NOT NULL,
    sort_order INT          NOT NULL,
    active     BOOLEAN      NOT NULL DEFAULT TRUE,     -- a hidden document stays on old checklists but is no longer asked for
    PRIMARY KEY (id),
    CONSTRAINT uq_to_document_types_name UNIQUE (name)
);

CREATE TABLE travel_order_documents (
    id               BIGINT      NOT NULL AUTO_INCREMENT,
    travel_order_id  BIGINT      NOT NULL,
    document_type_id BIGINT      NOT NULL,
    checked_by       VARCHAR(60) NOT NULL,
    checked_at       DATETIME(6) NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT uq_tod_order_type UNIQUE (travel_order_id, document_type_id),
    CONSTRAINT fk_tod_order FOREIGN KEY (travel_order_id) REFERENCES travel_orders (id),
    CONSTRAINT fk_tod_type FOREIGN KEY (document_type_id) REFERENCES to_document_types (id)
);
