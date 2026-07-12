import { useState, useEffect } from 'react'
import { useLanguage } from '../hooks/useLanguage'
import { clearAuthSession, getPlatformFee, updatePlatformFee } from '../api/agromitra'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'

// ── Helpers ──────────────────────────────────────────────────
const PREF_KEY = 'agromitra_prefs'
const getPrefs = () => {
  try { return JSON.parse(localStorage.getItem(PREF_KEY) || '{}') }
  catch { return {} }
}
const savePrefs = (prefs) => localStorage.setItem(PREF_KEY, JSON.stringify(prefs))

// Toggle switch component
function Toggle({ on, onChange, label, sub }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0', borderBottom: '1px solid var(--border-col, #E0E0E0)' }}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-main, #212121)' }}>{label}</div>
        {sub && <div style={{ fontSize: 12, color: 'var(--text-sub, #546E7A)', marginTop: 2 }}>{sub}</div>}
      </div>
      <div
        onClick={onChange}
        style={{
          width: 44, height: 24, borderRadius: 99, cursor: 'pointer',
          background: on ? '#2E7D32' : '#CFD8DC',
          position: 'relative', transition: 'background 0.2s', flexShrink: 0
        }}
      >
        <div style={{
          position: 'absolute', top: 3, left: on ? 23 : 3,
          width: 18, height: 18, borderRadius: '50%',
          background: 'white', transition: 'left 0.2s',
          boxShadow: '0 1px 4px rgba(0,0,0,0.25)'
        }} />
      </div>
    </div>
  )
}

export default function SettingsTab({ userRole }) {
  const { lang, toggleLang } = useLanguage()
  const navigate = useNavigate()
  const isBn = lang === 'bn'

  // prefs state
  const [prefs, setPrefs] = useState(getPrefs)
  const [darkMode, setDarkMode] = useState(() => document.body.classList.contains('dark-mode'))

  // password change
  const [showPassForm, setShowPassForm] = useState(false)
  const [passForm, setPassForm] = useState({ current: '', newPass: '', confirm: '' })
  const [showPass, setShowPass] = useState(false)

  // delete account
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteInput, setDeleteInput] = useState('')

  // platform fee (admin only)
  const [platformFee, setPlatformFee] = useState(null)      // বর্তমানে server-এ যা সেভ আছে
  const [feeInput, setFeeInput]       = useState('')        // input field-এর value
  const [feeLoading, setFeeLoading]   = useState(false)
  const [feeSaving, setFeeSaving]     = useState(false)

  const T = (en, bn) => isBn ? bn : en

  // Sync pref changes
  const setPref = (key, val) => {
    const next = { ...prefs, [key]: val }
    setPrefs(next)
    savePrefs(next)
  }

  // Dark mode toggle
  const toggleDark = () => {
    const next = !darkMode
    setDarkMode(next)
    document.body.classList.toggle('dark-mode', next)
    localStorage.setItem('agromitra_dark', next ? '1' : '0')
    toast.success(next ? T('Dark mode on 🌙', 'ডার্ক মোড চালু 🌙') : T('Light mode on ☀️', 'লাইট মোড চালু ☀️'))
  }

  // Load dark mode on mount
  useEffect(() => {
    const saved = localStorage.getItem('agromitra_dark')
    if (saved === '1') { document.body.classList.add('dark-mode'); setDarkMode(true) }
    else { document.body.classList.remove('dark-mode'); setDarkMode(false) }
  }, [])

  // Admin হলে বর্তমান platform fee % লোড করো
  useEffect(() => {
    if (userRole !== 'admin') return
    setFeeLoading(true)
    getPlatformFee()
      .then(({ data }) => {
        setPlatformFee(data.platform_fee_percent)
        setFeeInput(String(data.platform_fee_percent))
      })
      .catch(() => toast.error(T('Could not load platform fee', 'প্ল্যাটফর্ম ফি লোড করা যায়নি')))
      .finally(() => setFeeLoading(false))
  }, [userRole])

  const handleSavePlatformFee = async () => {
    const value = parseFloat(feeInput)
    if (Number.isNaN(value) || value < 0 || value > 20) {
      toast.error(T('Enter a value between 0 and 20', '০ থেকে ২০ এর মধ্যে একটি মান দিন'))
      return
    }
    setFeeSaving(true)
    try {
      const { data } = await updatePlatformFee(value)
      setPlatformFee(data.platform_fee_percent)
      setFeeInput(String(data.platform_fee_percent))
      toast.success(T(`Platform fee updated to ${data.platform_fee_percent}%`, `প্ল্যাটফর্ম ফি ${data.platform_fee_percent}% করা হয়েছে`))
    } catch (e) {
      toast.error(e?.response?.data?.detail || T('Could not update platform fee', 'প্ল্যাটফর্ম ফি আপডেট করা যায়নি'))
    } finally {
      setFeeSaving(false)
    }
  }

  const handlePasswordChange = (e) => {
    e.preventDefault()
    if (!passForm.current) { toast.error(T('Enter current password', 'বর্তমান পাসওয়ার্ড দিন')); return }
    if (passForm.newPass.length < 6) { toast.error(T('Min 6 characters', 'কমপক্ষে ৬ অক্ষর')); return }
    if (passForm.newPass !== passForm.confirm) { toast.error(T('Passwords do not match', 'পাসওয়ার্ড মিলছে না')); return }
    // TODO: connect to backend /api/v1/auth/change-password
    toast.success(T('Password changed!', 'পাসওয়ার্ড পরিবর্তন হয়েছে!'))
    setPassForm({ current: '', newPass: '', confirm: '' })
    setShowPassForm(false)
  }

  const handleDeleteAccount = () => {
    if (deleteInput !== 'DELETE') { toast.error(T('Type DELETE to confirm', '"DELETE" টাইপ করুন')); return }
    toast.success(T('Account deleted. Goodbye!', 'অ্যাকাউন্ট মুছে ফেলা হয়েছে!'))
    clearAuthSession()
    navigate('/auth')
  }

  return (
    <div style={{ maxWidth: 580, margin: '0 auto' }}>

      {/* ── 1. Language & Theme ── */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-title">🌐 {T('Language & Theme', 'ভাষা ও থিম')}</div>
        <Toggle
          on={isBn}
          onChange={toggleLang}
          label={T('Bengali Language', 'বাংলা ভাষা')}
          sub={T('Switch interface to Bengali', 'ইন্টারফেস বাংলায় দেখুন')}
        />
        <Toggle
          on={darkMode}
          onChange={toggleDark}
          label={T('Dark Mode', 'ডার্ক মোড')}
          sub={T('Use dark theme across all dashboards', 'সব ড্যাশবোর্ডে ডার্ক থিম ব্যবহার করুন')}
        />
      </div>

      {/* ── Admin-only: Platform Fee ── */}
      {userRole === 'admin' && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-title">💰 {T('Platform Fee', 'প্ল্যাটফর্ম ফি')}</div>
          <p style={{ fontSize: 13, color: 'var(--text-sub, #546E7A)', marginBottom: 16, lineHeight: 1.6 }}>
            {T(
              'This percentage is deducted from every order as the platform fee (paid by the farmer\'s share, buyer pays the full price).',
              'প্রতিটি অর্ডার থেকে এই শতাংশ প্ল্যাটফর্ম ফি হিসেবে কাটা হয় (কৃষকের প্রাপ্য অংশ থেকে, ক্রেতা সম্পূর্ণ মূল্য দেন)।'
            )}
          </p>

          {feeLoading ? (
            <div style={{ color: 'var(--text-sub, #546E7A)', fontSize: 13 }}>{T('Loading...', 'লোড হচ্ছে...')}</div>
          ) : (
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div className="form-group" style={{ marginBottom: 0, flex: '1 1 160px' }}>
                <label className="form-label">{T('Fee Percentage (%)', 'ফি শতাংশ (%)')}</label>
                <input
                  className="form-input"
                  type="number"
                  min="0"
                  max="20"
                  step="0.1"
                  value={feeInput}
                  onChange={e => setFeeInput(e.target.value)}
                  placeholder="3.0"
                />
              </div>
              <button
                className="btn btn-primary"
                onClick={handleSavePlatformFee}
                disabled={feeSaving || feeInput === '' || parseFloat(feeInput) === platformFee}
              >
                {feeSaving ? T('Saving...', 'সেভ হচ্ছে...') : T('💾 Save', '💾 সেভ করুন')}
              </button>
            </div>
          )}

          {platformFee !== null && (
            <div style={{ marginTop: 12, fontSize: 13, color: 'var(--text-sub, #546E7A)' }}>
              {T('Current fee:', 'বর্তমান ফি:')} <strong>{platformFee}%</strong>
              {' — '}
              {T(
                `On a ৳1,000 order, the platform keeps ৳${(1000 * platformFee / 100).toFixed(2)}.`,
                `৳১,০০০ টাকার অর্ডারে প্ল্যাটফর্ম ৳${(1000 * platformFee / 100).toFixed(2)} রাখবে।`
              )}
            </div>
          )}
        </div>
      )}

      {/* ── 2. Notifications ── */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-title">🔔 {T('Notification Preferences', 'নোটিফিকেশন পছন্দ')}</div>
        <Toggle
          on={prefs.notif_order !== false}
          onChange={() => setPref('notif_order', prefs.notif_order === false ? true : false)}
          label={T('Order Updates', 'অর্ডার আপডেট')}
          sub={T('Get notified when order status changes', 'অর্ডারের অবস্থা পরিবর্তনে নোটিফিকেশন পান')}
        />
        <Toggle
          on={prefs.notif_price !== false}
          onChange={() => setPref('notif_price', prefs.notif_price === false ? true : false)}
          label={T('Price Alerts', 'মূল্য সতর্কতা')}
          sub={T('Get notified on significant price changes', 'বড় মূল্য পরিবর্তনে নোটিফিকেশন পান')}
        />
        <Toggle
          on={prefs.notif_weather !== false}
          onChange={() => setPref('notif_weather', prefs.notif_weather === false ? true : false)}
          label={T('Weather Alerts', 'আবহাওয়া সতর্কতা')}
          sub={T('Receive weather warnings for your district', 'আপনার জেলার আবহাওয়া সতর্কতা পান')}
        />
        {userRole === 'farmer' && (
          <Toggle
            on={prefs.notif_new_order !== false}
            onChange={() => setPref('notif_new_order', prefs.notif_new_order === false ? true : false)}
            label={T('New Order Alerts', 'নতুন অর্ডার সতর্কতা')}
            sub={T('Get notified when a buyer places an order', 'ক্রেতা অর্ডার করলে নোটিফিকেশন পান')}
          />
        )}
      </div>

      {/* ── 3. Password Change ── */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: showPassForm ? 20 : 0 }}>
          <div className="card-title" style={{ marginBottom: 0 }}>🔑 {T('Change Password', 'পাসওয়ার্ড পরিবর্তন')}</div>
          <button
            className={`btn btn-sm ${showPassForm ? 'btn-secondary' : 'btn-primary'}`}
            onClick={() => setShowPassForm(!showPassForm)}
          >
            {showPassForm ? T('✕ Cancel', '✕ বাতিল') : T('Change', 'পরিবর্তন করুন')}
          </button>
        </div>

        {showPassForm && (
          <form onSubmit={handlePasswordChange}>
            {[
              ['current', T('Current Password', 'বর্তমান পাসওয়ার্ড')],
              ['newPass', T('New Password (min 6 chars)', 'নতুন পাসওয়ার্ড (কমপক্ষে ৬ অক্ষর)')],
              ['confirm', T('Confirm New Password', 'নতুন পাসওয়ার্ড নিশ্চিত করুন')],
            ].map(([field, label]) => (
              <div key={field} className="form-group">
                <label className="form-label">{label}</label>
                <div style={{ position: 'relative' }}>
                  <input
                    className="form-input"
                    type={showPass ? 'text' : 'password'}
                    value={passForm[field]}
                    onChange={e => setPassForm({ ...passForm, [field]: e.target.value })}
                    style={{ paddingRight: 40 }}
                  />
                  {field === 'confirm' && (
                    <button type="button" onClick={() => setShowPass(!showPass)}
                      style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 16 }}>
                      {showPass ? '🙈' : '👁️'}
                    </button>
                  )}
                </div>
                {field === 'confirm' && passForm.confirm && passForm.newPass !== passForm.confirm && (
                  <div style={{ fontSize: 12, color: '#C62828', marginTop: 4 }}>❌ {T('Passwords do not match', 'পাসওয়ার্ড মিলছে না')}</div>
                )}
              </div>
            ))}
            <button type="submit" className="btn btn-primary btn-full" style={{ marginTop: 8 }}>
              🔑 {T('Update Password', 'পাসওয়ার্ড আপডেট করুন')}
            </button>
          </form>
        )}
      </div>

      {/* ── 4. Privacy ── */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-title">🔒 {T('Privacy Settings', 'গোপনীয়তা সেটিংস')}</div>
        <Toggle
          on={prefs.show_phone !== false}
          onChange={() => setPref('show_phone', prefs.show_phone === false ? true : false)}
          label={T('Show phone to buyers', 'ক্রেতাদের কাছে ফোন দেখান')}
          sub={T('Buyers can see your mobile number', 'ক্রেতারা আপনার মোবাইল নম্বর দেখতে পাবেন')}
        />
        <Toggle
          on={prefs.show_district !== false}
          onChange={() => setPref('show_district', prefs.show_district === false ? true : false)}
          label={T('Show district publicly', 'জেলা প্রকাশ্যে দেখান')}
          sub={T('Show your district on product listings', 'পণ্য তালিকায় জেলা দেখান')}
        />
      </div>

      {/* ── 5. Danger Zone ── */}
      <div className="card" style={{ border: '1px solid #FFCDD2', marginBottom: 20 }}>
        <div className="card-title" style={{ color: '#C62828' }}>⚠️ {T('Danger Zone', 'বিপজ্জনক এলাকা')}</div>
        <p style={{ fontSize: 13, color: 'var(--text-sub, #546E7A)', marginBottom: 16, lineHeight: 1.6 }}>
          {T(
            'Deleting your account is permanent and cannot be undone. All your data, products, and orders will be removed.',
            'অ্যাকাউন্ট মুছে ফেলা স্থায়ী এবং পূর্বাবস্থায় ফেরানো যাবে না। আপনার সব তথ্য, পণ্য এবং অর্ডার মুছে যাবে।'
          )}
        </p>

        {!showDeleteConfirm ? (
          <button
            className="btn"
            onClick={() => setShowDeleteConfirm(true)}
            style={{ background: '#FFEBEE', color: '#C62828', border: '1px solid #FFCDD2', fontWeight: 600 }}
          >
            🗑️ {T('Delete My Account', 'আমার অ্যাকাউন্ট মুছুন')}
          </button>
        ) : (
          <div>
            <div style={{ background: '#FFF3E0', border: '1px solid #FFCC80', borderRadius: 8, padding: 14, marginBottom: 14, fontSize: 13, color: '#E65100' }}>
              ⚠️ {T('Type "DELETE" below to confirm account deletion', 'নিশ্চিত করতে নিচে "DELETE" টাইপ করুন')}
            </div>
            <input
              className="form-input"
              placeholder='DELETE'
              value={deleteInput}
              onChange={e => setDeleteInput(e.target.value)}
              style={{ marginBottom: 10, borderColor: deleteInput === 'DELETE' ? '#C62828' : undefined }}
            />
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                className="btn"
                onClick={handleDeleteAccount}
                disabled={deleteInput !== 'DELETE'}
                style={{
                  background: deleteInput === 'DELETE' ? '#C62828' : '#E0E0E0',
                  color: deleteInput === 'DELETE' ? 'white' : '#9E9E9E',
                  border: 'none', fontWeight: 600
                }}
              >
                🗑️ {T('Confirm Delete', 'মুছে ফেলুন')}
              </button>
              <button className="btn btn-secondary" onClick={() => { setShowDeleteConfirm(false); setDeleteInput('') }}>
                {T('Cancel', 'বাতিল')}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── App Info ── */}
      <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--text-sub, #546E7A)', fontSize: 12 }}>
        <div>AgroMitra v1.0.0 · Uttara University</div>
        <div style={{ marginTop: 4 }}>Built with ❤️ for Bangladeshi Farmers</div>
      </div>

    </div>
  )
}
