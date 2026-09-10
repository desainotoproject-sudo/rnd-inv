import * as React from "react"
import { supabase } from "@/lib/supabase"
import { useInfiniteRows } from "@/hooks/use-infinite-rows"
import {
  Search,
  Loader2,
  Package,
  CheckCircle2,
  AlertTriangle,
  PackageCheck,
  PackageX,
  ClipboardList,
  CalendarDays,
  Minus,
  Plus,
  ShoppingCart,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

type AvailableItem = {
  item_id: string
  name: string
  sku: string | null
  category: string | null
  unit: string
  item_type: "isi" | "kosong_box"
  available: number
}

type RequestStatus = {
  code: string
  item_name: string
  status: string
  prepared: boolean
  borrower_name: string
  return_date: string | null
  created_at: string
}

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  menunggu_approval: { label: "Menunggu approval", className: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" },
  disetujui: { label: "Disetujui", className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  ditolak: { label: "Ditolak", className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
  selesai: { label: "Selesai", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
}

/** Turn low-level PostgREST errors into actionable messages. */
function friendlyError(msg: string): string {
  if (/could not find the function|does not exist|schema cache|PGRST202/i.test(msg)) {
    return (
      "Fitur publik belum aktif di server. Jalankan migrasi terbaru di Supabase " +
      "(lihat folder supabase/migrations), lalu reload schema (NOTIFY pgrst, 'reload schema';)."
    )
  }
  return msg
}

export default function PublicRequestPage() {
  const [items, setItems] = React.useState<AvailableItem[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [search, setSearch] = React.useState("")

  // cart: item_id -> quantity
  const [cart, setCart] = React.useState<Record<string, number>>({})

  const [formOpen, setFormOpen] = React.useState(false)
  const [borrower, setBorrower] = React.useState("")
  const [returnDate, setReturnDate] = React.useState("")
  const [notes, setNotes] = React.useState("")
  const [submitting, setSubmitting] = React.useState(false)
  const [formError, setFormError] = React.useState("")
  const [resultCode, setResultCode] = React.useState<string | null>(null)

  const [checkCode, setCheckCode] = React.useState("")
  const [checking, setChecking] = React.useState(false)
  const [checkError, setCheckError] = React.useState("")
  const [checkResult, setCheckResult] = React.useState<RequestStatus | null>(null)

  const load = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error } = await supabase.rpc("public_available_items")
    if (error) setError(friendlyError(error.message))
    else setItems((data ?? []) as AvailableItem[])
    setLoading(false)
  }, [])

  React.useEffect(() => {
    void load()
  }, [load])

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return items
    return items.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        (i.sku ?? "").toLowerCase().includes(q) ||
        (i.category ?? "").toLowerCase().includes(q)
    )
  }, [items, search])

  const { shown, hasMore, sentinelRef } = useInfiniteRows(filtered, 15)

  const availableOf = (id: string) => items.find((i) => i.item_id === id)?.available ?? 0

  const inc = (item: AvailableItem) =>
    setCart((prev) => {
      const current = prev[item.item_id] ?? 0
      if (current >= item.available) return prev
      return { ...prev, [item.item_id]: current + 1 }
    })

  const dec = (id: string) =>
    setCart((prev) => {
      const next = { ...prev }
      const current = next[id] ?? 0
      if (current <= 1) delete next[id]
      else next[id] = current - 1
      return next
    })

  const setQty = (id: string, raw: string) => {
    const max = availableOf(id)
    const n = Math.max(0, Math.min(max, Number.parseInt(raw, 10) || 0))
    setCart((prev) => {
      const next = { ...prev }
      if (n <= 0) delete next[id]
      else next[id] = n
      return next
    })
  }

  const cartItems = React.useMemo(
    () =>
      items
        .filter((i) => (cart[i.item_id] ?? 0) > 0)
        .map((i) => ({ item: i, qty: cart[i.item_id] })),
    [items, cart]
  )
  const totalItems = cartItems.reduce((a, c) => a + c.qty, 0)

  const openForm = () => {
    setBorrower("")
    setReturnDate("")
    setNotes("")
    setFormError("")
    setResultCode(null)
    setFormOpen(true)
  }

  const submit = async () => {
    if (!borrower.trim()) {
      setFormError("Nama peminjam wajib diisi.")
      return
    }
    if (cartItems.length === 0) {
      setFormError("Pilih minimal satu barang.")
      return
    }
    setSubmitting(true)
    setFormError("")
    try {
      const { data, error } = await supabase.rpc("public_create_loan_request", {
        p_borrower_name: borrower.trim(),
        p_return_date: returnDate || null,
        p_notes: notes.trim() || null,
        p_items: cartItems.map((c) => ({ item_id: c.item.item_id, quantity: c.qty })),
      })
      if (error) throw new Error(error.message)
      setResultCode(String(data))
      setCart({})
      void load()
    } catch (e) {
      setFormError(friendlyError((e as Error).message))
    }
    setSubmitting(false)
  }

  const checkStatus = async () => {
    const code = checkCode.trim()
    if (!code) return
    setChecking(true)
    setCheckError("")
    setCheckResult(null)
    const { data, error } = await supabase.rpc("public_loan_request_status", { p_code: code })
    if (error) {
      setCheckError(friendlyError(error.message))
    } else {
      const row = Array.isArray(data) ? (data[0] as RequestStatus | undefined) : (data as RequestStatus | null)
      if (!row) setCheckError("Kode tidak ditemukan.")
      else setCheckResult(row)
    }
    setChecking(false)
  }

  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-10 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-2.5 px-4 py-3">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary">
            <Package className="size-4 text-primary-foreground" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">Pinjam Barang RND</p>
            <p className="hidden text-xs text-muted-foreground sm:block">Tanpa login — pilih barang lalu ajukan</p>
          </div>
        </div>
      </header>

      <main className={`mx-auto max-w-3xl space-y-6 px-4 py-6 ${cartItems.length > 0 ? "pb-28" : ""}`}>
        {/* Check status */}
        <section className="space-y-3 rounded-2xl border p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <ClipboardList className="size-4 text-primary" />
            Cek status pengajuan
          </h2>
          <div className="flex gap-2">
            <Input
              placeholder="Masukkan kode, mis. LN-20260910-0001"
              value={checkCode}
              onChange={(e) => setCheckCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => {
                if (e.key === "Enter") void checkStatus()
              }}
              className="font-mono uppercase"
            />
            <Button variant="outline" onClick={() => void checkStatus()} disabled={checking || !checkCode.trim()}>
              {checking ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
              <span className="hidden sm:inline">Cek</span>
            </Button>
          </div>

          {checkError && (
            <p className="flex items-center gap-2 text-sm text-destructive">
              <AlertTriangle className="size-4" /> {checkError}
            </p>
          )}

          {checkResult && (
            <div className="space-y-2 rounded-xl border bg-muted/30 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="font-mono">{checkResult.code}</Badge>
                <Badge variant="outline" className={STATUS_LABEL[checkResult.status]?.className ?? ""}>
                  {STATUS_LABEL[checkResult.status]?.label ?? checkResult.status}
                </Badge>
                <Badge
                  variant="outline"
                  className={
                    checkResult.prepared
                      ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                      : "bg-muted text-muted-foreground"
                  }
                >
                  {checkResult.prepared ? (
                    <>
                      <PackageCheck className="size-3.5" /> Sudah disiapkan
                    </>
                  ) : (
                    <>
                      <PackageX className="size-3.5" /> Belum disiapkan
                    </>
                  )}
                </Badge>
              </div>
              <p className="text-sm font-medium">{checkResult.item_name}</p>
              <p className="text-xs text-muted-foreground">
                Peminjam: {checkResult.borrower_name}
                {checkResult.return_date ? ` · Kembali: ${checkResult.return_date}` : ""}
              </p>
            </div>
          )}
        </section>

        {/* Available items */}
        <section className="space-y-3">
          <h1 className="text-lg font-semibold sm:text-xl">Barang tersedia</h1>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Cari nama / SKU / kategori..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <p className="flex items-center gap-2 text-sm text-destructive">
              <AlertTriangle className="size-4" /> Gagal memuat data: {error}
            </p>
          ) : filtered.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              Belum ada barang tersedia. Barang tampil di sini bila punya stok dengan jumlah &gt; 0.
            </p>
          ) : (
            <div className="space-y-2">
              {shown.map((item) => {
                const qty = cart[item.item_id] ?? 0
                const atMax = qty >= item.available
                return (
                  <div key={item.item_id} className="flex items-center gap-3 rounded-xl border p-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{item.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {item.sku ? <span className="font-mono">{item.sku}</span> : null}
                        {item.sku && item.category ? " · " : ""}
                        {item.category ?? ""}
                      </p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        Tersedia {item.available} {item.unit}
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        variant="outline"
                        size="icon"
                        className="size-8"
                        onClick={() => dec(item.item_id)}
                        disabled={qty <= 0}
                        aria-label="Kurangi"
                      >
                        <Minus className="size-3.5" />
                      </Button>
                      <Input
                        value={qty}
                        onChange={(e) => setQty(item.item_id, e.target.value)}
                        inputMode="numeric"
                        aria-label="Jumlah"
                        className="h-8 w-12 text-center"
                      />
                      <Button
                        variant="outline"
                        size="icon"
                        className="size-8"
                        onClick={() => inc(item)}
                        disabled={atMax}
                        aria-label="Tambah"
                      >
                        <Plus className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                )
              })}

              {filtered.length > 0 && (
                <div ref={sentinelRef} className="flex items-center justify-center gap-2 py-3 text-xs text-muted-foreground">
                  {hasMore ? (
                    <span className="inline-flex items-center gap-2">
                      <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent opacity-40" />
                      <span className="hidden sm:inline">Memuat…</span>
                    </span>
                  ) : (
                    <span className="hidden sm:inline">Semua {filtered.length} barang</span>
                  )}
                </div>
              )}
            </div>
          )}
        </section>
      </main>

      {/* Sticky cart bar */}
      {cartItems.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 backdrop-blur">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-sm font-medium">
                <ShoppingCart className="size-4 text-primary" />
                {cartItems.length} jenis · {totalItems} item
              </p>
            </div>
            <Button onClick={openForm}>Ajukan Pinjam</Button>
          </div>
        </div>
      )}

      {/* Request form */}
      <Dialog
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open)
          if (!open) setResultCode(null)
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto overflow-x-hidden sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">Ajukan Pinjam</DialogTitle>
            <DialogDescription>
              {resultCode ? "Pengajuan terkirim." : `${cartItems.length} jenis barang dipilih.`}
            </DialogDescription>
          </DialogHeader>

          {resultCode ? (
            <div className="space-y-3 py-2 text-center">
              <CheckCircle2 className="mx-auto size-10 text-green-500" />
              <p className="text-sm font-medium">Pengajuan terkirim!</p>
              <p className="text-xs text-muted-foreground">Simpan kode ini untuk cek status & keperluan audit:</p>
              <p className="rounded-lg border bg-muted/40 py-2 font-mono text-sm font-semibold">{resultCode}</p>
              <Button className="w-full" onClick={() => setFormOpen(false)}>Selesai</Button>
            </div>
          ) : (
            <>
              <div className="space-y-4">
                {/* Selected items */}
                <div className="max-h-40 space-y-1.5 overflow-y-auto rounded-xl border bg-muted/30 p-3">
                  {cartItems.map(({ item, qty }) => (
                    <div key={item.item_id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="min-w-0 truncate">{item.name}</span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">
                        {qty} {item.unit}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="borrower">Nama peminjam <span className="text-destructive">*</span></Label>
                  <Input
                    id="borrower"
                    placeholder="Nama lengkap"
                    value={borrower}
                    onChange={(e) => setBorrower(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="return" className="flex items-center gap-1.5">
                    <CalendarDays className="size-3.5" /> Tanggal dikembalikan
                  </Label>
                  <Input id="return" type="date" value={returnDate} onChange={(e) => setReturnDate(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="notes">Catatan (opsional)</Label>
                  <Textarea
                    id="notes"
                    rows={2}
                    placeholder="Divisi / keperluan..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>
                {formError && (
                  <p className="flex items-center gap-2 text-sm text-destructive">
                    <AlertTriangle className="size-4" /> {formError}
                  </p>
                )}
              </div>
              <DialogFooter className="gap-2 sm:gap-0">
                <Button variant="outline" onClick={() => setFormOpen(false)} disabled={submitting}>
                  Batal
                </Button>
                <Button onClick={() => void submit()} disabled={submitting}>
                  {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
                  Ajukan Pinjam
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
