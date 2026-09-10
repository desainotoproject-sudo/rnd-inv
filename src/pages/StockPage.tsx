import * as React from "react"
import { useInfiniteRows } from "@/hooks/use-infinite-rows"
import {
  Pencil,
  Trash2,
  Search,
  Loader2,
  BarChart3,
  Filter,
} from "lucide-react"
import { supabase } from "@/lib/supabase"
import type { StockEntry, Item, Location, Cabinet, StockStatus } from "@/lib/database.types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
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

const STATUS_CONFIG: Record<StockStatus, { label: string; class: string }> = {
  tersedia: { label: "Tersedia", class: "bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800" },
  kosong: { label: "Kosong", class: "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800" },
  dipinjam: { label: "Dipinjam", class: "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800" },
  menunggu_approval: { label: "Menunggu", class: "bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-800" },
}

type StockWithRelations = StockEntry & {
  item: Item
  location: Location & { cabinet: Cabinet }
}

interface StockForm {
  quantity: number
  status: StockStatus
  notes: string
}

export default function StockPage() {
  const [stocks, setStocks] = React.useState<StockWithRelations[]>([])
  const [loading, setLoading] = React.useState(true)
  const [search, setSearch] = React.useState("")
  const [filterStatus, setFilterStatus] = React.useState<StockStatus | "all">("all")

  const [dialog, setDialog] = React.useState<{ open: boolean; edit?: StockWithRelations }>({ open: false })
  const [form, setForm] = React.useState<StockForm>({ quantity: 0, status: "tersedia", notes: "" })
  const [formError, setFormError] = React.useState("")
  const [submitting, setSubmitting] = React.useState(false)

  const [deleteConfirm, setDeleteConfirm] = React.useState<{ open: boolean; id: string; label: string }>({
    open: false, id: "", label: "",
  })

  const loadData = React.useCallback(async () => {
    const { data } = await supabase
      .from("stock_entries")
      .select(`*, item:items(*), location:locations(*, cabinet:cabinets(*))`)
      .order("created_at", { ascending: false })
    setStocks((data ?? []) as StockWithRelations[])
    setLoading(false)
  }, [])

  React.useEffect(() => { loadData() }, [loadData])

  const filtered = React.useMemo(() => {
    const q = search.toLowerCase()
    return stocks.filter((s) => {
      const matchSearch =
        s.item?.name.toLowerCase().includes(q) ||
        (s.item?.sku ?? "").toLowerCase().includes(q) ||
        s.location?.code.toLowerCase().includes(q) ||
        s.location?.cabinet?.code.toLowerCase().includes(q)
      const matchStatus = filterStatus === "all" || s.status === filterStatus
      return matchSearch && matchStatus
    })
  }, [stocks, search, filterStatus])

  const { shown, hasMore, sentinelRef } = useInfiniteRows(filtered, 15)

  const openEdit = (s: StockWithRelations) => {
    setForm({
      quantity: s.quantity,
      status: s.status,
      notes: s.notes ?? "",
    })
    setFormError("")
    setDialog({ open: true, edit: s })
  }

  const saveStock = async () => {
    if (!dialog.edit) return
    setSubmitting(true)
    setFormError("")

    const payload = {
      quantity: form.quantity,
      status: form.status,
      notes: form.notes || null,
    }

    const { error } = await supabase.from("stock_entries").update(payload).eq("id", dialog.edit.id)
    if (error) {
      setFormError(error.message)
      setSubmitting(false)
      return
    }

    setDialog({ open: false })
    await loadData()
    setSubmitting(false)
  }

  const handleDelete = async () => {
    await supabase.from("stock_entries").delete().eq("id", deleteConfirm.id)
    setDeleteConfirm({ open: false, id: "", label: "" })
    await loadData()
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">Manajemen Stok</h1>
        <p className="hidden sm:block text-sm text-muted-foreground mt-1">
          Lihat dan koreksi jumlah stok barang per sub-lokasi. Untuk menambah barang baru, gunakan halaman Master Barang.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative min-w-60 flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Cari barang, SKU, atau lokasi..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as StockStatus | "all")}>
          <SelectTrigger className="w-44">
            <Filter className="size-3.5 text-muted-foreground" />
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua Status</SelectItem>
            {(Object.keys(STATUS_CONFIG) as StockStatus[]).map((s) => (
              <SelectItem key={s} value={s}>{STATUS_CONFIG[s].label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-lg border bg-card">
        {loading ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-md" />)}
          </div>
        ) : filtered.length === 0 ? (
          <Empty className="border-none">
            <EmptyHeader>
              <EmptyMedia variant="icon"><BarChart3 /></EmptyMedia>
              <EmptyTitle>Belum ada catatan stok</EmptyTitle>
              <EmptyDescription>
                {search || filterStatus !== "all"
                  ? "Tidak ada stok yang sesuai filter."
                  : "Tambahkan barang dari Master Barang untuk mulai mencatat stok."}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Barang</TableHead>
                <TableHead>Lokasi</TableHead>
                <TableHead>Jenis</TableHead>
                <TableHead>Jumlah</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-20"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((stock) => (
                <TableRow key={stock.id}>
                  <TableCell>
                    <div>
                      <p className="font-medium text-sm text-foreground">{stock.item?.name}</p>
                      {stock.item?.sku ? (
                        <code className="text-xs text-muted-foreground">{stock.item.sku}</code>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="flex size-6 shrink-0 items-center justify-center rounded bg-muted">
                        <span className="text-xs font-medium">{stock.location?.cabinet?.code}</span>
                      </div>
                      <span className="text-sm text-foreground">{stock.location?.code}</span>
                      {stock.location?.name && (
                        <span className="text-xs text-muted-foreground">— {stock.location.name}</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={
                        stock.item?.item_type === "isi"
                          ? "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400"
                          : "text-muted-foreground"
                      }
                    >
                      {stock.item?.item_type === "isi" ? "Isi" : "Kosong/Box"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span className="font-semibold text-sm">{stock.quantity}</span>
                    <span className="text-xs text-muted-foreground ml-1">{stock.item?.unit}</span>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={STATUS_CONFIG[stock.status].class}>
                      {STATUS_CONFIG[stock.status].label}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon-sm" onClick={() => openEdit(stock)}>
                        <Pencil />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setDeleteConfirm({ open: true, id: stock.id, label: `${stock.item?.name} @ ${stock.location?.code}` })}
                      >
                        <Trash2 className="text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
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
              <span className="hidden sm:inline">Semua {filtered.length} catatan</span>
            )}
          </div>
        )}
      </div>

      {/* Edit Stock Dialog */}
      <Dialog open={dialog.open} onOpenChange={(o) => setDialog({ open: o })}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Koreksi Stok</DialogTitle>
            <DialogDescription>
              Ubah jumlah atau status stok untuk{" "}
              <strong>{dialog.edit?.item?.name}</strong> di lokasi{" "}
              <strong>{dialog.edit?.location?.cabinet?.code}{dialog.edit?.location?.code}</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="s-qty">Jumlah</Label>
                <Input
                  id="s-qty"
                  type="number"
                  min={0}
                  value={form.quantity}
                  onChange={(e) => setForm((f) => ({ ...f, quantity: parseInt(e.target.value) || 0 }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="s-status">Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v as StockStatus }))}>
                  <SelectTrigger id="s-status" className="w-full">
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
            <div className="space-y-2">
              <Label htmlFor="s-notes">Catatan (opsional)</Label>
              <Textarea
                id="s-notes"
                placeholder="Keterangan tambahan..."
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                rows={2}
              />
            </div>
            {formError && <p className="text-sm text-destructive">{formError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog({ open: false })} disabled={submitting}>Batal</Button>
            <Button onClick={saveStock} disabled={submitting}>
              {submitting && <Loader2 className="size-4 animate-spin" />}
              Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={deleteConfirm.open} onOpenChange={(o) => setDeleteConfirm((d) => ({ ...d, open: o }))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Catatan Stok?</AlertDialogTitle>
            <AlertDialogDescription>
              Catatan stok untuk <strong>{deleteConfirm.label}</strong> akan dihapus permanen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} variant="destructive">Hapus</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
