import { useNavigate } from 'react-router-dom'
import { getStoredUser } from '../api/agromitra'

export default function NotFound() {
  const navigate = useNavigate()
  const user = getStoredUser()

  const handleGoHome = () => {
    if (!user) { navigate('/'); return }
    const routes = { farmer: '/farmer', buyer: '/buyer', consumer: '/buyer', admin: '/admin' }
    navigate(routes[user.role] || '/')
  }

  return (
    <div style={{
      minHeight: '80vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', padding: '40px 20px'
    }}>
      <div style={{ textAlign: 'center', maxWidth: 480 }}>

        {/* Illustration */}
        <div style={{ fontSize: 96, marginBottom: 8, lineHeight: 1 }}>🌾</div>
        <div style={{
          fontSize: 80, fontWeight: 900, color: 'var(--green)',
          lineHeight: 1, marginBottom: 8, letterSpacing: -2
        }}>404</div>

        <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--green-dark)', marginBottom: 12 }}>
          Page Not Found
        </div>
        <div style={{ fontSize: 15, color: 'var(--gray)', lineHeight: 1.6, marginBottom: 32 }}>
          মনে হচ্ছে এই পাতাটা ফসলের মতো হারিয়ে গেছে! 😅<br />
          The page you're looking for doesn't exist or has been moved.
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={handleGoHome}
            className="btn btn-primary"
            style={{ padding: '12px 28px', fontSize: 15 }}
          >
            🏠 {user ? 'Go to Dashboard' : 'Go to Home'}
          </button>
          <button
            onClick={() => navigate(-1)}
            className="btn btn-secondary"
            style={{ padding: '12px 28px', fontSize: 15 }}
          >
            ← Go Back
          </button>
        </div>

        {/* Quick links */}
        <div style={{ marginTop: 40, padding: 24, background: '#F9FBF9', borderRadius: 12, border: '1px solid var(--green-pale)' }}>
          <div style={{ fontSize: 13, color: 'var(--gray)', marginBottom: 14, fontWeight: 600 }}>Quick Links</div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
            {[
              { label: '🏠 Home', path: '/' },
              { label: '🔑 Login', path: '/auth' },
              { label: '🛒 Marketplace', path: '/buyer' },
            ].map(({ label, path }) => (
              <button key={path} onClick={() => navigate(path)}
                style={{
                  padding: '6px 14px', borderRadius: 20, fontSize: 13,
                  background: 'white', border: '1px solid var(--green-light)',
                  color: 'var(--green-dark)', cursor: 'pointer', fontWeight: 500
                }}>
                {label}
              </button>
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}
