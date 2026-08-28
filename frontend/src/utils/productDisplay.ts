// frontend/src/utils/productDisplay.ts

/**
 * Utility functions for displaying product stock and prices
 * in dual-unit formats (base unit and alternative sales unit).
 */

/**
 * Get the base unit stock and sales unit stock from total base stock.
 * @param totalBaseStock - Total stock in base units (e.g., 100 bags)
 * @param conversionFactor - How many base units make one sales unit (e.g., 50 kg per bag)
 * @returns { baseStock, salesStock, remainderBase }
 */
export function getDualUnitStock(
  totalBaseStock: number,
  conversionFactor: number | null | undefined
): { baseStock: number; salesStock: number; remainderBase: number } {
  if (!conversionFactor || conversionFactor <= 0) {
    return {
      baseStock: totalBaseStock,
      salesStock: 0,
      remainderBase: 0,
    };
  }

  const salesStock = Math.floor(totalBaseStock / conversionFactor);
  const remainderBase = totalBaseStock % conversionFactor;

  return {
    baseStock: totalBaseStock,
    salesStock,
    remainderBase,
  };
}

/**
 * Format stock display string.
 * Example: "100 bags (2,000 kg)" or "193 wheelbarrow (8 tonne + 1 wheelbarrow)"
 * @param totalBaseStock - Total stock in base units
 * @param baseUnit - Base unit name (e.g., "bag", "wheelbarrow")
 * @param salesUnit - Alternative sales unit name (e.g., "kg", "tonne")
 * @param conversionFactor - Conversion factor (base units per sales unit)
 * @returns Formatted stock string
 */
export function getStockDisplay(
  totalBaseStock: number,
  baseUnit: string,
  salesUnit?: string | null,
  conversionFactor?: number | null
): string {
  const baseDisplay = `${totalBaseStock} ${baseUnit}${totalBaseStock !== 1 ? 's' : ''}`;

  if (!salesUnit || !conversionFactor || conversionFactor <= 0) {
    return baseDisplay;
  }

  const { salesStock, remainderBase } = getDualUnitStock(totalBaseStock, conversionFactor);

  if (salesStock > 0 && remainderBase > 0) {
    return `${baseDisplay} (${salesStock} ${salesUnit} + ${remainderBase} ${baseUnit}${remainderBase !== 1 ? 's' : ''})`;
  } else if (salesStock > 0) {
    return `${baseDisplay} (${salesStock} ${salesUnit}${salesStock !== 1 ? 's' : ''})`;
  }

  return baseDisplay;
}

/**
 * Format price display for a product.
 * Example: "KES 2,800/bag | KES 56/kg"
 * @param basePrice - Price per base unit
 * @param baseUnit - Base unit name
 * @param salesUnit - Alternative sales unit name
 * @param conversionFactor - Conversion factor
 * @returns Formatted price string
 */
export function getPriceDisplay(
  basePrice: number,
  baseUnit: string,
  salesUnit?: string | null,
  conversionFactor?: number | null
): string {
  const basePriceDisplay = `KES ${basePrice.toLocaleString()}/${baseUnit}`;

  if (!salesUnit || !conversionFactor || conversionFactor <= 0) {
    return basePriceDisplay;
  }

  const salesPrice = basePrice * conversionFactor;
  return `${basePriceDisplay} | KES ${salesPrice.toLocaleString()}/${salesUnit}`;
}

/**
 * Get the price for a given unit.
 * @param basePrice - Price per base unit
 * @param unit - Selected unit ('base' or 'sales')
 * @param conversionFactor - Conversion factor (for sales unit)
 * @returns Price per selected unit
 */
export function getPriceForUnit(
  basePrice: number,
  unit: 'base' | 'sales',
  conversionFactor?: number | null
): number {
  if (unit === 'sales' && conversionFactor && conversionFactor > 0) {
    return basePrice * conversionFactor;
  }
  return basePrice;
}

/**
 * Convert quantity from selected unit to base units.
 * @param quantity - Quantity in selected unit
 * @param unit - Selected unit ('base' or 'sales')
 * @param conversionFactor - Conversion factor (for sales unit)
 * @returns Quantity in base units
 */
export function convertToBaseUnits(
  quantity: number,
  unit: 'base' | 'sales',
  conversionFactor?: number | null
): number {
  if (unit === 'sales' && conversionFactor && conversionFactor > 0) {
    return quantity * conversionFactor;
  }
  return quantity;
}

/**
 * Get available stock for a given unit.
 * @param totalBaseStock - Total stock in base units
 * @param unit - Selected unit ('base' or 'sales')
 * @param conversionFactor - Conversion factor
 * @returns Available quantity in selected unit
 */
export function getAvailableStockForUnit(
  totalBaseStock: number,
  unit: 'base' | 'sales',
  conversionFactor?: number | null
): number {
  if (unit === 'sales' && conversionFactor && conversionFactor > 0) {
    return Math.floor(totalBaseStock / conversionFactor);
  }
  return totalBaseStock;
}

/**
 * Check if a product has dual-unit support.
 * @param salesUnit - Sales unit name
 * @param conversionFactor - Conversion factor
 * @returns True if dual-unit is configured
 */
export function hasDualUnit(
  salesUnit?: string | null,
  conversionFactor?: number | null
): boolean {
  return !!(salesUnit && conversionFactor && conversionFactor > 0);
}
