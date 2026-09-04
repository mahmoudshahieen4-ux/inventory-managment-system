# State Management

Three-layer "onion" architecture for state management.

## The Three Layers

```
┌─────────────────────────────────────┐
│           useState                  │  ← Component UI State
│  ┌─────────────────────────────────┐│
│  │          Zustand                ││  ← Global UI State
│  │  ┌─────────────────────────────┐││
│  │  │      TanStack Query         │││  ← Persistent Data
│  │  └─────────────────────────────┘││
│  └─────────────────────────────────┘│
└─────────────────────────────────────┘
```

### Layer 1: TanStack Query (Persistent Data)

Use for data that:

- Comes from Tauri backend (file system, external APIs)
- Benefits from caching and automatic refetching
- Has loading, error, and success states

```typescript
const { data, isLoading, error } = useQuery({
  queryKey: ['user', userId],
  queryFn: () => commands.getUser({ userId }),
  enabled: !!userId,
})
```

See [error-handling.md](./error-handling.md) for retry configuration and error display patterns.

### Layer 2: Zustand (Global UI State)

Use for transient global state:

- Panel visibility, layout state
- Command palette open/closed
- UI modes and navigation

```typescript
import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

interface UIState {
  sidebarVisible: boolean
  toggleSidebar: () => void
}

export const useUIStore = create<UIState>()(
  devtools(
    set => ({
      sidebarVisible: true,
      toggleSidebar: () =>
        set(state => ({ sidebarVisible: !state.sidebarVisible })),
    }),
    { name: 'ui-store' }
  )
)
```

### Layer 3: useState (Component State)

Use for state that:

- Only affects UI presentation
- Is derived from props or global state
- Is tightly coupled to component lifecycle

```typescript
const [isDropdownOpen, setIsDropdownOpen] = useState(false)
const [windowWidth, setWindowWidth] = useState(window.innerWidth)
```

## Performance Patterns (Critical)

### The `getState()` Pattern

**Problem**: Subscribing to store data in callbacks causes render cascades.

**Solution**: Use `getState()` for callbacks that need current state.

```typescript
// ❌ BAD: Causes render cascade on every store change
const { currentFile, isDirty, saveFile } = useEditorStore()

const handleSave = useCallback(() => {
  if (currentFile && isDirty) {
    void saveFile()
  }
}, [currentFile, isDirty, saveFile]) // Re-creates on every change!

// ✅ GOOD: No cascade, stable callback
const handleSave = useCallback(() => {
  const { currentFile, isDirty, saveFile } = useEditorStore.getState()
  if (currentFile && isDirty) {
    void saveFile()
  }
}, []) // Stable dependency array
```

**When to use `getState()`:**

- In `useCallback` dependencies when you need current state but don't want re-renders
- In event handlers for accessing latest state without subscriptions
- In `useEffect` with empty deps when you need current state on mount only
- In async operations when state might change during execution

### Store Subscription Optimization

```typescript
// ❌ BAD: Object destructuring subscribes to entire store
const { currentFile } = useEditorStore()

// ✅ GOOD: Selector only re-renders when this specific value changes
const currentFile = useEditorStore(state => state.currentFile)

// ✅ GOOD: Derived selector for minimal re-renders
const hasCurrentFile = useEditorStore(state => !!state.currentFile)
const currentFileName = useEditorStore(state => state.currentFile?.name)
```

### CSS Visibility vs Conditional Rendering

For stateful UI components (like `react-resizable-panels`), use CSS visibility:

```typescript
// ❌ BAD: Conditional rendering breaks stateful components
{sidebarVisible ? <ResizablePanel /> : null}

// ✅ GOOD: CSS visibility preserves component tree
<ResizablePanel className={sidebarVisible ? '' : 'hidden'} />
```

### React Compiler (Automatic Memoization)

This app uses React Compiler which automatically handles memoization. You do **not** need to manually add:

- `useMemo` for computed values
- `useCallback` for function references
- `React.memo` for components

**Note:** The `getState()` pattern is still critical - it avoids store subscriptions, not memoization.

## Store Boundaries

**UIStore** - Use for:

- Panel visibility
- Layout state
- Command palette state
- UI modes and navigation

**Feature-specific stores** - Use for:

- Domain-specific state (e.g., `useDocumentStore`)
- Feature flags and configuration
- Temporary workflow state

**Auth store** - `useAuthStore` (see `src/store/useAuthStore.ts` and
`docs/developer/authentication.md`):

- Holds the signed-in `currentUser: User | null`, the full `accounts` list
  (with password hashes, store-layer only) and a public `users` view
- Authenticates with `login(username, password)` against PBKDF2-SHA256 hashes
  stored in the SQLite `auth_users` table (in-memory defaults in browser dev)
- Restores the last session on startup via `hydrate()`; sessions persist in
  localStorage (`pos.auth.session.v1`)
- Exposes `logout()`, `clearError()`, `changeOwnPassword()` and the ADMIN-only
  `changeUserPassword()`
- View access is decided by the pure `canAccessView(role, view)` helper in
  `src/lib/permissions.ts`; components gate actions by selecting
  `useAuthStore(state => state.currentUser?.role)` and comparing against the
  role they require (e.g., `role === 'ADMIN'`)

**Inventory store** - `useInventoryStore` (see `src/store/useInventoryStore.ts`):

- Holds the products list with seeded demo data covering every stock status
- Exposes `addProduct`, `updateProduct`, and `deleteProduct` (all immutable updates)
- Pure `getStockStatus(quantity, minThreshold)` lives in `src/lib/stock-status.ts` for row/badge alert logic
- Form modals call `addProduct`/`updateProduct`; delete confirmations call `deleteProduct`

**Cart store** - `useCartStore` (see `src/store/useCartStore.ts`):

- Ephemeral POS session state: current sale lines (`items: CartItem[]`)
- Exposes `addToCart(product)` (stock-capped, no-op when out of stock), `removeFromCart`, `updateQuantity` (clamped, 0 removes the line), and `clearCart`
- Totals come from pure selectors — `selectCartSubtotal`, `selectCartTax`, `selectCartTotal` (pass `useCartStore.getState()` inside callbacks, or use them as zustand selectors in components); `TAX_RATE` and `roundMoney` are exported for reuse
- Checkout flows read actions via `useCartStore.getState()` so they run once per event, not per render

**Sales store** - `useSalesStore` (see `src/store/useSalesStore.ts`):

- Completed transaction log: `sales: Sale[]`, newest first, each with a sequential `invoiceNumber` (`INV-0001`…)
- `addSale(sale)` generates the `id` (`crypto.randomUUID()`), the `invoiceNumber` and the `createdAt` timestamp, prepends the record, and returns it (so callers can hand it to a receipt modal)
- `getSaleById(id)` retrieves a stored invoice for re-printing from sales history

## Adding a New Store

1. Create store file in `src/store/`
2. Follow the pattern with `devtools` middleware
3. Add no-destructure rule to `.ast-grep/rules/zustand/no-destructure.yml`

```yaml
rule:
  any:
    - pattern: const { $$$PROPS } = useUIStore($$$ARGS)
    - pattern: const { $$$PROPS } = useNewStore($$$ARGS) # Add new store
```

## Local Persistence (SQLite)

Stores persist through `src/services/db.ts`, a thin layer over `tauri-plugin-sql`
(`sqlite:pos.db`, registered in `src-tauri/src/lib.rs`, permission `sql:default`).

- **Runtime guard**: every call site checks `isTauriRuntime()` — in the browser
  and unit tests the layer is a no-op, so stores keep working unchanged.
- **Store contract**: async `hydrate()` loads stored rows on startup (seeding on
  first launch); mutations update local state first, then fire-and-forget the
  SQL write via the `persist()` helper — failures toast `db.toast.saveFailed`.
- **Bootstrap**: `useAppBootstrap()` (mounted in `MainWindowContent`) runs both
  `hydrate()`s while `useUIStore.isDbInitializing` shows a full-area spinner.
- **Schema**: `products`, `sales`, `sale_items` (see `db.ts` migrations); rows
  map snake_case ↔ camelCase at the boundary only.

## Licensing & Trial (License Store)

`useLicenseStore` persists a single `license` row (key, status, activation,
expiration, plus `first_run_date` / `trial_expiration_date` / `last_active_time`).

- **Statuses**: `ACTIVE` | `TRIAL` | `EXPIRED` | `UNREGISTERED`.
- **Auto 3-day trial**: first launch (no stored row) creates a TRIAL record
  anchored at `firstRunDate` with `trialExpirationDate = firstRunDate + 3 days`.
  Legacy rows without trial fields only start a trial when UNREGISTERED/TRIAL —
  an existing ACTIVE or EXPIRED license is never overwritten.
- **Clock anti-cheat**: `runExpirationCheck()` (startup + hourly, via
  `useLicenseGuard`) detects `now < lastActiveTime` → status `EXPIRED` and locks.
  It also pulses `lastActiveTime = now` on every check so rollbacks are always
  detectable once the DB was written to.
- **Trial banner**: `TrialBanner` shows while `status === 'TRIAL'` (remaining
  days/hours + Buy Now/Activate); `LicenseLockModal` accepts an optional
  `onClose` so the banner can reuse it as a dismissable overlay.
- **Testing tip**: store trial logic lives behind `isTauriRuntime()`. Mock
  `@/services/db` (see `useLicenseStore.trial.test.ts`) to exercise the SQLite
  paths in jsdom — the dev bypass otherwise forces `ACTIVE` for browser/tests.
