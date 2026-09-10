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

export default function PublicRequestPage() {
  const [items, setItems] = React.useState<AvailableItem[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [search, setSearch] = React.useState("")

  const [selected, setSelected] = React.useState<AvailableItem | null>(null)
  const [borrower, setBorrower] = React.useState("")
  const [returnDate, setReturnDate] = React.useState("")
  const [qty, setQty] = React.useState("1")
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
    if (error) setError(error.message)
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

  const openForm = (item: AvailableItem) => {
    setSelected(item)
    setBorrower("")
    setReturnDate("")
    setQty("1")
    setNotes("")
    setFormError("")
    setResultCode(null)
  }

  const submit = async () => {
    if (!selected) return
    if (!borrower.trim()) {
      setFormError("Nama peminjam wajib diisi.")
      return
    }
    setSubmitting(true)
    setFormError("")
    try {
      const { data, error } = await supabase.rpc("public_create_loan_request", {
        p_item_id: selected.item_id,
        p_borrower_name: borrower.trim(),
        p_return_date: returnDate || null,
        p_quantity: Math.max(1, Number.parseInt(qty, 10) || 1),
        p_notes: notes.trim() || null,
      })
      if (error) throw new Error(error.message)
      setResultCode(String(data))
      void load()
    } catch (e) {
      setFormError((e as Error).message)
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
      setCheckError(error.message)
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
            <p className="hidden text-xs text-muted-foreground sm:block">Tanpa login — ajukan & cek status</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 px-4 py-6">
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
            <p className="py-8 text-center text-sm text-muted-foreground">Tidak ada barang tersedia.</p>
          ) : (
            <div className="space-y-2">
              {shown.map((item) => (
                <div key={item.item_id} className="flex items-center gap-3 rounded-xl border p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{item.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {item.sku ? <span className="font-mono">{item.sku}</span> : null}
                      {item.sku && item.category ? " · " : ""}
                      {item.category ?? ""}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold tabular-nums">{item.available}</p>
                    <p className="text-[10px] text-muted-foreground">{item.unit}</p>
                  </div>
                  <Button size="sm" onClick={() => openForm(item)}>
                    <span className="hidden sm:inline">Pinjam</span>
                    <Package className="size-4 sm:hidden" />
                  </Button>
                </div>
              ))}

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

      {/* Request form */}
      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="sm:max-w-md">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="text-base">{selected.name}</DialogTitle>
                <DialogDescription>
                  {selected.sku ? `SKU ${selected.sku} · ` : ""}Tersedia {selected.available} {selected.unit}
                </DialogDescription>
              </DialogHeader>

              {resultCode ? (
                <div className="space-y-3 py-2 text-center">
                  <CheckCircle2 className="mx-auto size-10 text-green-500" />
                  <p className="text-sm font-medium">Pengajuan terkirim!</p>
                  <p className="text-xs text-muted-foreground">
                    Simpan kode ini untuk cek status & keperluan audit:
                  </p>
                  <p className="rounded-lg border bg-muted/40 py-2 font-mono text-sm font-semibold">{resultCode}</p>
                  <Button className="w-full" onClick={() => setSelected(null)}>Selesai</Button>
                </div>
              ) : (
                <>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="borrower">Nama peminjam <span className="text-destructive">*</span></Label>
                      <Input
                        id="borrower"
                        placeholder="Nama lengkap"
                        value={borrower}
                        onChange={(e) => setBorrower(e.target.value)}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label htmlFor="return" className="flex items-center gap-1.5">
                          <CalendarDays className="size-3.5" /> Tgl dikembalikan
                        </Label>
                        <Input
                          id="return"
                          type="date"
                          value={returnDate}
                          onChange={(e) => setReturnDate(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="qty">Jumlah ({selected.unit})</Label>
                        <Input
                          id="qty"
                          type="number"
                          min={1}
                          max={selected.available}
                          inputMode="numeric"
                          value={qty}
                          onChange={(e) => setQty(e.target.value)}
                        />
                      </div>
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
                    <Button variant="outline" onClick={() => setSelected(null)} disabled={submitting}>
                      Batal
                    </Button>
                    <Button onClick={() => void submit()} disabled={submitting}>
                      {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
                      Ajukan Pinjam
                    </Button>
                  </DialogFooter>
                </>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
