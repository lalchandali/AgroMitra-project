import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { forgotPassword, resetPassword } from '../api/agromitra'
import toast from 'react-hot-toast'

// Step indicators
const STEPS = ['Mobile', 'OTP', 'New Password']

export default function ForgotPassword() {
  const navigate = useNavigate()
  const [step, setStep] = useState(1)   // 1=mobile, 2=otp, 3=new password
  const [mobile, setMobile]       = useState('')
  const [otp, setOtp]             = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading]     = useState(false)
  const [devOtp, setDevOtp]       = useState(null)   // dev mode only

  // ── Step 1: Request OTP ───────────────────────────────────
  const handleRequestOtp = async () => {
    if (!mobile.trim()) { toast.error('Mobile number required'); return }
    if (!/^01[3-9]\d{8}$/.test(mobile)) { toast.error('Invalid Bangladeshi mobile number'); return }
    setLoading(true)
    try {
      const res = await forgotPassword(mobile)
      toast.success('OTP sent! Check backend console (dev mode)')
      // dev_otp is returned in dev mode — show it for convenience
      if (res.data?.dev_otp) setDevOtp(res.data.dev_otp)
      setStep(2)
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Mobile number not found')
    } finally { setLoading(false) }
  }

  // ── Step 2: Verify OTP ────────────────────────────────────
  const handleVerifyOtp = () => {
    if (!otp.trim() || otp.length < 4) { toast.error('Enter the OTP'); return }
    setStep(3)
  }

  // ── Step 3: Reset Password ────────────────────────────────
  const handleResetPassword = async () => {
    if (!newPassword) { toast.error('Enter new password'); return }
    if (newPassword.length < 6) { toast.error('Password must be at least 6 characters'); return }
    if (newPassword !== confirmPassword) { toast.error('Passwords do not match'); return }
    setLoading(true)
    try {
      await resetPassword(mobile, otp, newPassword)
      toast.success('Password reset successfully! Please login.')
      navigate('/auth')
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Invalid OTP or request expired')
      setStep(2)   // go back to OTP step
    } finally { setLoading(false) }
  }

  return (
    <div style={{
      minHeight: '80vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', padding: '40px 20px'
    }}>
      <div style={{ width: '100%', maxWidth: 440 }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 56, marginBottom: 8 }}>🔑</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--green-dark)' }}>Reset Password</div>
          <div style={{ fontSize: 14, color: 'var(--gray)', marginTop: 6 }}>
            Enter your registered mobile number to get started
          </div>
        </div>

        {/* Step indicator */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 32, gap: 0 }}>
          {STEPS.map((label, i) => {
            const n = i + 1
            const done = step > n
            const active = step === n
            return (
              <div key={n} style={{ display: 'flex', alignItems: 'center' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: '50%', fontSize: 13, fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: done ? 'var(--green)' : active ? 'var(--green)' : '#E0E0E0',
                    color: (done || active) ? 'white' : '#9E9E9E',
                    transition: 'all 0.3s'
                  }}>
                    {done ? '✓' : n}
                  </div>
                  <div style={{ fontSize: 11, color: active ? 'var(--green-dark)' : '#9E9E9E', fontWeight: active ? 600 : 400 }}>
                    {label}
                  </div>
                </div>
                {i < STEPS.length - 1 && (
                  <div style={{
                    width: 60, height: 2, marginBottom: 18,
                    background: step > n + 1 || (step > n) ? 'var(--green)' : '#E0E0E0',
                    transition: 'background 0.3s'
                  }} />
                )}
              </div>
            )
          })}
        </div>

        {/* Card */}
        <div className="card" style={{ padding: 28 }}>

          {/* ── Step 1: Mobile ── */}
          {step === 1 && (
            <div>
              <div className="form-group">
                <label className="form-label">📱 Mobile Number</label>
                <input
                  className="form-input"
                  type="tel"
                  placeholder="01XXXXXXXXX"
                  value={mobile}
                  onChange={e => setMobile(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleRequestOtp()}
                  maxLength={11}
                />
                <div style={{ fontSize: 12, color: 'var(--gray)', marginTop: 4 }}>
                  Enter the mobile number registered on your account
                </div>
              </div>
              <button
                className="btn btn-primary btn-full"
                onClick={handleRequestOtp}
                disabled={loading}
                style={{ marginTop: 8 }}
              >
                {loading ? '⏳ Sending OTP…' : '📨 Send OTP'}
              </button>
            </div>
          )}

          {/* ── Step 2: OTP ── */}
          {step === 2 && (
            <div>
              <div style={{ background: '#E8F5E9', border: '1px solid #A5D6A7', borderRadius: 8, padding: '10px 14px', marginBottom: 20, fontSize: 13, color: '#2E7D32' }}>
                OTP sent to <strong>{mobile}</strong>
              </div>

              {/* Dev mode OTP hint */}
              {devOtp && (
                <div style={{ background: '#FFF8E1', border: '1px solid #FFE082', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#F57F17' }}>
                  🛠️ Dev mode OTP: <strong style={{ letterSpacing: 2 }}>{devOtp}</strong>
                </div>
              )}

              <div className="form-group">
                <label className="form-label">🔢 Enter OTP</label>
                <input
                  className="form-input"
                  type="text"
                  placeholder="Enter OTP"
                  value={otp}
                  onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
                  onKeyDown={e => e.key === 'Enter' && handleVerifyOtp()}
                  maxLength={6}
                  style={{ letterSpacing: 4, fontSize: 20, textAlign: 'center' }}
                />
              </div>
              <button
                className="btn btn-primary btn-full"
                onClick={handleVerifyOtp}
                style={{ marginTop: 8 }}
              >
                ✅ Verify OTP
              </button>
              <button
                className="btn btn-secondary btn-full"
                onClick={() => { setStep(1); setDevOtp(null) }}
                style={{ marginTop: 8 }}
              >
                ← Change Mobile
              </button>
            </div>
          )}

          {/* ── Step 3: New Password ── */}
          {step === 3 && (
            <div>
              <div style={{ background: '#E8F5E9', border: '1px solid #A5D6A7', borderRadius: 8, padding: '10px 14px', marginBottom: 20, fontSize: 13, color: '#2E7D32' }}>
                ✅ OTP verified! Now set your new password.
              </div>

              <div className="form-group">
                <label className="form-label">🔒 New Password</label>
                <div style={{ position: 'relative' }}>
                  <input
                    className="form-input"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Minimum 6 characters"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    style={{ paddingRight: 44 }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(p => !p)}
                    style={{
                      position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                      background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: 'var(--gray)'
                    }}
                  >{showPassword ? '🙈' : '👁️'}</button>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">🔒 Confirm Password</label>
                <input
                  className="form-input"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Repeat new password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleResetPassword()}
                />
                {confirmPassword && newPassword !== confirmPassword && (
                  <div style={{ fontSize: 12, color: '#C62828', marginTop: 4 }}>❌ Passwords do not match</div>
                )}
                {confirmPassword && newPassword === confirmPassword && (
                  <div style={{ fontSize: 12, color: '#2E7D32', marginTop: 4 }}>✅ Passwords match</div>
                )}
              </div>

              <button
                className="btn btn-primary btn-full"
                onClick={handleResetPassword}
                disabled={loading || newPassword !== confirmPassword}
                style={{ marginTop: 8 }}
              >
                {loading ? '⏳ Resetting…' : '🔑 Reset Password'}
              </button>
            </div>
          )}
        </div>

        {/* Back to login */}
        <div style={{ textAlign: 'center', marginTop: 20 }}>
          <button
            onClick={() => navigate('/auth')}
            style={{ background: 'none', border: 'none', color: 'var(--green)', cursor: 'pointer', fontSize: 14, fontWeight: 500 }}
          >
            ← Back to Login
          </button>
        </div>
      </div>
    </div>
  )
}
