import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import Navbar from './components/Navbar'
import Home from './pages/Home.jsx'
import FarmerDashboard from './pages/FarmerDashboard.jsx'
import BuyerMarketplace from './pages/BuyerMarketplace.jsx'
import AdminPanel from './pages/AdminPanel.jsx'
import AuthPage from './pages/AuthPage.jsx'
import NotFound from './pages/NotFound.jsx'
import ForgotPassword from './pages/ForgotPassword.jsx'
import { getStoredUser } from './api/agromitra'
import './index.css'

// ── Protected Route ──────────────────────────────────────────
function ProtectedRoute({ children, allowedRoles }) {
  const user = getStoredUser()
  const token = localStorage.getItem('agromitra_access_token')

  // Token নেই → login page
  if (!token || !user) {
    return <Navigate to="/auth" replace />
  }

  // Role match না করলে → তার নিজের dashboard-এ
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    const roleRoutes = {
      farmer: '/farmer',
      buyer: '/buyer',
      consumer: '/buyer',
      admin: '/admin',
    }
    return <Navigate to={roleRoutes[user.role] || '/'} replace />
  }

  return children
}

function App() {
  return (
    <Router>
      <Toaster position="top-right" />
      <Navbar />
      <div className="main-content">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />

          <Route path="/farmer" element={
            <ProtectedRoute allowedRoles={['farmer']}>
              <FarmerDashboard />
            </ProtectedRoute>
          } />

          <Route path="/buyer" element={<BuyerMarketplace />} />

          <Route path="/admin" element={
            <ProtectedRoute allowedRoles={['admin']}>
              <AdminPanel />
            </ProtectedRoute>
          } />

          {/* Unknown route → 404 */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </div>
    </Router>
  )
}

export default App