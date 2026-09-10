import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import { AuthProvider } from "@/contexts/AuthContext"
import AuthGuard from "@/components/AuthGuard"
import AppLayout from "@/layouts/AppLayout"
import LoginPage from "@/pages/LoginPage"
import DashboardPage from "@/pages/DashboardPage"
import UsersPage from "@/pages/UsersPage"
import LocationsPage from "@/pages/LocationsPage"
import ItemsPage from "@/pages/ItemsPage"
import StockPage from "@/pages/StockPage"
import InventoryPage from "@/pages/InventoryPage"
import TransactionsPage from "@/pages/TransactionsPage"
import ApprovalsPage from "@/pages/ApprovalsPage"
import HistoryPage from "@/pages/HistoryPage"
import AdminLoansPage from "@/pages/AdminLoansPage"
import QuickEditPage from "@/pages/QuickEditPage"
import ScanPage from "@/pages/ScanPage"
import PublicRequestPage from "@/pages/PublicRequestPage"
import LoanRequestsPage from "@/pages/LoanRequestsPage"

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          {/* Public (no login) route for guests to request a loan */}
          <Route path="/request" element={<PublicRequestPage />} />
          <Route
            element={
              <AuthGuard>
                <AppLayout />
              </AuthGuard>
            }
          >
            <Route path="/dashboard" element={<DashboardPage />} />
            {/* RND-only routes */}
            <Route path="/users" element={<AuthGuard requireRole="rnd"><UsersPage /></AuthGuard>} />
            <Route path="/locations" element={<AuthGuard requireRole="rnd"><LocationsPage /></AuthGuard>} />
            <Route path="/items" element={<AuthGuard requireRole="rnd"><ItemsPage /></AuthGuard>} />
            <Route path="/stock" element={<AuthGuard requireRole="rnd"><StockPage /></AuthGuard>} />
            <Route path="/approvals" element={<AuthGuard requireRole="rnd"><ApprovalsPage /></AuthGuard>} />
            <Route path="/admin-loans" element={<AuthGuard requireRole="rnd"><AdminLoansPage /></AuthGuard>} />
            <Route path="/quick-edit" element={<AuthGuard requireRole="rnd"><QuickEditPage /></AuthGuard>} />
            <Route path="/scan" element={<AuthGuard requireRole="rnd"><ScanPage /></AuthGuard>} />
            <Route path="/loan-requests" element={<AuthGuard requireRole="rnd"><LoanRequestsPage /></AuthGuard>} />
            {/* Shared routes (role-based filtering inside) */}
            <Route path="/history" element={<HistoryPage />} />
            {/* Guest routes */}
            <Route path="/inventory" element={<InventoryPage />} />
            <Route path="/transactions" element={<AuthGuard requireRole="guest"><TransactionsPage /></AuthGuard>} />
          </Route>
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
