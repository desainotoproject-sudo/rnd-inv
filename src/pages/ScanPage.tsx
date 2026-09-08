import * as React from "react"
import { Html5Qrcode } from "html5-qrcode"
import { supabase } from "@/lib/supabase"
import type { Item, ItemType, Location, Cabinet, StockEntry, StockStatus } from "@/lib/database.types"
import {
  ScanLine,
  Loader2,
  Package,
  QrCode,
  Camera,
  Keyboard,
  MapPin,
  CheckCircle2,
  AlertTriangle,
  Save,
  X,
  Plus,
  Layers,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import { toast } from "sonner"

const ITEM_TYPE_LABELS: Record<ItemType, string> = {
  isi: "Barang Isi",
  kosong_box: "Kosong/Box",
}

const STATUS_DOT: Record<StockStatus, string> = {
  tersedia: "bg-green-500",
  kosong: "bg-red-500",
  dipinjam: "bg-orange-500",
  menunggu_approval: "bg-yellow-500",
}

type LocationWithCabinet = Location & { cabinet: Cabinet }
type StockLine = StockEntry & { item: Item; location: Location & { cabinet: Cabinet } }

function locCode(loc?: Location & { cabinet?: Cabinet }): string {
  if (!loc) return ""
  const cab = loc.cabinet?.code ?? ""
  return `${cab}${loc.code}`
}

function locLabel(loc: LocationWithCabinet): string {
  const code = locCode(loc)
  return loc.name ? `${code} · ${loc.name}` : code
}

function clampQty(raw: string): number {
  return Math.max(0, Number.parseInt(raw, 10) || 0)
}

type ScannerProps = {
  onDecode: (text: string) => void
  disabled?: boolean
}

function CameraScanner({ onDecode, disabled }: ScannerProps) {
  const scannerRef = React.useRef<Html5Qrcode | null>(null)
  const [state, setState] = React.useState<"idle" | "starting" | "scanning" | "error">("idle")
  const [error, setError] = React.useState<string | null>(null)
  const decodePendingRef = React.useRef(false)

  const stopCamera = React.useCallback(async () => {
    const s = scannerRef.current
    scannerRef.current = null
    if (s) {
      try {
        if (s.isScanning) await s.stop()
        s.clear()
      } catch {
        /* ignore cleanup errors */
      }
    }
  }, [])

  const handleDecode = React.useCallback(
    (text: string) => {
      if (decodePendingRef.current) return
      decodePendingRef.current = true
      void stopCamera().finally(() => {
        decodePendingRef.current = false
        setState("idle")
        setError(null)
        onDecode(text)
      })
    },
    [stopCamera, onDecode]
  )

  const startCamera = React.useCallback(async () => {
    if (scannerRef.current || disabled) return
    setState("starting")
    setError(null)
    try {
      const s = new Html5Qrcode("scan-region")
      scannerRef.current = s
      await s.start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: (w) => {
            const size = Math.floor(Math.min(w, 320) * 0.75)
            return { width: size, height: size }
          },
        },
        (decodedText) => handleDecode(decodedText),
        () => {
          /* per-frame decode errors ignored */
        }
      )
      setState("scanning")
    } catch (err) {
      scannerRef.current = null
      setState("error")
      setError((err as Error)?.message || "Tidak dapat mengakses kamera.")
    }
  }, [disabled, handleDecode])

  // Stop camera when the scanner is unmounted
  React.useEffect(() => {
    return () => {
      void stopCamera()
    }
  }, [stopCamera])

  return (
    <div className="space-y-3">
      <div className="relative mx-auto w-full max-w-sm overflow-hidden rounded-xl border bg-muted/30 min-h-75">
        <div id="scan-region" className="w-full min-h-75" />
        {state === "idle" && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground">
            <Camera className="size-8" />
            <p className="text-sm text-center px-6">
              Arahkan kamera ke QR/barcode SKU barang.
            </p>
          </div>
        )}
        {state === "starting" && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-muted-foreground">
            <Loader2 className="size-6 animate-spin" />
          </div>
        )}
        {state === "error" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center">
            <AlertTriangle className="size-7 text-destructive" />
            <p className="text-sm text-muted-foreground">{error}</p>
          </div>
        )}
        {state === "scanning" && (
          <div className="pointer-events-none absolute inset-0 rounded-xl ring-2 ring-primary/60" />
        )}
      </div>

      {state === "scanning" ? (
        <Button
          variant="outline"
          className="w-full max-w-sm mx-auto flex"
          onClick={() => void stopCamera().then(() => setState("idle"))}
        >
          <X className="size-4" /> Stop Kamera
        </Button>
      ) : (
        <Button
          className="w-full max-w-sm mx-auto flex"
          onClick={() => void startCamera()}
          disabled={state === "starting" || disabled}
        >
          {state === "starting" ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />}
          Mulai Kamera
        </Button>
      )}
    </div>
  )
}

type LookupState =
  | { status: "searching"; raw: string }
  | { status: "notfound"; raw: string }
  | { status: "error"; raw: string; msg: string }
  | null

type DrawerData = {
  item: Item
  stocks: StockLine[]
}

/**
 * One editable stock line for the scanned product.
 * - Existing stock row (stock_id set): its location is fixed; only quantity can be edited.
 * - New line (stock_id undefined): user picks a location + quantity to add stock there.
 */
type EditableLine = {
  key: string
  location_id: string
  qtyStr: string
  base: number
  stock_id?: string
  status?: StockStatus
}

export default function ScanPage() {
  const [mode, setMode] = React.useState<"camera" | "manual">("camera")
  const [manualSku, setManualSku] = React.useState("")
  const [manualLoading, setManualLoading] = React.useState(false)
  const [lookup, setLookup] = React.useState<LookupState>(null)

  const [locations, setLocations] = React.useState<LocationWithCabinet[]>([])

  const [drawer, setDrawer] = React.useState<DrawerData | null>(null)
  const [lines, setLines] = React.useState<EditableLine[]>([])
  const [saving, setSaving] = React.useState(false)
  const newSeq = React.useRef(0)

  React.useEffect(() => {
    supabase
      .from("locations")
      .select("*, cabinet:cabinets(*)")
      .order("code")
      .then((res) => {
        setLocations((res.data ?? []) as LocationWithCabinet[])
      })
  }, [])

  const blankLine = React.useCallback((): EditableLine => {
    newSeq.current += 1
    return { key: `new-${newSeq.current}`, location_id: "", qtyStr: "", base: 0 }
  }, [])

  const openDrawer = React.useCallback(
    (item: Item, stocks: StockLine[]) => {
      const initLines: EditableLine[] = stocks.map((s) => ({
        key: s.id,
        location_id: s.location_id,
        qtyStr: String(s.quantity),
        base: s.quantity,
        stock_id: s.id,
        status: s.status,
      }))
      // If the product has no stock anywhere yet, start with one empty row to add.
      setDrawer({ item, stocks })
      setLines(initLines.length ? initLines : [blankLine()])
      setSaving(false)
    },
    [blankLine]
  )

  const runLookup = React.useCallback(
    async (raw: string) => {
      const value = raw.trim().toUpperCase()
      if (!value) return
      setLookup({ status: "searching", raw: value })
      setManualSku(value)

      // One single round-trip query for maximum speed:
      // - `sku` is a UNIQUE column, so `.eq()` on the exact (uppercased) value hits
      //   the unique index instead of doing a case-insensitive scan (unlike ILIKE).
      // - The item and ALL its stock entries (with their locations) are returned
      //   together in a single request, avoiding a second sequential query.
      const { data, error } = await supabase
        .from("items")
        .select("*, stock_entries(*, location:locations(*, cabinet:cabinets(*)))")
        .eq("sku", value)
        .maybeSingle()

      if (error) {
        setLookup({ status: "error", raw: value, msg: error.message })
        return
      }
      if (!data) {
        setLookup({ status: "notfound", raw: value })
        return
      }

      // data carries the item fields plus the embedded `stock_entries` relation.
      const found = data as unknown as Item & { stock_entries: StockLine[] }
      setLookup(null)
      openDrawer(found, (found.stock_entries ?? []) as StockLine[])
    },
    [openDrawer]
  )

  const handleManualSearch = async () => {
    if (!manualSku.trim() || manualLoading) return
    setManualLoading(true)
    await runLookup(manualSku)
    setManualLoading(false)
  }

  const updateLine = (key: string, patch: Partial<EditableLine>) => {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  }

  // Locations already assigned to some row (prevent duplicates when adding new ones).
  const usedLocations = React.useMemo(() => {
    const set = new Set<string>()
    lines.forEach((l) => {
      if (l.location_id) set.add(l.location_id)
    })
    return set
  }, [lines])

  const totalQty = React.useMemo(() => lines.reduce((acc, l) => acc + clampQty(l.qtyStr), 0), [lines])

  const dirty = React.useMemo(() => {
    if (!drawer) return false
    return lines.some((l) => {
      const qty = clampQty(l.qtyStr)
      if (l.stock_id) return qty !== l.base
      return !!l.location_id && qty > 0
    })
  }, [drawer, lines])

  const canSave = dirty && !saving

  const lineLabel = (line: EditableLine): string => {
    if (line.stock_id) {
      const s = drawer?.stocks.find((x) => x.id === line.stock_id)
      if (s) {
        const code = locCode(s.location)
        return s.location?.name ? `${code} · ${s.location.name}` : code
      }
    }
    const l = locations.find((x) => x.id === line.location_id)
    return l ? locLabel(l) : ""
  }

  const lineStatus = (line: EditableLine): StockStatus | undefined => {
    if (line.stock_id) {
      const s = drawer?.stocks.find((x) => x.id === line.stock_id)
      if (s) return s.status
    }
    return undefined
  }

  const saveAndRebuild = React.useCallback(
    async (itemId: string) => {
      const { data, error } = await supabase
        .from("stock_entries")
        .select("*, item:items(*), location:locations(*, cabinet:cabinets(*))")
        .eq("item_id", itemId)
      if (error) throw error
      const stocks = (data ?? []) as StockLine[]
      const rebuilt: EditableLine[] = stocks.map((s) => ({
        key: s.id,
        location_id: s.location_id,
        qtyStr: String(s.quantity),
        base: s.quantity,
        stock_id: s.id,
        status: s.status,
      }))
      setDrawer((prev) => (prev ? { ...prev, stocks } : prev))
      setLines(rebuilt.length ? rebuilt : [blankLine()])
    },
    [blankLine]
  )

  const handleSave = async () => {
    if (!drawer || saving) return
    setSaving(true)
    const name = drawer.item.name
    try {
      let updated = 0
      let added = 0
      for (const line of lines) {
        const qty = clampQty(line.qtyStr)
        if (line.stock_id) {
          const entry = drawer.stocks.find((s) => s.id === line.stock_id)
          if (!entry || qty === line.base) continue
          // Auto-adjust status only between tersedia/kosong to preserve loan states.
          const target: StockStatus =
            qty > 0 && entry.status === "kosong"
              ? "tersedia"
              : qty === 0 && entry.status === "tersedia"
                ? "kosong"
                : entry.status
          const statusPatch: Partial<Pick<StockEntry, "status">> =
            entry.status !== target ? { status: target } : {}
          const { error } = await supabase
            .from("stock_entries")
            .update({ quantity: qty, ...statusPatch })
            .eq("id", line.stock_id)
          if (error) throw error
          updated += 1
        } else if (line.location_id && qty > 0) {
          // Adding a brand-new location for this product must not collide with existing stock.
          if (drawer.stocks.some((s) => s.location_id === line.location_id)) continue
          const { error } = await supabase.from("stock_entries").insert({
            item_id: drawer.item.id,
            location_id: line.location_id,
            quantity: qty,
            status: "tersedia",
          })
          if (error) throw error
          added += 1
        }
      }

      await saveAndRebuild(drawer.item.id)
      setSaving(false)
      const parts: string[] = []
      if (updated > 0) parts.push(`${updated} lokasi diperbarui`)
      if (added > 0) parts.push(`${added} lokasi ditambahkan`)
      toast.success(`"${name}" disimpan (${parts.join(", ") || "tidak ada perubahan"}).`)
    } catch (err) {
      setSaving(false)
      toast.error("Gagal menyimpan: " + (err as Error).message)
    }
  }

  const totalStockSaved = React.useMemo(
    () => (drawer ? drawer.stocks.reduce((a, s) => a + (s.quantity || 0), 0) : 0),
    [drawer]
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <ScanLine className="size-6 text-primary" />
          Scan Barcode
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Arahkan ke QR/barcode berisi SKU, atau ketik SKU manual. Jika terdaftar, drawer terbuka untuk mengoreksi
          stok di tiap lokasi (barang yang sama bisa ada di beberapa lokasi).
        </p>
      </div>

      {/* Mode toggle */}
      <div className="flex w-fit items-center gap-1 rounded-lg border p-1">
        <button
          type="button"
          onClick={() => setMode("camera")}
          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            mode === "camera" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
          }`}
        >
          <Camera className="size-4" /> Kamera
        </button>
        <button
          type="button"
          onClick={() => setMode("manual")}
          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            mode === "manual" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
          }`}
        >
          <Keyboard className="size-4" /> Manual SKU
        </button>
      </div>

      {/* Scanner panel */}
      <div className="rounded-xl border p-4 space-y-4">
        {mode === "camera" ? (
          <CameraScanner onDecode={(text) => void runLookup(text)} disabled={!!drawer} />
        ) : (
          <div className="max-w-sm space-y-2 mx-auto w-full">
            <Label htmlFor="manual-sku">Ketik / tempel SKU</Label>
            <div className="flex gap-2">
              <Input
                id="manual-sku"
                placeholder="Contoh: SKU-0001"
                value={manualSku}
                onChange={(e) => setManualSku(e.target.value.toUpperCase())}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleManualSearch()
                }}
                className="font-mono uppercase"
              />
              <Button onClick={() => void handleManualSearch()} disabled={manualLoading || !manualSku.trim()}>
                {manualLoading ? <Loader2 className="size-4 animate-spin" /> : <QrCode className="size-4" />}
                Cari
              </Button>
            </div>
          </div>
        )}

        {/* Lookup status */}
        {lookup?.status === "searching" && (
          <div className="flex items-center gap-2 justify-center text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Mencari SKU{" "}
            <span className="font-mono font-medium text-foreground">{lookup.raw}</span> ...
          </div>
        )}
        {lookup?.status === "notfound" && (
          <div className="flex flex-col items-center gap-2 text-center">
            <div className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-2.5 text-sm">
              <AlertTriangle className="size-4 text-destructive" />
              <span>
                SKU <span className="font-mono font-semibold">{lookup.raw}</span>{" "}
                <span className="font-semibold text-destructive">tidak terdaftar</span> di database.
              </span>
            </div>
            {mode === "camera" && (
              <p className="text-xs text-muted-foreground">Gunakan tombol "Mulai Kamera" untuk memindai lagi.</p>
            )}
          </div>
        )}
        {lookup?.status === "error" && (
          <div className="flex items-center gap-2 justify-center rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-2.5 text-sm text-destructive">
            <AlertTriangle className="size-4" /> Terjadi kesalahan: {lookup.msg}
          </div>
        )}
      </div>

      {/* Drawer for matched item */}
      <Sheet open={!!drawer} onOpenChange={(open) => !open && setDrawer(null)}>
        <SheetContent side="right" className="sm:max-w-md w-full overflow-y-auto">
          {drawer && (
            <>
              <SheetHeader className="pb-2">
                <SheetTitle className="flex items-center gap-2 text-lg">
                  <Package className="size-5 text-primary" />
                  {drawer.item.name}
                </SheetTitle>
                <SheetDescription className="flex flex-wrap items-center gap-2 pt-1">
                  <Badge variant="outline" className="font-mono">{drawer.item.sku}</Badge>
                  <Badge variant="secondary">{ITEM_TYPE_LABELS[drawer.item.item_type]}</Badge>
                  <Badge variant="secondary">Satuan: {drawer.item.unit}</Badge>
                </SheetDescription>
              </SheetHeader>

              <Separator className="my-3" />

              <div className="mb-3 flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-sm font-medium">
                  <Layers className="size-4 text-primary" />
                  Stok per lokasi ({drawer.stocks.length} lokasi)
                </span>
                <span className="text-sm text-muted-foreground">
                  Total tersimpan: {totalStockSaved} {drawer.item.unit}
                </span>
              </div>

              {/* Editable per-location rows */}
              <div className="space-y-2">
                {lines.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    Barang ini belum memiliki stok. Tekan "Tambah Lokasi" lalu pilih lokasi & jumlah.
                  </p>
                )}
                {lines.map((line) => {
                  const isNew = !line.stock_id
                  const status = lineStatus(line)
                  const availableLocs = locations.filter(
                    (l) => !usedLocations.has(l.id) || l.id === line.location_id
                  )
                  return (
                    <div
                      key={line.key}
                      className={`flex items-center gap-2 rounded-lg border p-2 ${isNew ? "border-dashed" : ""}`}
                    >
                      {isNew ? (
                        <Select
                          value={line.location_id || undefined}
                          onValueChange={(v) => updateLine(line.key, { location_id: v })}
                        >
                          <SelectTrigger className="flex-1 min-w-0 h-9">
                            <SelectValue placeholder="Pilih lokasi" />
                          </SelectTrigger>
                          <SelectContent>
                            {availableLocs.map((l) => (
                              <SelectItem key={l.id} value={l.id}>
                                {locLabel(l)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <div className="flex items-center gap-1.5 flex-1 min-w-0">
                          <MapPin className="size-3.5 shrink-0 text-muted-foreground" />
                          <span className="text-sm font-medium truncate">{lineLabel(line)}</span>
                          {status && <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[status]}`} />}
                        </div>
                      )}

                      <Input
                        type="number"
                        min={0}
                        inputMode="numeric"
                        value={line.qtyStr}
                        onChange={(e) => updateLine(line.key, { qtyStr: e.target.value })}
                        placeholder="0"
                        className="w-20 h-9 text-right"
                      />

                      {isNew && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-9 shrink-0 text-muted-foreground"
                          onClick={() => setLines((prev) => prev.filter((l) => l.key !== line.key))}
                          aria-label="Hapus baris"
                        >
                          <X className="size-4" />
                        </Button>
                      )}
                    </div>
                  )
                })}
              </div>

              <Button
                variant="outline"
                size="sm"
                className="mt-3 w-full"
                onClick={() => setLines((prev) => [...prev, blankLine()])}
                disabled={saving}
              >
                <Plus className="size-4" /> Tambah Lokasi
              </Button>

              <p className="text-xs text-muted-foreground mt-2">
                Jumlah yang sedang diketik: {totalQty} {drawer.item.unit}. Set jumlah ke 0 untuk menandai kosong pada
                lokasi tersebut.
              </p>

              <div className="mt-5 flex flex-col gap-2">
                {canSave && (
                  <Button onClick={() => void handleSave()} disabled={!canSave} size="lg">
                    {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                    Simpan Perubahan
                  </Button>
                )}
                <Button variant="outline" onClick={() => setDrawer(null)} disabled={saving}>
                  Tutup
                </Button>
                {!canSave && !saving && (
                  <p className="text-center text-xs text-muted-foreground">
                    <CheckCircle2 className="size-3.5 inline mr-1 -mt-0.5 text-green-600" />
                    Tidak ada perubahan — tombol simpan muncul jika data diubah.
                  </p>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
