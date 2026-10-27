export class InsufficientStockError extends Error {
  constructor(productName: string) {
    super(`Insufficient stock for ${productName}`);
    this.name = "InsufficientStockError";
  }
}

/** A resource's state changed under us (double-submit, stale status, etc). */
export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}
