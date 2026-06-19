-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('admin', 'supervisor', 'operator', 'viewer');

-- CreateEnum
CREATE TYPE "PalletStatus" AS ENUM ('active', 'dispatched', 'expired', 'damaged');

-- CreateEnum
CREATE TYPE "PalletCondition" AS ENUM ('Good', 'Damaged', 'Partial');

-- CreateEnum
CREATE TYPE "MovementType" AS ENUM ('IN', 'OUT', 'MOVE');

-- CreateEnum
CREATE TYPE "DriverStatus" AS ENUM ('active', 'inactive');

-- CreateEnum
CREATE TYPE "VehicleType" AS ENUM ('Reefer_Truck', 'Container', 'Pickup', 'Van', 'Other');

-- CreateEnum
CREATE TYPE "VehicleOwnership" AS ENUM ('own', 'external');

-- CreateEnum
CREATE TYPE "VehicleStatus" AS ENUM ('active', 'inactive');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "username" VARCHAR(50) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'operator',
    "avatar" VARCHAR(10),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "custom_permissions" JSONB,
    "refresh_token" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "contact_person" VARCHAR(100),
    "phone" VARCHAR(20),
    "email" VARCHAR(100),
    "address" TEXT,
    "temp_requirement" VARCHAR(50),
    "contract_expiry" DATE,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "category" VARCHAR(50) NOT NULL,
    "cartons_per_pallet" INTEGER NOT NULL DEFAULT 0,
    "weight_per_carton" DECIMAL(10,2) NOT NULL,
    "uom" VARCHAR(5) NOT NULL DEFAULT 'Kg',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drivers" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "cnic" VARCHAR(20) NOT NULL,
    "phone" VARCHAR(20) NOT NULL,
    "license_no" VARCHAR(30) NOT NULL,
    "license_expiry" DATE NOT NULL,
    "joining_date" DATE,
    "status" "DriverStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "drivers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicles" (
    "id" TEXT NOT NULL,
    "vehicle_no" VARCHAR(20) NOT NULL,
    "type" "VehicleType" NOT NULL DEFAULT 'Reefer_Truck',
    "ownership" "VehicleOwnership" NOT NULL DEFAULT 'own',
    "route_permit_expiry" DATE,
    "token_expiry" DATE,
    "fitness_expiry" DATE,
    "insurance_expiry" DATE,
    "status" "VehicleStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pallets" (
    "id" VARCHAR(30) NOT NULL,
    "igp_number" VARCHAR(20) NOT NULL,
    "vehicle_no" VARCHAR(20) NOT NULL,
    "driver_name" VARCHAR(100) NOT NULL,
    "driver_id" VARCHAR(50),
    "seal_number" VARCHAR(30),
    "product_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "product_name" VARCHAR(150) NOT NULL,
    "product_code" VARCHAR(30) NOT NULL,
    "customer_name" VARCHAR(100) NOT NULL,
    "cartons" INTEGER NOT NULL,
    "weight_per_carton" DECIMAL(10,2) NOT NULL,
    "total_weight" DECIMAL(12,2) NOT NULL,
    "packing_type" VARCHAR(20),
    "mfg_date" DATE,
    "expiry_date" DATE NOT NULL,
    "batch_no" VARCHAR(50),
    "lot_no" VARCHAR(50),
    "order_ref" VARCHAR(50),
    "date_in" DATE NOT NULL,
    "time_in" VARCHAR(5),
    "departure_time" VARCHAR(5),
    "room" VARCHAR(20) NOT NULL,
    "side" VARCHAR(1) NOT NULL,
    "row" VARCHAR(5) NOT NULL,
    "slot" VARCHAR(5) NOT NULL,
    "position" INTEGER,
    "status" "PalletStatus" NOT NULL DEFAULT 'active',
    "condition" "PalletCondition" NOT NULL DEFAULT 'Good',
    "temperature_at_receipt" DECIMAL(5,1) NOT NULL,
    "product_temperature" VARCHAR(10),
    "notes" TEXT,
    "revised" BOOLEAN NOT NULL DEFAULT false,
    "revised_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "pallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" TEXT NOT NULL,
    "doc_number" VARCHAR(20) NOT NULL,
    "type" "MovementType" NOT NULL,
    "pallet_id" VARCHAR(30) NOT NULL,
    "customer_id" VARCHAR(50) NOT NULL,
    "customer_name" VARCHAR(100) NOT NULL,
    "product_name" VARCHAR(150) NOT NULL,
    "product_code" VARCHAR(30) NOT NULL,
    "cartons" INTEGER NOT NULL,
    "total_weight" DECIMAL(12,2) NOT NULL,
    "location" VARCHAR(50) NOT NULL,
    "vehicle_no" VARCHAR(20),
    "driver_name" VARCHAR(100),
    "driver_id" VARCHAR(50),
    "destination" VARCHAR(100),
    "reason" VARCHAR(100),
    "notes" TEXT,
    "vehicle_temp" VARCHAR(10),
    "condition" VARCHAR(20),
    "operator_name" VARCHAR(100),
    "order_ref" VARCHAR(50),
    "revised" BOOLEAN NOT NULL DEFAULT false,
    "revised_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "temperature_readings" (
    "id" TEXT NOT NULL,
    "room" VARCHAR(20) NOT NULL,
    "temperature" DECIMAL(5,1) NOT NULL,
    "recorded_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recorded_by" VARCHAR(100) NOT NULL,
    "notes" TEXT,

    CONSTRAINT "temperature_readings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "doc_counters" (
    "id" TEXT NOT NULL DEFAULT 'main',
    "igp_seq" INTEGER NOT NULL DEFAULT 0,
    "igp_year" INTEGER NOT NULL DEFAULT 2026,
    "ogp_seq" INTEGER NOT NULL DEFAULT 0,
    "ogp_year" INTEGER NOT NULL DEFAULT 2026,

    CONSTRAINT "doc_counters_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "customers_code_key" ON "customers"("code");

-- CreateIndex
CREATE UNIQUE INDEX "products_code_key" ON "products"("code");

-- CreateIndex
CREATE UNIQUE INDEX "drivers_code_key" ON "drivers"("code");

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_vehicle_no_key" ON "vehicles"("vehicle_no");

-- CreateIndex
CREATE INDEX "pallets_igp_number_idx" ON "pallets"("igp_number");

-- CreateIndex
CREATE INDEX "pallets_expiry_date_idx" ON "pallets"("expiry_date");

-- CreateIndex
CREATE INDEX "pallets_customer_id_idx" ON "pallets"("customer_id");

-- CreateIndex
CREATE INDEX "pallets_status_idx" ON "pallets"("status");

-- CreateIndex
CREATE INDEX "stock_movements_doc_number_idx" ON "stock_movements"("doc_number");

-- CreateIndex
CREATE INDEX "stock_movements_type_idx" ON "stock_movements"("type");

-- CreateIndex
CREATE INDEX "stock_movements_customer_id_idx" ON "stock_movements"("customer_id");

-- CreateIndex
CREATE INDEX "stock_movements_created_at_idx" ON "stock_movements"("created_at");

-- CreateIndex
CREATE INDEX "temperature_readings_room_idx" ON "temperature_readings"("room");

-- CreateIndex
CREATE INDEX "temperature_readings_recorded_at_idx" ON "temperature_readings"("recorded_at");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pallets" ADD CONSTRAINT "pallets_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pallets" ADD CONSTRAINT "pallets_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_pallet_id_fkey" FOREIGN KEY ("pallet_id") REFERENCES "pallets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

