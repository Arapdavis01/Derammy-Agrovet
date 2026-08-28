// frontend/src/utils/productDisplay.ts

/**
 * Utility functions for displaying product stock and prices
 * in dual-unit formats (base unit and alternative sales unit).
 */

/**
 * IMPORTANT CLARIFICATION:
 * 
 * In Derammy Agrovet, the conversion factor represents:
 * "How many sales units are in ONE base unit?"
 * 
 * Example:
 * - Chick Mash: Base unit = bag (50kg), Sales unit = kg
 * - Conversion factor = 50 (1 bag = 50 kg)
 * 
 * So:
 * - To convert base → sales: multiply by conversion factor
 * - To convert sales → base: divide by conversion factor
 * - Price per sales unit = base price ÷ conversion factor
 */

/**
 * Get the base unit stock and sales unit stock from total base stock.
 * @param totalBaseStock - Total stock in base units (e.g., 100 bags)
 * @param conversionFactor - How many sales units are in one base unit (e.g., 50 kg per bag)
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

  // Sales stock = total base stock × conversion factor
  const salesStock = totalBaseStock * conversionFactor;
  const remainderBase = 0;

  return {
    baseStock: totalBaseStock,
    salesStock,
    remainderBase,
  };
}

/**
 * Format stock display string.
 * Example: "20 bags (1000 kg)" or "193 wheelbarrow (4632 kg)"
 * @param totalBaseStock - Total stock in base units
 * @param baseUnit - Base unit name (e.g., "bag")
 * @param salesUnit - Alternative sales unit name (e.g., "kg")
 * @param conversionFactor - How many sales units in one base unit
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

  const totalSalesUnits = totalBaseStock * conversionFactor;
  return `${baseDisplay} (${totalSalesUnits.toLocaleString()} ${salesUnit}${totalSalesUnits !== 1 ? 's' : ''})`;
}

/**
 * Format price display for a product.
 * Example: "KES 2,800/bag | KES 56/kg"
 * @param basePrice - Price per base unit
 * @param baseUnit - Base unit name
 * @param salesUnit - Alternative sales unit name
 * @param conversionFactor - How many sales units in one base unit
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

  // ✅ FIXED: Price per sales unit = base price ÷ conversion factor
  const salesPrice = basePrice / conversionFactor;
  const salesPriceDisplay = `KES ${salesPrice.toFixed(2).replace(/\.00$/, '')}/${salesUnit}`;
  
  return `${basePriceDisplay} | ${salesPriceDisplay}`;
}

/**
 * Get the price for a given unit.
 * @param basePrice - Price per base unit
 * @param unit - Selected unit ('base' or 'sales')
 * @param conversionFactor - How many sales units in one base unit
 * @returns Price per selected unit
 */
export function getPriceForUnit(
  basePrice: number,
  unit: 'base' | 'sales',
  conversionFactor?: number | null
): number {
  if (unit === 'sales' && conversionFactor && conversionFactor > 0) {
    // ✅ FIXED: Divide for smaller unit price
    return basePrice / conversionFactor;
  }
  return basePrice;
}

/**
 * Convert quantity from selected unit to base units.
 * @param quantity - Quantity in selected unit
 * @param unit - Selected unit ('base' or 'sales')
 * @param conversionFactor - How many sales units in one base unit
 * @returns Quantity in base units
 */
export function convertToBaseUnits(
  quantity: number,
  unit: 'base' | 'sales',
  conversionFactor?: number | null
): number {
  if (unit === 'sales' && conversionFactor && conversionFactor > 0) {
    // ✅ FIXED: To convert sales to base, divide
    return quantity / conversionFactor;
  }
  return quantity;
}

/**
 * Get available stock for a given unit.
 * @param totalBaseStock - Total stock in base units
 * @param unit - Selected unit ('base' or 'sales')
 * @param conversionFactor - How many sales units in one base unit
 * @returns Available quantity in selected unit
 */
export function getAvailableStockForUnit(
  totalBaseStock: number,
  unit: 'base' | 'sales',
  conversionFactor?: number | null
): number {
  if (unit === 'sales' && conversionFactor && conversionFactor > 0) {
    // ✅ FIXED: Available in sales units = base stock × conversion factor
    return totalBaseStock * conversionFactor;
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

/**
 * Format a number to remove trailing zeros.
 * Example: 56.00 → 56, 56.50 → 56.5
 */
export function formatNumber(num: number): string {
  return num.toFixed(2).replace(/\.?0+$/, '');
}
