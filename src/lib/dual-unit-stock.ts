export interface DualUnitStock {
  cartonQuantity: number
  boxQuantity: number
  boxesPerCarton: number
}

export interface DualUnitStockResult {
  cartonQuantity: number
  boxQuantity: number
}

/** Converts cartons only when the loose-box balance cannot fulfil the sale. */
export function deductBoxStock(
  stock: DualUnitStock,
  requestedBoxes: number
): DualUnitStockResult | null {
  if (
    !Number.isInteger(requestedBoxes) ||
    requestedBoxes <= 0 ||
    !Number.isInteger(stock.cartonQuantity) ||
    !Number.isInteger(stock.boxQuantity) ||
    !Number.isInteger(stock.boxesPerCarton) ||
    stock.cartonQuantity < 0 ||
    stock.boxQuantity < 0 ||
    stock.boxesPerCarton < 1
  ) {
    return null
  }

  const cartonsToUnpack = Math.max(
    0,
    Math.ceil((requestedBoxes - stock.boxQuantity) / stock.boxesPerCarton)
  )
  if (cartonsToUnpack > stock.cartonQuantity) return null

  return {
    cartonQuantity: stock.cartonQuantity - cartonsToUnpack,
    boxQuantity:
      stock.boxQuantity +
      cartonsToUnpack * stock.boxesPerCarton -
      requestedBoxes,
  }
}

export function getTotalBoxStock(stock: DualUnitStock): number {
  return stock.cartonQuantity * stock.boxesPerCarton + stock.boxQuantity
}
