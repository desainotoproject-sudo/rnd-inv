import * as React from "react"
import { supabase } from "@/lib/supabase"
import type { Item, ItemType, Location, Cabinet, StockEntry, StockStatus } from "@/lib/database.types"
import {
  Search,
  Loader2,
  Package,
  CheckCircle2,
  AlertCircle,
  Zap,
  RotateCw,
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty"
import { toast } from "sonner"

type LocationWithCabinet = Location & { cabinet: Cabinet }

interface FlatRow {
  stock_id: string
  item_id: string
  name: string
  sku: string
  unit: string
  item_type: ItemType
  description: string
  location_id: string
  location_code: string
  quantity: number
  status: StockStatus
  original: {
    name: string
    sku: string
    unit: string
    item_type: ItemType
    description: string
    location_id: string
    quantity: number
    status: StockStatus
  }
  dirty: boolean
  saving: boolean
  saved: boolean
  error: boolean
}

const STATUS_OPTIONS: { value: StockStatus; label: string }[] = [
  { value: "tersedia", label: "Tersedia" },
  { value: "kosong", label: "Kosong" },
  { value: "dipinjam", label: "Dipinjam" },
  { value: "menunggu_approval", label: "Menunggu Approval" },
]

const ITEM_TYPE_OPTIONS: { value: ItemType; label: string }[] = [
  { value: "isi", label: "Isi" },
  { value: "kosong_box", label: "Kosong / Box" },
]

// --- Fuzzy search: normalize string (remove spaces, lowercase) ---
function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, "")
}

// Levenshtein distance for typo tolerance
function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  if (m === 0) return n
  if (n === 0) return m
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost)
    }
  }
  return dp[m][n]
}

function fuzzyScore(query: string, target: string): number {
  const q = normalize(query)
  const t = normalize(target)
  if (!q) return 1
  if (t.includes(q)) return 100
  // Check if all chars of query appear in order in target
  let qi = 0
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++
  }
  if (qi === q.length) return 80
  // Typo tolerance via Levenshtein
  const dist = levenshtein(q, t.slice(0, Math.max(q.length + 2, t.length)))
  const maxLen = Math.max(q.length, t.length)
  return Math.max(0, 60 - (dist / maxLen) * 60)
}

export default function QuickEditPage() {
  const [rows, setRows] = React.useState<FlatRow[]>([])
  const [locations, setLocations] = React.useState<LocationWithCabinet[]>([])
  const [loading, setLoading] = React.useState(true)
  const [search, setSearch] = React.useState("")

  const loadData = React.useCallback(async () => {
    setLoading(true)
    const [stockRes, locationsRes] = await Promise.all([
      supabase
        .from("stock_entries")
        .select("*, item:items(*), location:locations(*, cabinet:cabinets(*))")
        .order("created_at"),
      supabase.from("locations").select("*, cabinet:cabinets(*)").order("code"),
    ])

    if (stockRes.error || locationsRes.error) {
      toast.error("Gagal memuat data.")
      setLoading(false)
      return
    }

    setLocations((locationsRes.data ?? []) as LocationWithCabinet[])

    const flat: FlatRow[] = ((stockRes.data ?? []) as unknown as (StockEntry & { item: Item; location: Location & { cabinet: Cabinet } })[]).map((s) => {
      const locCode = `${s.location?.cabinet?.code ?? ""}${s.location?.code ?? ""}`
      return {
        stock_id: s.id,
        item_id: s.item_id,
        name: s.item?.name ?? "",
        sku: s.item?.sku ?? "",
        unit: s.item?.unit ?? "pcs",
        item_type: s.item?.item_type ?? "isi",
        description: s.item?.description ?? "",
        location_id: s.location_id,
        location_code: locCode,
        quantity: s.quantity,
        status: s.status,
        original: {
          name: s.item?.name ?? "",
          sku: s.item?.sku ?? "",
          unit: s.item?.unit ?? "pcs",
          item_type: s.item?.item_type ?? "isi",
          description: s.item?.description ?? "",
          location_id: s.location_id,
          quantity: s.quantity,
          status: s.status,
        },
        dirty: false,
        saving: false,
        saved: false,
        error: false,
      }
    })
    setRows(flat)
    setLoading(false)
  }, [])

  React.useEffect(() => {
    loadData()
  }, [loadData])

  // Filter with fuzzy search
  const filtered = React.useMemo(() => {
    if (!search.trim()) return rows
    const q = search.trim()
    return rows
      .map((r) => ({
        row: r,
        score: Math.max(
          fuzzyScore(q, r.name),
          fuzzyScore(q, r.sku),
          fuzzyScore(q, r.location_code),
        ),
      }))
      .filter((x) => x.score > 15)
      .sort((a, b) => b.score - a.score)
      .map((x) => x.row)
  }, [rows, search])

  const dirtyCount = rows.filter((r) => r.dirty).length

  const updateRow = (stock_id: string, patch: Partial<FlatRow>) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.stock_id !== stock_id) return r
        const updated = { ...r, ...patch, saved: false, error: false }
        // Check if dirty compared to original
        updated.dirty =
          updated.name !== updated.original.name ||
          updated.sku !== updated.original.sku ||
          updated.unit !== updated.original.unit ||
          updated.item_type !== updated.original.item_type ||
          updated.description !== updated.original.description ||
          updated.location_id !== updated.original.location_id ||
          updated.quantity !== updated.original.quantity ||
          updated.status !== updated.original.status
        return updated
      })
    )
  }

  // Debounced auto-save per row
  const saveTimers = React.useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const scheduleSave = React.useCallback((stock_id: string) => {
    // Clear existing timer
    const existing = saveTimers.current.get(stock_id)
    if (existing) clearTimeout(existing)

    const timer = setTimeout(() => {
      doSave(stock_id)
    }, 1200)
    saveTimers.current.set(stock_id, timer)
  }, [])

  const doSave = React.useCallback(async (stock_id: string) => {
    setRows((prev) => prev.map((r) => (r.stock_id === stock_id ? { ...r, saving: true, error: false } : r)))

    // Get the latest row data
    const row = rows.find((r) => r.stock_id === stock_id)
    if (!row) return

    try {
      // Update item
      const { error: itemErr } = await supabase
        .from("items")
        .update({
          name: row.name,
          sku: row.sku || null,
          unit: row.unit,
          item_type: row.item_type,
          description: row.description || null,
        })
        .eq("id", row.item_id)

      if (itemErr) throw new Error(itemErr.message)

      // Update stock entry
      const { error: stockErr } = await supabase
        .from("stock_entries")
        .update({
          location_id: row.location_id,
          quantity: row.quantity,
          status: row.status,
        })
        .eq("id", row.stock_id)

      if (stockErr) throw new Error(stockErr.message)

      // Update location code in local state
      const loc = locations.find((l) => l.id === row.location_id)
      const newLocCode = loc ? `${loc.cabinet?.code ?? ""}${loc.code}` : ""

      setRows((prev) =>
        prev.map((r) =>
          r.stock_id === stock_id
            ? {
                ...r,
                saving: false,
                saved: true,
                dirty: false,
                error: false,
                location_code: newLocCode,
                original: {
                  name: r.name,
                  sku: r.sku,
                  unit: r.unit,
                  item_type: r.item_type,
                  description: r.description,
                  location_id: r.location_id,
                  quantity: r.quantity,
                  status: r.status,
                },
              }
            : r
        )
      )

      // Clear saved indicator after 2s
      setTimeout(() => {
        setRows((prev) => prev.map((r) => (r.stock_id === stock_id ? { ...r, saved: false } : r)))
      }, 2000)
    } catch (err) {
      setRows((prev) => prev.map((r) => (r.stock_id === stock_id ? { ...r, saving: false, error: true } : r)))
      toast.error("Gagal menyimpan: " + (err as Error).message)
    }
  }, [rows, locations])

  const handleChange = (stock_id: string, patch: Partial<FlatRow>) => {
    updateRow(stock_id, patch)
    scheduleSave(stock_id)
  }

  const handleSaveNow = async (stock_id: string) => {
    const timer = saveTimers.current.get(stock_id)
    if (timer) {
      clearTimeout(timer)
      saveTimers.current.delete(stock_id)
    }
    await doSave(stock_id)
  }

  const handleSaveAll = async () => {
    const dirtyRows = rows.filter((r) => r.dirty)
    for (const r of dirtyRows) {
      const timer = saveTimers.current.get(r.stock_id)
      if (timer) {
        clearTimeout(timer)
        saveTimers.current.delete(r.stock_id)
      }
    }
    // Save sequentially to avoid race conditions
    for (const r of dirtyRows) {
      await doSave(r.stock_id)
    }
    if (dirtyRows.length > 0) {
      toast.success(`${dirtyRows.length} data berhasil disimpan.`)
    }
  }

  const [resetOpen, setResetOpen] = React.useState(false)
  const [resetFields, setResetFields] = React.useState<Record<string, boolean>>({
    name: true,
    sku: true,
    unit: true,
    item_type: true,
    location: true,
    quantity: true,
    status: true,
  })

  const RESET_FIELD_LABELS: { key: string; label: string }[] = [
    { key: "name", label: "Nama Produk" },
    { key: "sku", label: "SKU" },
    { key: "unit", label: "Satuan" },
    { key: "item_type", label: "Jenis" },
    { key: "location", label: "Lokasi" },
    { key: "quantity", label: "Jumlah" },
    { key: "status", label: "Status" },
  ]

  const handleReset = () => {
    setRows((prev) =>
      prev.map((r) => {
        const patch: Partial<FlatRow> = {}
        if (resetFields.name) { patch.name = r.original.name }
        if (resetFields.sku) { patch.sku = r.original.sku }
        if (resetFields.unit) { patch.unit = r.original.unit }
        if (resetFields.item_type) { patch.item_type = r.original.item_type }
        if (resetFields.location) { patch.location_id = r.original.location_id }
        if (resetFields.quantity) { patch.quantity = r.original.quantity }
        if (resetFields.status) { patch.status = r.original.status }

        const updated = { ...r, ...patch, saving: false, saved: false, error: false }

        if (resetFields.location) {
          const loc = locations.find((l) => l.id === updated.location_id)
          updated.location_code = loc ? `${loc.cabinet?.code ?? ""}${loc.code}` : updated.location_code
        }

        updated.dirty =
          updated.name !== updated.original.name ||
          updated.sku !== updated.original.sku ||
          updated.unit !== updated.original.unit ||
          updated.item_type !== updated.original.item_type ||
          updated.description !== updated.original.description ||
          updated.location_id !== updated.original.location_id ||
          updated.quantity !== updated.original.quantity ||
          updated.status !== updated.original.status

        return updated
      })
    )
    setResetOpen(false)
    toast.success("Data berhasil direset sesuai pilihan.")
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Zap className="size-6 text-primary" />
            Edit Cepat
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Cari barang (tahan typo & tanpa spasi), lalu edit langsung di tabel. Perubahan tersimpan otomatis.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {dirtyCount > 0 && (
            <AlertDialog open={resetOpen} onOpenChange={setResetOpen}>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <RotateCw className="size-4" />
                  Reset ({dirtyCount})
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Reset Data</AlertDialogTitle>
                  <AlertDialogDescription>
                    Pilih field mana saja yang ingin dikembalikan ke nilai awal. Perubahan yang belum tersimpan akan hilang.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="grid grid-cols-2 gap-3 py-2">
                  {RESET_FIELD_LABELS.map((f) => (
                    <label
                      key={f.key}
                      className="flex items-center gap-2.5 cursor-pointer rounded-md border p-2.5 hover:bg-muted/40 transition-colors"
                    >
                      <Checkbox
                        checked={resetFields[f.key]}
                        onCheckedChange={(v) =>
                          setResetFields((prev) => ({ ...prev, [f.key]: !!v }))
                        }
                      />
                      <span className="text-sm font-medium">{f.label}</span>
                    </label>
                  ))}
                </div>
                <AlertDialogFooter>
                  <AlertDialogCancel>Batal</AlertDialogCancel>
                  <AlertDialogAction onClick={handleReset}>
                    <RotateCw className="size-4" />
                    Reset Terpilih
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          <Button size="sm" onClick={handleSaveAll} disabled={dirtyCount === 0}>
            <CheckCircle2 className="size-4" />
            Simpan Semua ({dirtyCount})
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
        <Input
          placeholder="Cari nama, SKU, atau lokasi... (tahan typo)"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-8"
        />
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia>
              <Package className="size-8" />
            </EmptyMedia>
            <EmptyTitle>Tidak ada data</EmptyTitle>
            <EmptyDescription>
              {search ? "Tidak ada hasil untuk pencarian ini." : "Belum ada data stok."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="rounded-lg border">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-48">Nama Barang</TableHead>
                  <TableHead className="min-w-32">SKU</TableHead>
                  <TableHead className="min-w-24">Satuan</TableHead>
                  <TableHead className="min-w-28">Jenis</TableHead>
                  <TableHead className="min-w-32">Lokasi</TableHead>
                  <TableHead className="min-w-24 text-right">Jumlah</TableHead>
                  <TableHead className="min-w-36">Status</TableHead>
                  <TableHead className="w-16 text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((row) => (
                  <TableRow
                    key={row.stock_id}
                    className={row.dirty ? "bg-amber-50/50 dark:bg-amber-950/10" : row.error ? "bg-red-50/50 dark:bg-red-950/10" : ""}
                  >
                    {/* Name */}
                    <TableCell>
                      <Input
                        value={row.name}
                        onChange={(e) => handleChange(row.stock_id, { name: e.target.value })}
                        onBlur={() => handleSaveNow(row.stock_id)}
                        className="h-8 text-sm border-transparent hover:border-input focus-visible:border-input bg-transparent"
                      />
                    </TableCell>
                    {/* SKU */}
                    <TableCell>
                      <Input
                        value={row.sku}
                        onChange={(e) => handleChange(row.stock_id, { sku: e.target.value.toUpperCase() })}
                        onBlur={() => handleSaveNow(row.stock_id)}
                        placeholder="—"
                        className="h-8 text-sm font-mono border-transparent hover:border-input focus-visible:border-input bg-transparent"
                      />
                    </TableCell>
                    {/* Unit */}
                    <TableCell>
                      <Input
                        value={row.unit}
                        onChange={(e) => handleChange(row.stock_id, { unit: e.target.value })}
                        onBlur={() => handleSaveNow(row.stock_id)}
                        className="h-8 text-sm border-transparent hover:border-input focus-visible:border-input bg-transparent w-20"
                      />
                    </TableCell>
                    {/* Item type */}
                    <TableCell>
                      <Select
                        value={row.item_type}
                        onValueChange={(v) => handleChange(row.stock_id, { item_type: v as ItemType })}
                      >
                        <SelectTrigger className="h-8 text-sm w-28 border-transparent hover:border-input bg-transparent">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ITEM_TYPE_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    {/* Location */}
                    <TableCell>
                      <Select
                        value={row.location_id}
                        onValueChange={(v) => handleChange(row.stock_id, { location_id: v })}
                      >
                        <SelectTrigger className="h-8 text-sm font-mono w-32 border-transparent hover:border-input bg-transparent">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {locations.map((loc) => (
                            <SelectItem key={loc.id} value={loc.id}>
                              {loc.cabinet?.code}{loc.code}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    {/* Quantity */}
                    <TableCell>
                      <Input
                        type="number"
                        min={0}
                        value={row.quantity}
                        onChange={(e) => handleChange(row.stock_id, { quantity: parseInt(e.target.value) || 0 })}
                        onBlur={() => handleSaveNow(row.stock_id)}
                        className="h-8 text-sm tabular-nums text-right border-transparent hover:border-input focus-visible:border-input bg-transparent w-20"
                      />
                    </TableCell>
                    {/* Status */}
                    <TableCell>
                      <Select
                        value={row.status}
                        onValueChange={(v) => handleChange(row.stock_id, { status: v as StockStatus })}
                      >
                        <SelectTrigger className="h-8 text-sm w-36 border-transparent hover:border-input bg-transparent">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STATUS_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    {/* Save indicator */}
                    <TableCell className="text-center">
                      {row.saving ? (
                        <Loader2 className="size-4 animate-spin text-muted-foreground mx-auto" />
                      ) : row.saved ? (
                        <CheckCircle2 className="size-4 text-green-500 mx-auto" />
                      ) : row.error ? (
                        <AlertCircle className="size-4 text-destructive mx-auto" />
                      ) : row.dirty ? (
                        <Badge variant="outline" className="text-amber-600 border-amber-300 text-xs">
                          Diubah
                        </Badge>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Stats */}
      {!loading && rows.length > 0 && (
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span>Total: {rows.length} baris</span>
          <span>•</span>
          <span>Hasil: {filtered.length}</span>
          {dirtyCount > 0 && (
            <>
              <span>•</span>
              <span className="text-amber-600 font-medium">{dirtyCount} belum tersimpan</span>
            </>
          )}
        </div>
      )}
    </div>
  )
}
