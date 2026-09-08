import * as React from "react"
import {
  Plus,
  Search,
  Loader2,
  ArrowDownToLine,
  ArrowUpFromLine,
  Clock,
  CheckCircle2,
  XCircle,
  Filter,
} from "lucide-react"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/contexts/AuthContext"
import type {
  Transaction,
  TransactionType,
  TransactionStatus,
  Item,
  Location,
  Cabinet,
  StockEntry,
} from "@/lib/database.types"
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
import { toast } from "sonner"

const TYPE_CONFIG: Record<TransactionType, { label: string; icon: React.ElementType; class: string }> = {
  pinjam: { label: "Pinjam", icon: ArrowUpFromLine, class: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400" },
  titip: { label: "Titip", icon: ArrowDownToLine, class: "bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400" },
}

const STATUS_CONFIG: Record<TransactionStatus, { label: string; icon: React.ElementType; class: string }> = {
  menunggu_approval: { label: "Menunggu Approval", icon: Clock, class: "bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400" },
  disetujui: { label: "Disetujui", icon: CheckCircle2, class: "bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400" },
  ditolak: { label: "Ditolak", icon: XCircle, class: "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400" },
}

type StockWithItem = StockEntry & { item: Item; location: Location & { cabinet: Cabinet } }
type TxnWithRelations = Transaction & {
  requester?: { full_name: string; division: string }
  location?: Location & { cabinet?: Cabinet }
  item?: Item
}

interface TxnForm {
  type: TransactionType
  item_id: string
  location_id: string
  quantity: number
  notes: string
}

const emptyForm: TxnForm = {
  type: "pinjam",
  item_id: "",
  location_id: "",
  quantity: 1,
  notes: "",
}

export default function TransactionsPage() {
  const { profile } = useAuth()
  const [transactions, setTransactions] = React.useState<TxnWithRelations[]>([])
  const [stocks, setStocks] = React.useState<StockWithItem[]>([])
  const [loading, setLoading] = React.useState(true)
  const [search, setSearch] = React.useState("")
  const [filterStatus, setFilterStatus] = React.useState<TransactionStatus | "all">("all")
  const [filterType, setFilterType] = React.useState<TransactionType | "all">("all")

  const [dialog, setDialog] = React.useState(false)
  const [form, setForm] = React.useState<TxnForm>(emptyForm)
  const [formError, setFormError] = React.useState("")
  const [submitting, setSubmitting] = React.useState(false)
  const [selectedStock, setSelectedStock] = React.useState<StockWithItem | null>(null)

  const loadData = React.useCallback(async () => {
    const [txnRes, stockRes] = await Promise.all([
      supabase
        .from("transactions")
        .select(`*, requester:profiles!transactions_requester_id_fkey(full_name, division), location:locations(*, cabinet:cabinets(*)), item:items(*)`)
        .order("created_at", { ascending: false }),
      supabase
        .from("stock_entries")
        .select(`*, item:items(*), location:locations(*, cabinet:cabinets(*))`)
        .order("created_at", { ascending: false }),
    ])
    setTransactions((txnRes.data ?? []) as TxnWithRelations[])
    setStocks((stockRes.data ?? []) as StockWithItem[])
    setLoading(false)
  }, [])

  React.useEffect(() => { loadData() }, [loadData])

  const filtered = React.useMemo(() => {
    const q = search.toLowerCase()
    return transactions.filter((t) => {
      const matchSearch =
        t.item_name.toLowerCase().includes(q) ||
        (t.requester?.full_name ?? "").toLowerCase().includes(q) ||
        (t.location?.code ?? "").toLowerCase().includes(q)
      const matchStatus = filterStatus === "all" || t.status === filterStatus
      const matchType = filterType === "all" || t.type === filterType
      return matchSearch && matchStatus && matchType
    })
  }, [transactions, search, filterStatus, filterType])

  const openCreate = () => {
    setForm(emptyForm)
    setFormError("")
    setSelectedStock(null)
    setDialog(true)
  }

  const handleItemSelect = (stockId: string) => {
    const stock = stocks.find((s) => s.id === stockId)
    setSelectedStock(stock ?? null)
    if (stock) {
      setForm((f) => ({
        ...f,
        item_id: stock.item_id,
        location_id: stock.location_id,
        type: f.type,
      }))
    }
  }

  const submitTransaction = async () => {
    if (!form.item_id || !form.location_id) {
      setFormError("Pilih barang terlebih dahulu.")
      return
    }
    if (form.quantity < 1) {
      setFormError("Jumlah minimal 1.")
      return
    }

    if (form.type === "pinjam" && selectedStock) {
      if (form.quantity > selectedStock.quantity) {
        setFormError(`Jumlah melebihi stok tersedia (${selectedStock.quantity} ${selectedStock.item.unit}).`)
        return
      }
    }

    setSubmitting(true)
    setFormError("")

    const stock = stocks.find((s) => s.item_id === form.item_id && s.location_id === form.location_id)
    const item = stock?.item

    if (!item || !stock) {
      setFormError("Data barang tidak ditemukan.")
      setSubmitting(false)
      return
    }

    const payload = {
      requester_id: profile!.id,
      type: form.type,
      item_id: form.item_id,
      item_name: item.name,
      item_type: item.item_type,
      unit: item.unit,
      location_id: form.location_id,
      quantity: form.quantity,
      status: "menunggu_approval" as const,
      notes: form.notes || null,
    }

    const { error } = await supabase.from("transactions").insert(payload)
    if (error) {
      setFormError(error.message)
      setSubmitting(false)
      return
    }

    // Self-notification
    await supabase.from("notifications").insert({
      user_id: profile!.id,
      type: "request_created",
      title: "Pengajuan Dibuat",
      message: `Pengajuan ${form.type === "pinjam" ? "pinjam" : "titip"} "${item.name}" (${form.quantity} ${item.unit}) telah dikirim. Menunggu approval RND.`,
    })

    setDialog(false)
    toast.success("Pengajuan berhasil dikirim. Menunggu approval RND.")
    await loadData()
    setSubmitting(false)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Pengajuan Saya</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Ajukan pinjam atau titip barang, dan pantau status pengajuan Anda.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus />
          Ajukan Barang
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative min-w-60 flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Cari barang, lokasi..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filterType} onValueChange={(v) => setFilterType(v as TransactionType | "all")}>
          <SelectTrigger className="w-36">
            <Filter className="size-3.5 text-muted-foreground" />
            <SelectValue placeholder="Jenis" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua Jenis</SelectItem>
            <SelectItem value="pinjam">Pinjam</SelectItem>
            <SelectItem value="titip">Titip</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as TransactionStatus | "all")}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua Status</SelectItem>
            <SelectItem value="menunggu_approval">Menunggu</SelectItem>
            <SelectItem value="disetujui">Disetujui</SelectItem>
            <SelectItem value="ditolak">Ditolak</SelectItem>
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
              <EmptyMedia variant="icon"><ArrowUpFromLine /></EmptyMedia>
              <EmptyTitle>Belum ada pengajuan</EmptyTitle>
              <EmptyDescription>
                {search || filterStatus !== "all" || filterType !== "all"
                  ? "Tidak ada pengajuan yang sesuai filter."
                  : "Ajukan pinjam atau titip barang pertama Anda."}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Jenis</TableHead>
                <TableHead>Barang</TableHead>
                <TableHead>Lokasi</TableHead>
                <TableHead>Jumlah</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Tanggal</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((txn) => (
                <TableRow key={txn.id}>
                  <TableCell>
                    <Badge variant="outline" className={TYPE_CONFIG[txn.type].class}>
                      {TYPE_CONFIG[txn.type].label}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div>
                      <p className="font-medium text-sm text-foreground">{txn.item_name}</p>
                      <Badge variant="outline" className="text-xs mt-0.5">
                        {txn.item_type === "isi" ? "Isi" : "Kosong/Box"}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <Badge variant="outline" className="font-mono text-xs px-1.5 py-0">
                        {txn.location?.cabinet?.code}
                      </Badge>
                      <span className="text-sm text-foreground">{txn.location?.code}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="font-semibold text-sm">{txn.quantity}</span>
                    <span className="text-xs text-muted-foreground ml-1">{txn.unit}</span>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <Badge variant="outline" className={STATUS_CONFIG[txn.status].class}>
                        {STATUS_CONFIG[txn.status].label}
                      </Badge>
                    </div>
                    {txn.status === "ditolak" && txn.rejection_reason && (
                      <p className="text-xs text-muted-foreground mt-1 max-w-40 truncate" title={txn.rejection_reason}>
                        {txn.rejection_reason}
                      </p>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(txn.created_at).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Create Transaction Dialog */}
      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Ajukan Pinjam / Titip Barang</DialogTitle>
            <DialogDescription>
              Pilih barang dari inventaris dan masukkan jumlah yang ingin dipinjam atau dititipkan.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Jenis Pengajuan</Label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={form.type === "pinjam" ? "default" : "outline"}
                  onClick={() => setForm((f) => ({ ...f, type: "pinjam" }))}
                  className="justify-start"
                >
                  <ArrowUpFromLine className="size-4" />
                  Pinjam
                </Button>
                <Button
                  type="button"
                  variant={form.type === "titip" ? "default" : "outline"}
                  onClick={() => setForm((f) => ({ ...f, type: "titip" }))}
                  className="justify-start"
                >
                  <ArrowDownToLine className="size-4" />
                  Titip
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="t-stock">Barang & Lokasi</Label>
              <Select onValueChange={handleItemSelect}>
                <SelectTrigger id="t-stock" className="w-full">
                  <SelectValue placeholder="Pilih barang dari inventaris" />
                </SelectTrigger>
                <SelectContent>
                  {stocks.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      <span className="font-medium">{s.item.name}</span>
                      <span className="text-xs text-muted-foreground ml-2">
                        @ {s.location.cabinet?.code}{s.location.code} — {s.quantity} {s.item.unit}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedStock && (
              <div className="rounded-lg border bg-muted/30 p-3 space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Stok tersedia:</span>
                  <span className="font-medium">{selectedStock.quantity} {selectedStock.item.unit}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Jenis:</span>
                  <Badge variant="outline" className="text-xs">
                    {selectedStock.item.item_type === "isi" ? "Isi" : "Kosong/Box"}
                  </Badge>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Lokasi:</span>
                  <span className="font-medium font-mono text-xs">{selectedStock.location.cabinet?.code}{selectedStock.location.code}</span>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="t-qty">Jumlah</Label>
              <Input
                id="t-qty"
                type="number"
                min={1}
                max={form.type === "pinjam" ? selectedStock?.quantity : undefined}
                value={form.quantity}
                onChange={(e) => setForm((f) => ({ ...f, quantity: parseInt(e.target.value) || 1 }))}
              />
              {form.type === "pinjam" && selectedStock && (
                <p className="text-xs text-muted-foreground">Maksimal {selectedStock.quantity} {selectedStock.item.unit}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="t-notes">Catatan (opsional)</Label>
              <Textarea
                id="t-notes"
                placeholder="Keterangan tambahan untuk RND..."
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                rows={2}
              />
            </div>

            {formError && <p className="text-sm text-destructive">{formError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(false)} disabled={submitting}>Batal</Button>
            <Button onClick={submitTransaction} disabled={submitting}>
              {submitting && <Loader2 className="size-4 animate-spin" />}
              Kirim Pengajuan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
