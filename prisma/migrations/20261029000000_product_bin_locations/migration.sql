-- Give every existing assigned location a deterministic product-specific slot.
-- This also resolves any duplicate bin IDs already present in the catalog.
UPDATE `products`
SET `location` = CONCAT(`location`, '-', LPAD(`product_id`, 2, '0'))
WHERE `location` IS NOT NULL;

-- Put the example items in adjacent, human-readable bins.
UPDATE `products`
SET `location` = CONCAT(`location`, '-P', `product_id`)
WHERE `location` = 'SHELF-C2-01'
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
SET `location` = CONCAT(`location`, '-P', `product_id`)
WHERE `location` = 'SHELF-C2-02'
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
SET `location` = 'SHELF-C2-01'
WHERE `product_id` = (
  SELECT `product_id` FROM (
    SELECT `product_id`
    FROM `products`
    WHERE `name` LIKE '%Gas Stove%' AND `status` = 'active'
    ORDER BY `product_id`
    LIMIT 1
  ) AS `gas_stove`
);

UPDATE `products`
SET `location` = 'SHELF-C2-02'
WHERE `product_id` = (
  SELECT `product_id` FROM (
    SELECT `product_id`
    FROM `products`
    WHERE `name` = 'Rubber Hose 1.5m' AND `status` = 'active'
    ORDER BY `product_id`
    LIMIT 1
  ) AS `rubber_hose`
);

CREATE INDEX `products_location_status_idx` ON `products` (`location`, `status`);
