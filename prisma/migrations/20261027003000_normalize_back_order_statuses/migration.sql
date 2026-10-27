-- Normalize saved purchase order and receipt statuses to the Back Order name.
UPDATE `purchase_orders`
SET `status` = 'back-order'
WHERE `status` = 'on-hold';

UPDATE `purchase_order_items`
SET `receive_status` = 'back-order'
WHERE `receive_status` = 'on-hold';

UPDATE `audit_logs`
SET `action` = 'PO_RECEIVE_BACK_ORDER'
WHERE `action` = 'PO_RECEIVE_ON_HOLD';
