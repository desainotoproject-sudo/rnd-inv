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
  CheckCircle2,
  AlertTriangle,
  Save,
  X,
  Plus,
  Minus,
  RotateCw,
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
  /** When true the camera runs and scans automatically (camera mode & drawer closed). */
  active: boolean
}

function cameraErrorMessage(err: unknown): string {
  const e = err as { name?: string; message?: string } | null
  switch (e?.name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
      return 'Izin kamera ditolak. Di iPhone buka: Settings \u2192 Safari \u2192 Camera \u2192 Allow (atau Settings \u2192 [nama situs] \u2192 Camera), lalu ketuk "Aktifkan Kamera".'
    case "NotFoundError":
    case "DevicesNotFoundError":
      return "Kamera tidak ditemukan di perangkat ini."
    case "NotReadableError":
    case "TrackStartError":
      return 'Kamera gagal diakses (mungkin dipakai app lain, atau Anda di mode Private/incognito). Tutup app lain lalu ketuk "Coba Lagi".'
    case "OverconstrainedError":
      return "Kamera tidak mendukung pengaturan yang diminta."
    default:
      return e?.message || "Tidak dapat mengakses kamera."
  }
}

function detectInAppBrowser(): boolean {
  const ua = navigator.userAgent || ""
  return /FBAN|FBAV|Instagram|Line\/|WhatsApp|Twitter|MicroMessenger/i.test(ua)
}

function diagText(err: unknown): string {
  const e = err as { name?: string; message?: string } | null
  return `error=${e?.name ?? "?"} | secure=${window.isSecureContext} | ${location.protocol} | mediaDevices=${!!navigator.mediaDevices} | inApp=${detectInAppBrowser()}`
}

function CameraScanner({ onDecode, active }: ScannerProps) {
  const scannerRef = React.useRef<Html5Qrcode | null>(null)
  const [state, setState] = React.useState<"idle" | "starting" | "scanning" | "error">("idle")
  const [error, setError] = React.useState<string | null>(null)
  const [diag, setDiag] = React.useState("")
  const decodeLockRef = React.useRef(false)
  const lockTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  // Bumped on every start/stop so an in-flight start can detect it was superseded.
  const genRef = React.useRef(0)
  // iOS/Safari needs a user gesture (tap) before the camera permission prompt.
  // First activation is manual; afterwards restarts happen automatically.
  const startedOnceRef = React.useRef(false)
  // Keep the latest callback without re-triggering the camera start/stop effect.
  const onDecodeRef = React.useRef(onDecode)
  React.useEffect(() => {
    onDecodeRef.current = onDecode
  }, [onDecode])

  const stopCamera = React.useCallback(async () => {
    genRef.current += 1 // invalidate any start that is still in flight
    if (lockTimerRef.current) {
      clearTimeout(lockTimerRef.current)
      lockTimerRef.current = null
    }
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

  const startCamera = React.useCallback(async () => {
    if (scannerRef.current) return

    // getUserMedia only works in a secure context (HTTPS or localhost).
    if (!window.isSecureContext) {
      setState("error")
      setError(
        "Kamera hanya bisa diakses lewat koneksi aman. Buka aplikasi via https:// atau http://localhost (bukan alamat IP/LAN biasa)."
      )
      return
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setState("error")
      setError("Browser ini tidak mendukung akses kamera (getUserMedia).")
      return
    }

    const gen = ++genRef.current
    setState("starting")
    setError(null)
    decodeLockRef.current = false

    // Try several constraint sets from best quality down to the safest, because
    // iOS Safari (and some Android browsers) reject overly specific constraints.
    const attempts: MediaTrackConstraints[] = [
      { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
      { facingMode: { ideal: "environment" } },
      {},
    ]

    const scanConfig = {
      fps: 15,
      // Scan almost the whole viewfinder so a small code anywhere still decodes.
      qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
        const min = Math.min(viewfinderWidth, viewfinderHeight)
        const size = Math.max(160, Math.floor(min * 0.9))
        return { width: size, height: size }
      },
      disableFlip: false,
    }

    const onSuccess = (decodedText: string) => {
      if (decodeLockRef.current) return
      decodeLockRef.current = true
      // Auto-unlock shortly so scanning continues if no drawer opens (e.g. SKU not found).
      if (lockTimerRef.current) clearTimeout(lockTimerRef.current)
      lockTimerRef.current = setTimeout(() => {
        decodeLockRef.current = false
        lockTimerRef.current = null
      }, 2000)
      onDecodeRef.current(decodedText)
    }

    let lastErr: unknown = null
    for (const constraints of attempts) {
      if (genRef.current !== gen) return
      let s: Html5Qrcode | null = null
      try {
        // `useBarCodeDetectorIfSupported` uses the native BarcodeDetector when
        // available (ignored safely on iOS, which lacks it).
        s = new Html5Qrcode("scan-region", {
          verbose: false,
          useBarCodeDetectorIfSupported: true,
        })
        scannerRef.current = s
        await s.start(constraints, scanConfig, onSuccess, () => {
          /* per-frame decode errors ignored */
        })
        // If superseded while starting (e.g. StrictMode remount), tear down.
        if (genRef.current !== gen || scannerRef.current !== s) {
          try {
            if (s.isScanning) await s.stop()
            s.clear()
          } catch {
            /* ignore */
          }
          return
        }
        startedOnceRef.current = true
        setDiag("")
        setState("scanning")
        return
      } catch (err) {
        lastErr = err
        try {
          if (s?.isScanning) await s!.stop()
          s?.clear()
        } catch {
          /* ignore cleanup of a failed attempt */
        }
        if (scannerRef.current === s) scannerRef.current = null
        if (genRef.current !== gen) return // superseded — ignore
        // Short pause before trying the next constraint set.
        await new Promise((resolve) => setTimeout(resolve, 150))
      }
    }

    if (genRef.current !== gen) return
    setState("error")
    setError(cameraErrorMessage(lastErr))
    setDiag(diagText(lastErr))
  }, [])

  const handleStartClick = React.useCallback(async () => {
    setError(null)
    setDiag("")
    if (detectInAppBrowser()) {
      setState("error")
      setError(
        'Kamera tidak bisa dibuka dari browser dalam aplikasi. Buka link ini di Safari/Chrome dulu (menu \u22ef \u2192 "Open in Safari").'
      )
      return
    }
    if (!window.isSecureContext) {
      setState("error")
      setError(
        "Kamera hanya bisa diakses lewat koneksi aman. Buka aplikasi via https:// atau http://localhost (bukan alamat IP/LAN biasa)."
      )
      return
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setState("error")
      setError("Browser ini tidak mendukung akses kamera (getUserMedia).")
      return
    }
    // Ask for the camera directly inside the user gesture. This is what makes the
    // iOS Safari permission prompt appear and keeps permission for later starts.
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
      })
      stream.getTracks().forEach((track) => track.stop())
    } catch (err) {
      setState("error")
      setError(cameraErrorMessage(err))
      setDiag(diagText(err))
      return
    }
    await startCamera()
  }, [startCamera])

  // The camera starts on its own (shortly delayed so React StrictMode's
  // double-mount can't fire two overlapping start() calls) and restarts after
  // every save. A short delay is also harmless for the browser's permission prompt.
  React.useEffect(() => {
    if (!active) {
      void stopCamera().then(() => setState("idle"))
      return
    }
    // First activation requires a tap (iOS/Safari only shows the camera
    // permission prompt after a user gesture). Afterwards it auto-restarts.
    if (!startedOnceRef.current) {
      setState("idle")
      return
    }
    decodeLockRef.current = false
    const timer = setTimeout(() => {
      void startCamera()
    }, 200)
    return () => {
      clearTimeout(timer)
      void stopCamera()
    }
  }, [active, startCamera, stopCamera])

  return (
    <div className="space-y-3">
      <div className="relative mx-auto w-full max-w-sm overflow-hidden rounded-xl border bg-muted/30 min-h-75">
        <div id="scan-region" className="w-full min-h-75" />
        {state === "idle" && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground">
            <Camera className="size-8" />
            <p className="text-sm text-center px-6">
              Ketuk "Aktifkan Kamera" lalu arahkan ke QR/barcode SKU.
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
            {diag && <p className="text-[10px] leading-tight text-muted-foreground/70 wrap-break-word">{diag}</p>}
          </div>
        )}
        {state === "scanning" && (
          <div className="pointer-events-none absolute inset-0 rounded-xl ring-2 ring-primary/60" />
        )}
      </div>

      {state !== "scanning" && state !== "starting" && (
        <Button variant="outline" className="w-full max-w-sm mx-auto flex" onClick={() => void handleStartClick()}>
          {state === "error" ? <RotateCw className="size-4" /> : <Camera className="size-4" />}
          {state === "error" ? "Coba Lagi" : "Aktifkan Kamera"}
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
  const [addQty, setAddQty] = React.useState("1")
  const [addLoc, setAddLoc] = React.useState("")
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
      setAddLoc(stocks[0]?.location_id ?? "")
      setAddQty("1")
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

  const dirty = React.useMemo(() => {
    if (!drawer) return false
    return lines.some((l) => {
      const qty = clampQty(l.qtyStr)
      if (l.stock_id) {
        const entry = drawer.stocks.find((s) => s.id === l.stock_id)
        const locationChanged = !!entry && l.location_id !== entry.location_id
        return locationChanged || qty !== l.base
      }
      return !!l.location_id && qty > 0
    })
  }, [drawer, lines])

  const canSave = dirty && !saving

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
    const itemId = drawer.item.id
    const currentRows = drawer.stocks
    try {
      // Final desired state: one stock line per chosen location for this item.
      const desired = new Map<string, number>()
      for (const line of lines) {
        if (!line.location_id) continue
        const qty = clampQty(line.qtyStr)
        // Never create an empty row for a brand-new line; keep existing rows (incl. qty 0 = kosong).
        if (!line.stock_id && qty === 0) continue
        desired.set(line.location_id, qty)
      }

      let moved = 0
      let updated = 0
      let added = 0

      // 1) Remove any existing row whose location is no longer targeted,
      //    i.e. that stock was moved to another location (old location is freed).
      for (const row of currentRows) {
        if (!desired.has(row.location_id)) {
          const { error } = await supabase.from("stock_entries").delete().eq("id", row.id)
          if (error) throw error
          moved += 1
        }
      }

      // 2) Upsert each targeted location (update if present, otherwise insert).
      for (const [locId, qty] of desired) {
        const row = currentRows.find((r) => r.location_id === locId)
        if (row) {
          if (row.quantity === qty) continue // unchanged
          // Auto-adjust status only between tersedia/kosong to preserve loan states.
          const target: StockStatus =
            qty > 0 && row.status === "kosong"
              ? "tersedia"
              : qty === 0 && row.status === "tersedia"
                ? "kosong"
                : row.status
          const statusPatch: Partial<Pick<StockEntry, "status">> = row.status !== target ? { status: target } : {}
          const { error } = await supabase
            .from("stock_entries")
            .update({ quantity: qty, ...statusPatch })
            .eq("id", row.id)
          if (error) throw error
          updated += 1
        } else {
          const { error } = await supabase.from("stock_entries").insert({
            item_id: itemId,
            location_id: locId,
            quantity: qty,
            status: qty > 0 ? "tersedia" : "kosong",
          })
          if (error) throw error
          added += 1
        }
      }

      await saveAndRebuild(itemId)
      setSaving(false)
      // Intentionally no success toast — saving should be fast and quiet.
    } catch (err) {
      setSaving(false)
      toast.error("Gagal menyimpan: " + (err as Error).message)
    }
  }

  const handleQuickAdd = async () => {
    if (!drawer || saving || !addLoc) return
    const amount = Math.max(1, Number.parseInt(addQty, 10) || 1)
    setSaving(true)
    const existing = drawer.stocks.find((s) => s.location_id === addLoc)
    try {
      if (existing) {
        const newQty = existing.quantity + amount
        const target: StockStatus = existing.status === "kosong" ? "tersedia" : existing.status
        const statusPatch: Partial<Pick<StockEntry, "status">> =
          existing.status !== target ? { status: target } : {}
        const { error } = await supabase
          .from("stock_entries")
          .update({ quantity: newQty, ...statusPatch })
          .eq("id", existing.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from("stock_entries").insert({
          item_id: drawer.item.id,
          location_id: addLoc,
          quantity: amount,
          status: "tersedia",
        })
        if (error) throw error
      }
      setSaving(false)
      // Close the drawer -> the scanner restarts automatically for the next scan.
      setDrawer(null)
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
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight flex items-center gap-2">
          <ScanLine className="size-5 sm:size-6 text-primary" />
          Scan Barcode
        </h1>
        <p className="hidden sm:block text-sm text-muted-foreground mt-1">
          Arahkan ke QR/barcode berisi SKU atau ketik manual, lalu koreksi stok di tiap lokasi.
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
          <Camera className="size-4" />
          <span className="hidden sm:inline">Kamera</span>
        </button>
        <button
          type="button"
          onClick={() => setMode("manual")}
          className={`flex items-center gap-1.5 rounded-md px-2.5 sm:px-3 py-1.5 text-sm font-medium transition-colors ${
            mode === "manual" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
          }`}
        >
          <Keyboard className="size-4" />
          <span className="hidden sm:inline">Manual SKU</span>
        </button>
      </div>

      {/* Scanner panel */}
      <div className="rounded-xl border p-4 space-y-4">
        {mode === "camera" ? (
          <CameraScanner onDecode={(text) => void runLookup(text)} active={!drawer} />
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
        <SheetContent side="right" className="w-full p-0 sm:max-w-md">
          {drawer && (
            <div className="flex h-full flex-col">
              <SheetHeader className="px-5 pt-5 pb-2">
                <SheetTitle className="text-lg leading-snug pr-6">
                  <span className="flex items-start gap-2">
                    <Package className="size-5 shrink-0 mt-0.5 text-primary" />
                    <span className="wrap-break-word">{drawer.item.name}</span>
                  </span>
                </SheetTitle>
                <SheetDescription className="flex flex-wrap items-center gap-1.5 pt-1.5">
                  <Badge variant="outline" className="font-mono">{drawer.item.sku}</Badge>
                  <Badge variant="secondary">{ITEM_TYPE_LABELS[drawer.item.item_type]}</Badge>
                  <span className="text-xs text-muted-foreground">Satuan: {drawer.item.unit}</span>
                </SheetDescription>
              </SheetHeader>

              {/* Scrollable body */}
              <div className="flex-1 space-y-4 overflow-y-auto px-5 py-3">
                <Separator />

                {/* Quick add: scan -> tambah jumlah & simpan -> lanjut scan */}
                <div className="space-y-3 rounded-xl border bg-muted/30 p-3">
                  <div className="flex items-center gap-2">
                    <Select value={addLoc || undefined} onValueChange={setAddLoc}>
                      <SelectTrigger className="h-10 min-w-0 flex-1 bg-background">
                        <SelectValue placeholder="Pilih lokasi" />
                      </SelectTrigger>
                      <SelectContent>
                        {locations.map((l) => (
                          <SelectItem key={l.id} value={l.id}>
                            {locLabel(l)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <div className="flex shrink-0 items-center rounded-lg border bg-background">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-10 rounded-r-none"
                        onClick={() => setAddQty(String(Math.max(1, (Number.parseInt(addQty, 10) || 1) - 1)))}
                        aria-label="Kurangi"
                      >
                        <Minus className="size-4" />
                      </Button>
                      <Input
                        type="number"
                        min={1}
                        inputMode="numeric"
                        value={addQty}
                        onChange={(e) => setAddQty(e.target.value)}
                        aria-label="Jumlah tambah"
                        className="h-10 w-14 rounded-none border-x text-center"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-10 rounded-l-none"
                        onClick={() => setAddQty(String((Number.parseInt(addQty, 10) || 0) + 1))}
                        aria-label="Tambah"
                      >
                        <Plus className="size-4" />
                      </Button>
                    </div>
                  </div>

                  <Button
                    className="w-full"
                    onClick={() => void handleQuickAdd()}
                    disabled={saving || !addLoc}
                  >
                    <Plus className="size-4" /> Tambah Jumlah & Simpan
                  </Button>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-sm font-medium">
                    <Layers className="size-4 text-primary" />
                    <span className="hidden sm:inline">Stok per lokasi</span>
                    <span className="sm:hidden">Lokasi</span>
                    <span className="font-normal text-muted-foreground">({drawer.stocks.length})</span>
                  </span>
                  <span className="text-xs sm:text-sm text-muted-foreground whitespace-nowrap">
                    Total: {totalStockSaved} {drawer.item.unit}
                  </span>
                </div>

                {lines.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    Barang ini belum memiliki stok. Tekan "Tambah Lokasi".
                  </p>
                )}

                <div className="space-y-2.5">
                  {lines.map((line) => {
                    const isNew = !line.stock_id
                    const availableLocs = locations.filter(
                      (l) => !usedLocations.has(l.id) || l.id === line.location_id
                    )
                    return (
                      <div
                        key={line.key}
                        className={`flex items-center gap-1.5 rounded-xl border py-1 pr-1 pl-2 ${
                          isNew ? "border-dashed bg-muted/30" : ""
                        }`}
                      >
                        <Select
                          value={line.location_id || undefined}
                          onValueChange={(v) => updateLine(line.key, { location_id: v })}
                        >
                          <SelectTrigger className="h-10 min-w-0 flex-1 border-transparent bg-transparent px-1.5 hover:border-input data-placeholder:text-muted-foreground">
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

                        <div className="flex shrink-0 items-center gap-1">
                          <Input
                            type="number"
                            min={0}
                            inputMode="numeric"
                            value={line.qtyStr}
                            onChange={(e) => updateLine(line.key, { qtyStr: e.target.value })}
                            placeholder="0"
                            aria-label="Jumlah"
                            className="h-10 w-20 text-right"
                          />
                          {isNew && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-10 shrink-0 text-muted-foreground"
                              onClick={() => setLines((prev) => prev.filter((l) => l.key !== line.key))}
                              aria-label="Hapus baris"
                            >
                              <X className="size-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => setLines((prev) => [...prev, blankLine()])}
                  disabled={saving}
                >
                  <Plus className="size-4" /> Tambah Lokasi
                </Button>
              </div>

              {/* Pinned footer */}
              <div className="border-t px-5 py-4">
                <div className="flex flex-col gap-2">
                  {canSave && (
                    <Button onClick={() => void handleSave()} disabled={!canSave} size="lg" className="w-full">
                      {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                      Simpan Perubahan
                    </Button>
                  )}
                  <Button variant="outline" onClick={() => setDrawer(null)} disabled={saving} className="w-full">
                    Tutup
                  </Button>
                  {!canSave && !saving && (
                    <p className="hidden sm:block text-center text-xs text-muted-foreground">
                      <CheckCircle2 className="size-3.5 inline mr-1 -mt-0.5 text-green-600" />
                      Tidak ada perubahan — tombol simpan muncul jika data diubah.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
