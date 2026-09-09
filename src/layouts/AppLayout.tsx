import * as React from "react"
import { NavLink, useNavigate, Outlet, useLocation } from "react-router-dom"
import {
  Package,
  LayoutDashboard,
  MapPin,
  BoxesIcon,
  BarChart3,
  Users,
  LogOut,
  ChevronDown,
  ArrowUpDown,
  Clock,
  History,
  ArrowLeftRight,
  Zap,
  ScanLine,
} from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import NotificationBell from "@/components/NotificationBell"

const rndNavItems = [
  { to: "/dashboard", label: "Ringkasan", icon: LayoutDashboard },
  { to: "/locations", label: "Master Lokasi", icon: MapPin },
  { to: "/items", label: "Master Barang", icon: BoxesIcon },
  { to: "/quick-edit", label: "Edit Cepat", icon: Zap },
  { to: "/scan", label: "Scan Barcode", icon: ScanLine },
  { to: "/stock", label: "Manajemen Stok", icon: BarChart3 },
  { to: "/approvals", label: "Approval", icon: Clock },
  { to: "/admin-loans", label: "Pinjam/Titip", icon: ArrowLeftRight },
  { to: "/history", label: "Riwayat Transaksi", icon: History },
  { to: "/users", label: "Manajemen Akun", icon: Users },
]

const guestNavItems = [
  { to: "/dashboard", label: "Ringkasan", icon: LayoutDashboard },
  { to: "/inventory", label: "Daftar Inventaris", icon: BoxesIcon },
  { to: "/transactions", label: "Pengajuan Saya", icon: ArrowUpDown },
  { to: "/history", label: "Riwayat Saya", icon: History },
]

function getInitials(name: string) {
  return name.split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase()
}

function NavItem({ to, label, icon: Icon }: { to: string; label: string; icon: React.ElementType }) {
  const location = useLocation()
  const isActive = to === "/dashboard"
    ? location.pathname === "/dashboard"
    : location.pathname.startsWith(to)

  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={isActive} tooltip={label}>
        <NavLink to={to}>
          <Icon />
          <span>{label}</span>
        </NavLink>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}

export default function AppLayout() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const isRND = profile?.role === "rnd"
  const navItems = isRND ? rndNavItems : guestNavItems

  const handleSignOut = async () => {
    await signOut()
    navigate("/login", { replace: true })
  }

  return (
    <SidebarProvider className="h-dvh overflow-hidden">
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" className="cursor-default hover:bg-transparent active:bg-transparent">
                <div className="flex size-8 items-center justify-center rounded-lg bg-primary shrink-0">
                  <Package className="size-4 text-primary-foreground" />
                </div>
                <div className="flex flex-col gap-0.5 leading-none">
                  <span className="font-semibold text-sm">Inventaris RND</span>
                  <span className="text-xs text-muted-foreground">Sistem Manajemen</span>
                </div>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>

        <SidebarSeparator />

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Menu</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {navItems.map((item) => (
                  <NavItem key={item.to} {...item} />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuButton size="lg" className="w-full">
                    <Avatar className="size-6 shrink-0">
                      <AvatarFallback className="text-xs bg-primary text-primary-foreground">
                        {profile ? getInitials(profile.full_name) : "?"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex flex-1 flex-col gap-0.5 leading-none text-left min-w-0">
                      <span className="font-medium text-sm truncate">{profile?.full_name}</span>
                      <span className="text-xs text-muted-foreground truncate">{profile?.division}</span>
                    </div>
                    <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
                  </SidebarMenuButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent side="top" align="start" className="w-56">
                  <div className="px-2 py-2">
                    <div className="flex items-center gap-2">
                      <Avatar className="size-8">
                        <AvatarFallback className="text-xs bg-primary text-primary-foreground">
                          {profile ? getInitials(profile.full_name) : "?"}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col gap-0.5 min-w-0">
                        <span className="text-sm font-medium truncate">{profile?.full_name}</span>
                        <div className="flex items-center gap-1">
                          <Badge variant="secondary" className="text-xs px-1.5 py-0 h-4">
                            {profile?.role === "rnd" ? "RND" : "Guest"}
                          </Badge>
                          <span className="text-xs text-muted-foreground truncate">{profile?.division}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleSignOut} variant="destructive">
                    <LogOut />
                    Keluar
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset className="min-h-0 overflow-hidden">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-background px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="h-4" />
          <div className="flex-1" />
          <NotificationBell />
        </header>
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
