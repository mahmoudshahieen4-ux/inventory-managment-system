import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import {
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  PackageSearch,
  Pencil,
  Plus,
  Search,
  Trash2,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { getStockStatus } from '@/lib/stock-status'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/useAuthStore'
import { useInventoryStore } from '@/store/useInventoryStore'
import type { Product, StockStatus } from '@/types/inventory'
import { ProductFormModal } from './ProductFormModal'
import { stockStatusStyles } from './stock-status-config'

type StockFilter = StockStatus | 'ALL'

type SortKey =
  | 'sku'
  | 'name'
  | 'quantity'
  | 'minThreshold'
  | 'purchasePrice'
  | 'sellingPrice'
type SortDir = 'asc' | 'desc'
interface SortState {
  key: SortKey
  dir: SortDir
}

function compareValues(a: Product, b: Product, key: SortKey): number {
  const valueA = a[key]
  const valueB = b[key]
  if (typeof valueA === 'number' && typeof valueB === 'number') {
    return valueA - valueB
  }
  return String(valueA).localeCompare(String(valueB))
}

function sortProducts(products: Product[], sort: SortState | null): Product[] {
  if (!sort) return products
  const factor = sort.dir === 'asc' ? 1 : -1
  return [...products].sort((a, b) => factor * compareValues(a, b, sort.key))
}

export function InventoryTable() {
  const { t } = useTranslation()
  const products = useInventoryStore(state => state.products)
  const deleteProduct = useInventoryStore(state => state.deleteProduct)
  const role = useAuthStore(state => state.role)
  const isAdmin = role === 'ADMIN'
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<StockFilter>('ALL')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [sort, setSort] = useState<SortState | null>(null)

  const normalizedSearch = search.trim().toLowerCase()
  const filteredProducts = products.filter(product => {
    const matchesSearch =
      normalizedSearch === '' ||
      product.name.toLowerCase().includes(normalizedSearch) ||
      product.sku.toLowerCase().includes(normalizedSearch)

    if (!matchesSearch) return false

    if (filter === 'ALL') return true
    return getStockStatus(product.quantity, product.minThreshold) === filter
  })

  const sortedProducts = sortProducts(filteredProducts, sort)

  const toggleSort = (key: SortKey) => {
    setSort(current =>
      current?.key === key
        ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: 'asc' }
    )
  }

  // ACTION rows + status column. Admins get an extra actions column.
  const columnCount = isAdmin ? 9 : 8

  const handleOpenCreate = () => {
    setEditingProduct(null)
    setModalOpen(true)
  }

  const handleOpenEdit = (product: Product) => {
    setEditingProduct(product)
    setModalOpen(true)
  }

  const handleOpenChange = (open: boolean) => {
    setModalOpen(open)
    if (!open) setEditingProduct(null)
  }

  const handleDelete = (product: Product) => {
    const confirmed = window.confirm(
      t('inventory.actions.deleteConfirm', { name: product.name })
    )
    if (!confirmed) return
    deleteProduct(product.id)
    toast.success(t('inventory.toast.productDeleted'))
  }

  const headClass =
    'text-[11px] font-semibold tracking-wider text-muted-foreground uppercase'

  const renderSortableHead = (
    key: SortKey,
    label: string,
    alignEnd = false
  ) => {
    const active = sort?.key === key
    const dir: SortDir | undefined = active ? sort?.dir : undefined
    const Icon = !active
      ? ChevronsUpDown
      : dir === 'asc'
        ? ChevronUp
        : ChevronDown

    return (
      <TableHead
        className={cn(headClass, alignEnd && 'text-end')}
        aria-sort={
          dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : 'none'
        }
      >
        <button
          type="button"
          className="hover:text-foreground inline-flex items-center gap-1 transition-colors"
          onClick={() => toggleSort(key)}
        >
          {label}
          <Icon className="size-3.5" />
        </button>
      </TableHead>
    )
  }

  return (
    <Card className="w-full shadow-md">
      <CardHeader>
        <CardTitle className="text-xl font-bold tracking-tight">
          {t('inventory.title')}
        </CardTitle>
        <CardDescription>{t('inventory.description')}</CardDescription>
        {isAdmin && (
          <CardAction>
            <Button onClick={handleOpenCreate}>
              <Plus />
              {t('inventory.addProduct')}
            </Button>
          </CardAction>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Toolbar: search + status filter */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-xs">
            <Search className="text-muted-foreground pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2" />
            <Input
              type="search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={t('inventory.searchPlaceholder')}
              aria-label={t('inventory.searchLabel')}
              className="ps-9"
            />
          </div>

          <Select
            value={filter}
            onValueChange={value => setFilter(value as StockFilter)}
          >
            <SelectTrigger
              className="w-full sm:w-[220px]"
              aria-label={t('inventory.filterLabel')}
            >
              <SelectValue placeholder={t('inventory.filter.all')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">{t('inventory.filter.all')}</SelectItem>
              <SelectItem value="LOW_STOCK">
                {t('inventory.filter.lowStock')}
              </SelectItem>
              <SelectItem value="OUT_OF_STOCK">
                {t('inventory.filter.outOfStock')}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        {/* Products table */}
        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                {renderSortableHead('sku', t('inventory.column.sku'))}
                {renderSortableHead('name', t('inventory.column.name'))}
                <TableHead className={headClass}>
                  {t('inventory.column.unit')}
                </TableHead>
                {renderSortableHead(
                  'quantity',
                  t('inventory.column.quantity'),
                  true
                )}
                {renderSortableHead(
                  'minThreshold',
                  t('inventory.column.minThreshold'),
                  true
                )}
                {renderSortableHead(
                  'purchasePrice',
                  t('inventory.column.purchasePrice'),
                  true
                )}
                {renderSortableHead(
                  'sellingPrice',
                  t('inventory.column.sellingPrice'),
                  true
                )}
                <TableHead className={headClass}>
                  {t('inventory.column.status')}
                </TableHead>
                {isAdmin && (
                  <TableHead className={cn(headClass, 'text-end')}>
                    {t('inventory.column.actions')}
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>

            <TableBody>
              {sortedProducts.map(product => {
                const status = getStockStatus(
                  product.quantity,
                  product.minThreshold
                )
                const statusStyle = stockStatusStyles[status]
                const StatusIcon = statusStyle.icon

                return (
                  <TableRow
                    key={product.id}
                    className={cn(
                      'border-border/60 hover:bg-slate-800/60',
                      statusStyle.rowClassName
                    )}
                  >
                    <TableCell className="text-muted-foreground font-mono text-xs font-semibold uppercase">
                      {product.sku}
                    </TableCell>
                    <TableCell className="font-medium">
                      {product.name}
                    </TableCell>
                    <TableCell className="text-sm">
                      {product.unit ?? t('inventory.unit.notSet')}
                      {product.unit === 'كرتونة' && product.unitsPerCarton && (
                        <span className="text-muted-foreground ms-1 text-xs">
                          (
                          {t('inventory.unit.boxesCount', {
                            count: product.unitsPerCarton,
                          })}
                          )
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-end font-semibold tabular-nums">
                      {product.quantity}
                      {product.unit && (
                        <span className="text-muted-foreground ms-1 text-xs font-normal">
                          {product.unit}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-end tabular-nums">
                      {product.minThreshold}
                    </TableCell>
                    <TableCell className="text-end tabular-nums">
                      {formatMoney(product.purchasePrice)}
                    </TableCell>
                    <TableCell className="text-end font-semibold tabular-nums">
                      {formatMoney(product.sellingPrice)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn(
                          'rounded-full gap-1 px-2.5 py-0.5 text-[11px] font-medium',
                          statusStyle.badgeClassName
                        )}
                      >
                        <StatusIcon className="size-3" />
                        {t(statusStyle.labelKey)}
                      </Badge>
                    </TableCell>
                    {isAdmin && (
                      <TableCell className="text-end">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="text-muted-foreground hover:text-foreground"
                            aria-label={t('inventory.actions.edit', {
                              name: product.name,
                            })}
                            title={t('inventory.actions.edit', {
                              name: product.name,
                            })}
                            onClick={() => handleOpenEdit(product)}
                          >
                            <Pencil />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="text-muted-foreground hover:text-red-500"
                            aria-label={t('inventory.actions.delete', {
                              name: product.name,
                            })}
                            title={t('inventory.actions.delete', {
                              name: product.name,
                            })}
                            onClick={() => handleDelete(product)}
                          >
                            <Trash2 />
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                )
              })}

              {filteredProducts.length === 0 && (
                <TableRow className="hover:bg-transparent">
                  <TableCell
                    colSpan={columnCount}
                    className="text-muted-foreground h-32 text-center"
                  >
                    <div className="flex flex-col items-center justify-center gap-2">
                      <PackageSearch className="size-8" />
                      <p>{t('inventory.empty')}</p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {/* Product create/edit dialog */}
        <ProductFormModal
          open={modalOpen}
          onOpenChange={handleOpenChange}
          product={editingProduct}
        />
      </CardContent>
    </Card>
  )
}
