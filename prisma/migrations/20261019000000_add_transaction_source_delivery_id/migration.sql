ALTER TABLE `transactions`
  ADD COLUMN `source_delivery_id` INTEGER NULL,
  ADD UNIQUE INDEX `transactions_source_delivery_id_key` (`source_delivery_id`),
  ADD CONSTRAINT `transactions_source_delivery_id_fkey`
    FOREIGN KEY (`source_delivery_id`) REFERENCES `deliveries` (`delivery_id`)
    ON DELETE SET NULL
    ON UPDATE CASCADE;
