import * as React from "react"
import {
  Plus,
  Pencil,
  Trash2,
  ChevronRight,
  MapPin,
  Loader2,
  Search,
} from "lucide-react"
import { supabase } from "@/lib/supabase"
import type { Cabinet, Location } from "@/lib/database.types"
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
import { Skeleton } from "@/components/ui/skeleton"
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"

type CabinetWithLocations = Cabinet & { locations: Location[] }

export default function LocationsPage() {
  const [cabinets, setCabinets] = React.useState<CabinetWithLocations[]>([])
  const [loading, setLoading] = React.useState(true)
  const [search, setSearch] = React.useState("")
  const [openCabinets, setOpenCabinets] = React.useState<Set<string>>(new Set())

  // Cabinet dialog
  const [cabinetDialog, setCabinetDialog] = React.useState<{ open: boolean; edit?: Cabinet }>({ open: false })
  const [cabinetForm, setCabinetForm] = React.useState({ code: "", name: "", description: "" })
  const [cabinetError, setCabinetError] = React.useState("")
  const [cabinetSubmitting, setCabinetSubmitting] = React.useState(false)

  // Location dialog
  const [locationDialog, setLocationDialog] = React.useState<{ open: boolean; cabinetId?: string; edit?: Location }>({ open: false })
  const [locationForm, setLocationForm] = React.useState({ code: "", name: "", description: "", cabinet_id: "" })
  const [locationError, setLocationError] = React.useState("")
  const [locationSubmitting, setLocationSubmitting] = React.useState(false)

  // Delete confirm
  const [deleteConfirm, setDeleteConfirm] = React.useState<{ open: boolean; type: "cabinet" | "location"; id: string; name: string }>({ open: false, type: "cabinet", id: "", name: "" })

  const loadData = React.useCallback(async () => {
    const { data: cabinetsData } = await supabase
      .from("cabinets")
      .select("*")
      .order("code")
    const { data: locationsData } = await supabase
      .from("locations")
      .select("*")
      .order("code")

    const result: CabinetWithLocations[] = (cabinetsData ?? []).map((c) => ({
      ...c,
      locations: (locationsData ?? []).filter((l) => l.cabinet_id === c.id),
    }))
    setCabinets(result)
    setLoading(false)
  }, [])

  React.useEffect(() => { loadData() }, [loadData])

  const filtered = React.useMemo(() => {
    if (!search) return cabinets
    const q = search.toLowerCase()
    return cabinets
      .map((c) => ({
        ...c,
        locations: c.locations.filter(
          (l) => l.code.toLowerCase().includes(q) || (l.name ?? "").toLowerCase().includes(q)
        ),
      }))
      .filter(
        (c) =>
          c.code.toLowerCase().includes(q) ||
          c.name.toLowerCase().includes(q) ||
          c.locations.length > 0
      )
  }, [cabinets, search])

  const toggleCabinet = (id: string) => {
    setOpenCabinets((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // Cabinet CRUD
  const openCreateCabinet = () => {
    setCabinetForm({ code: "", name: "", description: "" })
    setCabinetError("")
    setCabinetDialog({ open: true })
  }
  const openEditCabinet = (c: Cabinet) => {
    setCabinetForm({ code: c.code, name: c.name, description: c.description ?? "" })
    setCabinetError("")
    setCabinetDialog({ open: true, edit: c })
  }
  const saveCabinet = async () => {
    if (!cabinetForm.code || !cabinetForm.name) {
      setCabinetError("Kode dan nama lemari wajib diisi.")
      return
    }
    setCabinetSubmitting(true)
    setCabinetError("")
    if (cabinetDialog.edit) {
      const { error } = await supabase
        .from("cabinets")
        .update({ code: cabinetForm.code.toUpperCase(), name: cabinetForm.name, description: cabinetForm.description || null })
        .eq("id", cabinetDialog.edit.id)
      if (error) { setCabinetError(error.message); setCabinetSubmitting(false); return }
    } else {
      const { error } = await supabase
        .from("cabinets")
        .insert({ code: cabinetForm.code.toUpperCase(), name: cabinetForm.name, description: cabinetForm.description || null })
      if (error) { setCabinetError(error.message.includes("unique") ? "Kode lemari sudah ada." : error.message); setCabinetSubmitting(false); return }
    }
    setCabinetDialog({ open: false })
    await loadData()
    setCabinetSubmitting(false)
  }

  // Location CRUD
  const openCreateLocation = (cabinetId: string) => {
    setLocationForm({ code: "", name: "", description: "", cabinet_id: cabinetId })
    setLocationError("")
    setLocationDialog({ open: true, cabinetId })
  }
  const openEditLocation = (l: Location) => {
    setLocationForm({ code: l.code, name: l.name ?? "", description: l.description ?? "", cabinet_id: l.cabinet_id })
    setLocationError("")
    setLocationDialog({ open: true, edit: l })
  }
  const saveLocation = async () => {
    if (!locationForm.code || !locationForm.cabinet_id) {
      setLocationError("Kode sub-lokasi dan lemari wajib diisi.")
      return
    }
    setLocationSubmitting(true)
    setLocationError("")
    if (locationDialog.edit) {
      const { error } = await supabase
        .from("locations")
        .update({ code: locationForm.code.toUpperCase(), name: locationForm.name || null, description: locationForm.description || null, cabinet_id: locationForm.cabinet_id })
        .eq("id", locationDialog.edit.id)
      if (error) { setLocationError(error.message); setLocationSubmitting(false); return }
    } else {
      const { error } = await supabase
        .from("locations")
        .insert({ code: locationForm.code.toUpperCase(), name: locationForm.name || null, description: locationForm.description || null, cabinet_id: locationForm.cabinet_id })
      if (error) { setLocationError(error.message.includes("unique") ? "Kode sub-lokasi sudah ada di lemari ini." : error.message); setLocationSubmitting(false); return }
    }
    setLocationDialog({ open: false })
    await loadData()
    setLocationSubmitting(false)
  }

  // Delete
  const confirmDelete = (type: "cabinet" | "location", id: string, name: string) => {
    setDeleteConfirm({ open: true, type, id, name })
  }
  const handleDelete = async () => {
    if (deleteConfirm.type === "cabinet") {
      await supabase.from("cabinets").delete().eq("id", deleteConfirm.id)
    } else {
      await supabase.from("locations").delete().eq("id", deleteConfirm.id)
    }
    setDeleteConfirm({ open: false, type: "cabinet", id: "", name: "" })
    await loadData()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">Master Lokasi</h1>
          <p className="hidden sm:block text-sm text-muted-foreground mt-1">
            Kelola lemari dan sub-lokasi penyimpanan barang RND.
          </p>
        </div>
        <Button onClick={openCreateCabinet}>
          <Plus />
          <span className="hidden sm:inline">Tambah Lemari</span>
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input
          placeholder="Cari lemari atau sub-lokasi..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><MapPin /></EmptyMedia>
            <EmptyTitle>Belum ada lokasi</EmptyTitle>
            <EmptyDescription>
              {search ? "Tidak ditemukan lokasi yang sesuai." : "Tambahkan lemari pertama untuk mulai mengatur lokasi penyimpanan."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="space-y-3">
          {filtered.map((cabinet) => (
            <div key={cabinet.id} className="rounded-lg border bg-card overflow-hidden">
              <Collapsible open={openCabinets.has(cabinet.id)} onOpenChange={() => toggleCabinet(cabinet.id)}>
                <div className="flex items-center gap-3 px-4 py-3">
                  <CollapsibleTrigger asChild>
                    <button className="flex items-center gap-3 flex-1 text-left hover:opacity-75 transition-opacity">
                      <ChevronRight
                        className={`size-4 text-muted-foreground transition-transform duration-200 ${openCabinets.has(cabinet.id) ? "rotate-90" : ""}`}
                      />
                      <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10">
                        <span className="text-sm font-bold text-primary">{cabinet.code}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm text-foreground">{cabinet.name}</p>
                        {cabinet.description && (
                          <p className="text-xs text-muted-foreground truncate">{cabinet.description}</p>
                        )}
                      </div>
                      <Badge variant="secondary" className="text-xs shrink-0">
                        {cabinet.locations.length} sub-lokasi
                      </Badge>
                    </button>
                  </CollapsibleTrigger>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="icon-sm" onClick={() => openCreateLocation(cabinet.id)}>
                      <Plus />
                    </Button>
                    <Button variant="ghost" size="icon-sm" onClick={() => openEditCabinet(cabinet)}>
                      <Pencil />
                    </Button>
                    <Button variant="ghost" size="icon-sm" onClick={() => confirmDelete("cabinet", cabinet.id, cabinet.name)}>
                      <Trash2 className="text-destructive" />
                    </Button>
                  </div>
                </div>

                <CollapsibleContent>
                  {cabinet.locations.length === 0 ? (
                    <div className="border-t px-4 py-4 text-sm text-muted-foreground">
                      Belum ada sub-lokasi.{" "}
                      <button
                        className="text-primary hover:underline font-medium"
                        onClick={() => openCreateLocation(cabinet.id)}
                      >
                        Tambah sub-lokasi
                      </button>
                    </div>
                  ) : (
                    <div className="border-t">
                      {cabinet.locations.map((loc, idx) => (
                        <div
                          key={loc.id}
                          className={`flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50 transition-colors ${idx !== cabinet.locations.length - 1 ? "border-b border-border/50" : ""}`}
                        >
                          <div className="w-4" />
                          <div className="flex size-7 shrink-0 items-center justify-center rounded bg-muted">
                            <span className="text-xs font-medium text-foreground">{loc.code}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className="text-sm text-foreground">
                              {loc.name ? `${loc.name}` : `Sub-lokasi ${loc.code}`}
                            </span>
                            {loc.description && (
                              <p className="text-xs text-muted-foreground truncate">{loc.description}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="icon-sm" onClick={() => openEditLocation(loc)}>
                              <Pencil />
                            </Button>
                            <Button variant="ghost" size="icon-sm" onClick={() => confirmDelete("location", loc.id, loc.code)}>
                              <Trash2 className="text-destructive" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CollapsibleContent>
              </Collapsible>
            </div>
          ))}
        </div>
      )}

      {/* Cabinet Dialog */}
      <Dialog open={cabinetDialog.open} onOpenChange={(o) => setCabinetDialog({ open: o })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{cabinetDialog.edit ? "Edit Lemari" : "Tambah Lemari"}</DialogTitle>
            <DialogDescription>
              Lemari adalah unit penyimpanan utama, diberi kode huruf (A, B, C, ...).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="c-code">Kode Lemari</Label>
              <Input
                id="c-code"
                placeholder="cth: A"
                value={cabinetForm.code}
                onChange={(e) => setCabinetForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                maxLength={5}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="c-name">Nama Lemari</Label>
              <Input
                id="c-name"
                placeholder="cth: Lemari A"
                value={cabinetForm.name}
                onChange={(e) => setCabinetForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="c-desc">Deskripsi (opsional)</Label>
              <Textarea
                id="c-desc"
                placeholder="Keterangan tambahan..."
                value={cabinetForm.description}
                onChange={(e) => setCabinetForm((f) => ({ ...f, description: e.target.value }))}
                rows={2}
              />
            </div>
            {cabinetError && <p className="text-sm text-destructive">{cabinetError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCabinetDialog({ open: false })} disabled={cabinetSubmitting}>Batal</Button>
            <Button onClick={saveCabinet} disabled={cabinetSubmitting}>
              {cabinetSubmitting && <Loader2 className="size-4 animate-spin" />}
              {cabinetDialog.edit ? "Simpan" : "Tambah"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Location Dialog */}
      <Dialog open={locationDialog.open} onOpenChange={(o) => setLocationDialog({ open: o })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{locationDialog.edit ? "Edit Sub-Lokasi" : "Tambah Sub-Lokasi"}</DialogTitle>
            <DialogDescription>
              Sub-lokasi adalah bagian dalam lemari, diberi kode kombinasi huruf + angka (A1, A2, ...).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="l-cabinet">Lemari</Label>
              <Select
                value={locationForm.cabinet_id}
                onValueChange={(v) => setLocationForm((f) => ({ ...f, cabinet_id: v }))}
              >
                <SelectTrigger id="l-cabinet" className="w-full">
                  <SelectValue placeholder="Pilih lemari" />
                </SelectTrigger>
                <SelectContent>
                  {cabinets.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.code} — {c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="l-code">Kode Sub-Lokasi</Label>
              <Input
                id="l-code"
                placeholder="cth: A1"
                value={locationForm.code}
                onChange={(e) => setLocationForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                maxLength={10}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="l-name">Nama (opsional)</Label>
              <Input
                id="l-name"
                placeholder="cth: Rak bawah kiri"
                value={locationForm.name}
                onChange={(e) => setLocationForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="l-desc">Deskripsi (opsional)</Label>
              <Textarea
                id="l-desc"
                placeholder="Keterangan tambahan..."
                value={locationForm.description}
                onChange={(e) => setLocationForm((f) => ({ ...f, description: e.target.value }))}
                rows={2}
              />
            </div>
            {locationError && <p className="text-sm text-destructive">{locationError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLocationDialog({ open: false })} disabled={locationSubmitting}>Batal</Button>
            <Button onClick={saveLocation} disabled={locationSubmitting}>
              {locationSubmitting && <Loader2 className="size-4 animate-spin" />}
              {locationDialog.edit ? "Simpan" : "Tambah"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={deleteConfirm.open} onOpenChange={(o) => setDeleteConfirm((d) => ({ ...d, open: o }))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus {deleteConfirm.type === "cabinet" ? "Lemari" : "Sub-Lokasi"}?</AlertDialogTitle>
            <AlertDialogDescription>
              Menghapus <strong>{deleteConfirm.name}</strong> akan menghapus semua data terkait secara permanen.
              Tindakan ini tidak dapat dibatalkan.
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
