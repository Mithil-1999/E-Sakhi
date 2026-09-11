-- CreateEnum
CREATE TYPE "user_role" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "verification_status" AS ENUM ('VERIFIED', 'PARTIALLY_VERIFIED', 'UNVERIFIED', 'NEEDS_REVIEW', 'UNKNOWN', 'ASSUMED');

-- CreateEnum
CREATE TYPE "station_status" AS ENUM ('ACTIVE', 'INACTIVE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "charger_availability" AS ENUM ('AVAILABLE', 'BUSY', 'UNAVAILABLE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "charging_mode" AS ENUM ('AC', 'DC', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "vehicle_type" AS ENUM ('CAR', 'SCOOTER', 'MOTORCYCLE', 'OTHER');

-- CreateEnum
CREATE TYPE "report_type" AS ENUM ('WRONG_LOCATION', 'WRONG_CONNECTOR', 'WRONG_POWER', 'STATION_UNAVAILABLE', 'WRONG_CONTACT', 'DUPLICATE_STATION', 'OTHER');

-- CreateEnum
CREATE TYPE "report_status" AS ENUM ('PENDING', 'REVIEWING', 'RESOLVED', 'REJECTED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "user_role" NOT NULL DEFAULT 'USER',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operators" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contact" TEXT,
    "website" TEXT,
    "logo" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "operators_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "connectors" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "connectors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "connector_aliases" (
    "id" TEXT NOT NULL,
    "connector_id" TEXT NOT NULL,
    "alias_text" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "connector_aliases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stations" (
    "id" TEXT NOT NULL,
    "station_id" TEXT,
    "station_name" TEXT NOT NULL,
    "operator_id" TEXT,
    "province" TEXT NOT NULL,
    "district" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "contact" TEXT,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "map_url" TEXT,
    "status" "station_status" NOT NULL DEFAULT 'UNKNOWN',
    "verification_status" "verification_status" NOT NULL DEFAULT 'UNKNOWN',
    "assumption_flag" BOOLEAN NOT NULL DEFAULT false,
    "verification_source" TEXT,
    "last_verified" TIMESTAMP(3),
    "location_verified" BOOLEAN NOT NULL DEFAULT false,
    "connector_verified" BOOLEAN NOT NULL DEFAULT false,
    "power_verified" BOOLEAN NOT NULL DEFAULT false,
    "contact_verified" BOOLEAN NOT NULL DEFAULT false,
    "availability_verified" BOOLEAN NOT NULL DEFAULT false,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chargers" (
    "id" TEXT NOT NULL,
    "station_id" TEXT NOT NULL,
    "plug_id" TEXT,
    "charging_mode" "charging_mode" NOT NULL DEFAULT 'UNKNOWN',
    "power_kw" DECIMAL(6,2),
    "vehicle_type" "vehicle_type",
    "availability" "charger_availability" NOT NULL DEFAULT 'UNKNOWN',
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chargers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "charger_connectors" (
    "id" TEXT NOT NULL,
    "charger_id" TEXT NOT NULL,
    "connector_id" TEXT NOT NULL,

    CONSTRAINT "charger_connectors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicles" (
    "id" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "vehicle_type" "vehicle_type" NOT NULL,
    "battery_capacity_kwh" DECIMAL(6,2) NOT NULL,
    "max_dc_power_kw" DECIMAL(6,2),
    "max_ac_power_kw" DECIMAL(6,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_connectors" (
    "id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "connector_id" TEXT NOT NULL,

    CONSTRAINT "vehicle_connectors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "favorites" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "station_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "favorites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reviews" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "station_id" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "station_id" TEXT NOT NULL,
    "report_type" "report_type" NOT NULL,
    "description" TEXT,
    "status" "report_status" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_logs" (
    "id" TEXT NOT NULL,
    "station_id" TEXT NOT NULL,
    "admin_id" TEXT,
    "field_changed" TEXT NOT NULL,
    "old_value" TEXT,
    "new_value" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "operators_name_key" ON "operators"("name");

-- CreateIndex
CREATE UNIQUE INDEX "connectors_code_key" ON "connectors"("code");

-- CreateIndex
CREATE INDEX "connector_aliases_connector_id_idx" ON "connector_aliases"("connector_id");

-- CreateIndex
CREATE UNIQUE INDEX "connector_aliases_alias_text_key" ON "connector_aliases"("alias_text");

-- CreateIndex
CREATE UNIQUE INDEX "stations_station_id_key" ON "stations"("station_id");

-- CreateIndex
CREATE INDEX "stations_province_idx" ON "stations"("province");

-- CreateIndex
CREATE INDEX "stations_district_idx" ON "stations"("district");

-- CreateIndex
CREATE INDEX "stations_city_idx" ON "stations"("city");

-- CreateIndex
CREATE INDEX "stations_status_idx" ON "stations"("status");

-- CreateIndex
CREATE INDEX "stations_verification_status_idx" ON "stations"("verification_status");

-- CreateIndex
CREATE INDEX "stations_operator_id_idx" ON "stations"("operator_id");

-- CreateIndex
CREATE INDEX "stations_is_deleted_idx" ON "stations"("is_deleted");

-- CreateIndex
CREATE UNIQUE INDEX "chargers_plug_id_key" ON "chargers"("plug_id");

-- CreateIndex
CREATE INDEX "chargers_station_id_idx" ON "chargers"("station_id");

-- CreateIndex
CREATE INDEX "chargers_charging_mode_idx" ON "chargers"("charging_mode");

-- CreateIndex
CREATE INDEX "chargers_is_deleted_idx" ON "chargers"("is_deleted");

-- CreateIndex
CREATE INDEX "charger_connectors_connector_id_idx" ON "charger_connectors"("connector_id");

-- CreateIndex
CREATE UNIQUE INDEX "charger_connectors_charger_id_connector_id_key" ON "charger_connectors"("charger_id", "connector_id");

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_brand_model_key" ON "vehicles"("brand", "model");

-- CreateIndex
CREATE INDEX "vehicle_connectors_connector_id_idx" ON "vehicle_connectors"("connector_id");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_connectors_vehicle_id_connector_id_key" ON "vehicle_connectors"("vehicle_id", "connector_id");

-- CreateIndex
CREATE INDEX "favorites_station_id_idx" ON "favorites"("station_id");

-- CreateIndex
CREATE UNIQUE INDEX "favorites_user_id_station_id_key" ON "favorites"("user_id", "station_id");

-- CreateIndex
CREATE INDEX "reviews_station_id_idx" ON "reviews"("station_id");

-- CreateIndex
CREATE UNIQUE INDEX "reviews_user_id_station_id_key" ON "reviews"("user_id", "station_id");

-- CreateIndex
CREATE INDEX "reports_station_id_idx" ON "reports"("station_id");

-- CreateIndex
CREATE INDEX "reports_status_idx" ON "reports"("status");

-- CreateIndex
CREATE INDEX "verification_logs_station_id_idx" ON "verification_logs"("station_id");

-- AddForeignKey
ALTER TABLE "connector_aliases" ADD CONSTRAINT "connector_aliases_connector_id_fkey" FOREIGN KEY ("connector_id") REFERENCES "connectors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stations" ADD CONSTRAINT "stations_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "operators"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stations" ADD CONSTRAINT "stations_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chargers" ADD CONSTRAINT "chargers_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "stations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chargers" ADD CONSTRAINT "chargers_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "charger_connectors" ADD CONSTRAINT "charger_connectors_charger_id_fkey" FOREIGN KEY ("charger_id") REFERENCES "chargers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "charger_connectors" ADD CONSTRAINT "charger_connectors_connector_id_fkey" FOREIGN KEY ("connector_id") REFERENCES "connectors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_connectors" ADD CONSTRAINT "vehicle_connectors_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_connectors" ADD CONSTRAINT "vehicle_connectors_connector_id_fkey" FOREIGN KEY ("connector_id") REFERENCES "connectors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "stations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "stations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "stations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_logs" ADD CONSTRAINT "verification_logs_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "stations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_logs" ADD CONSTRAINT "verification_logs_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CheckConstraint
-- Rating range is validated server-side (src/lib/validation), but a database
-- constraint guards against any write path that skips application validation.
-- See docs/data-model.md "Review" section.
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_rating_range" CHECK ("rating" >= 1 AND "rating" <= 5);
