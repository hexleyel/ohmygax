type StockTierProduct = {
  stock_qty: number;
  new_stock_qty: number;
  old_stock_qty: number;
  last_restocked_at: Date | string | null;
  created_at: Date | string;
};

export type StockTier = "new" | "old";

/**
 * Existing databases gain the tier columns with zero defaults. Until a
 * product is next changed, place its legacy stock in the age-based bucket.
 */
export function stockTierQuantities(product: StockTierProduct) {
  let newStock = Number(product.new_stock_qty) || 0;
  let oldStock = Number(product.old_stock_qty) || 0;
  const difference = Number(product.stock_qty) - newStock - oldStock;

  if (newStock === 0 && oldStock === 0 && Number(product.stock_qty) > 0) {
    const since = product.last_restocked_at || product.created_at;
    const timestamp = since instanceof Date ? since.getTime() : new Date(since).getTime();
    const days = (Date.now() - timestamp) / 86_400_000;
    if (days <= 30) newStock = Number(product.stock_qty);
    else oldStock = Number(product.stock_qty);
  } else if (difference > 0) {
    newStock += difference;
  } else if (difference < 0) {
    const reduction = -difference;
    const fromOld = Math.min(oldStock, reduction);
    oldStock -= fromOld;
    newStock = Math.max(0, newStock - (reduction - fromOld));
  }

  return { newStock, oldStock };
}

/** Remove stock FIFO: consume Old Stocks first, then New Stocks. */
export function consumeStockTiers(
  tiers: { newStock: number; oldStock: number },
  quantity: number,
) {
  const fromOld = Math.min(tiers.oldStock, quantity);
  const fromNew = quantity - fromOld;
  return {
    newStock: tiers.newStock - fromNew,
    oldStock: tiers.oldStock - fromOld,
  };
}
