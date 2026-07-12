import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import { getAllProducts, getMyOrders, placeOrder, getStoredUser, getFairPrice, getPricePrediction, getDemandForecast, uploadProfilePhoto, resolveImageUrl } from '../api/agromitra'
import Sidebar from '../components/Sidebar'
import SettingsTab from '../components/SettingsTab'
import { useLanguage } from '../hooks/useLanguage'
import { tr } from '../translations'

// existing code...

const CROP_EMOJIS = {
  Tomato: '🍅', Onion: '🧅', Potato: '🥔', Brinjal: '🍆',
  Cabbage: '🥬', Cauliflower: '🥦', Garlic: '🧄', Rice: '🌾',
  Ginger: '🫚', Corn: '🌽', Chili: '🌶️', Carrot: '🥕',
  Cucumber: '🥒', Pumpkin: '🎃', Spinach: '🥗', Wheat: '🌾',
}

const orderBadge = (status) => {
  const map = {
    pending: 'badge-gold',
    confirmed: 'badge-blue',
    shipped: 'badge-blue',
    delivered: 'badge-green',
    cancelled: 'badge-red',
  }
  return map[status?.toLowerCase()] || 'badge-blue'
}

export default function BuyerMarketplace() {
  const { lang } = useLanguage()
  const T = (key) => tr(key, lang)
  const [user, setUser] = useState(getStoredUser())
  const [photoKey, setPhotoKey] = useState(Date.now())

  useEffect(() => {
    const sync = () => setUser(getStoredUser())
    window.addEventListener('agromitra-auth-changed', sync)
    return () => window.removeEventListener('agromitra-auth-changed', sync)
  }, [])

  // ── Browse state ────────────────────────────────────────────
  const [products, setProducts] = useState([])
  const [productsLoading, setProductsLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [filterDistrict, setFilterDistrict] = useState('All')
  const [filterOrganic, setFilterOrganic] = useState(false)

  // ── Cart state ──────────────────────────────────────────────
  const [cart, setCart] = useState([])  // [{product, quantity_kg}]
  const [activeTab, setActiveTab] = useState('browse')

  // ── AI Insight state (per product, on-demand) ─────────────────
  const [aiInsights, setAiInsights] = useState({})   // { [product_id]: {loading, data, error} }
  const [openInsightId, setOpenInsightId] = useState(null)

  // ── Checkout state ──────────────────────────────────────────
  const [deliveryAddress, setDeliveryAddress] = useState(user?.address || '')
  const [paymentMethod, setPaymentMethod] = useState('bkash')
  const [deliveryType, setDeliveryType] = useState('pickup')
  const [placingOrder, setPlacingOrder] = useState(false)

  // ── Orders state ────────────────────────────────────────────
  const [orders, setOrders] = useState([])
  const [ordersLoading, setOrdersLoading] = useState(false)

  const [wishlist, setWishlist] = useState(() => {
    try { return JSON.parse(localStorage.getItem('bm_wishlist') || '[]') }
    catch { return [] }
  })
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [selectedProduct, setSelectedProduct] = useState(null)  // for detail modal

  // ── Fetch products ──────────────────────────────────────────
  const fetchProducts = useCallback(async () => {
    setProductsLoading(true)
    try {
      const res = await getAllProducts()
      setProducts(res.data || [])
    } catch {
      toast.error('Could not load products')
    } finally { setProductsLoading(false) }
  }, [])

  // ── Fetch orders ────────────────────────────────────────────
  const fetchOrders = useCallback(async () => {
    setOrdersLoading(true)
    try {
      const res = await getMyOrders()
      setOrders(res.data || [])
    } catch {
      toast.error('Could not load orders')
    } finally { setOrdersLoading(false) }
  }, [])

  useEffect(() => { fetchProducts() }, [fetchProducts])
  useEffect(() => { if (activeTab === 'orders') fetchOrders() }, [activeTab, fetchOrders])

  // ── Derived stats ───────────────────────────────────────────
  const uniqueDistricts = [...new Set(products.map(p => p.district).filter(Boolean))]
  const organicCount = products.filter(p => p.is_organic).length

  // ── Filter products ─────────────────────────────────────────
  const filtered = products.filter(p => {
    const matchSearch = !search ||
      p.title_en?.toLowerCase().includes(search.toLowerCase()) ||
      p.district?.toLowerCase().includes(search.toLowerCase())
    const matchDistrict = filterDistrict === 'All' || p.district === filterDistrict
    const matchOrganic = !filterOrganic || p.is_organic
    return matchSearch && matchDistrict && matchOrganic
  })

  // ── Cart helpers ────────────────────────────────────────────
  const getEmoji = (product) => {
    const name = product.title_en || ''
    for (const [key, emoji] of Object.entries(CROP_EMOJIS)) {
      if (name.toLowerCase().includes(key.toLowerCase())) return emoji
    }
    return '🌿'
  }

  // ── AI Insight: fair price + price trend + demand, on-demand ──
  // Crop name guessed from title_en since product doesn't carry a raw crop_name field.
  const guessCropName = (product) => {
    const name = (product.title_en || '').trim()
    for (const key of Object.keys(CROP_EMOJIS)) {
      if (name.toLowerCase().includes(key.toLowerCase())) return key
    }
    return name.split(' ')[0] || name
  }

  const toggleAiInsight = async (product) => {
    const id = product.product_id

    if (openInsightId === id) {
      setOpenInsightId(null)
      return
    }
    setOpenInsightId(id)

    if (aiInsights[id]?.data || aiInsights[id]?.loading) return

    setAiInsights(prev => ({ ...prev, [id]: { loading: true, data: null, error: null } }))

    const cropName = guessCropName(product)

    try {
      const [fairRes, priceRes, demandRes] = await Promise.all([
        getFairPrice(cropName, product.district),
        getPricePrediction(cropName, product.district, 7),
        getDemandForecast(cropName, product.district, 7),
      ])
      setAiInsights(prev => ({
        ...prev,
        [id]: {
          loading: false,
          error: null,
          data: {
            fair: fairRes.data,
            price: priceRes.data,
            demand: demandRes.data,
          },
        },
      }))
    } catch {
      setAiInsights(prev => ({ ...prev, [id]: { loading: false, data: null, error: true } }))
    }
  }

  const addToCart = (product) => {
    setCart(prev => {
      const exists = prev.find(i => i.product.product_id === product.product_id)
      if (exists) return prev.map(i =>
        i.product.product_id === product.product_id
          ? { ...i, quantity_kg: i.quantity_kg + 1 }
          : i
      )
      return [...prev, { product, quantity_kg: 1 }]
    })
    toast.success(`${getEmoji(product)} ${product.title_en} added to cart!`)
  }

  const updateQty = (productId, delta) => {
    setCart(prev => prev
      .map(i => i.product.product_id === productId ? { ...i, quantity_kg: Math.max(1, i.quantity_kg + delta) } : i)
    )
  }

  const removeFromCart = (productId) =>
    setCart(prev => prev.filter(i => i.product.product_id !== productId))

  const cartTotal = cart.reduce((sum, i) => sum + (i.product.unit_price_bdt * i.quantity_kg), 0)
  const cartCount = cart.reduce((sum, i) => sum + i.quantity_kg, 0)

  const toggleWishlist = (product) => {
    setWishlist(prev => {
      const exists = prev.find(p => p.product_id === product.product_id)
      const next = exists
        ? prev.filter(p => p.product_id !== product.product_id)
        : [...prev, product]
      localStorage.setItem('bm_wishlist', JSON.stringify(next))
      toast(exists ? '💔 Removed from wishlist' : '❤️ Added to wishlist')
      return next
    })
  }

  const isWishlisted = (productId) => wishlist.some(p => p.product_id === productId)

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

  const ORDER_STATUS_CONFIG = {
    placed: { icon: '⏳', label: T('orderPlaced'), color: '#E65100', bg: '#FFF3E0' },
    confirmed: { icon: '✅', label: 'Confirmed', color: '#1976D2', bg: '#E3F2FD' },
    ready: { icon: '📦', label: 'Ready', color: '#1976D2', bg: '#E3F2FD' },
    dispatched: { icon: '🚛', label: 'Dispatched', color: '#1976D2', bg: '#E3F2FD' },
    shipped: { icon: '🚚', label: 'Shipped', color: '#1976D2', bg: '#E3F2FD' },
    in_transit: { icon: '🛣️', label: T('inTransit'), color: '#6A1B9A', bg: '#F3E5F5' },
    out_for_delivery: { icon: '🏍️', label: T('outForDelivery'), color: '#E65100', bg: '#FFF3E0' },
    delivered: { icon: '✅', label: 'Delivered', color: '#2E7D32', bg: '#E8F5E9' },
    cancelled: { icon: '✕', label: 'Cancelled', color: '#C62828', bg: '#FFEBEE' },
  }

  // ── Place order ─────────────────────────────────────────────
  const handlePlaceOrder = async () => {
    if (!deliveryAddress.trim()) {
      toast.error(T('enterAddress'))
      return
    }
    if (cart.length === 0) {
      toast.error(T('cartEmptyErr'))
      return
    }

    setPlacingOrder(true)
    const results = { success: 0, failed: 0 }

    for (const item of cart) {
      try {
        await placeOrder({
          product_id: item.product.product_id,
          quantity_kg: item.quantity_kg,
          payment_method: paymentMethod,
          delivery_type: deliveryType,
          delivery_address: deliveryAddress,
        })
        results.success++
      } catch {
        results.failed++
      }
    }

    setPlacingOrder(false)

    if (results.success > 0) {
      toast.success(`✅ ${results.success} order(s) placed! Payment held in Escrow.`)
      setCart([])
      setActiveTab('orders')
      fetchOrders()
    }
    if (results.failed > 0) {
      toast.error(`${results.failed} order(s) failed`)
    }
  }

  // ════════════════════════════════════════════════════════════
  return (
    <div className="page" style={{ padding: 0 }}>

      {/* ── Sidebar + Content Layout (full height) ── */}
      <div className="dashboard-layout">
        <Sidebar
          title="Buyer Menu"
          subtitle="AgroMitra"
          activeTab={activeTab}
          onTabChange={setActiveTab}
          tabs={[
            { key: 'browse',   icon: '🌾', label: T('browse') },
            { key: 'cart',     icon: '🛒', label: T('cart'), badge: cartCount > 0 ? `${cartCount} kg` : null },
            { key: 'orders',   icon: '📦', label: T('myOrders') },
            { key: 'wishlist', icon: '❤️', label: T('wishlist'), badge: wishlist.length > 0 ? wishlist.length : null },
            { key: 'profile',  icon: '👤', label: T('profile') },
            { key: 'settings', icon: '⚙️', label: T('settings') },
          ]}
        />
        <div className="dashboard-content">

          {/* ── Header ── */}
          <div className="page-header">
            <div className="page-title">{T('buyerTitle')}</div>
            <div className="page-subtitle">{T('buyerSub')}</div>
          </div>

          {/* ── Stats ── */}
          <div className="stats-grid">
            {[
              { icon: '🌾', label: T('activeListingsStat'), val: productsLoading ? '…' : products.length, color: '#E8F5E9', border: '#2E7D32' },
              { icon: '📍', label: T('districtsStat'), val: productsLoading ? '…' : uniqueDistricts.length, color: '#FFF3E0', border: '#E65100' },
              { icon: '🌱', label: T('organicStat'), val: productsLoading ? '…' : organicCount, color: '#E8F5E9', border: '#2E7D32' },
              { icon: '📦', label: T('myOrdersStat'), val: ordersLoading ? '…' : orders.length, color: '#F3E5F5', border: '#6A1B9A' },
            ].map((s, i) => (
              <div key={i} className="stat-card" style={{ borderLeftColor: s.border }}>
                <div className="stat-icon" style={{ background: s.color, fontSize: 28 }}>{s.icon}</div>
                <div className="stat-info">
                  <div className="stat-value">{s.val}</div>
                  <div className="stat-label">{s.label}</div>
                </div>
              </div>
            ))}
          </div>
      {/* ════ Browse Tab ════ */}
      {activeTab === 'browse' && (
        <div>
          {/* Filters */}
          <div className="card mb-20">
            <div className="flex gap-12" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                className="form-input" style={{ flex: 1, minWidth: 200 }}
                placeholder={T('searchProducts')}
                value={search} onChange={e => setSearch(e.target.value)}
              />
              <button
                className={`btn btn-sm ${filterOrganic ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setFilterOrganic(p => !p)}
              >
                🌱 Organic Only
              </button>
              <button
                className={`btn btn-sm ${filterDistrict === 'All' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setFilterDistrict('All')}
              >All</button>
              {uniqueDistricts.slice(0, 6).map(d => (
                <button key={d}
                  className={`btn btn-sm ${filterDistrict === d ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setFilterDistrict(d)}
                >{d}</button>
              ))}
            </div>
          </div>

          {/* Product Grid */}
          {productsLoading ? (
            <div className="grid-auto">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="skeleton-card">
                  <div className="skeleton skeleton-text" style={{ width: '40%', height: 12 }} />
                  <div className="skeleton skeleton-title" style={{ width: '75%' }} />
                  <div className="skeleton skeleton-text" style={{ width: '55%' }} />
                  <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                    <div className="skeleton skeleton-badge" />
                    <div className="skeleton skeleton-badge" style={{ width: 56 }} />
                  </div>
                  <div className="skeleton skeleton-btn" style={{ marginTop: 8 }} />
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 60, color: '#9E9E9E' }}>
              <div style={{ fontSize: 48 }}>🔍</div>
              <div style={{ marginTop: 16, fontSize: 16 }}>{T('noProducts')}</div>
            </div>
          ) : (
            <div className="grid-auto">
              {filtered.map(p => (
                <div key={p.product_id} className="product-card">
                  <div className={`product-img${p.image_url ? ' has-photo' : ''}`}>
                    {p.image_url
                      ? <img className="product-photo" src={resolveImageUrl(p.image_url)} alt={p.title_en} />
                      : getEmoji(p)}
                  </div>
                  <div className="product-body">
                    <div className="flex justify-between flex-center mb-20">
                      <div>
                        <div className="product-name">
                          {p.title_en} 
                          {p.title_bn && <span style={{ fontSize: 13, color: '#546E7A' }}> ({p.title_bn})</span>}
                        </div>
                        <div className="product-location">
                          📍 {p.district} • 👨‍🌾 {p.farmer_name || 'Farmer'}
                        </div>
                      </div>
                      <div className="flex gap-8" style={{ flexDirection: 'column', alignItems: 'flex-end' }}>
                        {p.is_organic && <span className="badge badge-green">🌱 Organic</span>}
                        {p.quality_grade && <span className="badge badge-blue">Grade {p.quality_grade}</span>}
                      </div>
                    </div>
                    <div className="flex justify-between flex-center">
                      <div>
                        <div className="product-price">৳{p.unit_price_bdt}<span>/kg</span></div>
                        <div style={{ fontSize: 13, color: '#546E7A' }}>
                          Available: {p.quantity_kg?.toLocaleString()} kg
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="product-footer" style={{ flexDirection: 'column', gap: 8 }}>
                      <div style={{ display: 'flex', gap: 8, width: '100%' }}>
                        <button
                          className="btn btn-primary btn-sm"
                          style={{ flex: 1 }}
                          onClick={() => addToCart(p)}
                        >{T('addToCart')}</button>
                        <button
                          className="btn btn-sm"
                          style={{
                            background: isWishlisted(p.product_id) ? '#FFEBEE' : 'white',
                            color: isWishlisted(p.product_id) ? '#C62828' : '#546E7A',
                            border: '1.5px solid #DDE2E5'
                          }}
                          onClick={() => toggleWishlist(p)}
                        >{isWishlisted(p.product_id) ? '❤️' : '🤍'}</button>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => setSelectedProduct(p)}
                          title={T('viewDetailsTitle')}
                        >👁️</button>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => toggleAiInsight(p)}
                          disabled={aiInsights[p.product_id]?.loading}
                        >{aiInsights[p.product_id]?.loading ? '⏳' : '🤖'}</button>
                      </div>
                  
                    {aiInsights[p.product_id]?.loading && (
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 8, color: '#546E7A',
                        padding: 12, background: '#F4FBF6', borderRadius: 8, border: '1px solid #DCEFE0'
                      }}>
                        <div className="spinner" />
                        <span>Analyzing market data with AI...</span>
                      </div>
                    )}
                    {aiInsights[p.product_id]?.error && (
                      <div style={{
                        color: '#C62828', padding: 12, background: '#FFEBEE',
                        borderRadius: 8, border: '1px solid #FFCDD2', fontSize: 13
                      }}>
                        ⚠️ Could not load AI insight for this crop/district.
                      </div>
                    )}

                    {aiInsights[p.product_id]?.data && (() => {
                      const insightData = aiInsights[p.product_id].data;
                      const fair = insightData?.fair;
                      const price = insightData?.price;
                      const demand = insightData?.demand;

                      const listed = p.unit_price_bdt;
                      const minFair = fair?.fair_price_min ?? 0;
                      const maxFair = fair?.fair_price_max ?? Infinity;

                      // 💡 ৩টি আলাদা স্ট্যাটাস নির্ধারণের লজিক
                      let priceStatus = "fair";
                      if (listed < minFair) {
                        priceStatus = "low";
                      } else if (listed > maxFair) {
                        priceStatus = "high";
                      }

                      return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, margin:7, padding: 8, background: '#F4FBF6', borderRadius: 8, border: '1px solid #DCEFE0', fontSize: 13, color: '#546E7A' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span>💰 Fair price range :</span>
                            <strong>৳{fair?.fair_price_min ?? '—'}–{fair?.fair_price_max ?? '—'}/kg</strong>
                          </div>

                          {/* 💡 স্ট্যাটাস অনুযায়ী ডাইনামিক ব্যাজ কালার ও টেক্সট */}
                          <div style={{ display: 'block', margin: '4px 0' }}>
                            {priceStatus === "fair" && (
                              <span className="badge badge-green">✅ Listed price is fair</span>
                            )}
                            {priceStatus === "low" && (
                              <span className="badge badge-green" style={{ background: '#E8F5E9', color: '#2E7D32', border: '1px solid #C8E6C9' }}>
                                🔥 Great Deal (Below Market Price)
                              </span>
                            )}
                            {priceStatus === "high" && (
                              <span className="badge badge-orange">⚠️ Above typical fair range</span>
                            )}
                          </div>

                          <div style={{ display: 'flex', justifyContent: 'normal' }}>
                            <span>📈 7-Day Trend :</span>
                            <strong>
                              {(price?.summary?.trend_pct ?? 0) > 0 ? '↑' : '↓'}{' '}
                              {Math.abs(price?.summary?.trend_pct ?? 0).toFixed(1)}%
                            </strong>
                          </div>

                          <div style={{ display: 'flex', justifyContent: 'normal' }}>
                            <span>📊 Demand signal :</span>
                            <strong>{demand?.forecasts?.[0]?.market_signal || '—'}</strong>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ════ Cart Tab ════ */}
      {activeTab === 'cart' && (
        <div className="grid-2">
          {/* Cart Items */}
          <div className="card">
            <div className="card-title">🛒 Your Cart</div>
            {cart.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#9E9E9E' }}>
                <div style={{ fontSize: 48 }}>🛒</div>
                <div style={{ marginTop: 12 }}>Your cart is empty</div>
                <button className="btn btn-primary mt-16" onClick={() => setActiveTab('browse')}>
                  Browse Products
                </button>
              </div>
            ) : (
              <>
                {cart.map((item, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '14px 0', borderBottom: '1px solid #F0F0F0'
                  }}>
                    <span style={{ fontSize: 32 }}>{getEmoji(item.product)}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600 }}>{item.product.title_en}</div>
                      <div style={{ fontSize: 13, color: '#546E7A' }}>
                        ৳{item.product.unit_price_bdt}/kg
                      </div>
                    </div>
                    {/* Qty controls */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <button className="btn btn-sm btn-secondary"
                        style={{ padding: '2px 10px' }}
                        onClick={() => updateQty(item.product.product_id, -1)}>−</button>
                      <span style={{ fontWeight: 600, minWidth: 32, textAlign: 'center' }}>
                        {item.quantity_kg} kg
                      </span>
                      <button className="btn btn-sm btn-secondary"
                        style={{ padding: '2px 10px' }}
                        onClick={() => updateQty(item.product.product_id, 1)}>+</button>
                    </div>
                    <div style={{ fontWeight: 700, color: '#2E7D32', minWidth: 70, textAlign: 'right' }}>
                      ৳{(item.product.unit_price_bdt * item.quantity_kg).toLocaleString()}
                    </div>
                    <button
                      className="btn btn-sm"
                      style={{ background: '#FFEBEE', color: '#C62828', border: 'none' }}
                      onClick={() => removeFromCart(item.product.product_id)}
                    >✕</button>
                  </div>
                ))}
                <div style={{ paddingTop: 16, borderTop: '2px solid #E0E0E0', marginTop: 8 }}>
                  <div className="flex justify-between" style={{ fontSize: 20, fontWeight: 700 }}>
                    <span>Total</span>
                    <span style={{ color: '#2E7D32' }}>৳{cartTotal.toLocaleString()}</span>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Checkout */}
          {cart.length > 0 && (
            <div className="card">
              <div className="card-title">💳 Checkout</div>

              <div className="form-group">
                <label className="form-label">Delivery Address *</label>
                <input className="form-input"
                  placeholder="House, Road, Area, District..."
                  value={deliveryAddress}
                  onChange={e => setDeliveryAddress(e.target.value)} />
              </div>

              <div className="form-group">
                <label className="form-label">Delivery Type</label>
                <select className="form-select" value={deliveryType}
                  onChange={e => setDeliveryType(e.target.value)}>
                  <option value="pickup">📦 Pickup</option>
                  <option value="delivery">🚚 Home Delivery</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Payment Method</label>
                <select className="form-select" value={paymentMethod}
                  onChange={e => setPaymentMethod(e.target.value)}>
                  <option value="bkash">💚 bKash</option>
                  <option value="nagad">🔵 Nagad</option>
                  <option value="bank_transfer">💵 Cash on Delivery</option>
                </select>
              </div>

              <div className="alert alert-info">
                🔒 Payment protected by AgroMitra Escrow — funds released only after delivery confirmation.
              </div>

              {/* Order summary */}
              <div style={{ background: '#F9FBF9', borderRadius: 8, padding: 12, marginBottom: 16 }}>
                {cart.map((item, i) => (
                  <div key={i} className="flex justify-between" style={{ fontSize: 13, marginBottom: 4 }}>
                    <span>{getEmoji(item.product)} {item.product.title_en} × {item.quantity_kg} kg</span>
                    <span style={{ color: '#2E7D32', fontWeight: 600 }}>
                      ৳{(item.product.unit_price_bdt * item.quantity_kg).toLocaleString()}
                    </span>
                  </div>
                ))}
                <div className="flex justify-between" style={{ fontWeight: 700, marginTop: 8, borderTop: '1px solid #E0E0E0', paddingTop: 8 }}>
                  <span>Total ({cart.length} item{cart.length > 1 ? 's' : ''})</span>
                  <span style={{ color: '#2E7D32' }}>৳{cartTotal.toLocaleString()}</span>
                </div>
              </div>

              <button
                className="btn btn-primary btn-full"
                onClick={handlePlaceOrder}
                disabled={placingOrder}
              >
                {placingOrder ? T('loading') : `✅ ${T('placeOrder')} — ৳${cartTotal.toLocaleString()}`}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ════ Orders Tab ════ */}
      {activeTab === 'orders' && (
        <div>
          <div className="flex justify-between mb-20">
            <div className="section-title">📦 My Orders</div>
            <button className="btn btn-secondary" onClick={fetchOrders}>🔄 Refresh</button>
          </div>

          {ordersLoading ? (
            <div className="spinner-box"><div className="spinner" /><span>Loading orders…</span></div>
          ) : orders.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: 40 }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>📦</div>
              <div style={{ fontSize: 16, color: '#546E7A' }}>No orders yet</div>
              <button className="btn btn-primary mt-16" onClick={() => setActiveTab('browse')}>
                Browse Products
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {orders.map(o => {
                const matchedProduct = products.find(p => p.product_id === o.product_id)
                const productName = matchedProduct?.title_en || o.product_name || 'Product'
                const productEmoji = matchedProduct ? getEmoji(matchedProduct) : '🌿'
                const statusCfg = ORDER_STATUS_CONFIG[o.status?.toLowerCase()] || ORDER_STATUS_CONFIG.placed

                return (
                  <div key={o.order_id} className="card" style={{ cursor: 'pointer' }}
                    onClick={() => setSelectedOrder(o)}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                      <div style={{ display: 'flex', gap: 14, alignItems: 'center', flex: 1 }}>
                        <span style={{ fontSize: 36 }}>{productEmoji}</span>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 15 }}>{productName}</div>
                          <div style={{ fontSize: 13, color: '#546E7A', marginTop: 2 }}>
                            {o.quantity_kg} kg · ৳{o.unit_price}/kg · {fmtDate(o.created_at)} {fmtTime(o.created_at)}
                          </div>
                          <div style={{ fontSize: 13, color: '#546E7A' }}>
                            {o.delivery_type === 'pickup' ? '📦 Pickup' : '🚚 Delivery'} ·{' '}
                            {o.payment_method === 'bkash' ? '💚 bKash'
                              : o.payment_method === 'nagad' ? '🔵 Nagad'
                                : o.payment_method === 'bank_transfer' ? '💵 Cash on Delivery'
                                  : '💳 Other'}
                          </div>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontSize: 18, fontWeight: 800, color: '#2E7D32' }}>
                          ৳{o.total_amount?.toLocaleString()}
                        </div>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          padding: '4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700,
                          background: statusCfg.bg, color: statusCfg.color, marginTop: 6
                        }}>
                          {statusCfg.icon} {statusCfg.label}
                        </span>
                        <div style={{ marginTop: 6 }}>
                          <span className={`badge ${o.payment_status === 'released' ? 'badge-green' : 'badge-gold'}`}>
                            {o.payment_status === 'released' ? '✅ Released' : '🔒 Escrow'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Status Progress Bar */}
                    <div style={{ marginTop: 14 }}>
                      {(() => {
                        const steps = ['placed', 'confirmed', 'shipped', 'delivered']
                        const current = steps.indexOf(o.status?.toLowerCase())
                        return (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                            {steps.map((step, i) => {
                              const done = i <= current
                              const cfg = ORDER_STATUS_CONFIG[step]
                              return (
                                <div key={step} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                                    {i > 0 && (
                                      <div style={{
                                        flex: 1, height: 3,
                                        background: done ? '#2E7D32' : '#E0E0E0',
                                        transition: 'background 0.3s'
                                      }} />
                                    )}
                                    <div style={{
                                      width: 28, height: 28, borderRadius: '50%',
                                      background: done ? '#2E7D32' : '#E0E0E0',
                                      color: 'white', fontSize: 12,
                                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                                      flexShrink: 0, transition: 'background 0.3s'
                                    }}>
                                      {done ? '✓' : i + 1}
                                    </div>
                                    {i < steps.length - 1 && (
                                      <div style={{
                                        flex: 1, height: 3,
                                        background: i < current ? '#2E7D32' : '#E0E0E0',
                                      }} />
                                    )}
                                  </div>
                                  <div style={{ fontSize: 10, color: done ? '#2E7D32' : '#9E9E9E', marginTop: 4, fontWeight: done ? 700 : 400 }}>
                                    {cfg?.label}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        )
                      })()}
                    </div>

                    <div style={{ fontSize: 12, color: '#9E9E9E', marginTop: 10, textAlign: 'right' }}>
                      Click to view full details →
                    </div>
                  </div>
                )
              })}

              {/* Summary */}
              <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', padding: '4px 0' }}>
                {[
                  { label: T('totalOrdersLabel'), val: orders.length, color: '#546E7A' },
                  { label: 'Pending', val: orders.filter(o => o.status === 'placed').length, color: '#E65100' },
                  { label: 'Delivered', val: orders.filter(o => o.status === 'delivered').length, color: '#2E7D32' },
                  { label: T('totalSpent'), val: `৳${orders.reduce((s, o) => s + (o.total_amount || 0), 0).toLocaleString()}`, color: '#1565C0' },
                ].map((s, i) => (
                  <div key={i} style={{ fontSize: 13 }}>
                    <span style={{ color: '#9E9E9E' }}>{s.label}: </span>
                    <strong style={{ color: s.color }}>{s.val}</strong>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Order Detail Modal */}
          {selectedOrder && (() => {
            const o = selectedOrder
            const matchedProduct = products.find(p => p.product_id === o.product_id)
            const productName = matchedProduct?.title_en || o.product_name || 'Product'
            const statusCfg = ORDER_STATUS_CONFIG[o.status?.toLowerCase()] || ORDER_STATUS_CONFIG.placed
            return (
              <div style={{
                position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                zIndex: 1000, padding: 16
              }} onClick={() => setSelectedOrder(null)}>
                <div style={{
                  background: 'white', borderRadius: 12, padding: 28,
                  width: '100%', maxWidth: 500, boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
                  maxHeight: '90vh', overflowY: 'auto'
                }} onClick={e => e.stopPropagation()}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
                    <div>
                      <div style={{ fontSize: 18, fontWeight: 800 }}>Order Details</div>
                      <div style={{ fontSize: 12, color: '#9E9E9E' }}>#{o.order_id?.slice(-12)}</div>
                    </div>
                    <button onClick={() => setSelectedOrder(null)}
                      style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#546E7A' }}>✕</button>
                  </div>

                  {/* Status */}
                  <div style={{
                    padding: '12px 16px', borderRadius: 8, marginBottom: 16,
                    background: statusCfg.bg, color: statusCfg.color,
                    fontSize: 15, fontWeight: 700
                  }}>
                    {statusCfg.icon} {statusCfg.label}
                  </div>

                  {/* Info grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                    {[
                      { label: 'Product', val: productName },
                      { label: 'Quantity', val: `${o.quantity_kg} kg` },
                      { label: T('unitPrice'), val: `৳${o.unit_price}/kg` },
                      { label: T('orderDate'), val: `${fmtDate(o.created_at)} ${fmtTime(o.created_at)}` },
                      { label: 'Delivery', val: o.delivery_type === 'pickup' ? '📦 Pickup' : '🚚 Home Delivery' },
                      { label: 'Payment', val: o.payment_method?.replace('_', ' ') },
                    ].map((f, i) => (
                      <div key={i} style={{ background: '#F8FAFC', padding: '10px 12px', borderRadius: 8 }}>
                        <div style={{ fontSize: 11, color: '#9E9E9E', fontWeight: 600, textTransform: 'uppercase' }}>{f.label}</div>
                        <div style={{ fontSize: 14, fontWeight: 600, marginTop: 3 }}>{f.val}</div>
                      </div>
                    ))}
                  </div>

                  {/* Address */}
                  {o.delivery_address && (
                    <div style={{ background: '#F8FAFC', padding: '10px 12px', borderRadius: 8, marginBottom: 16 }}>
                      <div style={{ fontSize: 11, color: '#9E9E9E', fontWeight: 600, textTransform: 'uppercase' }}>Delivery Address</div>
                      <div style={{ fontSize: 14, fontWeight: 600, marginTop: 3 }}>{o.delivery_address}</div>
                    </div>
                  )}

                  {/* Financial */}
                  <div style={{ background: '#F0FFF4', borderRadius: 8, padding: 14, marginBottom: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13 }}>
                      <span style={{ color: '#546E7A' }}>Order Total</span>
                      <span style={{ fontWeight: 700 }}>৳{o.total_amount?.toLocaleString()}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                      <span style={{ color: '#546E7A' }}>Escrow Status</span>
                      <span className={`badge ${o.payment_status === 'released' ? 'badge-green' : 'badge-gold'}`}>
                        {o.payment_status === 'released' ? '✅ Released to Farmer' : '🔒 In Escrow'}
                      </span>
                    </div>
                  </div>

                  <button className="btn btn-secondary btn-full" onClick={() => setSelectedOrder(null)}>
                    Close
                  </button>
                </div>
              </div>
            )
          })()}
        </div>
      )}
      {/* ════ Wishlist Tab ════ */}
      {activeTab === 'wishlist' && (
        <div>
          <div className="flex justify-between mb-20">
            <div className="section-title">{T('wishlist')}</div>
            {wishlist.length > 0 && (
              <button className="btn btn-sm" style={{ background: '#FFEBEE', color: '#C62828', border: 'none' }}
                onClick={() => {
                  setWishlist([])
                  localStorage.removeItem('bm_wishlist')
                  toast(T('wishlistCleared'))
                }}>{T('clearAll')}</button>
            )}
          </div>

          {wishlist.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: 40 }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>🤍</div>
              <div style={{ fontSize: 16, color: '#546E7A' }}>Your wishlist is empty</div>
              <button className="btn btn-primary mt-16" onClick={() => setActiveTab('browse')}>
                Browse Products
              </button>
            </div>
          ) : (
            <div className="grid-auto">
              {wishlist.map(p => (
                <div key={p.product_id} className="product-card">
                  <div className={`product-img${p.image_url ? ' has-photo' : ''}`}>
                    {p.image_url
                      ? <img className="product-photo" src={resolveImageUrl(p.image_url)} alt={p.title_en} />
                      : getEmoji(p)}
                  </div>
                  <div className="product-body">
                    <div className="product-name">{p.title_en}</div>
                    <div className="product-location">📍 {p.district} · 👨‍🌾 {p.farmer_name || 'Farmer'}</div>
                    <div className="product-price" style={{ marginTop: 8 }}>৳{p.unit_price_bdt}<span>/kg</span></div>
                    <div style={{ fontSize: 13, color: '#546E7A' }}>{p.quantity_kg?.toLocaleString()} kg available</div>
                  </div>
                  <div className="product-footer" style={{ gap: 8 }}>
                    <button className="btn btn-primary btn-sm" style={{ flex: 1 }}
                      onClick={() => { addToCart(p); toggleWishlist(p) }}>
                      🛒 Add to Cart
                    </button>
                    <button className="btn btn-sm"
                      style={{ background: '#FFEBEE', color: '#C62828', border: 'none' }}
                      onClick={() => toggleWishlist(p)}>❤️</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {/* ════ Profile Tab ════ */}
      {/* ════ Profile Tab ════ */}
      {activeTab === 'profile' && (
        <div style={{ maxWidth: 600, margin: '0 auto' }}>

          {/* Profile Header */}
          <div className="card" style={{ textAlign: 'center', padding: 32, marginBottom: 20 }}>
            {/* Profile Photo */}
            <div style={{ position: 'relative', width: 88, height: 88, margin: '0 auto 16px' }}>
              {user?.profile_photo_url ? (
                <img
                  src={`${resolveImageUrl(user.profile_photo_url)}?t=${photoKey}`}
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
                      localStorage.setItem('agromitra_user', JSON.stringify(updatedUser))
                      setUser(updatedUser)
                      setPhotoKey(Date.now())
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
              <span className="badge badge-green">🛒 Buyer </span>
              {user?.district && <span className="badge badge-blue">📍 {user.district}</span>}
              {user?.is_verified
                ? <span className="badge badge-green">✅ Verified</span>
                : <span className="badge badge-orange">⏳ Not Verified</span>
              }
              
            </div>
            <div style={{ fontSize: 13, color: 'var(--gray)', marginTop: 10 }}>
              📱 {user?.mobile_number || '—'} · 🕐 Member since {user?.created_at
                ? new Date(user.created_at).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
                : '—'
              }
            </div>
          </div>

          {/* Order Stats */}
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="card-title">📊 My Shopping Stats</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {[
                { icon: '📦', label: T('totalOrdersLabel'), val: orders.length, color: '#E3F2FD', text: '#1976D2' },
                { icon: '✅', label: 'Delivered', val: orders.filter(o => o.status === 'delivered').length, color: '#E8F5E9', text: '#2E7D32' },
                { icon: '⏳', label: 'Pending', val: orders.filter(o => o.status === 'placed').length, color: '#FFF3E0', text: '#E65100' },
                { icon: '💰', label: T('totalSpent'), val: `৳${orders.reduce((s, o) => s + (o.total_amount || 0), 0).toLocaleString()}`, color: '#F3E5F5', text: '#6A1B9A' },
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

          {/* Wishlist quick view */}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div className="card-title" style={{ marginBottom: 0 }}>❤️ Wishlist ({wishlist.length})</div>
              <button className="btn btn-secondary btn-sm" onClick={() => setActiveTab('wishlist')}>
                View All →
              </button>
            </div>
            {wishlist.length === 0 ? (
              <div style={{ color: 'var(--gray)', fontSize: 13 }}>No items in wishlist yet.</div>
            ) : (
              wishlist.slice(0, 3).map((p, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 0', borderBottom: i < 2 ? '1px solid #F0F0F0' : 'none'
                }}>
                  <span style={{ fontSize: 24 }}>{getEmoji(p)}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{p.title_en}</div>
                    <div style={{ fontSize: 12, color: 'var(--gray)' }}>৳{p.unit_price_bdt}/kg · {p.district}</div>
                  </div>
                  <button className="btn btn-primary btn-sm" onClick={() => { addToCart(p); setActiveTab('cart') }}>
                    🛒 Add
                  </button>
                </div>
              ))
            )}
          </div>

        </div>
      )}

      {/* ════ Settings Tab ════ */}
      {activeTab === 'settings' && (
        <SettingsTab userRole="buyer" />
      )}

        </div>  {/* dashboard-content */}
      </div>  {/* dashboard-layout */}

      {/* ════ Product Detail Modal (page-level, always accessible) ════ */}
      {selectedProduct && (() => {
        const p = selectedProduct
        const inCart = cart.find(i => i.product.product_id === p.product_id)
        return (
          <div
            style={{
              position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
              zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: 16,
            }}
            onMouseDown={() => setSelectedProduct(null)}
          >
            <div
              style={{
                background: 'white', borderRadius: 16, width: '100%', maxWidth: 560,
                maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 24px 60px rgba(0,0,0,0.25)'
              }}
              onMouseDown={e => e.stopPropagation()}
            >

              {/* Header */}
              <div style={{
                background: 'linear-gradient(135deg, #1B5E20, #2E7D32)',
                borderRadius: '16px 16px 0 0', padding: '24px 24px 20px',
                position: 'relative'
              }}>
                <button onClick={() => setSelectedProduct(null)} style={{
                  position: 'absolute', top: 14, right: 14,
                  background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '50%',
                  width: 32, height: 32, color: 'white', fontSize: 18,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>✕</button>
                {p.image_url ? (
                  <img src={resolveImageUrl(p.image_url)} alt={p.title_en} style={{
                    width: '100%', height: 140, objectFit: 'cover', borderRadius: 10, marginBottom: 10
                  }} />
                ) : (
                  <div style={{ fontSize: 56, marginBottom: 10, textAlign: 'center' }}>{getEmoji(p)}</div>
                )}
                <div style={{ color: 'white', textAlign: 'center' }}>
                  <div style={{ fontSize: 20, fontWeight: 800 }}>{p.title_en}</div>
                  {p.title_bn && <div style={{ fontSize: 14, opacity: 0.8, marginTop: 4 }}>{p.title_bn}</div>}
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', marginTop: 10 }}>
                    {p.is_organic && <span style={{ background: 'rgba(255,255,255,0.2)', color: 'white', padding: '3px 10px', borderRadius: 99, fontSize: 12 }}>🌱 Organic</span>}
                    {p.quality_grade && <span style={{ background: 'rgba(255,255,255,0.2)', color: 'white', padding: '3px 10px', borderRadius: 99, fontSize: 12 }}>⭐ Grade {p.quality_grade}</span>}
                    <span style={{ background: 'rgba(255,255,255,0.2)', color: 'white', padding: '3px 10px', borderRadius: 99, fontSize: 12 }}>🌾 {p.crop_name}</span>
                  </div>
                </div>
              </div>

              {/* Body */}
              <div style={{ padding: 24 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
                  <div style={{ background: '#F1F8E9', borderRadius: 10, padding: '14px 16px', textAlign: 'center' }}>
                    <div style={{ fontSize: 24, fontWeight: 900, color: '#2E7D32' }}>৳{p.unit_price_bdt}</div>
                    <div style={{ fontSize: 12, color: '#546E7A', marginTop: 2 }}>per kg</div>
                  </div>
                  <div style={{ background: '#E3F2FD', borderRadius: 10, padding: '14px 16px', textAlign: 'center' }}>
                    <div style={{ fontSize: 24, fontWeight: 900, color: '#1565C0' }}>{p.quantity_kg?.toLocaleString()}</div>
                    <div style={{ fontSize: 12, color: '#546E7A', marginTop: 2 }}>kg available</div>
                  </div>
                </div>

                <div style={{ display: 'grid', gap: 10, marginBottom: 20 }}>
                  {[
                    [ T('locationLabel'), `${p.district}${p.upazila ? `, ${p.upazila}` : ''}`],
                    [ T('farmerLabel'), p.farmer_name || 'Verified Farmer'],
                    [ T('listedLabel'), p.created_at ? new Date(p.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'],
                    [ T('cropTypeLabel'), p.crop_name || p.title_en],
                    [ T('minOrderLabel'), p.min_order_kg ? `${p.min_order_kg} kg` : T('noMinimum')],
                  ].filter(([, v]) => v && v !== '—').map(([label, val]) => (
                    <div key={label} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '9px 0', borderBottom: '1px solid #F5F5F5'
                    }}>
                      <span style={{ fontSize: 13, color: '#546E7A' }}>{label}</span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#2E2E2E' }}>{val}</span>
                    </div>
                  ))}
                </div>

                {p.description && (
                  <div style={{ background: '#F9FBF9', borderRadius: 10, padding: 14, marginBottom: 20 }}>
                    <div style={{ fontSize: 12, color: '#546E7A', fontWeight: 600, marginBottom: 6 }}>📝 DESCRIPTION</div>
                    <div style={{ fontSize: 14, color: '#2E2E2E', lineHeight: 1.6 }}>{p.description}</div>
                  </div>
                )}

                {inCart && (
                  <div style={{ background: '#E8F5E9', borderRadius: 10, padding: '12px 16px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 13, color: '#2E7D32', fontWeight: 600 }}>🛒 In cart: {inCart.quantity_kg} kg</span>
                    <span style={{ fontSize: 14, fontWeight: 800, color: '#2E7D32' }}>৳{(inCart.quantity_kg * p.unit_price_bdt).toLocaleString()}</span>
                  </div>
                )}

                <div style={{ display: 'flex', gap: 10 }}>
                  <button className="btn btn-primary" style={{ flex: 1, padding: '12px' }}
                    onClick={() => { addToCart(p); toast.success('Added to cart!'); setSelectedProduct(null) }}>
                    🛒 Add to Cart
                  </button>
                  <button style={{
                    padding: '12px 16px', borderRadius: 8, cursor: 'pointer',
                    background: isWishlisted(p.product_id) ? '#FFEBEE' : 'white',
                    color: isWishlisted(p.product_id) ? '#C62828' : '#546E7A',
                    border: '1.5px solid #DDE2E5'
                  }} onClick={() => toggleWishlist(p)}>
                    {isWishlisted(p.product_id) ? T('removeWishlist') : T('addToWishlist')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      })()}

    </div>
  )
}
