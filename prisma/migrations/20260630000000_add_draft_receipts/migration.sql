-- ============================================================
-- PAKFROST WMS — Draft Receipts Migration
-- Date: 2026-06-30
-- Runs AFTER: 20260628120000_gate_pass_void, 20260629000000_location_unique
-- Safe: ADD ONLY — zero changes to existing tables, zero conflict
--       with the Gate Pass Void/Restore system (different tables entirely)
-- ============================================================

-- CreateTable: draft_receipts
CREATE TABLE "draft_receipts" (
    "id"                     TEXT          NOT NULL,
    "igp_number"             VARCHAR(20)   NOT NULL,
    "vehicle_no"             VARCHAR(20)   NOT NULL,
    "driver_name"            VARCHAR(100)  NOT NULL,
    "driver_id"              VARCHAR(50),
    "seal_number"            VARCHAR(30),
    "temperature_at_receipt" DECIMAL(5,1)  NOT NULL,
    "product_temperature"    VARCHAR(10),
    "condition"              VARCHAR(20)   NOT NULL DEFAULT 'Good',
    "notes"                  TEXT,
    "order_ref"              VARCHAR(50),
    "time_in"                VARCHAR(5),
    "departure_time"         VARCHAR(5),
    "operator_name"          VARCHAR(100),
    "status"                 VARCHAR(20)   NOT NULL DEFAULT 'pending',
    "received_at"            TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at"           TIMESTAMPTZ,
    "stacked_by"             VARCHAR(100),

    CONSTRAINT "draft_receipts_pkey" PRIMARY KEY ("id")
);

-- Unique index on igp_number (each IGP can only have one draft)
CREATE UNIQUE INDEX "draft_receipts_igp_number_key" ON "draft_receipts"("igp_number");

-- Index for fast status filtering (dashboard query)
CREATE INDEX "draft_receipts_status_idx" ON "draft_receipts"("status");

-- CreateTable: draft_receipt_items
CREATE TABLE "draft_receipt_items" (
    "id"                TEXT          NOT NULL,
    "draft_id"          TEXT          NOT NULL,
    "product_id"        VARCHAR(50)   NOT NULL,
    "product_name"      VARCHAR(150)  NOT NULL,
    "product_code"      VARCHAR(30)   NOT NULL,
    "customer_id"       VARCHAR(50)   NOT NULL,
    "customer_name"     VARCHAR(100)  NOT NULL,
    "total_cartons"     INTEGER       NOT NULL,
    "stacked_cartons"   INTEGER       NOT NULL DEFAULT 0,
    "weight_per_carton" DECIMAL(10,2) NOT NULL,
    "packing_type"      VARCHAR(20)   NOT NULL DEFAULT 'Carton',
    "mfg_date"          DATE,
    "expiry_date"       DATE          NOT NULL,
    "batch_no"          VARCHAR(50),
    "lot_no"            VARCHAR(50),
    "uom"               VARCHAR(5)    NOT NULL DEFAULT 'Kg',

    CONSTRAINT "draft_receipt_items_pkey" PRIMARY KEY ("id")
);

-- Index for fast join
CREATE INDEX "draft_receipt_items_draft_id_idx" ON "draft_receipt_items"("draft_id");

-- Foreign key: cascade delete items when draft is deleted
ALTER TABLE "draft_receipt_items"
    ADD CONSTRAINT "draft_receipt_items_draft_id_fkey"
    FOREIGN KEY ("draft_id")
    REFERENCES "draft_receipts"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;
