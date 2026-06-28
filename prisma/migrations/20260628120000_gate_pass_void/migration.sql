-- Gate pass undo/redo: voided status + snapshots

-- CreateEnum
CREATE TYPE "MovementStatus" AS ENUM ('active', 'voided');

-- AlterEnum
ALTER TYPE "PalletStatus" ADD VALUE 'voided';

-- AlterTable pallets
ALTER TABLE "pallets" ADD COLUMN "voided_at" TIMESTAMPTZ;

-- AlterTable stock_movements
ALTER TABLE "stock_movements" ADD COLUMN "status" "MovementStatus" NOT NULL DEFAULT 'active';
ALTER TABLE "stock_movements" ADD COLUMN "voided_at" TIMESTAMPTZ;
ALTER TABLE "stock_movements" ADD COLUMN "voided_by" VARCHAR(100);
ALTER TABLE "stock_movements" ADD COLUMN "void_reason" TEXT;

-- CreateIndex
CREATE INDEX "stock_movements_status_idx" ON "stock_movements"("status");

-- CreateTable
CREATE TABLE "gate_pass_snapshots" (
    "id" TEXT NOT NULL,
    "doc_number" VARCHAR(20) NOT NULL,
    "doc_type" VARCHAR(3) NOT NULL,
    "snapshot" JSONB NOT NULL,
    "voided_by" VARCHAR(100),
    "void_reason" TEXT,
    "voided_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "gate_pass_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "gate_pass_snapshots_doc_number_key" ON "gate_pass_snapshots"("doc_number");
CREATE INDEX "gate_pass_snapshots_doc_type_idx" ON "gate_pass_snapshots"("doc_type");
