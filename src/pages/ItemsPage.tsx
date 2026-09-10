import * as React from "react"
import { useInfiniteRows } from "@/hooks/use-infinite-rows"
import {
  Plus,
  Pencil,
  Trash2,
  Search,
  Loader2,
  BoxesIcon,
  Package,
  Filter,
  MapPin,
  Upload,
} from "lucide-react"
import { supabase } from "@/lib/supabase"
import type { Item, ItemType, Location, Cabinet, StockStatus } from "@/lib/database.types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
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
import { Skeleton } from "@/components/ui/skeleton"
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty"
import { Separator } from "@/components/ui/separator"
import { ImportItemsDialog } from "@/components/ImportItemsDialog"
import { toast } from "sonner"

const ITEM_TYPE_LABELS: Record<ItemType, string> = {
  isi: "Barang Isi",
  kosong_box: "Kosong/Box",
}

const STATUS_CONFIG: Record<StockStatus, { label: string; class: string }> = {
  tersedia: { label: "Tersedia", class: "bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800" },
  kosong: { label: "Kosong", class: "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800" },
  dipinjam: { label: "Dipinjam", class: "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800" },
  menunggu_approval: { label: "Menunggu", class: "bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-800" },
}

const UNITS = ["pcs", "box", "set", "unit", "roll", "lembar", "kg", "liter"]

type LocationWithCabinet = Location & { cabinet: Cabinet }

interface ItemForm {
  name: string
  sku: string
  unit: string
  item_type: ItemType
  description: string
  // Stock fields (only for create mode)
  location_id: string
  quantity: number
  status: StockStatus
}

const emptyForm: ItemForm = {
  name: "",
  sku: "",
  unit: "pcs",
  item_type: "isi",
  description: "",
  location_id: "",
  quantity: 0,
  status: "tersedia",
}

type StockSummary = {
  total: number
  locationCodes: string[]
}

export default function ItemsPage() {
  const [items, setItems] = React.useState<Item[]>([])
  const [stockMap, setStockMap] = React.useState<Map<string, StockSummary>>(new Map())
  const [locations, setLocations] = React.useState<LocationWithCabinet[]>([])
  const [loading, setLoading] = React.useState(true)
  const [search, setSearch] = React.useState("")
  const [filterType, setFilterType] = React.useState<ItemType | "all">("all")

  const [dialog, setDialog] = React.useState<{ open: boolean; edit?: Item }>({ open: false })
  const [form, setForm] = React.useState<ItemForm>(emptyForm)
  const [formError, setFormError] = React.useState("")
  const [submitting, setSubmitting] = React.useState(false)

  const [deleteConfirm, setDeleteConfirm] = React.useState<{ open: boolean; id: string; name: string }>({
    open: false, id: "", name: "",
  })
  const [importOpen, setImportOpen] = React.useState(false)
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set())
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = React.useState(false)
  const [bulkDeleting, setBulkDeleting] = React.useState(false)

  const loadData = React.useCallback(async () => {
    const [itemsRes, locationsRes, stockRes] = await Promise.all([
      supabase.from("items").select("*").order("name"),
      supabase.from("locations").select("*, cabinet:cabinets(*)").order("code"),
      supabase.from("stock_entries").select("item_id, quantity, location_id, location:locations(code, cabinet:cabinets(code))"),
    ])
    setItems(itemsRes.data ?? [])
    setLocations((locationsRes.data ?? []) as LocationWithCabinet[])

    // Build stock summary per item
    const map = new Map<string, StockSummary>()
    for (const s of (stockRes.data ?? []) as any[]) {
      const existing = map.get(s.item_id) ?? { total: 0, locationCodes: [] }
      existing.total += s.quantity ?? 0
      const code = `${s.location?.cabinet?.code ?? ""}${s.location?.code ?? ""}`
      if (code && !existing.locationCodes.includes(code)) existing.locationCodes.push(code)
      map.set(s.item_id, existing)
    }
    setStockMap(map)
    setLoading(false)
  }, [])

  React.useEffect(() => { loadData() }, [loadData])

  const filtered = React.useMemo(() => {
    const q = search.toLowerCase()
    return items.filter((item) => {
      const matchSearch =
        item.name.toLowerCase().includes(q) ||
        (item.sku ?? "").toLowerCase().includes(q)
      const matchType = filterType === "all" || item.item_type === filterType
      return matchSearch && matchType
    })
  }, [items, search, filterType])

  const { shown, hasMore, sentinelRef } = useInfiniteRows(filtered, 15)

  const openCreate = () => {
    setForm(emptyForm)
    setFormError("")
    setDialog({ open: true })
  }
  const openEdit = (item: Item) => {
    setForm({
      name: item.name,
      sku: item.sku ?? "",
      unit: item.unit,
      item_type: item.item_type,
      description: item.description ?? "",
      location_id: "",
      quantity: 0,
      status: "tersedia",
    })
    setFormError("")
    setDialog({ open: true, edit: item })
  }

  const saveItem = async () => {
    if (!form.name || !form.unit) {
      setFormError("Nama dan satuan wajib diisi.")
      return
    }
    if (dialog.edit) {
      // Edit mode: only update item fields
      setSubmitting(true)
      setFormError("")
      const payload = {
        name: form.name,
        sku: form.sku.toUpperCase() || null,
        unit: form.unit,
        item_type: form.item_type,
        description: form.description || null,
      }
      const { error } = await supabase.from("items").update(payload).eq("id", dialog.edit.id)
      if (error) {
        setFormError(error.message.includes("unique") ? "SKU sudah digunakan." : error.message)
        setSubmitting(false)
        return
      }
      setDialog({ open: false })
      await loadData()
      setSubmitting(false)
    } else {
      // Create mode: insert item + stock entry
      if (!form.location_id) {
        setFormError("Pilih sub-lokasi penyimpanan barang.")
        return
      }
      setSubmitting(true)
      setFormError("")

      const itemPayload = {
        name: form.name,
        sku: form.sku.toUpperCase() || null,
        unit: form.unit,
        item_type: form.item_type,
        description: form.description || null,
      }

      const { data: newItem, error: itemError } = await supabase
        .from("items")
        .insert(itemPayload)
        .select()
        .single()

      if (itemError) {
        setFormError(itemError.message.includes("unique") ? "SKU sudah digunakan." : itemError.message)
        setSubmitting(false)
        return
      }

      const stockPayload = {
        item_id: newItem.id,
        location_id: form.location_id,
        quantity: form.quantity,
        status: form.status,
        notes: null,
      }

      const { error: stockError } = await supabase.from("stock_entries").insert(stockPayload)
      if (stockError) {
        setFormError(
          stockError.message.includes("unique")
            ? "Barang sudah tercatat di lokasi tersebut."
            : stockError.message
        )
        setSubmitting(false)
        return
      }

      setDialog({ open: false })
      await loadData()
      setSubmitting(false)
    }
  }

  const handleDelete = async () => {
    await supabase.from("items").delete().eq("id", deleteConfirm.id)
    setDeleteConfirm({ open: false, id: "", name: "" })
    await loadData()
  }

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filtered.map((i) => i.id)))
    }
  }

  const handleBulkDelete = async () => {
    setBulkDeleting(true)
    const ids = Array.from(selectedIds)
    const { error } = await supabase.from("items").delete().in("id", ids)
    setBulkDeleting(false)
    if (error) {
      toast.error("Gagal menghapus: " + error.message)
      return
    }
    toast.success(`${ids.length} barang berhasil dihapus.`)
    setSelectedIds(new Set())
    setBulkDeleteConfirm(false)
    await loadData()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">Master Barang</h1>
          <p className="hidden sm:block text-sm text-muted-foreground mt-1">
            Kelola data barang beserta lokasi dan stok penyimpanannya.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <Upload />
            <span className="hidden sm:inline">Import Excel</span>
          </Button>
          {selectedIds.size > 0 && (
            <Button variant="destructive" onClick={() => setBulkDeleteConfirm(true)}>
              <Trash2 />
              <span className="hidden sm:inline">Hapus ({selectedIds.size})</span>
            </Button>
          )}
          <Button onClick={openCreate}>
            <Plus />
            <span className="hidden sm:inline">Tambah Barang</span>
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative min-w-60 flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Cari nama atau SKU..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filterType} onValueChange={(v) => setFilterType(v as ItemType | "all")}>
          <SelectTrigger className="w-40">
            <Filter className="size-3.5 text-muted-foreground" />
            <SelectValue placeholder="Jenis" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua Jenis</SelectItem>
            <SelectItem value="isi">Barang Isi</SelectItem>
            <SelectItem value="kosong_box">Kosong/Box</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-lg border bg-card">
        {loading ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-md" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <Empty className="border-none">
            <EmptyHeader>
              <EmptyMedia variant="icon"><BoxesIcon /></EmptyMedia>
              <EmptyTitle>Belum ada barang</EmptyTitle>
              <EmptyDescription>
                {search || filterType !== "all"
                  ? "Tidak ada barang yang sesuai filter."
                  : "Tambahkan barang pertama ke master data."}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={filtered.length > 0 && selectedIds.size === filtered.length}
                    onCheckedChange={toggleSelectAll}
                    aria-label="Pilih semua"
                  />
                </TableHead>
                <TableHead>Nama Barang</TableHead>
                <TableHead className="text-right">Jumlah</TableHead>
                <TableHead>Kode Lokasi</TableHead>
                <TableHead>Satuan</TableHead>
                <TableHead>Jenis</TableHead>
                <TableHead className="w-20"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((item) => {
                const stock = stockMap.get(item.id)
                return (
                <TableRow key={item.id} className={selectedIds.has(item.id) ? "bg-muted/40" : ""}>
                  <TableCell>
                    <Checkbox
                      checked={selectedIds.has(item.id)}
                      onCheckedChange={() => toggleSelect(item.id)}
                      aria-label={`Pilih ${item.name}`}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="flex size-7 shrink-0 items-center justify-center rounded bg-primary/10">
                        <Package className="size-3.5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium text-sm text-foreground">{item.name}</p>
                        {item.description && (
                          <p className="text-xs text-muted-foreground truncate max-w-48">{item.description}</p>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <span className={`text-sm font-semibold tabular-nums ${!stock || stock.total === 0 ? "text-muted-foreground" : "text-foreground"}`}>
                      {stock?.total ?? 0}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {stock?.locationCodes.length
                        ? stock.locationCodes.map((c) => (
                            <code key={c} className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">{c}</code>
                          ))
                        : <span className="text-xs text-muted-foreground">—</span>
                      }
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{item.unit}</TableCell>
                  <TableCell>
                    <Badge
                      variant={item.item_type === "isi" ? "default" : "outline"}
                      className={
                        item.item_type === "isi"
                          ? "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400"
                          : "bg-muted text-muted-foreground"
                      }
                    >
                      {ITEM_TYPE_LABELS[item.item_type]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon-sm" onClick={() => openEdit(item)}>
                        <Pencil />
                      </Button>
                      <Button variant="ghost" size="icon-sm" onClick={() => setDeleteConfirm({ open: true, id: item.id, name: item.name })}>
                        <Trash2 className="text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )})
            }
            </TableBody>
          </Table>
        )}
        {!loading && filtered.length > 0 && (
          <div ref={sentinelRef} className="flex items-center justify-center gap-2 py-3 text-xs text-muted-foreground">
            {hasMore ? (
              <span className="inline-flex items-center gap-2">
                <span className="size-3.5 animate-spin rounded-full border-2 border-current opacity-40 border-t-transparent" />
                <span className="hidden sm:inline">Memuat…</span>
              </span>
            ) : (
              <span className="hidden sm:inline">Semua {filtered.length} item</span>
            )}
          </div>
        )}
      </div>

      {/* Item Dialog */}
      <Dialog open={dialog.open} onOpenChange={(o) => setDialog({ open: o })}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{dialog.edit ? "Edit Barang" : "Tambah Barang"}</DialogTitle>
            <DialogDescription>
              {dialog.edit
                ? "Perbarui data barang. Untuk mengubah stok, gunakan halaman Manajemen Stok."
                : "Isi data barang dan pilih lokasi penyimpanan beserta jumlah stok awal."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="i-name">Nama Barang</Label>
              <Input
                id="i-name"
                placeholder="cth: Steering Wheel Cover"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="i-sku">SKU / Kode (opsional)</Label>
                <Input
                  id="i-sku"
                  placeholder="cth: SWC-001"
                  value={form.sku}
                  onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value.toUpperCase() }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="i-unit">Satuan</Label>
                <Select value={form.unit} onValueChange={(v) => setForm((f) => ({ ...f, unit: v }))}>
                  <SelectTrigger id="i-unit" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="i-type">Jenis Barang</Label>
              <Select value={form.item_type} onValueChange={(v) => setForm((f) => ({ ...f, item_type: v as ItemType }))}>
                <SelectTrigger id="i-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="isi">
                    <div>
                      <span className="font-medium">Barang Isi</span>
                      <span className="text-xs text-muted-foreground ml-2">— konten/isi lengkap</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="kosong_box">
                    <div>
                      <span className="font-medium">Kosong / Box</span>
                      <span className="text-xs text-muted-foreground ml-2">— wadah tanpa isi</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="i-desc">Deskripsi (opsional)</Label>
              <Textarea
                id="i-desc"
                placeholder="Keterangan tambahan..."
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                rows={2}
              />
            </div>

            {/* Stock section — only in create mode */}
            {!dialog.edit && (
              <>
                <Separator />
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <MapPin className="size-4 text-muted-foreground" />
                    <p className="text-sm font-medium text-foreground">Lokasi & Stok Awal</p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Pilih lokasi penyimpanan dan jumlah stok awal untuk barang ini.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="i-location">Sub-Lokasi</Label>
                  <Select
                    value={form.location_id}
                    onValueChange={(v) => setForm((f) => ({ ...f, location_id: v }))}
                  >
                    <SelectTrigger id="i-location" className="w-full">
                      <SelectValue placeholder="Pilih sub-lokasi" />
                    </SelectTrigger>
                    <SelectContent>
                      {locations.map((loc) => (
                        <SelectItem key={loc.id} value={loc.id}>
                          <span className="font-mono text-xs mr-2">{loc.cabinet?.code}{loc.code}</span>
                          {loc.name && <span>{loc.name}</span>}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="i-qty">Jumlah Stok</Label>
                    <Input
                      id="i-qty"
                      type="number"
                      min={0}
                      value={form.quantity}
                      onChange={(e) => setForm((f) => ({ ...f, quantity: parseInt(e.target.value) || 0 }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="i-status">Status</Label>
                    <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v as StockStatus }))}>
                      <SelectTrigger id="i-status" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.keys(STATUS_CONFIG) as StockStatus[]).map((s) => (
                          <SelectItem key={s} value={s}>{STATUS_CONFIG[s].label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </>
            )}

            {formError && <p className="text-sm text-destructive">{formError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog({ open: false })} disabled={submitting}>Batal</Button>
            <Button onClick={saveItem} disabled={submitting}>
              {submitting && <Loader2 className="size-4 animate-spin" />}
              {dialog.edit ? "Simpan" : "Tambah"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Dialog */}
      <ImportItemsDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        locations={locations}
        onImported={loadData}
      />

      {/* Delete Confirm */}
      <AlertDialog open={deleteConfirm.open} onOpenChange={(o) => setDeleteConfirm((d) => ({ ...d, open: o }))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Barang?</AlertDialogTitle>
            <AlertDialogDescription>
              Menghapus <strong>{deleteConfirm.name}</strong> akan menghapus semua data stok terkait secara permanen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} variant="destructive">Hapus</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* Bulk Delete Confirm */}
      <AlertDialog open={bulkDeleteConfirm} onOpenChange={setBulkDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus {selectedIds.size} Barang?</AlertDialogTitle>
            <AlertDialogDescription>
              Barang yang dipilih beserta semua data stok terkait akan dihapus permanen. Aksi ini tidak dapat dibatalkan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkDeleting}>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkDelete} disabled={bulkDeleting} variant="destructive">
              {bulkDeleting && <Loader2 className="size-4 animate-spin" />}
              Hapus Semua
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
