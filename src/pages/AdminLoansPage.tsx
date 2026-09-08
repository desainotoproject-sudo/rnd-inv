import * as React from "react"
import { supabase } from "@/lib/supabase"
import type { Location, Cabinet, StockEntry, ItemType, TransactionType } from "@/lib/database.types"
import { useAuth } from "@/contexts/AuthContext"
import {
  ArrowUpFromLine,
  ArrowDownToLine,
  Plus,
  Trash2,
  Search,
  Loader2,
  Calendar as CalendarIcon,
  User,
  Package,
  History,
  CheckCircle2,
  Clock,
  Pencil,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { DatePicker } from "@/components/ui/date-picker"
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty"
import { toast } from "sonner"

type StockWithLocation = StockEntry & { location: Location & { cabinet: Cabinet } }

interface CartItem {
  stock_entry_id: string
  item_id: string
  item_name: string
  item_type: ItemType
  unit: string
  location_id: string
  location_code: string
  available: number
  quantity: number
}

interface AdminLoanRow {
  id: string
  borrower_name: string
  type: TransactionType
  return_date: string | null
  notes: string | null
  status: "aktif" | "selesai"
  created_at: string
  items: {
    id: string
    item_name: string
    quantity: number
    unit: string
    item_id: string
    location_id: string
    location: { code: string; cabinet: { code: string } } | null
  }[]
}

interface EditForm {
  borrower_name: string
  return_date: string
  notes: string
}

export default function AdminLoansPage() {
  const { profile } = useAuth()
  const [tab, setTab] = React.useState("create")
  const [stockList, setStockList] = React.useState<StockWithLocation[]>([])
  const [cart, setCart] = React.useState<CartItem[]>([])
  const [search, setSearch] = React.useState("")
  const [borrowerName, setBorrowerName] = React.useState("")
  const [loanType, setLoanType] = React.useState<TransactionType>("pinjam")
  const [returnDate, setReturnDate] = React.useState("")
  const [notes, setNotes] = React.useState("")
  const [submitting, setSubmitting] = React.useState(false)
  const [loadingStock, setLoadingStock] = React.useState(true)
  const [history, setHistory] = React.useState<AdminLoanRow[]>([])
  const [loadingHistory, setLoadingHistory] = React.useState(true)
  const [returnDialog, setReturnDialog] = React.useState<{ open: boolean; loan: AdminLoanRow | null }>({ open: false, loan: null })
  const [returning, setReturning] = React.useState(false)
  const [editDialog, setEditDialog] = React.useState<{ open: boolean; loan: AdminLoanRow | null }>({ open: false, loan: null })
  const [editForm, setEditForm] = React.useState<EditForm>({ borrower_name: "", return_date: "", notes: "" })
  const [editSubmitting, setEditSubmitting] = React.useState(false)

  const loadStock = React.useCallback(async () => {
    const { data, error } = await supabase
      .from("stock_entries")
      .select("*, item:items(*), location:locations(*, cabinet:cabinets(*))")
      .order("created_at")
    if (error) {
      toast.error("Gagal memuat data stok.")
      return
    }
    setStockList((data ?? []) as unknown as StockWithLocation[])
    setLoadingStock(false)
  }, [])

  const loadHistory = React.useCallback(async () => {
    const { data, error } = await supabase
      .from("admin_loans")
      .select(`
        id, borrower_name, type, return_date, notes, status, created_at,
        items:admin_loan_items (
          id, item_name, quantity, unit, item_id, location_id,
          location:locations ( code, cabinet:cabinets(code) )
        )
      `)
      .order("created_at", { ascending: false })
      .limit(50)
    if (error) {
      toast.error("Gagal memuat riwayat.")
      return
    }
    setHistory((data ?? []) as unknown as AdminLoanRow[])
    setLoadingHistory(false)
  }, [])

  React.useEffect(() => {
    loadStock()
    loadHistory()
  }, [loadStock, loadHistory])

  const filteredStock = stockList.filter((s) => {
    const q = search.toLowerCase()
    return (
      s.item?.name.toLowerCase().includes(q) ||
      (s.item?.sku ?? "").toLowerCase().includes(q)
    )
  })

  const addToCart = (s: StockWithLocation) => {
    const locCode = `${s.location?.cabinet?.code ?? ""}${s.location?.code ?? ""}`
    const existing = cart.find((c) => c.stock_entry_id === s.id)
    if (existing) {
      toast.info("Barang sudah ada di daftar.")
      return
    }
    if (loanType === "pinjam" && s.quantity <= 0) {
      toast.error("Stok habis, tidak bisa dipinjam.")
      return
    }
    setCart([...cart, {
      stock_entry_id: s.id,
      item_id: s.item_id,
      item_name: s.item?.name ?? "—",
      item_type: s.item?.item_type ?? "isi",
      unit: s.item?.unit ?? "pcs",
      location_id: s.location_id,
      location_code: locCode,
      available: s.quantity,
      quantity: 1,
    }])
  }

  const updateQty = (id: string, qty: number) => {
    setCart(cart.map((c) => {
      if (c.stock_entry_id !== id) return c
      if (loanType === "pinjam" && qty > c.available) {
        toast.error(`Jumlah melebihi stok tersedia (${c.available}).`)
        return c
      }
      return { ...c, quantity: Math.max(1, qty) }
    }))
  }

  const removeFromCart = (id: string) => {
    setCart(cart.filter((c) => c.stock_entry_id !== id))
  }

  const resetForm = () => {
    setCart([])
    setBorrowerName("")
    setLoanType("pinjam")
    setReturnDate("")
    setNotes("")
  }

  const handleSubmit = async () => {
    if (!borrowerName.trim()) {
      toast.error("Nama peminjam/penitip wajib diisi.")
      return
    }
    if (cart.length === 0) {
      toast.error("Pilih minimal satu barang.")
      return
    }
    if (loanType === "pinjam" && !returnDate) {
      toast.error("Tanggal pengembalian wajib diisi untuk pinjam.")
      return
    }

    setSubmitting(true)

    try {
      const { data: loan, error: loanErr } = await supabase
        .from("admin_loans")
        .insert({
          borrower_name: borrowerName.trim(),
          type: loanType,
          return_date: loanType === "pinjam" ? returnDate : null,
          notes: notes.trim() || null,
          status: "aktif",
          created_by: profile?.id,
        })
        .select()
        .single()

      if (loanErr) throw new Error(loanErr.message)

      const loanItems = cart.map((c) => ({
        admin_loan_id: loan.id,
        item_id: c.item_id,
        item_name: c.item_name,
        item_type: c.item_type,
        unit: c.unit,
        location_id: c.location_id,
        quantity: c.quantity,
      }))
      const { error: itemsErr } = await supabase.from("admin_loan_items").insert(loanItems)
      if (itemsErr) throw new Error(itemsErr.message)

      for (const c of cart) {
        if (loanType === "pinjam") {
          const newQty = Math.max(0, c.available - c.quantity)
          const newStatus = newQty === 0 ? "kosong" : "tersedia"
          const { error: decErr } = await supabase
            .from("stock_entries")
            .update({ quantity: newQty, status: newStatus })
            .eq("id", c.stock_entry_id)
          if (decErr) throw new Error(decErr.message)
        } else {
          const newQty = c.available + c.quantity
          const { error: incErr } = await supabase
            .from("stock_entries")
            .update({ quantity: newQty, status: "tersedia" })
            .eq("id", c.stock_entry_id)
          if (incErr) throw new Error(incErr.message)
        }
      }

      toast.success(`${cart.length} barang berhasil ${loanType === "pinjam" ? "dipinjamkan" : "dititipkan"} ke ${borrowerName}.`)
      resetForm()
      loadStock()
      loadHistory()
    } catch (err) {
      toast.error("Gagal menyimpan transaksi: " + (err as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleReturn = async (loan: AdminLoanRow) => {
    setReturning(true)
    try {
      for (const item of loan.items) {
        const { data: se } = await supabase
          .from("stock_entries")
          .select("id, quantity")
          .eq("item_id", item.item_id)
          .eq("location_id", item.location_id)
          .maybeSingle()

        if (se) {
          await supabase
            .from("stock_entries")
            .update({ quantity: se.quantity + item.quantity, status: "tersedia" })
            .eq("id", se.id)
        }
      }

      const { error: updErr } = await supabase
        .from("admin_loans")
        .update({ status: "selesai" })
        .eq("id", loan.id)
      if (updErr) throw new Error(updErr.message)

      toast.success("Barang berhasil dikembalikan, stok diperbarui.")
      setReturnDialog({ open: false, loan: null })
      loadStock()
      loadHistory()
    } catch (err) {
      toast.error("Gagal mengembalikan: " + (err as Error).message)
    } finally {
      setReturning(false)
    }
  }

  const openEdit = (loan: AdminLoanRow) => {
    setEditForm({
      borrower_name: loan.borrower_name,
      return_date: loan.return_date ?? "",
      notes: loan.notes ?? "",
    })
    setEditDialog({ open: true, loan })
  }

  const handleEditSave = async () => {
    if (!editDialog.loan) return
    if (!editForm.borrower_name.trim()) {
      toast.error("Nama peminjam wajib diisi.")
      return
    }
    if (!editForm.return_date) {
      toast.error("Tanggal pengembalian wajib diisi.")
      return
    }

    setEditSubmitting(true)
    try {
      const { error } = await supabase
        .from("admin_loans")
        .update({
          borrower_name: editForm.borrower_name.trim(),
          return_date: editForm.return_date,
          notes: editForm.notes.trim() || null,
        })
        .eq("id", editDialog.loan.id)

      if (error) throw new Error(error.message)

      toast.success("Transaksi berhasil diperbarui.")
      setEditDialog({ open: false, loan: null })
      loadHistory()
    } catch (err) {
      toast.error("Gagal memperbarui: " + (err as Error).message)
    } finally {
      setEditSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Transaksi Pinjam / Titip</h1>
          <p className="text-sm text-muted-foreground">Input langsung oleh admin RND untuk peminjam/penitip eksternal.</p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="create">
            <Plus className="size-4" />
            Buat Transaksi
          </TabsTrigger>
          <TabsTrigger value="history">
            <History className="size-4" />
            Riwayat
          </TabsTrigger>
        </TabsList>

        {/* Create Tab */}
        <TabsContent value="create" className="space-y-4">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Left: Stock picker */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Pilih Barang dari Stok</CardTitle>
                <div className="relative mt-2">
                  <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                  <Input
                    placeholder="Cari nama atau SKU..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-8"
                  />
                </div>
              </CardHeader>
              <CardContent>
                {loadingStock ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="size-6 animate-spin text-muted-foreground" />
                  </div>
                ) : filteredStock.length === 0 ? (
                  <Empty>
                    <EmptyHeader>
                      <EmptyMedia>
                        <Package className="size-8" />
                      </EmptyMedia>
                      <EmptyTitle>Tidak ada stok</EmptyTitle>
                      <EmptyDescription>Belum ada barang di stok atau hasil pencarian kosong.</EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                ) : (
                  <div className="max-h-96 overflow-y-auto space-y-1.5">
                    {filteredStock.map((s) => {
                      const locCode = `${s.location?.cabinet?.code ?? ""}${s.location?.code ?? ""}`
                      const inCart = cart.find((c) => c.stock_entry_id === s.id)
                      return (
                        <div
                          key={s.id}
                          className={`flex items-center justify-between rounded-lg border p-2.5 transition-colors ${inCart ? "border-primary bg-primary/5" : "hover:bg-muted/40"}`}
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">{s.item?.name}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">{locCode}</code>
                              <span className="text-xs text-muted-foreground">Stok: {s.quantity} {s.item?.unit}</span>
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant={inCart ? "secondary" : "outline"}
                            disabled={!!inCart || (loanType === "pinjam" && s.quantity <= 0)}
                            onClick={() => addToCart(s)}
                          >
                            {inCart ? <CheckCircle2 className="size-4" /> : <Plus className="size-4" />}
                          </Button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Right: Cart + form */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Detail Transaksi</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Borrower name */}
                <div className="space-y-1.5">
                  <Label className="text-sm">Nama Peminjam / Penitip</Label>
                  <div className="relative">
                    <User className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                    <Input
                      placeholder="Masukkan nama..."
                      value={borrowerName}
                      onChange={(e) => setBorrowerName(e.target.value)}
                      className="pl-8"
                    />
                  </div>
                </div>

                {/* Type */}
                <div className="space-y-1.5">
                  <Label className="text-sm">Jenis Transaksi</Label>
                  <Select value={loanType} onValueChange={(v) => setLoanType(v as TransactionType)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pinjam">
                        <div className="flex items-center gap-2">
                          <ArrowUpFromLine className="size-4" /> Pinjam
                        </div>
                      </SelectItem>
                      <SelectItem value="titip">
                        <div className="flex items-center gap-2">
                          <ArrowDownToLine className="size-4" /> Titip
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Return date (pinjam only) */}
                {loanType === "pinjam" && (
                  <div className="space-y-1.5">
                    <Label className="text-sm">Tanggal Pengembalian</Label>
                    <DatePicker
                      value={returnDate}
                      onChange={setReturnDate}
                      placeholder="Pilih tanggal pengembalian"
                    />
                  </div>
                )}

                {/* Notes */}
                <div className="space-y-1.5">
                  <Label className="text-sm">Catatan (opsional)</Label>
                  <Textarea
                    placeholder="Catatan tambahan..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                  />
                </div>

                {/* Cart items */}
                <div className="space-y-2">
                  <Label className="text-sm">Barang Dipilih ({cart.length})</Label>
                  {cart.length === 0 ? (
                    <div className="rounded-lg border border-dashed py-8 text-center">
                      <Package className="size-8 mx-auto text-muted-foreground mb-1" />
                      <p className="text-xs text-muted-foreground">Belum ada barang dipilih.</p>
                    </div>
                  ) : (
                    <div className="space-y-1.5 max-h-48 overflow-y-auto">
                      {cart.map((c) => (
                        <div key={c.stock_entry_id} className="flex items-center gap-2 rounded-lg border p-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">{c.item_name}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <code className="text-xs bg-muted px-1 rounded font-mono">{c.location_code}</code>
                              <span className="text-xs text-muted-foreground">Tersedia: {c.available} {c.unit}</span>
                            </div>
                          </div>
                          <Input
                            type="number"
                            min={1}
                            max={loanType === "pinjam" ? c.available : undefined}
                            value={c.quantity}
                            onChange={(e) => updateQty(c.stock_entry_id, parseInt(e.target.value) || 1)}
                            className="w-20 h-8 text-sm tabular-nums"
                          />
                          <span className="text-xs text-muted-foreground w-8">{c.unit}</span>
                          <Button size="icon" variant="ghost" className="size-8 text-destructive" onClick={() => removeFromCart(c.stock_entry_id)}>
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Summary */}
                {cart.length > 0 && (
                  <div className="rounded-lg bg-muted/40 p-3 space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Total Barang</span>
                      <span className="font-medium">{cart.length} jenis</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Total Unit</span>
                      <span className="font-medium tabular-nums">{cart.reduce((sum, c) => sum + c.quantity, 0)}</span>
                    </div>
                    {loanType === "pinjam" && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Tipe</span>
                        <Badge variant="outline" className="text-amber-600 border-amber-300">
                          <ArrowUpFromLine className="size-3 mr-1" /> Pinjam
                        </Badge>
                      </div>
                    )}
                    {loanType === "titip" && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Tipe</span>
                        <Badge variant="outline" className="text-green-600 border-green-300">
                          <ArrowDownToLine className="size-3 mr-1" /> Titip
                        </Badge>
                      </div>
                    )}
                  </div>
                )}

                <Button
                  className="w-full"
                  onClick={handleSubmit}
                  disabled={submitting || cart.length === 0 || !borrowerName}
                >
                  {submitting && <Loader2 className="size-4 animate-spin" />}
                  {loanType === "pinjam" ? "Simpan Pinjam" : "Simpan Titip"}
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history" className="space-y-4">
          {loadingHistory ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : history.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia>
                  <History className="size-8" />
                </EmptyMedia>
                <EmptyTitle>Belum ada transaksi</EmptyTitle>
                <EmptyDescription>Transaksi pinjam/titip yang dibuat admin akan muncul di sini.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="space-y-3">
              {history.map((loan) => (
                <Card key={loan.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{loan.borrower_name}</span>
                          {loan.type === "pinjam" ? (
                            <Badge variant="outline" className="text-amber-600 border-amber-300">
                              <ArrowUpFromLine className="size-3 mr-1" /> Pinjam
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-green-600 border-green-300">
                              <ArrowDownToLine className="size-3 mr-1" /> Titip
                            </Badge>
                          )}
                          {loan.status === "aktif" ? (
                            <Badge variant="outline" className="text-blue-600 border-blue-300">
                              <Clock className="size-3 mr-1" /> Aktif
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-muted-foreground">
                              <CheckCircle2 className="size-3 mr-1" /> Selesai
                            </Badge>
                          )}
                        </div>
                        {loan.return_date && (
                          <p className="text-xs text-muted-foreground">
                            <CalendarIcon className="size-3 inline mr-1" />
                            Pengembalian: {new Date(loan.return_date).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}
                          </p>
                        )}
                        {loan.notes && <p className="text-xs text-muted-foreground italic">"{loan.notes}"</p>}
                        <p className="text-xs text-muted-foreground">
                          {new Date(loan.created_at).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })} •{" "}
                          {new Date(loan.created_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {loan.type === "pinjam" && loan.status === "aktif" && (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => openEdit(loan)}
                            >
                              <Pencil className="size-4" />
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setReturnDialog({ open: true, loan })}
                            >
                              <ArrowDownToLine className="size-4" />
                              Kembalikan
                            </Button>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Items */}
                    <div className="mt-3 rounded-lg border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs">Barang</TableHead>
                            <TableHead className="text-xs">Lokasi</TableHead>
                            <TableHead className="text-xs text-right">Jumlah</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {loan.items.map((item) => (
                            <TableRow key={item.id}>
                              <TableCell className="text-sm font-medium">{item.item_name}</TableCell>
                              <TableCell>
                                {item.location ? (
                                  <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">
                                    {item.location.cabinet?.code}{item.location.code}
                                  </code>
                                ) : "—"}
                              </TableCell>
                              <TableCell className="text-sm text-right tabular-nums">{item.quantity} {item.unit}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Return confirmation dialog */}
      <Dialog open={returnDialog.open} onOpenChange={(open) => setReturnDialog({ open, loan: returnDialog.loan })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Konfirmasi Pengembalian</DialogTitle>
            <DialogDescription>
              Stok akan dikembalikan sesuai jumlah yang dipinjam. Pastikan barang sudah diterima.
            </DialogDescription>
          </DialogHeader>
          {returnDialog.loan && (
            <div className="rounded-lg border p-3 space-y-1">
              <p className="text-sm font-medium">{returnDialog.loan.borrower_name}</p>
              <div className="space-y-0.5">
                {returnDialog.loan.items.map((item) => (
                  <div key={item.id} className="flex justify-between text-sm">
                    <span>{item.item_name}</span>
                    <span className="tabular-nums">{item.quantity} {item.unit}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setReturnDialog({ open: false, loan: null })}>Batal</Button>
            <Button onClick={() => returnDialog.loan && handleReturn(returnDialog.loan)} disabled={returning}>
              {returning && <Loader2 className="size-4 animate-spin" />}
              Konfirmasi Kembali
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={editDialog.open} onOpenChange={(open) => setEditDialog({ open, loan: open ? editDialog.loan : null })}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Transaksi Pinjam</DialogTitle>
            <DialogDescription>
              Ubah nama peminjam, tanggal pengembalian, atau catatan. Daftar barang tidak dapat diubah setelah transaksi dibuat.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="e-name">Nama Peminjam</Label>
              <div className="relative">
                <User className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                <Input
                  id="e-name"
                  placeholder="Masukkan nama..."
                  value={editForm.borrower_name}
                  onChange={(e) => setEditForm((f) => ({ ...f, borrower_name: e.target.value }))}
                  className="pl-8"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="e-date">Tanggal Pengembalian</Label>
              <DatePicker
                value={editForm.return_date}
                onChange={(v) => setEditForm((f) => ({ ...f, return_date: v }))}
                placeholder="Pilih tanggal pengembalian"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="e-notes">Catatan (opsional)</Label>
              <Textarea
                id="e-notes"
                placeholder="Catatan tambahan..."
                value={editForm.notes}
                onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialog({ open: false, loan: null })}>Batal</Button>
            <Button onClick={handleEditSave} disabled={editSubmitting}>
              {editSubmitting && <Loader2 className="size-4 animate-spin" />}
              Simpan Perubahan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
