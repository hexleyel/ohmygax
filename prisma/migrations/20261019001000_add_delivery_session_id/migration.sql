ALTER TABLE `deliveries`
  ADD COLUMN `session_id` INTEGER NULL,
  ADD CONSTRAINT `deliveries_session_id_fkey`
    FOREIGN KEY (`session_id`) REFERENCES `cash_sessions` (`session_id`)
    ON DELETE SET NULL
    ON UPDATE CASCADE;
