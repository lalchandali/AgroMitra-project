import { useState, useEffect, useCallback } from 'react'
import { getHealth, getAllOrders, getAllUsers, updateUserStatus, verifyUser, getAllProducts, deleteProduct, uploadProfilePhoto, updateProfile, getStoredUser, resolveImageUrl } from '../api/agromitra'
import Sidebar from '../components/Sidebar'
import SettingsTab from '../components/SettingsTab'
import { useLanguage } from '../hooks/useLanguage'
import { tr } from '../translations'
import toast from 'react-hot-toast'

const orderBadge = (status) => {
  const map = {
    placed: 'badge-gold', confirmed: 'badge-blue', ready: 'badge-blue',
    dispatched: 'badge-blue', shipped: 'badge-blue', in_transit: 'badge-blue',
    out_for_delivery: 'badge-blue', delivered: 'badge-green',
    cancelled: 'badge-red', disputed: 'badge-red',
  }
  return map[status?.toLowerCase()] || 'badge-blue'
}

const paymentBadge = (s) => s === 'released' ? 'badge-green' : s === 'refunded' ? 'badge-red' : 'badge-gold'
const roleBadge = (r) => ({ farmer:'badge-green', buyer:'badge-blue', consumer:'badge-gold', admin:'badge-red' }[r] || 'badge-blue')

const CROP_EMOJIS = {
  Tomato:'🍅', Onion:'🧅', Potato:'🥔', Brinjal:'🍆', Cabbage:'🥬',
  Rice:'🌾', Wheat:'🌾', Corn:'🌽', Garlic:'🧄', Ginger:'🫚',
  Chili:'🌶️', Carrot:'🥕', Cucumber:'🥒', Pumpkin:'🎃',
}

export default function AdminPanel() {
  const { lang } = useLanguage()
  const T = (key) => tr(key, lang)
  const [activeTab, setActiveTab] = useState('overview')
  const [apiStatus, setApiStatus] = useState(null)

  // Users
  const [users, setUsers]                   = useState([])
  const [usersLoading, setUsersLoading]     = useState(false)
  const [userSearch, setUserSearch]         = useState('')
  const [userRoleFilter, setUserRoleFilter] = useState('')

  // Orders
  const [orders, setOrders]                   = useState([])
  const [ordersLoading, setOrdersLoading]     = useState(false)
  const [orderStatusFilter, setOrderStatusFilter] = useState('all')
  const [orderSearch, setOrderSearch]         = useState('')

  // Products
  const [products, setProducts]               = useState([])
  const [productsLoading, setProductsLoading] = useState(false)
  const [productSearch, setProductSearch]     = useState('')
  const [productStatusFilter, setProductStatusFilter] = useState('all')

  // Profile
  const [user, setUser]                   = useState(getStoredUser())
  const [photoKey, setPhotoKey]           = useState(Date.now())
  const [profileEditMode, setProfileEditMode] = useState(false)
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileForm, setProfileForm]     = useState({
    name_en: user?.name_en || '',
    name_bn: user?.name_bn || '',
    mobile_number: user?.mobile_number || '',
    district: user?.district || 'Dhaka',
  })

  useEffect(() => {
    getHealth().then(r => setApiStatus(r.data)).catch(() => setApiStatus({ status: 'offline' }))
  }, [])

  // ── Fetch functions ──────────────────────────────────────────
  const fetchUsers = useCallback(async () => {
    setUsersLoading(true)
    try {
      const params = {}
      if (userRoleFilter) params.role = userRoleFilter
      if (userSearch) params.search = userSearch
      const res = await getAllUsers(params)
      setUsers(res.data || [])
    } catch { toast.error('Could not load users') }
    finally { setUsersLoading(false) }
  }, [userRoleFilter, userSearch])

  const fetchOrders = useCallback(async () => {
    setOrdersLoading(true)
    try {
      const res = await getAllOrders()
      setOrders(res.data || [])
    } catch { toast.error('Could not load orders') }
    finally { setOrdersLoading(false) }
  }, [])

  const fetchProducts = useCallback(async () => {
    setProductsLoading(true)
    try {
      const res = await getAllProducts()
      setProducts(res.data || [])
    } catch { toast.error('Could not load products') }
    finally { setProductsLoading(false) }
  }, [])

  useEffect(() => { if (activeTab === 'users')    fetchUsers()   }, [activeTab, fetchUsers])
  useEffect(() => { if (activeTab === 'orders')  { fetchOrders(); fetchUsers() } }, [activeTab, fetchOrders, fetchUsers])
  useEffect(() => { if (activeTab === 'products') fetchProducts() }, [activeTab, fetchProducts])
  useEffect(() => { if (activeTab === 'overview') { fetchOrders(); fetchProducts() } }, [activeTab, fetchOrders, fetchProducts])

  // ── User actions ─────────────────────────────────────────────
  const handleToggleStatus = async (user) => {
    try {
      await updateUserStatus(user.user_id, !user.is_active)
      toast.success(user.is_active ? '🚫 User suspended' : '✅ User activated')
      fetchUsers()
    } catch (e) { toast.error(e?.response?.data?.detail || 'Could not update status') }
  }

  const handleVerify = async (user) => {
    try {
      await verifyUser(user.user_id)
      toast.success('✅ User verified!')
      fetchUsers()
    } catch (e) { toast.error(e?.response?.data?.detail || 'Could not verify') }
  }

  // ── Product actions ──────────────────────────────────────────
  const handleDeleteProduct = async (product) => {
    if (!window.confirm(`Delete "${product.title_en}"? This cannot be undone.`)) return
    try {
      await deleteProduct(product.product_id)
      toast.success(T('productDeleted'))
      fetchProducts()
    } catch (e) { toast.error(e?.response?.data?.detail || 'Could not delete product') }
  }

  // ── Derived stats ────────────────────────────────────────────
  const totalFarmers    = users.filter(u => u.role === 'farmer').length
  const totalBuyers     = users.filter(u => u.role === 'buyer' || u.role === 'consumer').length
  const totalRevenue    = orders.filter(o => o.payment_status === 'released').reduce((s, o) => s + (o.platform_fee || 0), 0)
  const completedOrders = orders.filter(o => o.status === 'delivered').length
  const completionRate  = orders.length ? ((completedOrders / orders.length) * 100).toFixed(1) : 0
  const activeProducts  = products.filter(p => p.status === 'active').length

  // ── User map for name lookup ─────────────────────────────────
  const userMap = {}
  users.forEach(u => { userMap[u.user_id] = u })
  const nameFor = (id) => userMap[id]?.name_en || null

  // ── Filtered lists ───────────────────────────────────────────
  const filteredOrders = orders.filter(o => {
    const matchStatus = orderStatusFilter === 'all' || o.status?.toLowerCase() === orderStatusFilter
    const q = orderSearch.toLowerCase()
    const matchSearch = !q || o.order_id?.includes(q)
      || nameFor(o.farmer_id)?.toLowerCase().includes(q)
      || nameFor(o.buyer_id)?.toLowerCase().includes(q)
    return matchStatus && matchSearch
  })

  const filteredProducts = products.filter(p => {
    const matchStatus = productStatusFilter === 'all' || p.status?.toLowerCase() === productStatusFilter
    const q = productSearch.toLowerCase()
    const matchSearch = !q || p.title_en?.toLowerCase().includes(q)
      || p.district?.toLowerCase().includes(q)
      || p.crop_name?.toLowerCase().includes(q)
    return matchStatus && matchSearch
  })

  return (
    <div className="page" style={{ padding: 0 }}>
      {/* ── Sidebar + Content Layout (full height) ── */}
      <div className="dashboard-layout">
        <Sidebar
          title="Admin Menu"
          subtitle="AgroMitra"
          activeTab={activeTab}
          onTabChange={setActiveTab}
          tabs={[
            { key: 'overview',  icon: '📊', label: T('overview') },
            { key: 'users',     icon: '👥', label: T('users') },
            { key: 'orders',    icon: '📦', label: T('orders'),   badge: orders.length || null },
            { key: 'products',  icon: '🌿', label: T('products'), badge: products.length || null },
            { key: 'api',       icon: '🤖', label: T('aiStatus') },
            { key: 'profile',   icon: '👤', label: T('profile') },
            { key: 'settings',  icon: '⚙️', label: T('settings') },
          ]}
        />
        <div className="dashboard-content">

          {/* Header */}
          <div className="page-header flex justify-between">
            <div>
              <div className="page-title">⚙️ Admin Panel</div>
              <div className="page-subtitle">AgroMitra Platform Management</div>
            </div>
            <div className="flex gap-8 flex-center">
              <span className={`badge ${apiStatus?.status === 'healthy' ? 'badge-green' : 'badge-red'}`}>
                {apiStatus?.status === 'healthy' ? T('apiOnline') : T('apiOffline')}
              </span>
              <span style={{ fontSize: 13, color: '#546E7A' }}>{apiStatus?.timestamp?.slice(0, 19)}</span>
            </div>
          </div>

          {/* Stats */}
          <div className="stats-grid">
            {[
              { icon: '👨‍🌾', label: T('totalFarmers'),    val: users.length ? totalFarmers : '…',   color: '#E8F5E9', border: '#2E7D32' },
              { icon: '🛒',   label: T('totalBuyers'),     val: users.length ? totalBuyers : '…',    color: '#E3F2FD', border: '#1976D2' },
              { icon: '📦',   label: T('totalOrdersStat'),     val: orders.length || (ordersLoading ? '…' : 0), color: '#FFF3E0', border: '#E65100' },
              { icon: '🌿',   label: T('activeProducts'),  val: products.length ? activeProducts : '…', color: '#E8F5E9', border: '#388E3C' },
              { icon: '💰',   label: T('platformFees'),    val: `৳${totalRevenue.toLocaleString()}`, color: '#F3E5F5', border: '#6A1B9A' },
              { icon: '📊',   label: T('completionRate'),  val: `${completionRate}%`,                color: '#E0F2F1', border: '#00695C' },
            ].map((s, i) => (
              <div key={i} className="stat-card" style={{ borderLeftColor: s.border }}>
                <div className="stat-icon" style={{ background: s.color, fontSize: 24 }}>{s.icon}</div>
                <div className="stat-info">
                  <div className="stat-value">{s.val}</div>
                  <div className="stat-label">{s.label}</div>
                </div>
              </div>
            ))}
          </div>
      {/* ════ Overview Tab ════ */}
      {activeTab === 'overview' && (
        <div>
          <div className="card">
            <div className="card-title">📦 Recent Orders (Live)</div>
            {ordersLoading ? (
              <div style={{ padding: '8px 0' }}>
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="skeleton-row">
                    <div className="skeleton skeleton-text" style={{ width: 60 }} />
                    <div className="skeleton skeleton-text" style={{ width: 80 }} />
                    <div className="skeleton skeleton-badge" />
                    <div className="skeleton skeleton-badge" style={{ width: 80 }} />
                    <div className="skeleton skeleton-text" style={{ flex: 1 }} />
                  </div>
                ))}
              </div>
            ) : orders.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 30, color: '#9E9E9E' }}>No orders yet</div>
            ) : (
              <div className="table-container">
                <table>
                  <thead><tr><th>{T('thOrderID')}</th><th>{T('thAmount')}</th><th>{T('thFee')}</th><th>{T('thStatus')}</th><th>{T('thPayment')}</th><th>{T('thDate')}</th></tr></thead>
                  <tbody>
                    {orders.slice(0, 10).map(o => (
                      <tr key={o.order_id}>
                        <td style={{ fontFamily: 'monospace', fontSize: 12 }}>#{o.order_id?.slice(-6)}</td>
                        <td style={{ color: '#2E7D32', fontWeight: 600 }}>৳{o.total_amount?.toLocaleString()}</td>
                        <td style={{ color: '#546E7A' }}>৳{o.platform_fee?.toLocaleString()}</td>
                        <td><span className={`badge ${orderBadge(o.status)}`}>{o.status}</span></td>
                        <td><span className={`badge ${paymentBadge(o.payment_status)}`}>{o.payment_status}</span></td>
                        <td style={{ color: '#546E7A', fontSize: 13 }}>{o.created_at?.slice(0, 10)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="card mt-20">
            <div className="card-title">🌿 Recent Products</div>
            {productsLoading ? (
              <div style={{ padding: '8px 0' }}>
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="skeleton-row">
                    <div className="skeleton skeleton-text" style={{ width: 120 }} />
                    <div className="skeleton skeleton-text" style={{ width: 60 }} />
                    <div className="skeleton skeleton-badge" />
                    <div className="skeleton skeleton-text" style={{ flex: 1 }} />
                  </div>
                ))}
              </div>
            ) : products.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 30, color: '#9E9E9E' }}>No products yet</div>
            ) : (
              <div className="table-container">
                <table>
                  <thead><tr><th>{T('thProduct')}</th><th>{T('thQty')}</th><th>{T('thPricePerKg')}</th><th>{T('thDistrict')}</th><th>{T('thOrganic')}</th><th>{T('thStatus')}</th></tr></thead>
                  <tbody>
                    {products.slice(0, 8).map(p => (
                      <tr key={p.product_id}>
                        <td><strong>{CROP_EMOJIS[p.crop_name] || '🌿'} {p.title_en}</strong></td>
                        <td>{p.quantity_kg} kg</td>
                        <td style={{ color: '#2E7D32', fontWeight: 600 }}>৳{p.unit_price_bdt}</td>
                        <td style={{ fontSize: 13, color: '#546E7A' }}>{p.district}</td>
                        <td>{p.is_organic ? '🌱 Yes' : '—'}</td>
                        <td><span className={`badge ${p.status === 'active' ? 'badge-green' : p.status === 'sold_out' ? 'badge-gold' : 'badge-red'}`}>{p.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="card mt-20">
            <div className="card-title">🤖 AI Model Status</div>
            {[
              { name: T('priceAPIName'),    status: T('healthy') },
              { name: T('demandAPIName'),  status: T('healthy') },
              { name: T('cropAPIName'), status: T('healthy') },
              { name: T('diseaseAPIName'),   status: T('healthy') },
              { name: 'FastAPI Server', status: apiStatus?.status === 'healthy' ? 'Online' : 'Offline', offline: apiStatus?.status !== 'healthy' },
            ].map((m, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #F5F5F5' }}>
                <span style={{ fontSize: 14 }}>{m.name}</span>
                <span className="badge" style={{ background: (m.offline ? '#C62828' : '#2E7D32') + '22', color: m.offline ? '#C62828' : '#2E7D32' }}>
                  ● {m.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ════ Users Tab ════ */}
      {activeTab === 'users' && (
        <div className="card">
          <div className="flex justify-between mb-20" style={{ flexWrap: 'wrap', gap: 12 }}>
            <div className="section-title">👥 User Management</div>
            <div className="flex gap-8">
              <input className="form-input" style={{ width: 220 }}
                placeholder={T('searchUser')}
                value={userSearch}
                onChange={e => setUserSearch(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && fetchUsers()} />
              <select className="form-select" style={{ width: 140 }} value={userRoleFilter} onChange={e => setUserRoleFilter(e.target.value)}>
                <option value="">All Roles</option>
                <option value="farmer">Farmer</option>
                <option value="buyer">Buyer</option>
                <option value="consumer">Consumer</option>
                <option value="admin">Admin</option>
              </select>
              <button className="btn btn-primary btn-sm" onClick={fetchUsers}>Search</button>
            </div>
          </div>
          {usersLoading ? (
            <div style={{ padding: '8px 0' }}>
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="skeleton-row">
                  <div className="skeleton skeleton-text" style={{ width: 100, flexShrink: 0 }} />
                  <div className="skeleton skeleton-text" style={{ width: 90, flexShrink: 0 }} />
                  <div className="skeleton skeleton-badge" />
                  <div className="skeleton skeleton-text" style={{ flex: 1 }} />
                  <div className="skeleton skeleton-badge" />
                </div>
              ))}
            </div>
          ) : users.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 30, color: '#9E9E9E' }}>No users found</div>
          ) : (
            <div className="table-container">
              <table>
                <thead><tr><th>{T('thName')}</th><th>{T('thMobile')}</th><th>{T('thRole')}</th><th>{T('thDistrict')}</th><th>{T('thVerified')}</th><th>{T('thTrust')}</th><th>{T('thStatus')}</th><th>{T('thAction')}</th></tr></thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.user_id}>
                      <td><strong>{u.name_en}</strong>{u.name_bn && <div style={{ fontSize: 11, color: '#888' }}>{u.name_bn}</div>}</td>
                      <td style={{ color: '#546E7A' }}>{u.mobile_number}</td>
                      <td><span className={`badge ${roleBadge(u.role)}`}>{u.role}</span></td>
                      <td>{u.district || '—'}</td>
                      <td>{u.is_verified ? T('verified') : T('pending')}</td>
                      <td>{u.trust_score}/100</td>
                      <td><span className={`badge ${u.is_active ? 'badge-green' : 'badge-red'}`}>{u.is_active ? 'Active' : 'Suspended'}</span></td>
                      <td>
                        <div className="flex gap-8">
                          {!u.is_verified && (
                            <button className="btn btn-sm btn-secondary" onClick={() => handleVerify(u)}>✅ Verify</button>
                          )}
                          <button className={`btn btn-sm ${u.is_active ? 'btn-danger' : 'btn-primary'}`}
                            onClick={() => handleToggleStatus(u)}>
                            {u.is_active ? `🚫 ${T('suspend')}` : `✅ ${T('activate')}`}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ════ Orders Tab ════ */}
      {activeTab === 'orders' && (
        <div className="card">
          <div className="flex justify-between mb-20" style={{ flexWrap: 'wrap', gap: 12 }}>
            <div className="section-title">📦 All Orders</div>
            <div className="flex gap-8">
              <input className="form-input" style={{ width: 200 }}
                placeholder={T('searchOrder')}
                value={orderSearch}
                onChange={e => setOrderSearch(e.target.value)} />
              <select className="form-select" style={{ width: 150 }} value={orderStatusFilter} onChange={e => setOrderStatusFilter(e.target.value)}>
                <option value="all">All Status</option>
                <option value="placed">Placed</option>
                <option value="confirmed">Confirmed</option>
                <option value="shipped">Shipped</option>
                <option value="delivered">Delivered</option>
                <option value="cancelled">Cancelled</option>
              </select>
              <button className="btn btn-secondary btn-sm" onClick={fetchOrders}>🔄 Refresh</button>
            </div>
          </div>

          {/* Order count pills */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
            {[
              ['all', 'All', orders.length],
              ['placed', 'New', orders.filter(o => o.status === 'placed').length],
              ['confirmed', 'Confirmed', orders.filter(o => o.status === 'confirmed').length],
              ['shipped', 'Shipped', orders.filter(o => o.status === 'shipped').length],
              ['delivered', 'Delivered', orders.filter(o => o.status === 'delivered').length],
              ['cancelled', 'Cancelled', orders.filter(o => o.status === 'cancelled').length],
            ].map(([key, label, count]) => (
              <button key={key}
                onClick={() => setOrderStatusFilter(key)}
                style={{
                  padding: '4px 12px', borderRadius: 99, fontSize: 12, cursor: 'pointer', fontWeight: 500,
                  background: orderStatusFilter === key ? '#2E7D32' : '#F5F5F5',
                  color: orderStatusFilter === key ? '#fff' : '#546E7A',
                  border: orderStatusFilter === key ? '1px solid #2E7D32' : '1px solid #E0E0E0',
                }}>
                {label} {count > 0 && <span style={{ fontWeight: 700 }}>({count})</span>}
              </button>
            ))}
          </div>

          {ordersLoading ? (
            <div style={{ padding: '8px 0' }}>
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="skeleton-row">
                  <div className="skeleton skeleton-text" style={{ width: 60, flexShrink: 0 }} />
                  <div className="skeleton skeleton-text" style={{ width: 100, flexShrink: 0 }} />
                  <div className="skeleton skeleton-text" style={{ width: 80, flexShrink: 0 }} />
                  <div className="skeleton skeleton-badge" />
                  <div className="skeleton skeleton-text" style={{ flex: 1 }} />
                </div>
              ))}
            </div>
          ) : filteredOrders.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 30, color: '#9E9E9E' }}>No orders found</div>
          ) : (
            <div className="table-container">
              <table>
                <thead>
                  <tr><th>{T('thOrderID')}</th><th>{T('thFarmer')}</th><th>{T('thBuyer')}</th><th>{T('thQty')}</th><th>{T('thAmount')}</th><th>{T('thFee')}</th><th>{T('thStatus')}</th><th>{T('thPayment')}</th><th>{T('thDelivery')}</th><th>{T('thDate')}</th></tr>
                </thead>
                <tbody>
                  {filteredOrders.map(o => (
                    <tr key={o.order_id}>
                      <td style={{ fontFamily: 'monospace', fontSize: 12 }}>#{o.order_id?.slice(-6)}</td>
                      <td style={{ fontSize: 13 }}>{nameFor(o.farmer_id) || <span style={{ fontFamily: 'monospace', color: '#9E9E9E' }}>#{o.farmer_id?.slice(-6)}</span>}</td>
                      <td style={{ fontSize: 13 }}>{nameFor(o.buyer_id) || <span style={{ fontFamily: 'monospace', color: '#9E9E9E' }}>#{o.buyer_id?.slice(-6)}</span>}</td>
                      <td>{o.quantity_kg} kg</td>
                      <td style={{ color: '#2E7D32', fontWeight: 600 }}>৳{o.total_amount?.toLocaleString()}</td>
                      <td style={{ color: '#546E7A' }}>৳{o.platform_fee?.toLocaleString()}</td>
                      <td><span className={`badge ${orderBadge(o.status)}`}>{o.status}</span></td>
                      <td><span className={`badge ${paymentBadge(o.payment_status)}`}>{o.payment_status}</span></td>
                      <td>
                        <span className="badge badge-blue" style={{ textTransform: 'capitalize' }}>{o.delivery_type}</span>
                        {o.delivery_address && (
                          <div style={{ color: '#9E9E9E', fontSize: 11, marginTop: 3, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={o.delivery_address}>
                            📍 {o.delivery_address}
                          </div>
                        )}
                      </td>
                      <td style={{ color: '#546E7A', fontSize: 13 }}>{o.created_at?.slice(0, 10)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div style={{ marginTop: 12, color: '#9E9E9E', fontSize: 13 }}>
            Showing {filteredOrders.length} of {orders.length} orders
          </div>
        </div>
      )}

      {/* ════ Products Tab ════ */}
      {activeTab === 'products' && (
        <div className="card">
          <div className="flex justify-between mb-20" style={{ flexWrap: 'wrap', gap: 12 }}>
            <div className="section-title">🌿 All Products</div>
            <div className="flex gap-8">
              <input className="form-input" style={{ width: 220 }}
                placeholder={T('searchProduct')}
                value={productSearch}
                onChange={e => setProductSearch(e.target.value)} />
              <select className="form-select" style={{ width: 150 }} value={productStatusFilter} onChange={e => setProductStatusFilter(e.target.value)}>
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="sold_out">Sold Out</option>
                <option value="inactive">Inactive</option>
              </select>
              <button className="btn btn-secondary btn-sm" onClick={fetchProducts}>🔄 Refresh</button>
            </div>
          </div>

          {/* Product count pills */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
            {[
              ['all', 'All', products.length],
              ['active', 'Active', products.filter(p => p.status === 'active').length],
              ['sold_out', T('soldOut'), products.filter(p => p.status === 'sold_out').length],
              ['inactive', 'Inactive', products.filter(p => p.status === 'inactive').length],
            ].map(([key, label, count]) => (
              <button key={key}
                onClick={() => setProductStatusFilter(key)}
                style={{
                  padding: '4px 12px', borderRadius: 99, fontSize: 12, cursor: 'pointer', fontWeight: 500,
                  background: productStatusFilter === key ? '#2E7D32' : '#F5F5F5',
                  color: productStatusFilter === key ? '#fff' : '#546E7A',
                  border: productStatusFilter === key ? '1px solid #2E7D32' : '1px solid #E0E0E0',
                }}>
                {label} {count > 0 && <span style={{ fontWeight: 700 }}>({count})</span>}
              </button>
            ))}
          </div>

          {productsLoading ? (
            <div style={{ padding: '8px 0' }}>
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="skeleton-row">
                  <div className="skeleton skeleton-text" style={{ width: 130, flexShrink: 0 }} />
                  <div className="skeleton skeleton-text" style={{ width: 70, flexShrink: 0 }} />
                  <div className="skeleton skeleton-text" style={{ width: 60, flexShrink: 0 }} />
                  <div className="skeleton skeleton-badge" />
                  <div className="skeleton skeleton-text" style={{ flex: 1 }} />
                </div>
              ))}
            </div>
          ) : filteredProducts.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 30, color: '#9E9E9E' }}>No products found</div>
          ) : (
            <div className="table-container">
              <table>
                <thead>
                  <tr><th>{T('thProduct')}</th><th>{T('thCrop')}</th><th>{T('thQtyKg')}</th><th>{T('thPricePerKg')}</th><th>{T('thDistrict')}</th><th>{T('thOrganic')}</th><th>{T('thStatus')}</th><th>{T('thListed')}</th><th>{T('thAction')}</th></tr>
                </thead>
                <tbody>
                  {filteredProducts.map(p => (
                    <tr key={p.product_id}>
                      <td>
                        <strong>{CROP_EMOJIS[p.crop_name] || '🌿'} {p.title_en}</strong>
                        {p.title_bn && <div style={{ fontSize: 11, color: '#888' }}>{p.title_bn}</div>}
                      </td>
                      <td style={{ fontSize: 13, color: '#546E7A' }}>{p.crop_name}</td>
                      <td><strong>{p.quantity_kg}</strong></td>
                      <td style={{ color: '#2E7D32', fontWeight: 600 }}>৳{p.unit_price_bdt}</td>
                      <td style={{ fontSize: 13 }}>{p.district}</td>
                      <td>{p.is_organic ? <span className="badge badge-green">🌱 Organic</span> : <span style={{ color: '#9E9E9E' }}>—</span>}</td>
                      <td>
                        <span className={`badge ${p.status === 'active' ? 'badge-green' : p.status === 'sold_out' ? 'badge-gold' : 'badge-red'}`}>
                          {p.status}
                        </span>
                      </td>
                      <td style={{ color: '#546E7A', fontSize: 13 }}>{p.created_at?.slice(0, 10)}</td>
                      <td>
                        <button className="btn btn-sm btn-danger" onClick={() => handleDeleteProduct(p)}>
                          🗑️ Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div style={{ marginTop: 12, color: '#9E9E9E', fontSize: 13 }}>
            Showing {filteredProducts.length} of {products.length} products
          </div>
        </div>
      )}

      {/* ════ AI Status Tab ════ */}
      {activeTab === 'api' && (
        <div>
          <div className="ai-section mb-20">
            <div className="ai-section-title">🤖 AI API Status</div>
            <div className="ai-section-sub">FastAPI Server running on localhost:8000</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
              {Object.entries(apiStatus?.models || {}).map(([k, v], i) => (
                <div key={i} style={{ background: 'rgba(255,255,255,0.1)', borderRadius: 8, padding: 14 }}>
                  <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 4 }}>{k.replace(/_/g, ' ')}</div>
                  <div style={{ fontWeight: 600 }}>{v}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="card">
            <div className="card-title">🗄️ Database</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #F5F5F5' }}>
              <span>Enabled</span>
              <span className={`badge ${apiStatus?.database?.enabled ? 'badge-green' : 'badge-red'}`}>
                {apiStatus?.database?.enabled ? 'Yes' : 'No'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0' }}>
              <span>Connection Status</span>
              <span className={`badge ${apiStatus?.database?.status === 'connected' ? 'badge-green' : 'badge-red'}`}>
                {apiStatus?.database?.status || 'unknown'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ════ Profile Tab ════ */}
      {activeTab === 'profile' && (
        <div style={{ maxWidth: 600, margin: '0 auto' }}>

          {/* Profile Header Card */}
          <div className="card" style={{ textAlign: 'center', padding: 32, marginBottom: 20 }}>
            <div style={{ position: 'relative', width: 88, height: 88, margin: '0 auto 16px' }}>
              {user?.profile_photo_url ? (
                <img
                  src={`${resolveImageUrl(user.profile_photo_url)}?t=${photoKey}`}
                  alt="Profile"
                  style={{ width: 88, height: 88, borderRadius: '50%', objectFit: 'cover', border: '3px solid var(--green-light)' }}
                />
              ) : (
                <div style={{
                  width: 88, height: 88, borderRadius: '50%',
                  background: 'var(--green-pale)', fontSize: 44,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: '3px solid var(--green-light)'
                }}>⚙️</div>
              )}
              <label style={{
                position: 'absolute', bottom: 0, right: 0,
                width: 28, height: 28, borderRadius: '50%',
                background: 'var(--green)', color: 'white',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', fontSize: 14, boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
                border: '2px solid white'
              }}>
                <span>📷</span>
                <input type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }}
                  onChange={async (e) => {
                    const file = e.target.files[0]
                    if (!file) return
                    try {
                      toast.loading('Uploading photo...')
                      const res = await uploadProfilePhoto(file)
                      const updatedUser = { ...user, profile_photo_url: res.data.photo_url }
                      localStorage.setItem('agromitra_user', JSON.stringify(updatedUser))
                      setUser(updatedUser)
                      setPhotoKey(Date.now())
                      toast.dismiss()
                      toast.success('Profile photo updated!')
                    } catch {
                      toast.dismiss()
                      toast.error('Upload failed. Max 2MB, JPG/PNG only.')
                    }
                  }} />
              </label>
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--green-dark)' }}>
              {user?.name_en || 'Admin'}
            </div>
            {user?.name_bn && <div style={{ fontSize: 15, color: 'var(--gray)', marginTop: 4 }}>{user.name_bn}</div>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', marginTop: 12 }}>
              <span className="badge badge-red">⚙️ Admin</span>
              {user?.district && <span className="badge badge-blue">📍 {user.district}</span>}
              {user?.is_verified
                ? <span className="badge badge-green">✅ Verified</span>
                : <span className="badge badge-gold">⏳ Not Verified</span>
              }
            </div>
            <div style={{ fontSize: 13, color: 'var(--gray)', marginTop: 10 }}>
              📱 {user?.mobile_number || '—'} · 🕐 Member since {user?.created_at
                ? new Date(user.created_at).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
                : '—'
              }
            </div>
          </div>

          {/* Editable Info Card */}
          <div className="card" style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div className="card-title" style={{ marginBottom: 0 }}>📝 Personal Information</div>
              {!profileEditMode ? (
                <button className="btn btn-secondary btn-sm" onClick={() => setProfileEditMode(true)}>✏️ Edit</button>
              ) : (
                <button style={{ background: '#FFEBEE', color: '#C62828', border: 'none', borderRadius: 6, padding: '4px 12px', cursor: 'pointer', fontSize: 13 }}
                  onClick={() => {
                    setProfileEditMode(false)
                    setProfileForm({ name_en: user?.name_en || '', name_bn: user?.name_bn || '', district: user?.district || 'Dhaka', mobile_number: user?.mobile_number || '' })
                  }}>✕ Cancel</button>
              )}
            </div>

            {!profileEditMode ? (
              <div style={{ display: 'grid', gap: 14 }}>
                {[['Full Name (EN)', user?.name_en], ['Full Name (BN)', user?.name_bn], ['Mobile', user?.mobile_number], ['District', user?.district]].map(([label, val]) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #F5F5F5' }}>
                    <span style={{ color: '#546E7A', fontSize: 14 }}>{label}</span>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{val || '—'}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 16 }}>
                {[['name_en', T('fullNameEn'), 'text'], ['name_bn', T('fullNameBn'), 'text'], ['mobile_number', T('mobile'), 'text']].map(([field, label, type]) => (
                  <div key={field} className="form-group">
                    <label className="form-label">{label}</label>
                    <input className="form-input" type={type} value={profileForm[field]}
                      onChange={e => setProfileForm({ ...profileForm, [field]: e.target.value })} />
                  </div>
                ))}
                <div className="form-group">
                  <label className="form-label">District</label>
                  <input className="form-input" value={profileForm.district}
                    onChange={e => setProfileForm({ ...profileForm, district: e.target.value })} />
                </div>
                <button className="btn btn-primary btn-full" disabled={savingProfile}
                  onClick={async () => {
                    if (!profileForm.name_en.trim()) { toast.error(T('nameRequired')); return }
                    setSavingProfile(true)
                    try {
                      const res = await updateProfile({ name_en: profileForm.name_en, name_bn: profileForm.name_bn, mobile_number: profileForm.mobile_number, district: profileForm.district })
                      const updatedUser = { ...user, ...res.data }
                      localStorage.setItem('agromitra_user', JSON.stringify(updatedUser))
                      setUser(updatedUser)
                      toast.success('Profile updated!')
                      setProfileEditMode(false)
                    } catch { toast.error('Could not update profile') }
                    finally { setSavingProfile(false) }
                  }}>
                  {savingProfile ? '⏳ Saving…' : '✅ Save Changes'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ════ Settings Tab ════ */}
      {activeTab === 'settings' && (
        <SettingsTab userRole="admin" />
      )}

        </div>  {/* dashboard-content */}
      </div>  {/* dashboard-layout */}
    </div>
  )
}
