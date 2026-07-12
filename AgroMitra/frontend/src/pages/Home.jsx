import { Link } from 'react-router-dom'
import { useEffect, useRef, useState } from 'react'
import { AreaChart, Area, ResponsiveContainer, YAxis, Tooltip, LineChart, Line } from 'recharts'
import { getPricePrediction, getDemandForecast, getWeatherAlert, getSowingCalendar, getMarketPrices } from '../api/agromitra'

const features = [
  { icon: '🤖', title: 'AI Price Prediction', desc: 'Prophet + XGBoost hybrid model forecasts crop prices 7–30 days ahead with 12% MAPE accuracy.' },
  { icon: '📊', title: 'Demand Forecasting', desc: 'LSTM neural network predicts crop demand 4–8 weeks in advance to help farmers plan production.' },
  { icon: '🌱', title: 'Crop Recommendation', desc: 'Content-based AI suggests top 5 profitable crops based on soil, season, budget, and market trends.' },
  { icon: '💳', title: 'bKash & Nagad Payments', desc: 'Secure digital payments with escrow protection. Farmers get paid instantly on delivery confirmation.' },
  { icon: '🗣️', title: 'Bengali Interface', desc: 'Fully bilingual Bengali and English platform designed for rural farmers with low digital literacy.' },
  { icon: '🌤️', title: 'Micro-Climate Alerts', desc: 'Hyper-local weather warnings and regional sowing timelines mapped to safeguard crops against unpredictable weather.' },
]

const stats = [
  { val: '17M+', label: 'Bangladeshi Farmers', icon: '👨‍🌾' },
  { val: '64', label: 'Districts Supported', icon: '🗺️' },
  { val: '12%', label: 'AI MAPE Accuracy', icon: '🤖' },
  { val: '35%+', label: 'Farmer Income Increase', icon: '📈' },
]

const gapRows = [
  { problem: 'Farmers earn only 20–40% of market price', solution: 'Direct farmer-to-buyer marketplace — zero middlemen' },
  { problem: '3–5 middlemen layers extract 60–80% value', solution: 'AI price prediction with 12% MAPE accuracy' },
  { problem: '25–30% post-harvest food waste every year', solution: 'Demand forecasting reduces overproduction by 25%' },
  { problem: 'No real-time price data for rural farmers', solution: 'Real-time market data in Bengali and English' },
  { problem: 'Cash-based risky transactions with no records', solution: 'Secure bKash/Nagad payments with escrow protection' },
  { problem: 'Buyers can\u2019t verify quality before paying', solution: 'Quality grading and photos on every listing' },
  { problem: 'Disputes have no neutral record to settle them', solution: 'Every order timestamped and traceable end to end' },
  { problem: 'Smallholders can\u2019t plan which crop to grow next', solution: 'AI crop recommendation matched to soil and budget' },
  { problem: 'Buyers travel far to find trustworthy sellers', solution: 'Verified farmer profiles with trust scores, browsed from anywhere' },
]

const DEMO_CROPS = ['Tomato', 'Onion', 'Potato', 'Brinjal', 'Cabbage', 'Garlic', 'Rice', 'Ginger']
const DEMO_DISTRICTS = [
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
const DEMO_CROP_EMOJI = { Tomato: '🍅', Onion: '🧅', Potato: '🥔', Brinjal: '🍆', Cabbage: '🥬', Garlic: '🧄', Rice: '🌾', Ginger: '🫚' }

// Crop -> emoji, used for the Sowing Calendar cards
const CROP_EMOJI = { Tomato: '🍅', Onion: '🧅', Potato: '🥔', Brinjal: '🍆', Cabbage: '🥬', Garlic: '🧄', Rice: '🌾', Ginger: '🫚' }

const Home = () => {
  const rootRef = useRef(null)

  // ── Live AI price/demand demo ───────────────────────────────
  const [demoCrop, setDemoCrop] = useState('Tomato')
  const [demoDistrict, setDemoDistrict] = useState('Dhaka')
  const [demoLoading, setDemoLoading] = useState(false)
  const [demoData, setDemoData] = useState(null)
  const [demoError, setDemoError] = useState(false)

  // ── Weather alert ────────────────────────────────────────────
  const [weatherDistrict, setWeatherDistrict] = useState('Dhaka')
  const [weather, setWeather] = useState(null)
  const [weatherLoading, setWeatherLoading] = useState(false)
  const [weatherError, setWeatherError] = useState(false)

  // ── Market price table ───────────────────────────────────────
  const [marketPrices, setMarketPrices] = useState([])
  const [marketLoading, setMarketLoading] = useState(false)
  const [marketError, setMarketError] = useState(false)

  // ── Sowing calendar ──────────────────────────────────────────
  const [calendar, setCalendar] = useState(null)
  const [calendarLoading, setCalendarLoading] = useState(false)
  const [calendarError, setCalendarError] = useState(false)

  useEffect(() => {
    let cancelled = false
    setDemoLoading(true)
    setDemoError(false)
    Promise.all([
      getPricePrediction(demoCrop, demoDistrict, 7),
      getDemandForecast(demoCrop, demoDistrict, 7),
    ])
      .then(([priceRes, demandRes]) => {
        if (cancelled) return
        setDemoData({ price: priceRes.data, demand: demandRes.data })
      })
      .catch(() => { if (!cancelled) setDemoError(true) })
      .finally(() => { if (!cancelled) setDemoLoading(false) })
    return () => { cancelled = true }
  }, [demoCrop, demoDistrict])

  // ── Fetch weather alert whenever the chosen district changes ──
  useEffect(() => {
    let cancelled = false
    setWeatherLoading(true)
    setWeatherError(false)
    getWeatherAlert(weatherDistrict)
      .then(res => { if (!cancelled) setWeather(res.data) })
      .catch(() => { if (!cancelled) setWeatherError(true) })
      .finally(() => { if (!cancelled) setWeatherLoading(false) })
    return () => { cancelled = true }
  }, [weatherDistrict])

  // ── Fetch today's wholesale market prices (once) ──────────────
  useEffect(() => {
    let cancelled = false
    setMarketLoading(true)
    setMarketError(false)
    getMarketPrices()
      .then(res => { if (!cancelled) setMarketPrices(res.data?.prices || []) })
      .catch(() => { if (!cancelled) setMarketError(true) })
      .finally(() => { if (!cancelled) setMarketLoading(false) })
    return () => { cancelled = true }
  }, [])

  // ── Fetch this month's sowing calendar (once) ─────────────────
  useEffect(() => {
    let cancelled = false
    setCalendarLoading(true)
    setCalendarError(false)
    getSowingCalendar()
      .then(res => { if (!cancelled) setCalendar(res.data) })
      .catch(() => { if (!cancelled) setCalendarError(true) })
      .finally(() => { if (!cancelled) setCalendarLoading(false) })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    const els = rootRef.current?.querySelectorAll('.am-reveal, .am-flip-card, .am-stat')
    if (!els?.length) return
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('am-in-view')
            observer.unobserve(entry.target)
          }
        });
      },
      { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
    )
    els.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [])

  // Convert a per-kg price (what the AI backend returns) to an
  // approximate per-maund price (1 maund ≈ 37.3242 kg) for the
  // wholesale-style table, and figure out a simple day-over-day arrow.
  const PER_MAUND_KG = 37.3242
  const marketRows = marketPrices.map(p => {
    const perMaund = p.avg_price * PER_MAUND_KG
    const minPerMaund = p.min_price * PER_MAUND_KG
    const maxPerMaund = p.max_price * PER_MAUND_KG
    const diff = maxPerMaund - minPerMaund
    let status = 'Stable'
    if (diff > perMaund * 0.15) status = 'High Demand'
    else if (diff < perMaund * 0.05) status = 'Ample Stock'
    return {
      crop: p.crop_name,
      district: p.district,
      perMaund: Math.round(perMaund),
      minPerMaund: Math.round(minPerMaund),
      maxPerMaund: Math.round(maxPerMaund),
      status,
      lastUpdated: p.last_updated,
    }
  }).slice(0, 8)

  return (
    <div className="am-home" ref={rootRef}>
      {/* ===== HERO ===== */}
      <div className="am-hero">
        <div className="am-eyebrow">From the field to your hands</div>
        <h1>Where Bangladesh's harvest meets <em>fair value</em></h1>
        <p>
          AgroMitra is an AI-powered marketplace connecting farmers directly with buyers —
          no middlemen, transparent pricing, and payments protected until delivery.
        </p>
        <div className="am-hero-btns">
          <Link to="/farmer" className="am-btn am-btn-primary">👨‍🌾 I'm a Farmer</Link>
          <Link to="/buyer" className="am-btn am-btn-outline">🛒 I'm a Buyer</Link>
        </div>
        <div className="am-field-rows" />
      </div>

      {/* ===== STATS ===== */}
      <div className="am-stats-container">
        <div className="am-stats">
          {stats.map((s, i) => (
            <div key={i} className="am-stat">
              <div className="am-stat-icon">{s.icon}</div>
              <div className="am-stat-info">
                <div className="am-stat-val">{s.val}</div>
                <div className="am-stat-label">{s.label}</div>
              </div>
              <div className="am-stat-bar" />
            </div>
          ))}
        </div>
      </div>

      {/* ===== FEATURES ===== */}
      <div className="am-section am-reveal">
        <div className="am-section-head">
          <div className="am-section-eyebrow">Built for the field</div>
          <h2>Technology that speaks the farmer's language</h2>
          <p className="am-section-sub">Six tools working together so every harvest finds its fairest price.</p>
        </div>
        <div className="am-features">
          {features.map((f, i) => (
            <div key={i} className="am-feature">
              <div className="am-feature-top">
                <div className="am-feature-icon-circle">{f.icon}</div>
                <div className="am-feature-num">{String(i + 1).padStart(2, '0')}</div>
              </div>
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ===== LIVE AI DEMO ===== */}
      <div className="am-section am-reveal">
        <div className="am-section-head">
          <div className="am-section-eyebrow">See it in action</div>
          <h2>Real AI, running right now</h2>
          <p className="am-section-sub">Pick a crop and a district — this is live data from our forecasting model.</p>
        </div>

        <div className="am-demo">
          <div className="am-demo-controls">
            <div className="am-select-wrapper">
              <select className="am-demo-select" value={demoCrop} onChange={e => setDemoCrop(e.target.value)}>
                {DEMO_CROPS.map(c => <option key={c} value={c}>{DEMO_CROP_EMOJI[c]} {c}</option>)}
              </select>
            </div>
            <div className="am-select-wrapper">
              <select className="am-demo-select" value={demoDistrict} onChange={e => setDemoDistrict(e.target.value)}>
                {DEMO_DISTRICTS.map(d => <option key={d} value={d}>📍 {d}</option>)}
              </select>
            </div>
          </div>

          {demoLoading && (
            <div className="am-demo-loading">
              <span className="am-demo-spinner" />
              Running live AI forecast for {demoCrop} in {demoDistrict}…
            </div>
          )}

          {demoError && !demoLoading && (
            <div className="am-demo-error">⚠️ Could not reach the AI service. Please confirm the backend is live.</div>
          )}

          {demoData && !demoLoading && !demoError && (() => {
            const sparkData = demoData.price.forecasts?.map(f => ({ price: f.predicted_price })) || []
            const isUp = (demoData.price.summary?.trend_pct ?? 0) > 0
            const strokeColor = isUp ? '#2E7D32' : '#D32F2F'
            const fillColor = isUp ? 'rgba(46, 125, 50, 0.15)' : 'rgba(211, 47, 47, 0.15)'

            return (
              <div className="am-demo-results">
                {/* Card 1: Current Price */}
                <div className="am-demo-card am-demo-card-highlight">
                  <div className="am-demo-card-header">
                    <span className="am-demo-card-icon">💰</span>
                    <span className="am-demo-card-label">Current Price</span>
                  </div>
                  <div className="am-demo-card-val">৳{demoData.price.current_price}<span>/kg</span></div>
                  <div className="am-demo-spark">
                    <ResponsiveContainer width="100%" height={50}>
                      <AreaChart data={sparkData}>
                        <defs>
                          <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={strokeColor} stopOpacity={0.3} />
                            <stop offset="95%" stopColor={strokeColor} stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <YAxis domain={['dataMin - 1', 'dataMax + 1']} hide />
                        <Tooltip labelFormatter={() => 'Forecast'} />
                        <Area type="monotone" dataKey="price" stroke={strokeColor} fillOpacity={1} fill="url(#colorPrice)" strokeWidth={2.5} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Card 2: 7-Day Trend */}
                <div className="am-demo-card">
                  <div className="am-demo-card-header">
                    <span className="am-demo-card-icon">{isUp ? '📈' : '📉'}</span>
                    <span className="am-demo-card-label">7-Day Trend</span>
                  </div>
                  <div className={`am-demo-card-val ${isUp ? 'am-demo-up' : 'am-demo-down'}`}>
                    {isUp ? '↑' : '↓'} {Math.abs(demoData.price.summary?.trend_pct ?? 0).toFixed(1)}%
                  </div>
                  <p className="am-demo-card-meta">Based on recent shifts</p>
                </div>

                {/* Card 3: Market Outlook */}
                <div className="am-demo-card">
                  <div className="am-demo-card-header">
                    <span className="am-demo-card-icon">🧭</span>
                    <span className="am-demo-card-label">Market Outlook</span>
                  </div>
                  <div className="am-demo-card-val am-demo-card-val-sm">
                    {demoData.price.summary?.market_outlook || 'Stable'}
                  </div>
                  <p className="am-demo-card-meta">Smart suggestion</p>
                </div>

                {/* Card 4: Demand Signal */}
                <div className="am-demo-card">
                  <div className="am-demo-card-header">
                    <span className="am-demo-card-icon">📊</span>
                    <span className="am-demo-card-label">Demand Signal</span>
                  </div>
                  <div className="am-demo-card-val am-demo-card-val-sm">
                    {demoData.demand.forecasts?.[0]?.market_signal || 'Normal'}
                  </div>
                  <p className="am-demo-card-meta">Volume expectation</p>
                </div>
              </div>
            )
          })()}
        </div>
      </div>

      {/* ===== PROBLEM / SOLUTION ===== */}
      <div className="am-section am-reveal">
        <div className="am-section-head">
          <div className="am-section-eyebrow">The gap we close</div>
          <h2>From a broken chain to a direct line</h2>
          <p className="am-section-sub">Nine everyday frictions in Bangladesh's crop trade — and what replaces each one.</p>
        </div>
        <div className="am-flip-grid">
          {gapRows.map((row, i) => (
            <div key={i} className="am-flip-card">
              <div className="am-flip-inner">
                <div className="am-flip-front">
                  <div className="am-flip-top">
                    <div className="am-flip-icon-circle">⚠️</div>
                    <div className="am-flip-num">{String(i + 1).padStart(2, '0')}</div>
                  </div>
                  <span className="am-flip-tag tag-problem">Traditional Issue</span>
                  <p>{row.problem}</p>
                </div>
                <div className="am-flip-back">
                  <div className="am-flip-top">
                    <div className="am-flip-icon-circle-success">✅</div>
                  </div>
                  <span className="am-flip-tag tag-solution">AgroMitra Solution</span>
                  <p>{row.solution}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 1. EMERGENCY ADVISORY ALERTS — live from OpenWeatherMap via our backend */}
      <section className="am-section">
        <div className="am-weather-controls">
          <span className="am-weather-controls-label">📍 Checking weather for:</span>
          <select className="am-demo-select am-weather-select" value={weatherDistrict} onChange={e => setWeatherDistrict(e.target.value)}>
            {DEMO_DISTRICTS.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>

        {weatherLoading && (
          <div className="am-demo-loading">
            <span className="am-demo-spinner" />
            Checking live conditions in {weatherDistrict}…
          </div>
        )}

        {weatherError && !weatherLoading && (
          <div className="am-demo-error">⚠️ Could not reach the weather service right now.</div>
        )}

        {weather && !weatherLoading && !weatherError && (
          weather.has_alert ? (
            <div className="alert alert-warning" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '24px', border: '6px solid var(--orange)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '32px', paddingLeft: '20px' }}>⚠️</span>
                <div>
                  <strong style={{ fontSize: '16px', display: 'block', color: 'var(--orange)' }}>{weather.alert_title}</strong>
                  <span style={{ fontSize: '14px', color: 'var(--gray-dark)' }}>{weather.alert_message}</span>
                </div>
              </div>
              <strong style={{ fontSize: '16px', color: 'var(--orange)', display: 'block', paddingRight: '20px' }}>{weather.district} : {weather.temperature_c}°C {weather.alert_source}</strong>

            </div>
          ) : (
            <div className="alert alert-success" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '24px', border: '6px solid var(--green)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '32px' }}>☀️</span>
                <div>
                  <strong style={{ fontSize: '16px', display: 'block', color: 'var(--green-dark)' }}>No active weather alerts</strong>
                  <span style={{ fontSize: '14px', color: 'var(--gray-dark)' }}>Conditions in {weather.district}: {weather.condition}, {weather.temperature_c}°C, wind {weather.wind_speed_ms} m/s.</span>
                </div>
              </div>
              {/* <span className="badge badge-green" style={{ whiteSpace: 'nowrap' }}>Agri Info Service</span> */}
            </div>
          )
        )}
      </section>

      {/* 2. REAL-TIME MARKET PRICE — live from our backend (per-kg converted to per-maund) */}
      <section className="am-section">
        <div className="am-section-head">
          <span className="am-section-eyebrow">Live Updates</span>
          <h2>📊 Current Market Rates (Today's Wholesale Prices)</h2>
          <p className="am-section-sub">Check live prices from nearby markets to ensure fair value for your produce.</p>
        </div>

        {marketLoading && (
          <div className="am-demo-loading">
            <span className="am-demo-spinner" />
            Loading today's market rates…
          </div>
        )}

        {marketError && !marketLoading && (
          <div className="am-demo-error">⚠️ Could not load market prices right now.</div>
        )}

        {!marketLoading && !marketError && marketRows.length > 0 && (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Crop Name</th>
                  <th>District</th>
                  <th>Price (per Maund)</th>
                  <th>Price Range</th>
                  <th>Market Status</th>
                </tr>
              </thead>
              <tbody>
                {marketRows.map((r, i) => (
                  <tr key={i}>
                    <td><strong>{CROP_EMOJI[r.crop] || '🌿'} {r.crop}</strong></td>
                    <td>{r.district}</td>
                    <td>৳{r.perMaund.toLocaleString()}</td>
                    <td style={{ fontSize: 13, color: 'var(--gray)' }}>৳{r.minPerMaund.toLocaleString()} – ৳{r.maxPerMaund.toLocaleString()}</td>
                    <td>
                      <span className={`badge ${r.status === 'High Demand' ? 'badge-green' : r.status === 'Ample Stock' ? 'badge-orange' : 'badge-blue'}`}>
                        {r.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!marketLoading && !marketError && marketRows.length === 0 && (
          <div style={{ textAlign: 'center', padding: 30, color: 'var(--gray)' }}>No market price data available right now.</div>
        )}
      </section>

      {/* 3. REGIONAL SOWING CALENDAR — live from our backend, derived from CROP_DB.best_months */}
      <section className="am-section">
        <div className="am-section-head">
          <span className="am-section-eyebrow">Cultivation Guide</span>
          <h2>📅 Regional Sowing Calendar ({calendar?.month_name || 'This Month'})</h2>
          <p className="am-section-sub">Plant the right crop at the right time to maximize seasonal yield.</p>
        </div>

        {calendarLoading && (
          <div className="am-demo-loading">
            <span className="am-demo-spinner" />
            Building this month's sowing calendar…
          </div>
        )}

        {calendarError && !calendarLoading && (
          <div className="am-demo-error">⚠️ Could not load the sowing calendar right now.</div>
        )}

        {!calendarLoading && !calendarError && calendar?.crops?.length > 0 && (
          <div className="grid-3">
            {calendar.crops.map((c, i) => (
              <div className="card" key={i}>
                <div className="card-title">{CROP_EMOJI[c.crop] || '🌿'} {c.crop} ({c.name_bn})</div>
                <div className="form-group" style={{ marginBottom: '8px' }}>
                  <span className="form-label">Grow duration: {c.grow_days} days • {c.difficulty}</span>
                </div>
                <p style={{ fontSize: '13px', color: 'var(--gray)', lineHeight: '1.5' }}>
                  Best suited to {c.soil_types.join(', ')} soil, with {c.water_need.toLowerCase()} water needs.
                  {c.districts?.length > 0 && ` Commonly grown in ${c.districts.slice(0, 3).join(', ')}.`}
                </p>
                <div style={{ marginTop: '12px' }}>
                  <span className={`badge ${c.market_demand === 'Very High' ? 'badge-green' : c.market_demand === 'High' ? 'badge-blue' : 'badge-orange'}`}>
                    Demand: {c.market_demand}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {!calendarLoading && !calendarError && calendar && calendar.crops?.length === 0 && (
          <div style={{ textAlign: 'center', padding: 30, color: 'var(--gray)' }}>
            No recommended crops for {calendar.month_name} in our current database.
          </div>
        )}
      </section>

      {/* 5. PROJECT ROADMAP & TECH STACK — intentionally static, descriptive content */}
      <section className="am-section" style={{ borderTop: '1px solid var(--gray-light)', paddingTop: '50px' }}>
        <div className="am-section-head">
          <span className="am-section-eyebrow">Technical Architecture</span>
          <h2>⚙️ Project Specifications & Tech Stack</h2>
          <p className="am-section-sub">UU | Department of Computer Science & Engineering</p>
        </div>

        <div className="grid-3" style={{ textAlign: 'center' }}>
          <div className="card">
            <div style={{ fontSize: '32px', marginBottom: '10px' }}>💻</div>
            <h4 style={{ marginBottom: '6px' }}>Frontend Framework</h4>
            <p style={{ fontSize: '14px', color: 'var(--gray)', lineHeight: '1.6' }}>Built on <strong>React.js</strong> using modular, reusable components. Interacts with the backend via asynchronous <strong>Axios HTTP client</strong> requests, ensuring seamless page state changes without reloads.</p>
          </div>

          <div className="card" >
            <div style={{ fontSize: '32px', marginBottom: '10px' }}>⚡</div>
            <h3 style={{ fontSize: '18px', marginBottom: '8px' }}>FastAPI Backend</h3>
            <p style={{ fontSize: '14px', color: 'var(--gray)', lineHeight: '1.6' }}>
              Powered by an asynchronous <strong>Python FastAPI</strong> REST server. Handles machine learning model execution (Prophet + XGBoost) and performs rapid request routing using type-safe Pydantic models.
            </p>
          </div>

          <div className="card">
            <div style={{ fontSize: '32px', marginBottom: '10px' }}>🧠</div>
            <h4 style={{ marginBottom: '6px' }}>Core Algorithms</h4>
            <p style={{ fontSize: '14px', color: 'var(--gray)', lineHeight: '1.6' }}>
              Employs a knowledge-based <strong>Rule-Based Crop Recommendation System</strong> that filters optimal crops by season, budget, and market trends. Powered by a <strong>Regional Soil Profile Mapping Engine</strong> that parses static district-wise soil matrices (N-P-K baselines and soil textures) without requiring live hardware testing.
            </p>
          </div>
        </div>
      </section>
      {/* ===== HOW IT WORKS ===== */}
      <section className="am-section am-reveal">
        <div className="am-section-head">
          <div className="am-section-eyebrow">Simple & Transparent</div>
          <h2>How AgroMitra Works</h2>
          <p className="am-section-sub">From harvest to payment in 4 simple steps.</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 24, position: 'relative' }}>
          {[
            { step: '01', icon: '👨‍🌾', title: 'Farmer Lists Crop', desc: 'Farmer registers, lists produce with price, quantity, quality grade and photos.' },
            { step: '02', icon: '🛒', title: 'Buyer Places Order', desc: 'Buyer browses verified listings, checks AI fair price, and places order securely.' },
            { step: '03', icon: '🔒', title: 'Payment in Escrow', desc: 'bKash/Nagad payment is held safely in AgroMitra escrow — neither party can misuse it.' },
            { step: '04', icon: '✅', title: 'Delivery & Release', desc: 'Farmer delivers, buyer confirms receipt, escrow releases funds instantly to farmer.' },
          ].map((s, i) => (
            <div key={i} style={{
              background: 'white', borderRadius: 12, padding: 28,
              boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
              borderTop: '4px solid var(--green)', position: 'relative'
            }}>
              <div style={{
                position: 'absolute', top: -16, left: 24,
                background: 'var(--green-dark)', color: 'white',
                fontWeight: 800, fontSize: 13, padding: '4px 12px',
                borderRadius: 20
              }}>Step {s.step}</div>
              <div style={{ fontSize: 40, marginBottom: 14, marginTop: 8 }}>{s.icon}</div>
              <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 8, color: 'var(--gray-dark)' }}>{s.title}</h3>
              <p style={{ fontSize: 14, color: 'var(--gray)', lineHeight: 1.6 }}>{s.desc}</p>
              {i < 3 && (
                <div style={{
                  position: 'absolute', right: -12, top: '50%',
                  transform: 'translateY(-50%)',
                  fontSize: 20, color: 'var(--green-light)', zIndex: 1,
                  display: 'none' // hidden on mobile, shown on desktop via CSS
                }}>→</div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ===== TESTIMONIALS ===== */}
      <section className="am-section am-reveal">
        <div className="am-section-head">
          <div className="am-section-eyebrow">Farmer & Buyer Stories</div>
          <h2>Real impact, real people</h2>
          <p className="am-section-sub">How AgroMitra is changing lives across Bangladesh.</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
          {[
            {
              name: 'Mohammad Rahim',
              role: '🌾 Farmer, Bogura',
              quote: 'আগে দালালদের মাধ্যমে বিক্রি করতাম, দাম পেতাম না। AgroMitra-তে সরাসরি buyer পাই, দাম ৪০% বেশি পাচ্ছি।',
              avatar: '👨‍🌾',
              rating: 5,
            },
            {
              name: 'Fatema Begum',
              role: '🥕 Farmer, Dinajpur',
              quote: 'AI crop recommendation দেখে এই মৌসুমে গাজর চাষ করলাম। বাজারে চাহিদা বেশি ছিল, ভালো লাভ হয়েছে।',
              avatar: '👩‍🌾',
              rating: 5,
            },
            {
              name: 'Karim Hossain',
              role: '🛒 Buyer, Dhaka',
              quote: 'Fresh vegetables directly from farmers. Quality is much better than local market and prices are fair. The escrow payment gives me full confidence.',
              avatar: '🧑‍💼',
              rating: 5,
            },
            {
              name: 'Nasrin Akter',
              role: '🛒 Buyer, Chattogram',
              quote: 'AI fair price feature helps me know if a listing is worth it. I saved almost ৳3,000 last month by comparing AI-suggested prices.',
              avatar: '👩‍💼',
              rating: 4,
            },
            {
              name: 'Md. Rafiqul Islam',
              role: '🌾 Farmer, Bogura',
              quote: 'স্মার্ট এআই ফেয়ার প্রাইস এনালাইসিস দেখে সঠিক দামে আলু বিক্রি করতে পেরেছি। ফড়িয়াদের খপ্পরে পড়তে হয়নি, ন্যায্য মূল্য পেয়েছি।',
              avatar: '👨‍🌾',
              rating: 4.5,
            },
            {
              name: 'Anisur Rahman',
              role: '🥭 Merchant, Dhaka',
              quote: 'সরাসরি চাষীদের থেকে এসক্রো পেমেন্টের মাধ্যমে আম কিনতে পেরে ব্যবসার ঝুক্কি অনেক কমে গেছে। টাকা এবং প্রোডাক্ট দুটোই একদম সেফ থাকে।',
              avatar: '👨‍💼',
              rating: 4.5,
            }

          ].map((t, i) => (
            <div key={i} style={{
              background: 'white', borderRadius: 12, padding: 24,
              boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
              borderLeft: '4px solid var(--green)',
              display: 'flex', flexDirection: 'column', gap: 12
            }}>
              <div style={{ fontSize: 24 }}>{'⭐'.repeat(t.rating)}</div>
              <p style={{ fontSize: 14, color: 'var(--gray-dark)', lineHeight: 1.7, fontStyle: 'italic' }}>
                "{t.quote}"
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 'auto' }}>
                <span style={{ fontSize: 32 }}>{t.avatar}</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{t.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--gray)' }}>{t.role}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ===== TEAM ===== */}
      <section className="am-section am-reveal">
        <div className="am-section-head">
          <div className="am-section-eyebrow">Uttara University — CSE Department</div>
          <h2>Meet the Team</h2>
          <p className="am-section-sub">Final year project — Batch 60-C, Evening Program</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20, maxWidth: 800, margin: '0 auto' }}>
          {[
            {
              name: 'Lal Chand Ali',
              role: 'Developer & Researcher',
              details: 'Full-stack development · AI/ML integration · React + FastAPI',
              avatar: '👨‍💻',
              tag: 'Student',
            },
            {
              name: 'Lal Chand Ali',
              role: 'Developer & Researcher',
              details: 'Full-stack development · AI/ML integration · React + FastAPI',
              avatar: '👨‍💻',
              tag: 'Student',
            },
            {
              name: 'Lal Chand Ali',
              role: 'Developer & Researcher',
              details: 'Full-stack development · AI/ML integration · React + FastAPI',
              avatar: '👨‍💻',
              tag: 'Student',
            },
            {
              name: 'Lal Chand Ali',
              role: 'Developer & Researcher',
              details: 'Full-stack development · AI/ML integration · React + FastAPI',
              avatar: '👨‍💻',
              tag: 'Student',
            },
            {
              name: 'Lal Chand Ali',
              role: 'Developer & Researcher',
              details: 'Full-stack development · AI/ML integration · React + FastAPI',
              avatar: '👨‍💻',
              tag: 'Student',
            },
            {
              name: 'Md. Ashraful Kabir',
              role: 'Project Supervisor',
              details: 'Department of CSE · Uttara University, Dhaka',
              avatar: '👨‍🏫',
              tag: 'Supervisor',
            },
          ].map((m, i) => (
            <div key={i} style={{
              background: 'white', borderRadius: 12, padding: 28,
              boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
              textAlign: 'center', border: '1px solid #E8F5E9'
            }}>
              <div style={{
                width: 72, height: 72, borderRadius: '50%',
                background: 'var(--green-pale)', fontSize: 36,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 16px'
              }}>{m.avatar}</div>
              <div style={{
                display: 'inline-block', fontSize: 11, fontWeight: 700,
                background: 'var(--green-pale)', color: 'var(--green-dark)',
                padding: '3px 10px', borderRadius: 20, marginBottom: 8
              }}>{m.tag}</div>
              <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 4 }}>{m.name}</div>
              <div style={{ fontSize: 13, color: 'var(--green-dark)', fontWeight: 600, marginBottom: 8 }}>{m.role}</div>
              <div style={{ fontSize: 13, color: 'var(--gray)', lineHeight: 1.6 }}>{m.details}</div>
            </div>
          ))}
        </div>

        {/* University badge */}
        <center><div style={{
          marginTop: 35, textAlign: 'center',
          background: 'white', borderRadius: 12, padding: '25px 37px',
          boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
          display: 'inline-flex', alignItems: 'center', gap: 16,
          border: '1px solid #E8F5E9'
        }}>
          <span style={{ fontSize: 40 }}>🎓</span>
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--green-dark)' }}>Uttara University</div>
            <div style={{ fontSize: 13, color: 'var(--gray)' }}>Department of Computer Science & Engineering</div>
            <div style={{ fontSize: 12, color: 'var(--gray)' }}>Dhaka, Bangladesh · Final Year Project 2026</div>
          </div>
        </div>
        </center>

      </section>

      {/* ===== CTA ===== */}
      <div className="am-section am-reveal">
        <div className="am-cta">
          <h2>Ready to transform Bangladeshi agriculture?</h2>
          <p>Join thousands of farmers and smart buyers already using AgroMitra</p>
          <div className="am-hero-btns">
            <Link to="/farmer" className="am-btn am-btn-primary">Get Started as Farmer</Link>
            <Link to="/buyer" className="am-btn am-btn-outline">Browse Marketplace</Link>
          </div>
        </div>
      </div>
      {/* ===== FOOTER ===== */}
      <footer style={{
        background: 'var(--green-dark)', color: 'rgba(255,255,255,0.85)',
        padding: '48px 24px 24px', marginTop: 60
      }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 32, marginBottom: 40 }}>

            {/* Brand */}
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, color: 'white', marginBottom: 10 }}>🌾 AgroMitra</div>
              <p style={{ fontSize: 13, lineHeight: 1.7, opacity: 0.8 }}>
                AI-powered agricultural marketplace connecting Bangladeshi farmers directly with buyers.
                Fair prices. Zero middlemen. Secure payments.
              </p>
            </div>

            {/* Platform */}
            <div>
              <div style={{ fontWeight: 700, color: 'white', marginBottom: 12, fontSize: 14 }}>Platform</div>
              {[
                ['👨‍🌾 Farmer Dashboard', '/farmer'],
                ['🛒 Buyer Marketplace', '/buyer'],
                ['🛡️ Admin Panel', '/admin'],
                ['🔐 Login / Register', '/auth'],
              ].map(([label, path], i) => (
                <div key={i} style={{ marginBottom: 8 }}>
                  <Link to={path} style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13, textDecoration: 'none' }}
                    onMouseOver={e => e.target.style.color = 'white'}
                    onMouseOut={e => e.target.style.color = 'rgba(255,255,255,0.75)'}
                  >{label}</Link>
                </div>
              ))}
            </div>

            {/* AI Features */}
            <div>
              <div style={{ fontWeight: 700, color: 'white', marginBottom: 12, fontSize: 14 }}>AI Features</div>
              {[
                '🤖 Price Prediction (Prophet + XGBoost)',
                '📊 Demand Forecasting (LSTM)',
                '🌱 Crop Recommendation',
                '💰 Fair Price Analysis',
                '🌤️ Weather Alerts',
                '📅 Sowing Calendar',
              ].map((f, i) => (
                <div key={i} style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', marginBottom: 6 }}>{f}</div>
              ))}
            </div>

            {/* Tech Stack */}
            <div>
              <div style={{ fontWeight: 700, color: 'white', marginBottom: 12, fontSize: 14 }}>Tech Stack</div>
              {[
                '⚛️ React.js + Vite',
                '⚡ FastAPI (Python)',
                '🗄️ PostgreSQL',
                '🔐 JWT Authentication',
                '💚 bKash / Nagad Escrow',
                '🌐 OpenWeatherMap API',
              ].map((t, i) => (
                <div key={i} style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', marginBottom: 6 }}>{t}</div>
              ))}
            </div>
          </div>

          {/* Bottom bar */}
          <div style={{
            borderTop: '1px solid rgba(255,255,255,0.15)',
            paddingTop: 20, display: 'flex',
            justifyContent: 'space-between', alignItems: 'center',
            flexWrap: 'wrap', gap: 12
          }}>
            <div style={{ fontSize: 13, opacity: 0.7 }}>
              © 2026 AgroMitra · Uttara University, CSE Department · Final Year Project
            </div>
            <div style={{ fontSize: 13, opacity: 0.7 }}>
              Developed by <strong style={{ color: 'white' }}>Lal Chand Ali</strong> · Supervised by <strong style={{ color: 'white' }}>Md. Ashraful Kabir</strong>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default Home
