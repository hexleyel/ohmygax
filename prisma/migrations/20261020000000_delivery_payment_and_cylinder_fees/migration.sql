ALTER TABLE `deliveries`
  ADD COLUMN `gcash_mobile` VARCHAR(20) NULL,
  ADD COLUMN `gcash_reference` VARCHAR(40) NULL;

ALTER TABLE `delivery_items`
  ADD COLUMN `without_cylinder_qty` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `cylinder_fee` DECIMAL(12, 2) NOT NULL DEFAULT 0;