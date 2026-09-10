import * as React from "react"
import {
  Package,
  MapPin,
  BoxesIcon,
  AlertCircle,
  CheckCircle2,
  Clock,
  TrendingDown,
  Inbox,
} from "lucide-react"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/contexts/AuthContext"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty"

interface Stats {
  totalItems: number
  totalLocations: number
  totalCabinets: number
  stockTersedia: number
  stockKosong: number
  stockDipinjam: number
  stockMenunggu: number
  pendingApprovals: number
}

interface EmptyStock {
  id: string
  item_name: string
  sku: string | null
  location_code: string
  cabinet_code: string
  unit: string
}

interface PopularItem {
  item_name: string
  total_requests: number
  type: string
}

function StatCard({
  title,
  value,
  icon: Icon,
  description,
  loading,
}: {
  title: string
  value: number | string
  icon: React.ElementType
  description?: string
  loading: boolean
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
          <Icon className="size-4 text-muted-foreground" />
        </div>
      </CardHeader>
      <CardContent>
        {loading ? <Skeleton className="h-8 w-16" /> : <p className="text-2xl font-bold text-foreground">{value}</p>}
        {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
      </CardContent>
    </Card>
  )
}

export default function DashboardPage() {
  const { profile } = useAuth()
  const [stats, setStats] = React.useState<Stats | null>(null)
  const [emptyStocks, setEmptyStocks] = React.useState<EmptyStock[]>([])
  const [popularItems, setPopularItems] = React.useState<PopularItem[]>([])
  const [loading, setLoading] = React.useState(true)
  const [detailLoading, setDetailLoading] = React.useState(true)

  React.useEffect(() => {
    async function loadStats() {
      const [itemsRes, locationsRes, cabinetsRes, stockRes, pendingRes] = await Promise.all([
        supabase.from("items").select("id", { count: "exact", head: true }),
        supabase.from("locations").select("id", { count: "exact", head: true }),
        supabase.from("cabinets").select("id", { count: "exact", head: true }),
        supabase.from("stock_entries").select("status"),
        supabase.from("transactions").select("id", { count: "exact", head: true }).eq("status", "menunggu_approval"),
      ])

      const stockData = stockRes.data ?? []
      setStats({
        totalItems: itemsRes.count ?? 0,
        totalLocations: locationsRes.count ?? 0,
        totalCabinets: cabinetsRes.count ?? 0,
        stockTersedia: stockData.filter((s) => s.status === "tersedia").length,
        stockKosong: stockData.filter((s) => s.status === "kosong").length,
        stockDipinjam: stockData.filter((s) => s.status === "dipinjam").length,
        stockMenunggu: stockData.filter((s) => s.status === "menunggu_approval").length,
        pendingApprovals: pendingRes.count ?? 0,
      })
      setLoading(false)
    }
    loadStats()
  }, [])

  // RND-only: load empty stocks and popular items
  React.useEffect(() => {
    if (profile?.role !== "rnd") {
      setDetailLoading(false)
      return
    }
    async function loadDetails() {
      // Empty stocks
      const { data: emptyData } = await supabase
        .from("stock_entries")
        .select(`id, item:items(name, sku, unit), location:locations(code, cabinet:cabinets(code))`)
        .eq("status", "kosong")
        .order("updated_at", { ascending: false })
        .limit(10)

      const empties: EmptyStock[] = (emptyData ?? []).map((s: any) => ({
        id: s.id,
        item_name: s.item?.name ?? "",
        sku: s.item?.sku ?? null,
        location_code: s.location?.code ?? "",
        cabinet_code: s.location?.cabinet?.code ?? "",
        unit: s.item?.unit ?? "",
      }))
      setEmptyStocks(empties)

      // Popular items (most requested)
      const { data: txnData } = await supabase
        .from("transactions")
        .select("item_name, type")
        .in("status", ["disetujui", "menunggu_approval"])

      const counts: Record<string, PopularItem> = {}
      for (const t of txnData ?? []) {
        const key = t.item_name
        if (!counts[key]) {
          counts[key] = { item_name: key, total_requests: 0, type: t.type }
        }
        counts[key].total_requests += 1
      }
      const sorted = Object.values(counts).sort((a, b) => b.total_requests - a.total_requests).slice(0, 5)
      setPopularItems(sorted)
      setDetailLoading(false)
    }
    loadDetails()
  }, [profile])

  const isRND = profile?.role === "rnd"

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
          Selamat datang, {profile?.full_name?.split(" ")[0]}
        </h1>
        <p className="hidden sm:block text-sm text-muted-foreground mt-1">
          {isRND
            ? "Kelola inventaris RND — barang, lokasi, dan akun pengguna."
            : "Lihat ketersediaan inventaris RND secara real-time."}
        </p>
      </div>

      {/* Main stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard title="Total Jenis Barang" value={stats?.totalItems ?? 0} icon={BoxesIcon} description="Master barang terdaftar" loading={loading} />
        <StatCard title="Lemari" value={stats?.totalCabinets ?? 0} icon={Package} description="Unit penyimpanan utama" loading={loading} />
        <StatCard title="Sub-Lokasi" value={stats?.totalLocations ?? 0} icon={MapPin} description="Lokasi penyimpanan detail" loading={loading} />
      </div>

      {/* Stock status breakdown */}
      <div>
        <h2 className="text-base font-semibold text-foreground mb-3">Status Stok</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-muted-foreground">Tersedia</CardTitle>
                <CheckCircle2 className="size-4 text-green-500" />
              </div>
            </CardHeader>
            <CardContent>
              {loading ? <Skeleton className="h-8 w-12" /> : <p className="text-2xl font-bold text-foreground">{stats?.stockTersedia}</p>}
              <Badge variant="secondary" className="mt-1 text-xs bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">Siap pakai</Badge>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-muted-foreground">Kosong</CardTitle>
                <TrendingDown className="size-4 text-red-500" />
              </div>
            </CardHeader>
            <CardContent>
              {loading ? <Skeleton className="h-8 w-12" /> : <p className="text-2xl font-bold text-foreground">{stats?.stockKosong}</p>}
              <Badge variant="secondary" className="mt-1 text-xs bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">Stok habis</Badge>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-muted-foreground">Dipinjam</CardTitle>
                <AlertCircle className="size-4 text-orange-500" />
              </div>
            </CardHeader>
            <CardContent>
              {loading ? <Skeleton className="h-8 w-12" /> : <p className="text-2xl font-bold text-foreground">{stats?.stockDipinjam}</p>}
              <Badge variant="secondary" className="mt-1 text-xs bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">Sedang pinjam</Badge>
            </CardContent>
          </Card>
          {isRND ? (
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Menunggu Approval</CardTitle>
                  <Clock className="size-4 text-yellow-500" />
                </div>
              </CardHeader>
              <CardContent>
                {loading ? <Skeleton className="h-8 w-12" /> : <p className="text-2xl font-bold text-foreground">{stats?.pendingApprovals}</p>}
                <Badge variant="secondary" className="mt-1 text-xs bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">Perlu keputusan</Badge>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Menunggu</CardTitle>
                  <Clock className="size-4 text-yellow-500" />
                </div>
              </CardHeader>
              <CardContent>
                {loading ? <Skeleton className="h-8 w-12" /> : <p className="text-2xl font-bold text-foreground">{stats?.stockMenunggu}</p>}
                <Badge variant="secondary" className="mt-1 text-xs bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">Proses approval</Badge>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* RND-only: Empty stocks and popular items */}
      {isRND && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Empty stocks */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <TrendingDown className="size-4 text-red-500" />
              <h2 className="text-base font-semibold text-foreground">Stok Kosong</h2>
            </div>
            <div className="rounded-lg border bg-card">
              {detailLoading ? (
                <div className="p-4 space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full rounded-md" />)}
                </div>
              ) : emptyStocks.length === 0 ? (
                <Empty className="border-none">
                  <EmptyHeader>
                    <EmptyMedia variant="icon"><CheckCircle2 /></EmptyMedia>
                    <EmptyTitle>Semua stok terisi</EmptyTitle>
                    <EmptyDescription>Tidak ada barang dengan status kosong.</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Barang</TableHead>
                      <TableHead>Lokasi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {emptyStocks.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium text-sm">{s.item_name}</p>
                            {s.sku && <code className="text-xs text-muted-foreground">{s.sku}</code>}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="font-mono text-xs">
                            {s.cabinet_code}{s.location_code}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </div>

          {/* Popular items */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Inbox className="size-4 text-primary" />
              <h2 className="text-base font-semibold text-foreground">Paling Sering Diajukan</h2>
            </div>
            <div className="rounded-lg border bg-card">
              {detailLoading ? (
                <div className="p-4 space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full rounded-md" />)}
                </div>
              ) : popularItems.length === 0 ? (
                <Empty className="border-none">
                  <EmptyHeader>
                    <EmptyMedia variant="icon"><Inbox /></EmptyMedia>
                    <EmptyTitle>Belum ada data</EmptyTitle>
                    <EmptyDescription>Belum ada pengajuan yang tercatat.</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Barang</TableHead>
                      <TableHead>Jenis</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {popularItems.map((item, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="font-medium text-sm">{item.item_name}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={
                            item.type === "pinjam"
                              ? "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400"
                              : "bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400"
                          }>
                            {item.type === "pinjam" ? "Pinjam" : "Titip"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-semibold text-sm">{item.total_requests}x</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Role info */}
      <Card className="border-dashed">
        <CardContent className="py-4">
          <div className="flex items-start gap-3">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
              <Package className="size-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">
                {isRND ? "Akses Penuh (RND)" : "Mode Lihat (Guest)"}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {isRND
                  ? "Anda dapat mengelola barang, lokasi, stok, dan akun pengguna dari menu di samping."
                  : "Anda dapat melihat data inventaris RND dan mengajukan pinjam/titip barang."}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
