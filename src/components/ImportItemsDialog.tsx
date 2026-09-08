import * as React from "react"
import * as XLSX from "xlsx"
import { Upload, Download, FileSpreadsheet, CheckCircle2, AlertCircle, Loader2 } from "lucide-react"
import { supabase } from "@/lib/supabase"
import type { ItemType, StockStatus, Location, Cabinet } from "@/lib/database.types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { toast } from "sonner"

type LocationWithCabinet = Location & { cabinet: Cabinet }

interface ParsedRow {
  rowIndex: number
  name: string
  sku: string
  unit: string
  item_type: ItemType
  description: string
  location_code: string
  quantity: number
  status: StockStatus
  errors: string[]
}

const ITEM_TYPES: { value: ItemType; label: string }[] = [
  { value: "isi", label: "isi" },
  { value: "kosong_box", label: "kosong_box" },
]

const STATUSES: { value: StockStatus; label: string }[] = [
  { value: "tersedia", label: "tersedia" },
  { value: "kosong", label: "kosong" },
  { value: "dipinjam", label: "dipinjam" },
  { value: "menunggu_approval", label: "menunggu_approval" },
]

const TEMPLATE_HEADERS = [
  "Nama Barang*",
  "SKU (opsional)",
  "Satuan*",
  "Jenis* (isi / kosong_box)",
  "Deskripsi (opsional)",
  "Kode Lokasi* (cth: A1)",
  "Jumlah*",
  "Status* (tersedia / kosong / dipinjam / menunggu_approval)",
]

const SAMPLE_ROWS = [
  ["Steering Wheel Cover", "SWC-001", "pcs", "isi", "Cover jok setir", "A1", 10, "tersedia"],
  ["Box Kardus Besar", "", "box", "kosong_box", "", "B2", 5, "tersedia"],
  ["Sample Kit RND", "SK-100", "set", "isi", "Kit sample lengkap", "C1", 0, "kosong"],
]

function downloadTemplate() {
  const ws = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS, ...SAMPLE_ROWS])
  ws["!cols"] = [
    { wch: 24 }, { wch: 16 }, { wch: 10 }, { wch: 22 },
    { wch: 24 }, { wch: 18 }, { wch: 10 }, { wch: 40 },
  ]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "Template Import Barang")
  XLSX.writeFile(wb, "template_import_barang.xlsx")
}

function parseSheet(file: File, locations: LocationWithCabinet[]): Promise<ParsedRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer)
        const wb = XLSX.read(data, { type: "array" })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as unknown[][]
        // Skip header row
        const dataRows = rows.slice(1)
        const locationMap = new Map<string, LocationWithCabinet>()
        for (const loc of locations) {
          const code = `${loc.cabinet?.code ?? ""}${loc.code}`.toUpperCase()
          locationMap.set(code, loc)
        }
        const parsed: ParsedRow[] = dataRows.map((raw, idx) => {
          const cells = (raw as unknown[]).map((c) => String(c ?? "").trim())
          const name = cells[0] ?? ""
          const sku = cells[1] ?? ""
          const unit = cells[2] ?? ""
          const itemTypeRaw = (cells[3] ?? "").toLowerCase()
          const description = cells[4] ?? ""
          const locationCode = (cells[5] ?? "").toUpperCase()
          const qtyRaw = cells[6] ?? "0"
          const statusRaw = (cells[7] ?? "").toLowerCase()

          const errors: string[] = []
          if (!name) errors.push("Nama kosong")
          if (!unit) errors.push("Satuan kosong")
          const itemType = ITEM_TYPES.find((t) => t.label === itemTypeRaw)?.value
          if (!itemType) errors.push(`Jenis tidak valid: "${itemTypeRaw}"`)
          const location = locationMap.get(locationCode)
          if (!location) errors.push(`Lokasi tidak ditemukan: "${locationCode}"`)
          const quantity = parseInt(qtyRaw, 10)
          if (isNaN(quantity) || quantity < 0) errors.push(`Jumlah tidak valid: "${qtyRaw}"`)
          const status = STATUSES.find((s) => s.label === statusRaw)?.value
          if (!status) errors.push(`Status tidak valid: "${statusRaw}"`)

          return {
            rowIndex: idx + 2,
            name,
            sku: sku.toUpperCase(),
            unit,
            item_type: itemType ?? "isi",
            description,
            location_code: locationCode,
            quantity: isNaN(quantity) ? 0 : quantity,
            status: status ?? "tersedia",
            errors,
          }
        }).filter((r) => r.name || r.sku || r.unit || r.location_code)

        resolve(parsed)
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = reject
    reader.readAsArrayBuffer(file)
  })
}

interface ImportItemsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  locations: LocationWithCabinet[]
  onImported: () => void
}

export function ImportItemsDialog({ open, onOpenChange, locations, onImported }: ImportItemsDialogProps) {
  const [parsed, setParsed] = React.useState<ParsedRow[]>([])
  const [fileName, setFileName] = React.useState("")
  const [importing, setImporting] = React.useState(false)
  const [result, setResult] = React.useState<{ success: number; failed: number } | null>(null)
  const fileRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    if (!open) {
      setParsed([])
      setFileName("")
      setImporting(false)
      setResult(null)
    }
  }, [open])

  const handleFile = async (file: File) => {
    setFileName(file.name)
    setResult(null)
    try {
      const rows = await parseSheet(file, locations)
      setParsed(rows)
      if (rows.length === 0) toast.info("Tidak ada baris data di file.")
    } catch {
      toast.error("Gagal membaca file. Pastikan format .xlsx valid.")
    }
  }

  const validRows = parsed.filter((r) => r.errors.length === 0)
  const invalidRows = parsed.filter((r) => r.errors.length > 0)

  const doImport = async () => {
    setImporting(true)
    let success = 0
    let failed = 0
    const locationMap = new Map<string, LocationWithCabinet>()
    for (const loc of locations) {
      locationMap.set(`${loc.cabinet?.code ?? ""}${loc.code}`.toUpperCase(), loc)
    }

    for (const row of validRows) {
      try {
        const itemPayload = {
          name: row.name,
          sku: row.sku || null,
          unit: row.unit,
          item_type: row.item_type,
          description: row.description || null,
        }
        const { data: newItem, error: itemError } = await supabase
          .from("items")
          .insert(itemPayload)
          .select()
          .single()

        if (itemError) {
          if (itemError.message.includes("unique")) {
            // Try to find existing item by SKU and skip stock insert
            if (row.sku) {
              const { data: existing } = await supabase
                .from("items")
                .select("id")
                .eq("sku", row.sku)
                .maybeSingle()
              if (existing) {
                failed++
                continue
              }
            }
          }
          failed++
          continue
        }

        const location = locationMap.get(row.location_code)
        const stockPayload = {
          item_id: newItem.id,
          location_id: location!.id,
          quantity: row.quantity,
          status: row.status,
          notes: null,
        }
        const { error: stockError } = await supabase.from("stock_entries").insert(stockPayload)
        if (stockError) {
          if (stockError.message.includes("unique")) {
            // Item already has stock at this location — update quantity instead
            const { error: updateErr } = await supabase
              .from("stock_entries")
              .update({ quantity: row.quantity, status: row.status })
              .eq("item_id", newItem.id)
              .eq("location_id", location!.id)
            if (updateErr) failed++
            else success++
          } else {
            failed++
          }
        } else {
          success++
        }
      } catch {
        failed++
      }
    }

    setResult({ success, failed })
    setImporting(false)
    if (success > 0) {
      toast.success(`${success} barang berhasil diimpor.`)
      onImported()
    }
    if (failed > 0) {
      toast.error(`${failed} baris gagal diimpor.`)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import Data Barang via Excel</DialogTitle>
          <DialogDescription>
            Unduh template, isi data barang, lalu unggah file .xlsx untuk menambahkan banyak barang sekaligus.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Step 1: Download template */}
          <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="size-4 text-primary" />
              <p className="text-sm font-medium">Langkah 1 — Unduh Template</p>
            </div>
            <p className="text-xs text-muted-foreground">
              Template berisi kolom: Nama, SKU (opsional), Satuan, Jenis, Deskripsi (opsional), Kode Lokasi, Jumlah, Status.
              Kode lokasi adalah gabungan kode lemari + kode sub-lokasi (cth: <code>A1</code>, <code>B2</code>).
            </p>
            <Button variant="outline" size="sm" onClick={downloadTemplate}>
              <Download className="size-4" />
              Unduh Template .xlsx
            </Button>
          </div>

          {/* Step 2: Upload */}
          <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
            <div className="flex items-center gap-2">
              <Upload className="size-4 text-primary" />
              <p className="text-sm font-medium">Langkah 2 — Unggah File Excel</p>
            </div>
            <Input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) handleFile(file)
              }}
              className="cursor-pointer"
            />
            {fileName && (
              <p className="text-xs text-muted-foreground">
                File: <span className="font-medium text-foreground">{fileName}</span>
              </p>
            )}
          </div>

          {/* Step 3: Preview */}
          {parsed.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Langkah 3 — Pratinjau Data</p>
                <div className="flex items-center gap-2">
                  <Badge className="bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400">
                    <CheckCircle2 className="size-3 mr-1" />
                    {validRows.length} Valid
                  </Badge>
                  {invalidRows.length > 0 && (
                    <Badge className="bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400">
                      <AlertCircle className="size-3 mr-1" />
                      {invalidRows.length} Error
                    </Badge>
                  )}
                </div>
              </div>
              <div className="rounded-lg border max-h-64 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8">#</TableHead>
                      <TableHead>Nama</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead>Satuan</TableHead>
                      <TableHead>Jenis</TableHead>
                      <TableHead>Lokasi</TableHead>
                      <TableHead className="text-right">Jml</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Error</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsed.map((row) => (
                      <TableRow key={row.rowIndex} className={row.errors.length > 0 ? "bg-red-50 dark:bg-red-950/20" : ""}>
                        <TableCell className="text-xs text-muted-foreground">{row.rowIndex}</TableCell>
                        <TableCell className="text-sm font-medium">{row.name || "—"}</TableCell>
                        <TableCell className="text-xs font-mono">{row.sku || "—"}</TableCell>
                        <TableCell className="text-sm">{row.unit || "—"}</TableCell>
                        <TableCell className="text-xs">{row.item_type}</TableCell>
                        <TableCell className="text-xs font-mono">{row.location_code || "—"}</TableCell>
                        <TableCell className="text-sm text-right">{row.quantity}</TableCell>
                        <TableCell className="text-xs">{row.status}</TableCell>
                        <TableCell className="text-xs text-destructive">
                          {row.errors.join("; ") || "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {/* Result */}
          {result && (
            <div className="rounded-lg border p-4 space-y-1">
              <p className="text-sm font-medium">Hasil Import</p>
              <p className="text-sm text-green-600 dark:text-green-400">
                <CheckCircle2 className="size-4 inline mr-1" />
                {result.success} barang berhasil ditambahkan
              </p>
              {result.failed > 0 && (
                <p className="text-sm text-destructive">
                  <AlertCircle className="size-4 inline mr-1" />
                  {result.failed} baris gagal (SKU duplik atau error lain)
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Tutup</Button>
          <Button onClick={doImport} disabled={importing || validRows.length === 0}>
            {importing && <Loader2 className="size-4 animate-spin" />}
            Import {validRows.length > 0 ? `(${validRows.length})` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
