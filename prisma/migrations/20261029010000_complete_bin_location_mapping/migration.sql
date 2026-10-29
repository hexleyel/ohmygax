-- Assign bins to products that were previously unassigned.
UPDATE `products`
SET `location` = CONCAT('BIN-PRODUCT-', `product_id`, '-01')
WHERE `location` IS NULL OR TRIM(`location`) = '';

-- Convert rack or shelf names without a slot segment to bin IDs.
UPDATE `products`
SET `location` = CONCAT(UPPER(TRIM(`location`)), '-01')
WHERE `location` NOT REGEXP '^[A-Z0-9]+(-[A-Z0-9]+){2,}$';

-- Resolve any remaining duplicate IDs deterministically.
UPDATE `products` AS `p`
JOIN (
  SELECT
    `product_id`,
    `location`,
    ROW_NUMBER() OVER (PARTITION BY `location` ORDER BY `product_id`) AS `slot_number`
  FROM `products`
  WHERE `location` IS NOT NULL
) AS `slots` ON `slots`.`product_id` = `p`.`product_id`
SET `p`.`location` = CONCAT(`slots`.`location`, '-P', `p`.`product_id`)
WHERE `slots`.`slot_number` > 1;

-- Reserve the requested adjacent shelf bins for Rubber Hose and Gas Stove.
UPDATE `products`
SET `location` = CONCAT(`location`, '-P', `product_id`)
WHERE `location` = 'SHELF-C2-01'
  AND `product_id` <> COALESCE((
    SELECT `product_id` FROM (
      SELECT `product_id`
      FROM `products`
      WHERE `name` = 'Rubber Hose 1.5m' AND `status` = 'active'
      ORDER BY `product_id`
      LIMIT 1
    ) AS `rubber_hose`
  ), -1);

UPDATE `products`
SET `location` = CONCAT(`location`, '-P', `product_id`)
WHERE `location` = 'SHELF-C2-02'
  AND `product_id` <> COALESCE((
    SELECT `product_id` FROM (
      SELECT `product_id`
      FROM `products`
      WHERE `name` LIKE '%Gas Stove%' AND `status` = 'active'
      ORDER BY `product_id`
      LIMIT 1
    ) AS `gas_stove`
  ), -1);

UPDATE `products`
SET `location` = 'SHELF-C2-01'
WHERE `product_id` = (
  SELECT `product_id` FROM (
    SELECT `product_id`
    FROM `products`
    WHERE `name` = 'Rubber Hose 1.5m' AND `status` = 'active'
    ORDER BY `product_id`
    LIMIT 1
  ) AS `rubber_hose`
);

UPDATE `products`
SET `location` = 'SHELF-C2-02'
WHERE `product_id` = (
  SELECT `product_id` FROM (
    SELECT `product_id`
    FROM `products`
    WHERE `name` LIKE '%Gas Stove%' AND `status` = 'active'
    ORDER BY `product_id`
    LIMIT 1
  ) AS `gas_stove`
);
