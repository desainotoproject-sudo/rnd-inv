import * as React from "react"
import { Search, BoxesIcon, Filter, Info } from "lucide-react"
import { supabase } from "@/lib/supabase"
import type { StockEntry, Item, Location, Cabinet, StockStatus } from "@/lib/database.types"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
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
import { Card, CardContent } from "@/components/ui/card"

const STATUS_CONFIG: Record<StockStatus, { label: string; class: string }> = {
  tersedia: { label: "Tersedia", class: "bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800" },
  kosong: { label: "Kosong", class: "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800" },
  dipinjam: { label: "Dipinjam", class: "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800" },
  menunggu_approval: { label: "Menunggu Approval", class: "bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-800" },
}

type StockWithRelations = StockEntry & {
  item: Item
  location: Location & { cabinet: Cabinet }
}

export default function InventoryPage() {
  const [stocks, setStocks] = React.useState<StockWithRelations[]>([])
  const [loading, setLoading] = React.useState(true)
  const [search, setSearch] = React.useState("")
  const [filterStatus, setFilterStatus] = React.useState<StockStatus | "all">("all")
  const [filterType, setFilterType] = React.useState<"isi" | "kosong_box" | "all">("all")

  React.useEffect(() => {
    supabase
      .from("stock_entries")
      .select(`*, item:items(*), location:locations(*, cabinet:cabinets(*))`)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setStocks((data ?? []) as StockWithRelations[])
        setLoading(false)
      })
  }, [])

  const filtered = React.useMemo(() => {
    const q = search.toLowerCase()
    return stocks.filter((s) => {
      const matchSearch =
        s.item?.name.toLowerCase().includes(q) ||
        (s.item?.sku ?? "").toLowerCase().includes(q) ||
        (s.item?.category ?? "").toLowerCase().includes(q) ||
        s.location?.code.toLowerCase().includes(q) ||
        s.location?.cabinet?.code.toLowerCase().includes(q)
      const matchStatus = filterStatus === "all" || s.status === filterStatus
      const matchType = filterType === "all" || s.item?.item_type === filterType
      return matchSearch && matchStatus && matchType
    })
  }, [stocks, search, filterStatus, filterType])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Daftar Inventaris</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Lihat ketersediaan barang di ruang RND secara real-time.
        </p>
      </div>

      {/* Info card */}
      <Card className="border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/20">
        <CardContent className="py-3 flex items-start gap-3">
          <Info className="size-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
          <p className="text-sm text-blue-700 dark:text-blue-300">
            Data ini hanya untuk dilihat. Untuk meminjam atau menitipkan barang, hubungi tim RND secara langsung.
            Fitur pengajuan digital akan tersedia di pembaruan berikutnya.
          </p>
        </CardContent>
      </Card>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative min-w-60 flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Cari nama barang, SKU, kategori..."
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
        <Select value={filterType} onValueChange={(v) => setFilterType(v as "isi" | "kosong_box" | "all")}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Jenis" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua Jenis</SelectItem>
            <SelectItem value="isi">Barang Isi</SelectItem>
            <SelectItem value="kosong_box">Kosong / Box</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-lg border bg-card">
        {loading ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-md" />)}
          </div>
        ) : filtered.length === 0 ? (
          <Empty className="border-none">
            <EmptyHeader>
              <EmptyMedia variant="icon"><BoxesIcon /></EmptyMedia>
              <EmptyTitle>Tidak ada data</EmptyTitle>
              <EmptyDescription>
                {search || filterStatus !== "all" || filterType !== "all"
                  ? "Tidak ada barang yang sesuai filter."
                  : "Belum ada barang yang dicatat di sistem."}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nama Barang</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Kategori</TableHead>
                <TableHead>Lokasi</TableHead>
                <TableHead>Jenis</TableHead>
                <TableHead>Jumlah</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((stock) => (
                <TableRow key={stock.id}>
                  <TableCell>
                    <p className="font-medium text-sm text-foreground">{stock.item?.name}</p>
                    {stock.item?.description && (
                      <p className="text-xs text-muted-foreground truncate max-w-40">{stock.item.description}</p>
                    )}
                  </TableCell>
                  <TableCell>
                    <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">{stock.item?.sku}</code>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{stock.item?.category || "—"}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <Badge variant="outline" className="font-mono text-xs px-1.5 py-0">
                        {stock.location?.cabinet?.code}
                      </Badge>
                      <span className="text-sm text-foreground font-medium">{stock.location?.code}</span>
                      {stock.location?.name && (
                        <span className="text-xs text-muted-foreground hidden sm:inline">— {stock.location.name}</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={
                        stock.item?.item_type === "isi"
                          ? "bg-blue-50 text-blue-700 border-blue-200 text-xs"
                          : "text-muted-foreground text-xs"
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
                    <Badge variant="outline" className={`text-xs ${STATUS_CONFIG[stock.status].class}`}>
                      {STATUS_CONFIG[stock.status].label}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {!loading && filtered.length > 0 && (
        <p className="text-xs text-muted-foreground text-right">
          Menampilkan {filtered.length} dari {stocks.length} catatan stok
        </p>
      )}
    </div>
  )
}
