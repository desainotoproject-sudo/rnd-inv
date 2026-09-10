import * as React from "react"
import {
  Plus,
  MoreHorizontal,
  UserX,
  UserCheck,
  Loader2,
  Users,
  Search,
} from "lucide-react"
import { supabase } from "@/lib/supabase"
import type { Profile, UserRole } from "@/lib/database.types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Skeleton } from "@/components/ui/skeleton"
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty"

function getInitials(name: string) {
  return name.split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase()
}

interface CreateUserForm {
  email: string
  password: string
  full_name: string
  division: string
  role: UserRole
}

const emptyForm: CreateUserForm = {
  email: "",
  password: "",
  full_name: "",
  division: "",
  role: "guest",
}

export default function UsersPage() {
  const [users, setUsers] = React.useState<Profile[]>([])
  const [loading, setLoading] = React.useState(true)
  const [search, setSearch] = React.useState("")
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [form, setForm] = React.useState<CreateUserForm>(emptyForm)
  const [formError, setFormError] = React.useState("")
  const [submitting, setSubmitting] = React.useState(false)

  const loadUsers = React.useCallback(async () => {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false })
    setUsers(data ?? [])
    setLoading(false)
  }, [])

  React.useEffect(() => { loadUsers() }, [loadUsers])

  const filtered = React.useMemo(() => {
    const q = search.toLowerCase()
    return users.filter(
      (u) =>
        u.full_name.toLowerCase().includes(q) ||
        u.division.toLowerCase().includes(q)
    )
  }, [users, search])

  const handleCreate = async () => {
    if (!form.email || !form.password || !form.full_name || !form.division) {
      setFormError("Semua kolom wajib diisi.")
      return
    }
    if (form.password.length < 6) {
      setFormError("Password minimal 6 karakter.")
      return
    }
    setSubmitting(true)
    setFormError("")

    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token

    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-user`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          email: form.email,
          password: form.password,
          full_name: form.full_name,
          division: form.division,
          role: form.role,
        }),
      }
    )

    const result = await res.json()

    if (!res.ok || result.error) {
      setFormError(result.error ?? "Gagal membuat akun. Coba lagi.")
      setSubmitting(false)
      return
    }

    setDialogOpen(false)
    setForm(emptyForm)
    await loadUsers()
    setSubmitting(false)
  }

  const toggleActive = async (user: Profile) => {
    await supabase
      .from("profiles")
      .update({ is_active: !user.is_active })
      .eq("id", user.id)
    await loadUsers()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">Manajemen Akun</h1>
          <p className="hidden sm:block text-sm text-muted-foreground mt-1">
            Kelola akun pengguna — buat akun untuk divisi lain (Guest).
          </p>
        </div>
        <Button onClick={() => { setForm(emptyForm); setFormError(""); setDialogOpen(true) }}>
          <Plus />
          <span className="hidden sm:inline">Buat Akun</span>
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input
          placeholder="Cari nama atau divisi..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Table */}
      <div className="rounded-lg border bg-card">
        {loading ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-md" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <Empty className="border-none">
            <EmptyHeader>
              <EmptyMedia variant="icon"><Users /></EmptyMedia>
              <EmptyTitle>Belum ada pengguna</EmptyTitle>
              <EmptyDescription>
                {search ? "Tidak ada pengguna yang sesuai pencarian." : "Buat akun untuk divisi lain agar mereka bisa mengakses sistem."}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Pengguna</TableHead>
                <TableHead>Divisi</TableHead>
                <TableHead>Peran</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Bergabung</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="size-8">
                        <AvatarFallback className="text-xs bg-primary/10 text-primary">
                          {getInitials(user.full_name)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="font-medium text-sm">{user.full_name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{user.division}</TableCell>
                  <TableCell>
                    <Badge variant={user.role === "rnd" ? "default" : "secondary"} className="text-xs">
                      {user.role === "rnd" ? "RND" : "Guest"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={
                        user.is_active
                          ? "border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-900/20 dark:text-green-400"
                          : "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400"
                      }
                    >
                      {user.is_active ? "Aktif" : "Nonaktif"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(user.created_at).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm">
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => toggleActive(user)} variant={user.is_active ? "destructive" : "default"}>
                          {user.is_active ? <UserX /> : <UserCheck />}
                          {user.is_active ? "Nonaktifkan" : "Aktifkan"}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Create user dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Buat Akun Baru</DialogTitle>
            <DialogDescription>
              Buatkan akun untuk anggota divisi lain. Mereka akan login menggunakan email dan password ini.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="u-name">Nama Lengkap</Label>
              <Input
                id="u-name"
                placeholder="Nama lengkap"
                value={form.full_name}
                onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="u-division">Divisi</Label>
              <Input
                id="u-division"
                placeholder="cth: Digmar, Marketing, Produksi"
                value={form.division}
                onChange={(e) => setForm((f) => ({ ...f, division: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="u-email">Email</Label>
              <Input
                id="u-email"
                type="email"
                placeholder="nama@perusahaan.com"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="u-password">Password</Label>
              <Input
                id="u-password"
                type="text"
                placeholder="Minimal 6 karakter"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="u-role">Peran</Label>
              <Select value={form.role} onValueChange={(v) => setForm((f) => ({ ...f, role: v as UserRole }))}>
                <SelectTrigger id="u-role" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="guest">Guest (Hanya lihat)</SelectItem>
                  <SelectItem value="rnd">RND (Akses penuh)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {formError && <p className="text-sm text-destructive">{formError}</p>}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={submitting}>
              Batal
            </Button>
            <Button onClick={handleCreate} disabled={submitting}>
              {submitting && <Loader2 className="size-4 animate-spin" />}
              Buat Akun
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
