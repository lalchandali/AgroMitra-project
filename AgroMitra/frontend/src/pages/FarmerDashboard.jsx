import { useState, useEffect, useCallback } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, BarChart, Bar
} from 'recharts'
import {
  getPricePrediction, getDemandForecast, getCropRecommendation,
  getMyProducts, createProduct, updateProduct, deleteProduct,
  getMyOrders, updateOrderStatus,
  getStoredUser, uploadProfilePhoto, updateProfile, resolveImageUrl
} from '../api/agromitra'
import Sidebar from '../components/Sidebar'
import SettingsTab from '../components/SettingsTab'
import { useLanguage } from '../hooks/useLanguage'
import { tr } from '../translations'
import toast from 'react-hot-toast'

const CROPS = [
  "Rice", "Wheat", "Corn", "Tomato", "Onion", "Potato", "Brinjal", "Cabbage",
  "Cauliflower", "Cucumber", "Chili", "Pumpkin", "Spinach", "Carrot", "Radish",
  "Lettuce", "Beetroot", "Okra", "Pea", "Garlic", "Ginger", "Turmeric",
  "Fenugreek", "Mustard", "Bitter Gourd", "Bottle Gourd", "Snake Gourd",
  "Ridge Gourd", "Yam", "Sweet Potato"
]
const DISTRICTS = [
  "Bagerhat", "Bandarban", "Barguna", "Barishal", "Bhola", "Bogura",
  "Brahmanbaria", "Chandpur", "Chapai Nawabganj", "Chattogram", "Chuadanga",
  "Cumilla", "Cox's Bazar", "Dhaka", "Dinajpur", "Faridpur", "Feni", "Gaibandha",
  "Gazipur", "Gopalganj", "Habiganj", "Jamalpur", "Jashore", "Jhalokathi",
  "Jhenaidah", "Joypurhat", "Khagrachhari", "Khulna", "Kishoreganj", "Kurigram",
  "Kushtia", "Lakshmipur", "Lalmonirhat", "Madaripur", "Magura", "Manikganj",
  "Meherpur", "Moulvibazar", "Munshiganj", "Mymensingh", "Naogaon", "Narail",
  "Narayanganj", "Narsingdi", "Natore", "Netrokona", "Nilphamari", "Noakhali",
  "Pabna", "Panchagarh", "Patuakhali", "Pirojpur", "Rajbari", "Rajshahi",
  "Rangamati", "Rangpur", "Satkhira", "Shariatpur", "Sherpur", "Sirajganj",
  "Sunamganj", "Sylhet", "Tangail", "Thakurgaon"
]
const CROP_EMOJIS = {
  Tomato: '🍅', Onion: '🧅', Potato: '🥔', Brinjal: '🍆',
  Cabbage: '🥬', Cauliflower: '🥦', Garlic: '🧄', Rice: '🌾',
  Ginger: '🫚', Corn: '🌽', Chili: '🌶️', Carrot: '🥕',
  Cucumber: '🥒', Pumpkin: '🎃', Spinach: '🥗'
}

// AI Price Prediction model শুধু এই ১৪টা crop-এর জন্য ডেটা রাখে
// (backend/main.py -এর CROP_DB এর সাথে মিলিয়ে রাখা হয়েছে)
const AI_PRICE_CROPS = [
  "Tomato", "Onion", "Potato", "Brinjal", "Cabbage", "Garlic", "Rice",
  "Ginger", "Maize", "Wheat", "Chili", "Watermelon", "Mustard", "Jute"
]

const BLANK_PRODUCT = {
  title_en: '', title_bn: '', category: 'Vegetable',
  description_en: '', quantity_kg: '', unit_price_bdt: '',
  quality_grade: 'A', district: 'Dhaka',
  is_organic: false, harvest_date: '', availability_until: '',
  image_url: '', image_file: null
}

const STATUS_CONFIG = {
  placed: { cls: 'fd-badge fd-badge--gold', icon: '⏳', label: 'Placed' },
  pending: { cls: 'fd-badge fd-badge--gold', icon: '⏳', label: 'Pending' },
  confirmed: { cls: 'fd-badge fd-badge--blue', icon: '✅', label: 'Confirmed' },
  shipped: { cls: 'fd-badge fd-badge--blue', icon: '🚚', label: 'Shipped' },
  delivered: { cls: 'fd-badge fd-badge--green', icon: '📦', label: 'Delivered' },
  cancelled: { cls: 'fd-badge fd-badge--red', icon: '✕', label: 'Cancelled' },
}

const PAYMENT_ICONS = { bkash: '💚', nagad: '🔵', bank_transfer: '🏦', cash_on_delivery: '💵' }

const fmtDate = (iso) => {
  if (!iso) return '—'
  const d = new Date(iso.endsWith('Z') ? iso : iso + 'Z')
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Dhaka' })
}

const fmtTime = (iso) => {
  if (!iso) return ''
  const d = new Date(iso.endsWith('Z') ? iso : iso + 'Z')
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Dhaka' })
}
// ── Order Detail Modal ────────────────────────────────────────
function OrderDetailModal({ order: o, onClose, onStatusUpdate }) {
  if (!o) return null
  const statusCfg = STATUS_CONFIG[o.status?.toLowerCase()] || STATUS_CONFIG.pending

  return (
    <div className="fd-overlay" onClick={onClose}>
      <div className="fd-modal fd-modal--wide" onClick={e => e.stopPropagation()}>
        <div className="fd-modal-header">
          <div>
            <div className="fd-modal-title">Order Details</div>
            <div className="fd-modal-sub">#{o.order_id?.slice(-12)}</div>
          </div>
          <button className="fd-modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="fd-order-detail-grid">
          {/* Status & Timeline */}
          <div className="fd-detail-section">
            <div className="fd-detail-label">Status</div>
            <span className={statusCfg.cls}>{statusCfg.icon} {statusCfg.label}</span>
          </div>

          <div className="fd-detail-section">
            <div className="fd-detail-label">Order Placed</div>
            <div className="fd-detail-val">{fmtDate(o.created_at)}</div>
            <div className="fd-detail-sub">{fmtTime(o.created_at)}</div>
          </div>

          {o.confirmed_at && (
            <div className="fd-detail-section">
              <div className="fd-detail-label">Confirmed At</div>
              <div className="fd-detail-val">{fmtDate(o.confirmed_at)}</div>
            </div>
          )}

          {o.delivered_at && (
            <div className="fd-detail-section">
              <div className="fd-detail-label">Delivered At</div>
              <div className="fd-detail-val">{fmtDate(o.delivered_at)}</div>
            </div>
          )}

          {/* Buyer */}
          <div className="fd-detail-section">
            <div className="fd-detail-label">Buyer Name</div>
            <div className="fd-detail-val">{o.buyer_name || T('unknownBuyer')}</div>
          </div>

          {/* Items — একটা order-এ একই buyer-এর একাধিক product থাকতে পারে */}
          <div className="fd-detail-section fd-detail-section--full">
            <div className="fd-detail-label">Items ({(o.items || []).length})</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6 }}>
              {(o.items || []).map(item => (
                <div key={item.order_item_id} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  background: 'var(--bg-muted, #F8FAFC)', padding: '10px 12px', borderRadius: 8, gap: 8
                }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: 18 }}>
                      {CROP_EMOJIS[item.product_name?.split(' ').find(w => CROP_EMOJIS[w])] || '🌿'}
                    </span>
                    <div>
                      <div className="fd-detail-val" style={{ fontSize: 14 }}>{item.product_name || T('unknownProduct')}</div>
                      <div className="fd-detail-sub">{item.quantity_kg} kg × ৳{item.unit_price}/kg</div>
                    </div>
                  </div>
                  <div style={{ fontWeight: 700, color: '#2E7D32' }}>৳{item.subtotal?.toLocaleString()}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Delivery */}
          <div className="fd-detail-section">
            <div className="fd-detail-label">Delivery Type</div>
            <div className="fd-detail-val">{o.delivery_type === 'pickup' ? '📦 Pickup' : '🚚 Home Delivery'}</div>
          </div>

          <div className="fd-detail-section fd-detail-section--full">
            <div className="fd-detail-label">Delivery Address</div>
            <div className="fd-detail-val">{o.delivery_address || '—'}</div>
          </div>

          {/* Payment */}
          <div className="fd-detail-section">
            <div className="fd-detail-label">Payment Method</div>
            <div className="fd-detail-val">
              {PAYMENT_ICONS[o.payment_method] || '💳'} {o.payment_method?.replace('_', ' ')}
            </div>
          </div>

          <div className="fd-detail-section">
            <div className="fd-detail-label">Payment Status</div>
            <span className={`fd-badge ${o.payment_status === 'released' ? 'fd-badge--green' : 'fd-badge--gold'}`}>
              {o.payment_status === 'released' ? '✅ Released' : '🔒 In Escrow'}
            </span>
          </div>
        </div>

        {/* Financial breakdown */}
        <div className="fd-finance-box">
          <div className="fd-finance-row">
            <span>Order Total</span>
            <span>৳{o.total_amount?.toLocaleString()}</span>
          </div>
          <div className="fd-finance-row">
            <span>Platform Fee</span>
            <span className="fd-finance-neg">− ৳{o.platform_fee?.toLocaleString()}</span>
          </div>
          <div className="fd-finance-row fd-finance-row--total">
            <span>You Receive</span>
            <span className="fd-finance-earn">৳{o.farmer_amount?.toLocaleString()}</span>
          </div>
        </div>

        {/* Action buttons */}
        <div className="fd-modal-actions">
          {o.status?.toLowerCase() === 'placed' && (
            <>
              <button className="fd-btn fd-btn--confirm"
                onClick={() => { onStatusUpdate(o.order_id, 'confirmed'); onClose() }}>
                ✅ Confirm Order
              </button>
              <button className="fd-btn fd-btn--cancel"
                onClick={() => { onStatusUpdate(o.order_id, 'cancelled'); onClose() }}>
                ✕ Cancel
              </button>
            </>
          )}
          {o.status?.toLowerCase() === 'confirmed' && (
            <button className="fd-btn fd-btn--ship"
              onClick={() => { onStatusUpdate(o.order_id, 'shipped'); onClose() }}>
              🚚 Mark as Shipped
            </button>
          )}
          {o.status?.toLowerCase() === 'shipped' && (
            <button className="fd-btn fd-btn--deliver"
              onClick={() => { onStatusUpdate(o.order_id, 'delivered'); onClose() }}>
              📦 Mark as Delivered
            </button>
          )}
          <button className="fd-btn fd-btn--ghost" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════
export default function FarmerDashboard() {
  const { lang } = useLanguage()
  const T = (key) => tr(key, lang)
  const [user, setUser] = useState(getStoredUser())

  useEffect(() => {
    const syncUser = () => setUser(getStoredUser())
    window.addEventListener('agromitra-auth-changed', syncUser)
    return () => window.removeEventListener('agromitra-auth-changed', syncUser)
  }, [])

  const [activeTab, setActiveTab] = useState('overview')
  const [crop, setCrop] = useState('Tomato')
  const [district, setDistrict] = useState('Bogura')
  const [priceData, setPriceData] = useState(null)
  const [demandData, setDemandData] = useState(null)
  const [recData, setRecData] = useState(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [recForm, setRecForm] = useState({
    farmer_name: user?.full_name || 'Mohammad Rahim',
    district: 'Bogura',
    soil_type: 'Loam',
    land_acres: 2.5,
    budget_bdt: 80000,
    experience: 'Intermediate',
    planting_month: new Date().getMonth() + 1
  })
  const [profileForm, setProfileForm] = useState({
    name_en: user?.name_en || '',
    name_bn: user?.name_bn || '',
    district: user?.district || 'Dhaka',
    mobile_number: user?.mobile_number || '',
  })
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileEditMode, setProfileEditMode] = useState(false)

  const [products, setProducts] = useState([])
  const [productsLoading, setProductsLoading] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [editingProduct, setEditingProduct] = useState(null)
  const [productForm, setProductForm] = useState(BLANK_PRODUCT)
  const [savingProduct, setSavingProduct] = useState(false)

  // ── Add/Edit Product modal-এর ভিতরের AI Price Suggestion ──
  const [aiCropType, setAiCropType] = useState(AI_PRICE_CROPS[0])
  const [aiPriceLoading, setAiPriceLoading] = useState(false)
  const [aiPriceSuggestion, setAiPriceSuggestion] = useState(null)

  const [orders, setOrders] = useState([])
  const [ordersLoading, setOrdersLoading] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [orderFilter, setOrderFilter] = useState('all')

  const fetchAI = useCallback(async () => {
    setAiLoading(true)
    try {
      const [priceRes, demandRes] = await Promise.all([
        getPricePrediction(crop, district, 7),
        getDemandForecast(crop, district, 7),
      ])
      setPriceData(priceRes.data)
      setDemandData(demandRes.data)
      toast.success('AI predictions updated!')
    } catch {
      toast.error('AI API Error — Make sure FastAPI is running on port 8000')
    } finally { setAiLoading(false) }
  }, [crop, district])

  const fetchProducts = useCallback(async () => {
    setProductsLoading(true)
    try {
      const res = await getMyProducts()
      setProducts(res.data || [])
    } catch {
      toast.error('Could not load your products')
    } finally { setProductsLoading(false) }
  }, [])

  const fetchOrders = useCallback(async () => {
    setOrdersLoading(true)
    try {
      const res = await getMyOrders()
      setOrders(res.data || [])
    } catch {
      toast.error('Could not load your orders')
    } finally { setOrdersLoading(false) }
  }, [])

  useEffect(() => { fetchAI() }, [fetchAI])
  useEffect(() => { fetchProducts() }, [fetchProducts])
  useEffect(() => { fetchOrders() }, [fetchOrders])

  const activeListings = products.filter(p => p.is_available !== false).length
  const pendingOrders = orders.filter(o => ['placed', 'pending'].includes(o.status?.toLowerCase())).length
  const totalEarnings = orders
    .filter(o => o.status?.toLowerCase() === 'delivered')
    .reduce((sum, o) => sum + (o.farmer_amount || o.total_amount || 0), 0)

  const priceChartData = priceData?.forecasts?.map(f => ({
    date: f.date.slice(5),
    price: f.predicted_price,
    low: f.lower_bound,
    high: f.upper_bound,
  })) || []

  const demandChartData = demandData?.forecasts?.map(f => ({
    date: f.date.slice(5),
    demand: f.predicted_demand,
  })) || []

  // productForm.title_en থেকে সবচেয়ে কাছাকাছি AI-supported crop অনুমান করে
  // (যেমন "Fresh Tomato" টাইটেল দিলে "Tomato" ধরে নেবে) — না মিললে প্রথমটা।
  const guessAiCrop = (title) => {
    if (!title) return AI_PRICE_CROPS[0]
    const lower = title.toLowerCase()
    return AI_PRICE_CROPS.find(c => lower.includes(c.toLowerCase())) || AI_PRICE_CROPS[0]
  }

  const openAddModal = () => {
    setEditingProduct(null)
    setProductForm(BLANK_PRODUCT)
    setAiCropType(AI_PRICE_CROPS[0])
    setAiPriceSuggestion(null)
    setShowModal(true)
  }

  const openEditModal = (product) => {
    setEditingProduct(product)
    setProductForm({
      title_en: product.title_en || '',
      title_bn: product.title_bn || '',
      category: product.category || 'Vegetable',
      description_en: product.description_en || '',
      quantity_kg: product.quantity_kg,
      unit_price_bdt: product.unit_price_bdt,
      quality_grade: product.quality_grade || 'A',
      district: product.district,
      is_organic: product.is_organic || false,
      harvest_date: product.harvest_date || '',
      availability_until: product.availability_until || '',
      image_url: product.image_url || '',
    })
    setAiCropType(guessAiCrop(product.title_en))
    setAiPriceSuggestion(null)
    setShowModal(true)
  }

  const handleGetAiPrice = async () => {
    setAiPriceLoading(true)
    setAiPriceSuggestion(null)
    try {
      const { data } = await getPricePrediction(aiCropType, productForm.district, 7)
      setAiPriceSuggestion(data)
    } catch (e) {
      toast.error(e?.response?.data?.detail || T('AI price prediction failed', 'AI প্রাইস প্রেডিকশন ব্যর্থ হয়েছে'))
    } finally {
      setAiPriceLoading(false)
    }
  }

  const handleSaveProduct = async () => {
    if (!productForm.title_en || !productForm.quantity_kg || !productForm.unit_price_bdt) {
      toast.error('Title, quantity, and price are required')
      return
    }
    setSavingProduct(true)
    try {
      // ── ৪২২ এরর ফিক্স: Multipart FormData তৈরি করা হচ্ছে ──
      const formData = new FormData()

      // ১. সাধারণ টেক্সট এবং নাম্বার ডেটা অ্যাপেন্ড করা হচ্ছে
      formData.append('title_en', productForm.title_en)
      formData.append('title_bn', productForm.title_bn || '')
      formData.append('category', productForm.category)
      formData.append('description_en', productForm.description_en || '')
      formData.append('quantity_kg', Number(productForm.quantity_kg))
      formData.append('unit_price_bdt', Number(productForm.unit_price_bdt))
      formData.append('quality_grade', productForm.quality_grade)
      formData.append('district', productForm.district)
      formData.append('is_organic', productForm.is_organic ? 'true' : 'false') // FormData-তে বুলিয়ান স্ট্রিং করে পাঠাতে হয়

      const harvestDate = productForm.harvest_date || new Date().toISOString()
      const availabilityUntil = productForm.availability_until || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      formData.append('harvest_date', harvestDate)
      formData.append('availability_until', availabilityUntil)

      if (productForm.image_file) {
        formData.append('file', productForm.image_file)
      } else if (productForm.image_url) {
        formData.append('image_url', productForm.image_url)
      }

      if (editingProduct) {
        await updateProduct(editingProduct.product_id, formData) 
        toast.success('Product updated!')
      } else {
        await createProduct(formData) 
        toast.success('Product listed!')
      }
      setShowModal(false)
      fetchProducts()
    }  catch (e) {
      console.error("Full Submit Error:", e);

      let errorMsg = 'Failed to save product';

      if (e?.response?.data?.detail) {
        const detail = e.response.data.detail;

        if (typeof detail === 'string') {
          errorMsg = detail;
        } else if (Array.isArray(detail) && detail[0]?.msg) {
          errorMsg = `${detail[0].loc?.join('.') || 'Error'}: ${detail[0].msg}`;
        } else if (typeof detail === 'object') {
          errorMsg = JSON.stringify(detail);
        }
      }

      toast.error(errorMsg);
    } finally {
    setSavingProduct(false);
  }

}

const handleDeleteProduct = async (id) => {
  if (!window.confirm('Delete this listing?')) return
  try {
    await deleteProduct(id)
    toast.success('Listing deleted')
    fetchProducts()
  } catch {
    toast.error('Could not delete listing')
  }
}

const handleOrderStatus = async (orderId, newStatus) => {
  try {
    await updateOrderStatus(orderId, newStatus)
    toast.success(`Order marked as ${newStatus}`)
    fetchOrders()
  } catch {
    toast.error('Could not update order status')
  }
}

const fetchRecommendations = async () => {
  setAiLoading(true)
  try {
    const res = await getCropRecommendation(recForm)
    setRecData(res.data)
    toast.success('Crop recommendations ready!')
  } catch {
    toast.error('Failed to get recommendations')
  } finally { setAiLoading(false) }
}

// ── Filter orders ────────────────────────────────────────────
const filteredOrders = orderFilter === 'all'
  ? orders
  : orders.filter(o => o.status?.toLowerCase() === orderFilter)

const orderCounts = {
  all: orders.length,
  placed: orders.filter(o => ['placed', 'pending'].includes(o.status?.toLowerCase())).length,
  confirmed: orders.filter(o => o.status?.toLowerCase() === 'confirmed').length,
  shipped: orders.filter(o => o.status?.toLowerCase() === 'shipped').length,
  delivered: orders.filter(o => o.status?.toLowerCase() === 'delivered').length,
  cancelled: orders.filter(o => o.status?.toLowerCase() === 'cancelled').length,
}

// ════════════════════════════════════════════════════════════
return (
  <div className="page" style={{ padding: 0 }}>

    {/* ── Sidebar + Content Layout (full height) ── */}
    <div className="dashboard-layout">
      <Sidebar
        title="Farmer Menu"
        subtitle="AgroMitra"
        activeTab={activeTab}
        onTabChange={setActiveTab}
        tabs={[
          { key: 'overview',   icon: '📊', label: T('overview') },
          { key: 'price',      icon: '🤖', label: T('priceAI') },
          { key: 'demand',     icon: '📈', label: T('demandAI') },
          { key: 'recommend',  icon: '🌱', label: T('cropAI') },
          { key: 'listings',   icon: '📦', label: T('myListings') },
          { key: 'orders',     icon: '🛒', label: T('orders'), badge: pendingOrders > 0 ? pendingOrders : null },
          { key: 'profile',    icon: '👤', label: T('profile') },
          { key: 'settings',   icon: '⚙️', label: T('settings') },
        ]}
      />
      <div className="dashboard-content">

        {/* ── Header ── */}
        <div className="page-header flex justify-between">
          <div>
            <div className="page-title">{T('farmerDashTitle')}</div>
            <div className="page-subtitle">
              {T('welcomeFarmer')}, {user?.name_en || user?.full_name || 'Farmer'} — {T('farmerDashSub')}
            </div>
          </div>
          <div className="flex gap-8">
            <select className="form-select" style={{ width: 140 }} value={crop}
              onChange={e => setCrop(e.target.value)}>
              {CROPS.map(c => <option key={c}>{c}</option>)}
            </select>
            <select className="form-select" style={{ width: 140 }} value={district}
              onChange={e => setDistrict(e.target.value)}>
              {DISTRICTS.map(d => <option key={d}>{d}</option>)}
            </select>
            <button className="btn btn-primary" onClick={fetchAI} disabled={aiLoading}>
              {aiLoading ? '⏳' : '🔄'} Refresh AI
            </button>
          </div>
        </div>

        {/* ── Stats ── */}
        <div className="stats-grid">
          {[
            { icon: '📦', label: T('activeListings'), val: productsLoading ? '…' : activeListings, change: T('activeListings'), color: '#E8F5E9', border: '#2E7D32' },
            { icon: '🛒', label: T('pendingOrders'), val: ordersLoading ? '…' : pendingOrders, change: `${orders.length} ${T('totalOrders')}`, color: '#E3F2FD', border: '#1976D2' },
            { icon: '💰', label: T('totalEarningsStat'), val: ordersLoading ? '…' : `৳${totalEarnings.toLocaleString()}`, change: T('fromDelivered'), color: '#FFF3E0', border: '#E65100' },
            { icon: '⭐', label: T('trustScore'), val: '87/100', change: T('verified'), color: '#F3E5F5', border: '#6A1B9A' },
          ].map((s, i) => (
            <div key={i} className="stat-card" style={{ borderLeftColor: s.border }}>
              <div className="stat-icon" style={{ background: s.color }}>{s.icon}</div>
              <div className="stat-info">
                <div className="stat-value">{s.val}</div>
                <div className="stat-label">{s.label}</div>
                <div className="stat-change up">{s.change}</div>
              </div>
            </div>
          ))}
        </div>
    {/* ════ Overview Tab ════ */}
    {activeTab === 'overview' && (
      <div>

        {/* ── Profile + Quick Actions ── */}
        <div className="grid-1" style={{ marginBottom: 20 }}>
          <div className="card">
            <div className="card-title">⚡ Quick Actions</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              {[
                { icon: '➕', label: T('addListing'), action: () => { openAddModal() }, color: '#E8F5E9', border: '#2E7D32', text: '#2E7D32' },
                { icon: '🛒', label: `${pendingOrders} ${T('pendingOrders')}`, action: () => setActiveTab('orders'), color: pendingOrders > 0 ? '#FFF3E0' : '#F5F5F5', border: pendingOrders > 0 ? '#E65100' : '#E0E0E0', text: pendingOrders > 0 ? '#E65100' : '#9E9E9E' },
                { icon: '📦', label: T('myListings'), action: () => setActiveTab('listings'), color: '#E3F2FD', border: '#1976D2', text: '#1976D2' },
                { icon: '🤖', label: T('cropAI'), action: () => setActiveTab('recommend'), color: '#F3E5F5', border: '#6A1B9A', text: '#6A1B9A' },
              ].map((a, i) => (
                <button key={i} onClick={a.action} style={{
                  background: a.color, border: `2px solid ${a.border}`,
                  borderRadius: 8, padding: '12px 8px', cursor: 'pointer',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                  transition: 'all 0.2s', fontWeight: 600, color: a.text, fontSize: 13
                }}
                  onMouseOver={e => e.currentTarget.style.transform = 'translateY(-2px)'}
                  onMouseOut={e => e.currentTarget.style.transform = 'translateY(0)'}
                >
                  <span style={{ fontSize: 22 }}>{a.icon}</span>
                  {a.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Low Stock Alert ── */}
        {products.filter(p => p.quantity_kg < 50 && p.is_available !== false).length > 0 && (
          <div className="alert alert-warning" style={{ marginBottom: 20 }}>
            ⚠️ <strong>Low Stock Alert:</strong>{' '}
            {products
              .filter(p => p.quantity_kg < 50 && p.is_available !== false)
              .map(p => `${p.title_en} (${p.quantity_kg} kg)`)
              .join(', ')
            } — consider restocking soon.
          </div>
        )}

        {/* ── Pending Orders Alert ── */}
        {pendingOrders > 0 && (
          <div className="alert alert-info" style={{ marginBottom: 20, cursor: 'pointer' }}
            onClick={() => setActiveTab('orders')}>
            🛒 {lang === 'bn' ? `আপনার` : 'You have'} <strong>{pendingOrders}</strong> {T('newOrderAlert')}{'  '}
            <span style={{ color: 'var(--blue)', fontWeight: 700, cursor: 'pointer' }} onClick={() => setActiveTab('orders')}>{T('viewOrders')}</span>
          </div>
        )}

        {/* ── AI Market Intelligence ── */}
        <div className="ai-section" style={{ marginBottom: 20 }}>
          <div className="ai-section-title">🤖 AI Market Intelligence</div>
          <div className="ai-section-sub">
            {CROP_EMOJIS[crop] || '🌿'} {crop} in {district} — Prophet + XGBoost + LSTM
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 16 }}>
            {priceData && [
              { label: T('currentPrice'), val: `৳${priceData.current_price}/kg`, icon: '💰' },
              { label: '7-Day Avg', val: `৳${priceData.summary?.avg_7day_price}/kg`, icon: '📊' },
              { label: T('marketOutlook'), val: priceData.summary?.market_outlook || '—', icon: '📈' },
              { label: 'Trend', val: `${(priceData.summary?.trend_pct || 0) > 0 ? '↑' : '↓'} ${Math.abs(priceData.summary?.trend_pct || 0).toFixed(1)}%`, icon: '📉' },
            ].map((item, i) => (
              <div key={i} style={{ background: 'rgba(255,255,255,0.12)', borderRadius: 8, padding: 16 }}>
                <div style={{ fontSize: 13, opacity: 0.8 }}>{item.icon} {item.label}</div>
                <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4 }}>{item.val}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Charts + Recent Activity ── */}
        <div className="grid-2" style={{ marginBottom: 20 }}>
          <div className="card">
            <div className="card-title">💰 Price Forecast (7 Days)</div>
            {aiLoading
              ? <div className="spinner-box"><div className="spinner" /><span>Loading…</span></div>
              : <ResponsiveContainer width="100%" height={200}>
                <LineChart data={priceChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F0" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip formatter={v => [`৳${v}`, 'Price']} />
                  <Line type="monotone" dataKey="price" stroke="#2E7D32" strokeWidth={2.5} dot={{ r: 4 }} />
                  <Line type="monotone" dataKey="high" stroke="#A5D6A7" strokeWidth={1} strokeDasharray="4 4" dot={false} />
                  <Line type="monotone" dataKey="low" stroke="#FFCC80" strokeWidth={1} strokeDasharray="4 4" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            }
          </div>

          {/* Recent Activity Feed */}
          <div className="card">
            <div className="card-title">🕐 Recent Activity</div>
            {ordersLoading ? (
              <div className="spinner-box"><div className="spinner" /></div>
            ) : orders.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 30, color: 'var(--gray)', fontSize: 14 }}>
                No activity yet
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {orders.slice(0, 5).map((o, i) => {
                  const cfg = STATUS_CONFIG[o.status?.toLowerCase()] || STATUS_CONFIG.pending
                  const items = o.items || []
                  const firstItem = items[0]
                  const totalKg = items.reduce((sum, it) => sum + Number(it.quantity_kg || 0), 0)
                  const label = items.length > 1
                    ? `${firstItem?.product_name || 'Product'} + ${items.length - 1} more`
                    : `${firstItem?.product_name || 'Product'} × ${totalKg} kg`
                  return (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '10px 12px', borderRadius: 8,
                      background: '#F8FAFC', cursor: 'pointer',
                      border: '1px solid #EEF0F2'
                    }}
                      onClick={() => { setSelectedOrder(o) }}
                    >
                      <span style={{ fontSize: 20 }}>
                        {CROP_EMOJIS[firstItem?.product_name?.split(' ').find(w => CROP_EMOJIS[w])] || '🌿'}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {label}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--gray)' }}>
                          {o.buyer_name || 'Buyer'} · {fmtDate(o.created_at)}
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
                        <span className={cfg.cls} style={{ fontSize: 11 }}>{cfg.icon} {cfg.label}</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--green-dark)' }}>
                          ৳{(o.farmer_amount || o.total_amount)?.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  )
                })}
                {orders.length > 5 && (
                  <button className="btn btn-secondary btn-sm" onClick={() => setActiveTab('orders')}
                    style={{ alignSelf: 'center', marginTop: 4 }}>
                    View all {orders.length} orders →
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Earnings Chart ── */}
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-title">💹 Earnings Overview</div>
          {(() => {
            // orders-এর প্রতিটা item থেকে per-product earnings বানাও
            // (একটা order-এ একাধিক product থাকতে পারে, তাই order নয়, item ধরে group করা হচ্ছে)
            const earningsByProduct = {}
            orders
              .filter(o => o.status?.toLowerCase() === 'delivered')
              .forEach(o => {
                (o.items || []).forEach(item => {
                  const name = item.product_name || 'Unknown'
                  earningsByProduct[name] = (earningsByProduct[name] || 0) + (item.subtotal || 0)
                })
              })
            const chartData = Object.entries(earningsByProduct)
              .map(([name, amount]) => ({ name, amount: Math.round(amount) }))
              .sort((a, b) => b.amount - a.amount)
              .slice(0, 6)

            if (chartData.length === 0) return (
              <div style={{ textAlign: 'center', padding: 30, color: 'var(--gray)', fontSize: 14 }}>
                Earnings chart will appear after first delivered order.
              </div>
            )
            return (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F0" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip formatter={v => [`৳${v.toLocaleString()}`, 'Earnings']} />
                  <Bar dataKey="amount" fill="#2E7D32" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )
          })()}
        </div>

        {/* ── Demand chart + Advisory ── */}
        <div className="grid-2">
          <div className="card">
            <div className="card-title">📊 Demand Forecast (7 Days)</div>
            {aiLoading
              ? <div className="spinner-box"><div className="spinner" /><span>Loading…</span></div>
              : <ResponsiveContainer width="100%" height={200}>
                <BarChart data={demandChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F0" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip formatter={v => [`${v} kg`, 'Demand']} />
                  <Bar dataKey="demand" fill="#0a987e" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            }
          </div>

          {/* Order Summary Card */}
          <div className="card">
            <div className="card-title">📈 Order Summary</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                { label: T('totalOrdersLabel'), val: orders.length, color: '#546E7A', bg: '#F5F5F5' },
                { label: 'New (Placed)', val: orderCounts.placed, color: '#E65100', bg: '#FFF3E0' },
                { label: 'Confirmed', val: orderCounts.confirmed, color: '#1976D2', bg: '#E3F2FD' },
                { label: 'Shipped', val: orderCounts.shipped, color: '#1976D2', bg: '#E3F2FD' },
                { label: 'Delivered', val: orderCounts.delivered, color: '#2E7D32', bg: '#E8F5E9' },
                { label: T('totalEarningsStat'), val: `৳${totalEarnings.toLocaleString()}`, color: '#2E7D32', bg: '#E8F5E9' },
              ].map((s, i) => (
                <div key={i} style={{
                  display: 'flex', justifyContent: 'space-between',
                  alignItems: 'center', padding: '8px 12px',
                  background: s.bg, borderRadius: 8
                }}>
                  <span style={{ fontSize: 13, color: 'var(--gray)' }}>{s.label}</span>
                  <strong style={{ color: s.color }}>{s.val}</strong>
                </div>
              ))}
            </div>
          </div>
        </div>

        {demandData && (
          <div className="alert alert-success mt-16">
            💡 <strong>AgroMitra Advisory:</strong> {demandData.summary?.farmer_advisory}
          </div>
        )}
      </div>
    )}

    {/* ════ Price AI Tab ════ */}
    {activeTab === 'price' && (
      <div className="grid-2">
        <div className="card">
          <div className="card-title">🤖 7-Day Price Forecast — {CROP_EMOJIS[crop] || '🌿'} {crop}</div>
          <div className="table-container">
            <table>
              <thead><tr><th>Date</th><th>Predicted Price</th><th>Range</th><th>Trend</th></tr></thead>
              <tbody>
                {priceData?.forecasts?.map((f, i) => (
                  <tr key={i}>
                    <td>{f.date}</td>
                    <td><strong style={{ color: '#2E7D32' }}>৳{f.predicted_price}/kg</strong></td>
                    <td style={{ color: '#546E7A', fontSize: 13 }}>৳{f.lower_bound} – ৳{f.upper_bound}</td>
                    <td><span className={`badge ${f.trend?.includes('↑') ? 'badge-green' : f.trend?.includes('↓') ? 'badge-orange' : 'badge-blue'}`}>{f.trend}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="card">
          <div className="card-title">📈 Price Trend Chart</div>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={priceChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F0" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={v => [`৳${v}/kg`, 'Price']} />
              <Line type="monotone" dataKey="price" stroke="#2E7D32" strokeWidth={3} dot={{ r: 5, fill: '#2E7D32' }} />
              <Line type="monotone" dataKey="high" stroke="#A5D6A7" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
              <Line type="monotone" dataKey="low" stroke="#FFCC80" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
            </LineChart>
          </ResponsiveContainer>
          {priceData && (
            <div className={`alert ${(priceData.summary?.trend_pct || 0) > 0 ? 'alert-success' : 'alert-warning'} mt-16`}>
              📊 {priceData.summary?.market_outlook}
            </div>
          )}
        </div>
      </div>
    )}

    {/* ════ Demand AI Tab ════ */}
    {activeTab === 'demand' && (
      <div className="grid-2">
        <div className="card">
          <div className="card-title">📊 Demand Forecast Table</div>
          <div className="table-container">
            <table>
              <thead><tr><th>Date</th><th>Predicted Demand</th><th>Range</th><th>Signal</th></tr></thead>
              <tbody>
                {demandData?.forecasts?.map((f, i) => (
                  <tr key={i}>
                    <td>{f.date}</td>
                    <td><strong>{f.predicted_demand?.toLocaleString()} kg</strong></td>
                    <td style={{ color: '#546E7A', fontSize: 13 }}>{f.lower_bound?.toLocaleString()} – {f.upper_bound?.toLocaleString()}</td>
                    <td><span className={`badge ${f.market_signal?.includes('High') ? 'badge-green' : f.market_signal?.includes('Low') ? 'badge-red' : 'badge-blue'}`}>{f.market_signal}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="card">
          <div className="card-title">📈 Demand Chart</div>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={demandChartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={v => [`${v} kg`, 'Demand']} />
              <Bar dataKey="demand" fill="#1976D2" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          {demandData && (
            <div className="alert alert-info mt-16">
              💡 {demandData.summary?.farmer_advisory}
            </div>
          )}
        </div>
      </div>
    )}

    {/* ════ Crop AI Tab ════ */}
    {activeTab === 'recommend' && (
      <div className="grid-2">
        <div className="card">
          <div className="card-title">🌱 Your Farm Profile</div>
          {[
            ['farmer_name', T('yourName'), 'text'],
            ['land_acres', 'Land (acres)', 'number'],
            ['budget_bdt', 'Budget (৳)', 'number'],
          ].map(([field, label, type]) => (
            <div className="form-group" key={field}>
              <label className="form-label">{label}</label>
              <input className="form-input" type={type} value={recForm[field]}
                onChange={e => setRecForm({ ...recForm, [field]: type === 'number' ? Number(e.target.value) : e.target.value })} />
            </div>
          ))}
          {[
            ['district', 'District', DISTRICTS],
            ['soil_type', T('soilType'), [T('soilTypeLoam'), T('soilTypeSandy'), T('soilTypeClayLoam'), T('soilTypeClay')]],
            ['experience', 'Experience', ['Beginner', 'Intermediate', 'Expert']],
          ].map(([field, label, opts]) => (
            <div className="form-group" key={field}>
              <label className="form-label">{label}</label>
              <select className="form-select" value={recForm[field]}
                onChange={e => setRecForm({ ...recForm, [field]: e.target.value })}>
                {opts.map(o => <option key={o}>{o}</option>)}
              </select>
            </div>
          ))}
          <button className="btn btn-primary btn-full" onClick={fetchRecommendations} disabled={aiLoading}>
            {aiLoading ? '⏳ Analyzing…' : '🌱 Get AI Recommendations'}
          </button>
        </div>
        <div>
          {recData ? (
            <div>
              <div className="alert alert-success mb-20">
                🏆 Top Pick: <strong>{recData.top_pick?.crop}</strong> ({recData.top_pick?.name_bn}) — Score: {recData.top_pick?.score}/100
              </div>
              {recData.recommendations?.map((r, i) => (
                <div key={i} className="rec-card mb-20">
                  <div className="flex justify-between flex-center">
                    <div>
                      <div className="rec-rank">#{r.rank}</div>
                      <div className="rec-crop">{CROP_EMOJIS[r.crop] || '🌿'} {r.crop}</div>
                      <div className="rec-crop-bn">{r.name_bn}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 28, fontWeight: 800, color: '#2E7D32' }}>{r.score}</div>
                      <div style={{ fontSize: 12, color: '#546E7A' }}>/ 100</div>
                    </div>
                  </div>
                  <div className="rec-score-bar">
                    <div className="rec-score-fill" style={{ width: `${r.score}%` }} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 13 }}>
                    <div>💰 Est. Profit: <strong style={{ color: '#2E7D32' }}>৳{r.est_profit_bdt?.toLocaleString()}</strong></div>
                    <div>⏱️ Duration: <strong>{r.grow_days} days</strong></div>
                    <div>⚠️ Risk: <span className={`badge ${r.risk_level === 'Low' ? 'badge-green' : r.risk_level === 'Medium' ? 'badge-gold' : 'badge-red'}`}>{r.risk_level}</span></div>
                    <div>📊 Demand: <span className="badge badge-blue">{r.market_demand}</span></div>
                  </div>
                  <div className="alert alert-success mt-16" style={{ padding: '8px 12px', fontSize: 13 }}>{r.advisory}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="card" style={{ textAlign: 'center', padding: 40 }}>
              <div style={{ fontSize: 64, marginBottom: 16 }}>🌱</div>
              <div style={{ fontSize: 18, fontWeight: 600, color: '#546E7A' }}>Fill your profile and click</div>
              <div style={{ fontSize: 15, color: '#9E9E9E', marginTop: 8 }}>"Get AI Recommendations"</div>
            </div>
          )}
        </div>
      </div>
    )}

    {/* ════ My Listings Tab ════ */}
    {activeTab === 'listings' && (
      <div>
        <div className="flex justify-between mb-20">
          <div className="section-title">📦 My Product Listings</div>
          <button className="btn btn-primary" onClick={openAddModal}>{T('addProduct')}</button>
        </div>
        {productsLoading ? (
          <div className="spinner-box"><div className="spinner" /><span>Loading products…</span></div>
        ) : products.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: 40 }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>📦</div>
            <div style={{ fontSize: 16, color: '#546E7A' }}>No listings yet</div>
            <button className="btn btn-primary mt-16" onClick={openAddModal}>{T('addProduct')}</button>
          </div>
        ) : (
          <div className="card">
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Crop</th><th>Quantity</th><th>Price/kg</th>
                    <th>District</th><th>Organic</th><th>Status</th><th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map(p => (
                    <tr key={p.id}>
                      <td><strong>{p.title_en}</strong>{p.title_bn && <div style={{ fontSize: 11, color: '#888' }}>{p.title_bn}</div>}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          {p.image_url ? (
                            <img
                              src={resolveImageUrl(p.image_url)}
                              alt={p.title_en}
                              style={{ width: 40, height: 40, borderRadius: 6, objectFit: 'cover', border: '1px solid #E2E8F0' }}
                            />
                          ) : (
                            <div style={{ width: 40, height: 40, borderRadius: 6, background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>
                              {CROP_EMOJIS[p.title_en] || '🌾'}
                            </div>
                          )}
                          <div>
                            <div style={{ fontWeight: 600 }}>{p.title_en}</div>
                            <div style={{ fontSize: 11, color: 'var(--gray)' }}>{p.title_bn}</div>
                          </div>
                        </div>
                      </td>
                      <td>{p.quantity_kg?.toLocaleString()} kg</td>
                      <td style={{ color: '#2E7D32', fontWeight: 600 }}>৳{p.unit_price_bdt}</td>
                      <td>{p.district}</td>
                      <td>{p.is_organic ? '✅ Yes' : '—'}</td>
                      <td>
                        <span className={`badge ${p.is_available !== false ? 'badge-green' : 'badge-orange'}`}>
                          {p.is_available !== false ? 'Active' : 'Unavailable'}
                        </span>
                      </td>
                      <td style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-sm btn-secondary" onClick={() => openEditModal(p)}>Edit</button>
                        <button className="btn btn-sm" style={{ background: '#FFEBEE', color: '#C62828', border: 'none' }}
                          onClick={() => handleDeleteProduct(p.id)}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    )}

    {/* ════ Orders Table ════ */}
    {activeTab === 'orders' && (
      <div>
        <div className="flex justify-between mb-20">
          <div className="section-title">🛒 Incoming Orders</div>
          <button className="btn btn-secondary" onClick={fetchOrders}>🔄 Refresh</button>
        </div>

        {/* Status filter pills */}
        <div className="fd-order-filters">
          {[
            ['all', 'All'],
            ['placed', 'New'],
            ['confirmed', 'Confirmed'],
            ['shipped', 'Shipped'],
            ['delivered', 'Delivered'],
            ['cancelled', 'Cancelled'],
          ].map(([key, label]) => (
            <button
              key={key}
              className={`fd-filter-pill ${orderFilter === key ? 'fd-filter-pill--active' : ''}`}
              onClick={() => setOrderFilter(key)}
            >
              {label}
              {orderCounts[key] > 0 && (
                <span className="fd-filter-count">{orderCounts[key]}</span>
              )}
            </button>
          ))}
        </div>

        {ordersLoading ? (
          <div className="spinner-box"><div className="spinner" /><span>Loading orders…</span></div>
        ) : filteredOrders.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: 40 }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🛒</div>
            <div style={{ fontSize: 16, color: '#546E7A' }}>No orders in this category</div>
          </div>
        ) : (
          <div className="card">
            <div className="table-container">
              <table className="fd-orders-table">
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Date</th>
                    <th>Product</th>
                    <th>Qty</th>
                    <th>You Receive</th>
                    <th>Payment</th>
                    <th>Delivery</th>
                    <th>Address</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.map(o => {
                    const statusCfg = STATUS_CONFIG[o.status?.toLowerCase()] || STATUS_CONFIG.pending
                    const items = o.items || []
                    const firstItem = items[0]
                    const totalKg = items.reduce((sum, it) => sum + Number(it.quantity_kg || 0), 0)
                    return (
                      <tr key={o.order_id} className="fd-order-row"
                        onClick={() => setSelectedOrder(o)}
                        title="Click to view details">
                        <td>
                          <span className="fd-order-id">#{o.order_id?.slice(-6)}</span>
                        </td>
                        <td>
                          <div className="fd-date-cell">
                            <span>{fmtDate(o.created_at)}</span>
                            <span className="fd-time">{fmtTime(o.created_at)}</span>
                          </div>
                        </td>
                        <td>
                          <strong>
                            {CROP_EMOJIS[firstItem?.product_name?.split(' ').find(w => CROP_EMOJIS[w])] || '🌿'}{' '}
                            {items.length > 1
                              ? `${firstItem?.product_name || 'Product'} + ${items.length - 1} more`
                              : (firstItem?.product_name || `#${o.order_id?.slice(-6)}`)}
                          </strong>
                          {items.length === 1 && firstItem?.product_name_bn && (
                            <div style={{ fontSize: 11, color: '#888' }}>{firstItem.product_name_bn}</div>
                          )}
                        </td>
                        <td><strong>{totalKg} kg</strong></td>
                        <td>
                          <span className="fd-earn">৳{(o.farmer_amount || o.total_amount)?.toLocaleString()}</span>
                          {o.platform_fee > 0 && (
                            <div className="fd-fee">fee: ৳{o.platform_fee}</div>
                          )}
                        </td>
                        <td>
                          <span className="fd-payment">
                            {PAYMENT_ICONS[o.payment_method] || '💳'} {o.payment_method?.replace('_', ' ')}
                          </span>
                        </td>
                        <td>
                          <span>{o.delivery_type === 'pickup' ? '📦 Pickup' : '🚚 Delivery'}</span>
                        </td>
                        <td>
                          <span className="fd-address" title={o.delivery_address}>
                            {o.delivery_address
                              ? o.delivery_address.length > 20
                                ? o.delivery_address.slice(0, 20) + '…'
                                : o.delivery_address
                              : '—'}
                          </span>
                        </td>
                        <td onClick={e => e.stopPropagation()}>
                          <span className={statusCfg.cls}>{statusCfg.icon} {statusCfg.label}</span>
                        </td>
                        <td onClick={e => e.stopPropagation()}>
                          <div className="fd-action-btns">
                            {['placed', 'pending'].includes(o.status?.toLowerCase()) && (
                              <>
                                <button className="fd-action-btn fd-action-btn--confirm"
                                  onClick={() => handleOrderStatus(o.order_id, 'confirmed')}>✅</button>
                                <button className="fd-action-btn fd-action-btn--cancel"
                                  onClick={() => handleOrderStatus(o.order_id, 'cancelled')}>✕</button>
                              </>
                            )}
                            {o.status?.toLowerCase() === 'confirmed' && (
                              <button className="fd-action-btn fd-action-btn--ship"
                                onClick={() => handleOrderStatus(o.order_id, 'shipped')}>🚚</button>
                            )}
                            {o.status?.toLowerCase() === 'shipped' && (
                              <button className="fd-action-btn fd-action-btn--deliver"
                                onClick={() => handleOrderStatus(o.order_id, 'delivered')}>📦</button>
                            )}
                            {['delivered', 'cancelled'].includes(o.status?.toLowerCase()) && (
                              <span style={{ color: '#9E9E9E', fontSize: 12 }}>—</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="fd-table-hint">💡 Click any row to see full order details</div>
          </div>
        )}
      </div>
    )}

    {/* ════ Profile Tab ════ */}
    {activeTab === 'profile' && (
      <div style={{ maxWidth: 600, margin: '0 auto' }}>

        {/* Profile Header Card */}
        <div className="card" style={{ textAlign: 'center', padding: 32, marginBottom: 20 }}>
          {/* Profile Photo */}
          <div style={{ position: 'relative', width: 88, height: 88, margin: '0 auto 16px' }}>
            {user?.profile_photo_url ? (
              <img
                src={resolveImageUrl(user.profile_photo_url)}
                alt="Profile"
                style={{
                  width: 88, height: 88, borderRadius: '50%',
                  objectFit: 'cover', border: '3px solid var(--green-light)'
                }}
              />
            ) : (
              <div style={{
                width: 88, height: 88, borderRadius: '50%',
                background: 'var(--green-pale)', fontSize: 44,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: '3px solid var(--green-light)'
              }}>👨‍🌾</div>
            )}

            {/* Upload button */}
            <label style={{
              position: 'absolute', bottom: 0, right: 0,
              width: 28, height: 28, borderRadius: '50%',
              background: 'var(--green)', color: 'white',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', fontSize: 14, boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
              border: '2px solid white'
            }}>
              <span>📷</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                style={{ display: 'none' }}
                onChange={async (e) => {
                  const file = e.target.files[0]
                  if (!file) return
                  try {
                    toast.loading('Uploading photo...')
                    const res = await uploadProfilePhoto(file)
                    const updatedUser = { ...user, profile_photo_url: res.data.photo_url }
                    sessionStorage.setItem('agromitra_user', JSON.stringify(updatedUser))
                    setUser(updatedUser)
                    toast.dismiss()
                    toast.success('Profile photo updated!')
                  } catch (err) {
                    toast.dismiss()
                    console.error(err)
                    toast.error('Upload failed. Max 2MB, JPG/PNG only.')
                  }
                }}
              />
            </label>
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--green-dark)' }}>
            {user?.name_en || 'Farmer'}
          </div>
          {user?.name_bn && (
            <div style={{ fontSize: 15, color: 'var(--gray)', marginTop: 4 }}>{user.name_bn}</div>
          )}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', marginTop: 12 }}>
            <span className="badge badge-green">👨‍🌾 Farmer</span>
            {user?.district && <span className="badge badge-blue">📍 {user.district}</span>}
            {user?.is_verified
              ? <span className="badge badge-green">✅ Verified</span>
              : <span className="badge badge-orange">⏳ Not Verified</span>
            }
            <span className="badge" style={{ background: '#F3E5F5', color: '#6A1B9A' }}>
              ⭐ Trust Score: 87/100
            </span>
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
              <button className="btn btn-secondary btn-sm"
                onClick={() => setProfileEditMode(true)}>
                ✏️ Edit
              </button>
            ) : (
              <button className="btn btn-sm"
                style={{ background: '#FFEBEE', color: '#C62828', border: 'none' }}
                onClick={() => {
                  setProfileEditMode(false)
                  setProfileForm({
                    name_en: user?.name_en || '',
                    name_bn: user?.name_bn || '',
                    district: user?.district || 'Dhaka',
                    mobile_number: user?.mobile_number || '',
                  })
                }}>
                ✕ Cancel
              </button>
            )}
          </div>

          {/* View mode */}
          {!profileEditMode ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {[
                { label: 'Full Name (English)', val: user?.name_en || '—', icon: '👤' },
                { label: 'নাম (বাংলা)', val: user?.name_bn || '—', icon: '🔤' },
                { label: T('mobileNumber'), val: user?.mobile_number || '—', icon: '📱' },
                { label: 'District', val: user?.district || '—', icon: '📍' },
              ].map((f, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 14px', background: '#F8FAFC',
                  borderRadius: 8, border: '1px solid #EEF0F2'
                }}>
                  <span style={{ fontSize: 18, flexShrink: 0 }}>{f.icon}</span>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--gray)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      {f.label}
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--gray-dark)', marginTop: 2 }}>
                      {f.val}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* Edit mode */
            <div>
              <div className="form-group">
                <label className="form-label">Full Name (English) *</label>
                <input className="form-input" value={profileForm.name_en}
                  onChange={e => setProfileForm({ ...profileForm, name_en: e.target.value })}
                  placeholder="Mohammad Rahim" />
              </div>
              <div className="form-group">
                <label className="form-label">নাম (বাংলা)</label>
                <input className="form-input" value={profileForm.name_bn}
                  onChange={e => setProfileForm({ ...profileForm, name_bn: e.target.value })}
                  placeholder="মোহাম্মদ রহিম" />
              </div>
              <div className="form-group">
                <label className="form-label">Mobile Number</label>
                <input className="form-input" value={profileForm.mobile_number}
                  disabled style={{ background: '#F5F5F5', cursor: 'not-allowed' }}
                  placeholder="01711223344" />
                <div style={{ fontSize: 11, color: 'var(--gray)', marginTop: 4 }}>
                  📵 Mobile number cannot be changed
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">District</label>
                <select className="form-select" value={profileForm.district}
                  onChange={e => setProfileForm({ ...profileForm, district: e.target.value })}>
                  {DISTRICTS.map(d => <option key={d}>{d}</option>)}
                </select>
              </div>

              <button
                className="btn btn-primary btn-full"
                disabled={savingProfile}
                onClick={async () => {
                  if (!profileForm.name_en.trim()) {
                    toast.error('Name is required')
                    return
                  }
                  setSavingProfile(true)
                  try {
                    const res = await updateProfile({
                      name_en: profileForm.name_en,
                      name_bn: profileForm.name_bn,
                      mobile_number: profileForm.mobile_number,
                      district: profileForm.district,
                    })
                    // localStorage sync করো যাতে refresh-এ নতুন data থাকে
                    const updatedUser = { ...user, ...res.data }
                    localStorage.setItem('agromitra_user', JSON.stringify(updatedUser))
                    setUser(updatedUser)
                    toast.success('Profile updated successfully!')
                    setProfileEditMode(false)
                  } catch {
                    toast.error('Could not update profile')
                  } finally {
                    setSavingProfile(false)
                  }
                }}
              >
                {savingProfile ? '⏳ Saving…' : '✅ Save Changes'}
              </button>
            </div>
          )}
        </div>

        {/* Stats Summary Card */}
        <div className="card">
          <div className="card-title">📊 My Stats</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {[
              { icon: '📦', label: T('activeListings'), val: activeListings, color: '#E8F5E9', text: '#2E7D32' },
              { icon: '🛒', label: T('totalOrdersLabel'), val: orders.length, color: '#E3F2FD', text: '#1976D2' },
              { icon: '✅', label: 'Delivered', val: orderCounts.delivered, color: '#E8F5E9', text: '#2E7D32' },
              { icon: '💰', label: T('totalEarningsStat'), val: `৳${totalEarnings.toLocaleString()}`, color: '#FFF3E0', text: '#E65100' },
            ].map((s, i) => (
              <div key={i} style={{
                background: s.color, borderRadius: 10,
                padding: '16px 14px', textAlign: 'center'
              }}>
                <div style={{ fontSize: 28 }}>{s.icon}</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: s.text, marginTop: 4 }}>{s.val}</div>
                <div style={{ fontSize: 12, color: 'var(--gray)', marginTop: 2 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

      </div>
    )}

    {/* ════ Add / Edit Product Modal ════ */}
    {showModal && (
      <div className="fd-overlay">
        <div className="fd-modal">
          <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 20 }}>
            {editingProduct ? T('editProduct') : T('addProduct')}
          </div>
          <div className="form-group">
            <label className="form-label">Product Title (English) *</label>
            <input className="form-input" type="text" value={productForm.title_en}
              onChange={e => setProductForm({ ...productForm, title_en: e.target.value })}
              placeholder="e.g. Fresh Tomato" />
          </div>
          <div className="form-group">
            <label className="form-label">Product Title (বাংলা)</label>
            <input className="form-input" type="text" value={productForm.title_bn}
              onChange={e => setProductForm({ ...productForm, title_bn: e.target.value })}
              placeholder="যেমন: তাজা টমেটো" />
          </div>
          {/* ── 📸 প্রোডাক্ট ছবি আপলোড ফিল্ড ── */}
          {/* ── 📸 প্রোডাক্ট ছবি আপলোড ফিল্ড ── */}
          <div className="form-group" style={{ marginTop: 8 }}>
            <label className="form-label">Product Photo</label>

            {/* ছবি লোকালি সিলেক্ট করা থাকলে বা আগের কোনো ইমেজ থাকলে তার প্রিভিউ দেখাবে */}
            {productForm.image_url && (
              <div style={{ marginBottom: 8, position: 'relative', width: 80, height: 80 }}>
                <img
                  src={resolveImageUrl(productForm.image_url)}
                  alt="Preview"
                  style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 6, border: '1px solid #ddd' }}
                />
                <button
                  type="button"
                  style={{ position: 'absolute', top: -5, right: -5, background: '#FFEBEE', color: '#C62828', border: 'none', borderRadius: '50%', cursor: 'pointer', width: 20, height: 20, fontSize: 10 }}
                  onClick={() => setProductForm({ ...productForm, image_url: '', image_file: null })}
                >
                  ✕
                </button>
              </div>
            )}

            <input
              type="file"
              accept="image/*"
              className="form-input"
              onChange={(e) => {
                const file = e.target.files[0];
                if (!file) return;

                // লোকাল প্রিভিউ দেখানোর জন্য একটি টেম্পোরারি URL তৈরি করা হচ্ছে
                const localPreviewUrl = URL.createObjectURL(file);

                // স্টেটে ফাইল এবং প্রিভিউ URL দুটিই সেভ করে রাখা হচ্ছে
                setProductForm({
                  ...productForm,
                  image_file: file,
                  image_url: localPreviewUrl
                });

                toast.success('Photo selected!');
              }}
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">Category</label>
              <select className="form-select" value={productForm.category}
                onChange={e => setProductForm({ ...productForm, category: e.target.value })}>
                {['Vegetable', 'Fruit', 'Grain', 'Spice', 'Root'].map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Quality Grade</label>
              <select className="form-select" value={productForm.quality_grade}
                onChange={e => setProductForm({ ...productForm, quality_grade: e.target.value })}>
                {['A', 'B', 'C'].map(g => <option key={g}>{g}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">Quantity (kg) *</label>
              <input className="form-input" type="number" min="1" value={productForm.quantity_kg}
                onChange={e => setProductForm({ ...productForm, quantity_kg: e.target.value })}
                placeholder="e.g. 500" />
            </div>
            <div className="form-group">
              <label className="form-label">Price per kg (৳) *</label>
              <input className="form-input" type="number" min="1" value={productForm.unit_price_bdt}
                onChange={e => setProductForm({ ...productForm, unit_price_bdt: e.target.value })}
                placeholder="e.g. 22" />
            </div>
          </div>

          {/* ── 🤖 AI Price Suggestion ── */}
          <div className="form-group" style={{
            background: 'var(--green-pale, #E8F5E9)', borderRadius: 10, padding: 14, marginTop: 4
          }}>
            <label className="form-label" style={{ marginBottom: 8 }}>
              🤖 {T('AI Price Suggestion', 'AI প্রাইস সাজেশন')}
            </label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <select className="form-select" style={{ flex: '1 1 140px' }}
                value={aiCropType}
                onChange={e => { setAiCropType(e.target.value); setAiPriceSuggestion(null) }}>
                {AI_PRICE_CROPS.map(c => (
                  <option key={c} value={c}>{CROP_EMOJIS[c] || '🌿'} {c}</option>
                ))}
              </select>
              <button type="button" className="btn btn-secondary" style={{ flex: '0 0 auto' }}
                onClick={handleGetAiPrice} disabled={aiPriceLoading}>
                {aiPriceLoading ? T('Checking...', 'চেক হচ্ছে...') : T('Get Suggested Price', 'দাম জেনে নিন')}
              </button>
            </div>
            <div style={{ fontSize: 12, color: 'var(--gray, #546E7A)', marginTop: 6 }}>
              {T(
                `Uses ${productForm.district}'s market data — pick the crop closest to what you're listing.`,
                `${productForm.district}-এর বাজারদর অনুযায়ী — যে ফসলের সাথে সবচেয়ে মিল আছে সেটা বাছাই করুন।`
              )}
            </div>

            {aiPriceSuggestion && (
              <div style={{
                marginTop: 12, background: 'var(--bg-card, white)', borderRadius: 8,
                padding: 12, border: '1px solid var(--border-col, #C8E6C9)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--gray, #546E7A)' }}>{T('Current market price', 'বর্তমান বাজারদর')}</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--green-dark, #1B5E20)' }}>
                      ৳{aiPriceSuggestion.current_price}/kg
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--gray, #546E7A)' }}>{T('7-day AI forecast avg', '৭-দিনের AI পূর্বাভাস')}</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--green-dark, #1B5E20)' }}>
                      ৳{aiPriceSuggestion.summary.avg_forecast}/kg
                    </div>
                  </div>
                </div>
                <div style={{ fontSize: 13, marginTop: 8 }}>{aiPriceSuggestion.summary.market_outlook}</div>
                <button type="button" className="btn btn-primary btn-sm" style={{ marginTop: 10 }}
                  onClick={() => {
                    setProductForm({ ...productForm, unit_price_bdt: aiPriceSuggestion.summary.avg_forecast })
                    toast.success(T('Price applied!', 'দাম বসানো হয়েছে!'))
                  }}>
                  ✅ {T(`Use ৳${aiPriceSuggestion.summary.avg_forecast} as my price`, `৳${aiPriceSuggestion.summary.avg_forecast} দাম হিসেবে বসাও`)}
                </button>
              </div>
            )}
          </div>
          <div className="form-group">
            <label className="form-label">District</label>
            <select className="form-select" value={productForm.district}
              onChange={e => { setProductForm({ ...productForm, district: e.target.value }); setAiPriceSuggestion(null) }}>
              {DISTRICTS.map(d => <option key={d}>{d}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Description</label>
            <textarea className="form-input" rows={3} style={{ resize: 'vertical' }}
              value={productForm.description_en}
              onChange={e => setProductForm({ ...productForm, description_en: e.target.value })}
              placeholder="Fresh from farm, pesticide-free…" />
          </div>
          <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" id="is_organic" checked={productForm.is_organic}
              onChange={e => setProductForm({ ...productForm, is_organic: e.target.checked })} />
            <label htmlFor="is_organic" style={{ marginBottom: 0, cursor: 'pointer' }}>
              🌿 Organic product
            </label>
          </div>
          <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
            <button className="btn btn-primary" style={{ flex: 1 }}
              onClick={handleSaveProduct} disabled={savingProduct}>
              {savingProduct ? '⏳ Saving…' : editingProduct ? '✅ Update Listing' : '➕ Add Listing'}
            </button>
            <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
          </div>
        </div>
      </div>
    )}

    {/* ════ Order Detail Modal ════ */}
    <OrderDetailModal
      order={selectedOrder}
      onClose={() => setSelectedOrder(null)}
      onStatusUpdate={handleOrderStatus}
    />

    {/* ════ Settings Tab ════ */}
    {activeTab === 'settings' && (
      <SettingsTab userRole="farmer" />
    )}

      </div>  {/* dashboard-content */}
    </div>  {/* dashboard-layout */}

  </div>
)
}