import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { FiLock, FiLogIn, FiPhone, FiShield, FiUser, FiUserPlus } from 'react-icons/fi'
import { loginUser, registerUser, saveAuthSession } from '../api/agromitra'

const districts = [
  "Bagerhat","Bandarban","Barguna","Barishal","Bhola","Bogura",
  "Brahmanbaria","Chandpur","Chapai Nawabganj","Chattogram","Chuadanga",
  "Cumilla","Cox's Bazar","Dhaka","Dinajpur","Faridpur","Feni","Gaibandha",
  "Gazipur","Gopalganj","Habiganj","Jamalpur","Jashore","Jhalokathi",
  "Jhenaidah","Joypurhat","Khagrachhari","Khulna","Kishoreganj","Kurigram",
  "Kushtia","Lakshmipur","Lalmonirhat","Madaripur","Magura","Manikganj",
  "Meherpur","Moulvibazar","Munshiganj","Mymensingh","Naogaon","Narail",
  "Narayanganj","Narsingdi","Natore","Netrokona","Nilphamari","Noakhali",
  "Pabna","Panchagarh","Patuakhali","Pirojpur","Rajbari","Rajshahi",
  "Rangamati","Rangpur","Satkhira","Shariatpur","Sherpur","Sirajganj",
  "Sunamganj","Sylhet","Tangail","Thakurgaon"
]

// ── Matches backend enum exactly: farmer | buyer | consumer | admin ──
const roleOptions = [
  { value: 'farmer',   label: '👨‍🌾 Farmer (Sell crops)' },
  { value: 'buyer',    label: '🛒 Buyer (Purchase crops)' },
  { value: 'consumer', label: '🧑 Consumer (Browse market)' },
  { value: 'admin',    label: '🛡️ Administrator' },
]

const emptyLogin = {
  mobile_number: '',
  password: '',
}

const emptyRegister = {
  mobile_number: '',
  name_en: '',
  name_bn: '',
  role: 'farmer',
  district: 'Bogura',
  password: '',
  confirm_password: '',
}

const getErrorMessage = (error) => {
  const detail = error?.response?.data?.detail
  if (Array.isArray(detail)) {
    return detail.map((item) => item.msg).join(', ')
  }
  return detail || error?.message || 'Something went wrong. Please try again.'
}

// ── Single source of truth for role → route mapping ──
const ROLE_ROUTES = {
  farmer:   '/farmer',
  buyer:    '/buyer',
  consumer: '/buyer',   // consumers browse the same marketplace as buyers
  admin:    '/admin',
}

const AuthPage = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const initialMode = searchParams.get('mode') === 'register' ? 'register' : 'login'
  const [mode, setMode] = useState(initialMode)
  const [loginForm, setLoginForm] = useState(emptyLogin)
  const [registerForm, setRegisterForm] = useState(emptyRegister)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const isRegister = mode === 'register'
  const activeForm = isRegister ? registerForm : loginForm

  const title = useMemo(() => (
    isRegister ? 'Create your AgroMitra account' : 'Welcome back to AgroMitra'
  ), [isRegister])

  const updateMode = (nextMode) => {
    setMode(nextMode)
    setSearchParams(nextMode === 'register' ? { mode: 'register' } : {})
  }

  const updateLogin = (event) => {
    const { name, value } = event.target
    setLoginForm((current) => ({ ...current, [name]: value }))
  }

  const updateRegister = (event) => {
    const { name, value } = event.target
    setRegisterForm((current) => ({ ...current, [name]: value }))
  }

  const completeLogin = async (credentials) => {
    const response = await loginUser(credentials)
    saveAuthSession(response.data)
    return response.data.user
  }

  const redirectByRole = (user) => {
    const path = ROLE_ROUTES[user?.role] || '/buyer'
    navigate(path)
  }

  const handleLogin = async (event) => {
    event.preventDefault()
    setIsSubmitting(true)
    try {
      const user = await completeLogin(loginForm)
      toast.success(`Logged in as ${user.name_en}`)
      redirectByRole(user)
    } catch (error) {
      toast.error(getErrorMessage(error))
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleRegister = async (event) => {
    event.preventDefault()
    if (registerForm.password !== registerForm.confirm_password) {
      toast.error('Passwords do not match.')
      return
    }

    setIsSubmitting(true)
    try {
      const payload = { ...registerForm }
      delete payload.confirm_password
      await registerUser({
        ...payload,
        name_bn: payload.name_bn.trim() || null,
      })
      const user = await completeLogin({
        mobile_number: registerForm.mobile_number,
        password: registerForm.password,
      })
      toast.success(`Account created for ${user.name_en}`)
      redirectByRole(user)
    } catch (error) {
      toast.error(getErrorMessage(error))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="auth-page">
      <section className="auth-panel">
        <div className="auth-copy">
          <Link to="/" className="auth-brand">
            <span className="auth-brand-mark">A</span>
            <span>AgroMitra</span>
          </Link>
          <div>
            <h1>{title}</h1>
            <p>
              Access your crop intelligence, marketplace activity, and secure farmer-buyer workflow from one account.
            </p>
          </div>
          <div className="auth-proof-grid">
            <div>
              <FiShield />
              <span>JWT protected API</span>
            </div>
            <div>
              <FiPhone />
              <span>Mobile number login</span>
            </div>
            <div>
              <FiUser />
              <span>Role based experience</span>
            </div>
          </div>
        </div>

        <div className="auth-card">
          <div className="auth-tabs" role="tablist" aria-label="Authentication mode">
            <button
              className={mode === 'login' ? 'active' : ''}
              onClick={() => updateMode('login')}
              type="button"
            >
              <FiLogIn /> Login
            </button>
            <button
              className={mode === 'register' ? 'active' : ''}
              onClick={() => updateMode('register')}
              type="button"
            >
              <FiUserPlus /> Register
            </button>
          </div>

          <form onSubmit={isRegister ? handleRegister : handleLogin}>
            {isRegister && (
              <>
                <div className="form-group">
                  <label className="form-label" htmlFor="name_en">Full name</label>
                  <input
                    id="name_en"
                    name="name_en"
                    className="form-input"
                    value={registerForm.name_en}
                    onChange={updateRegister}
                    placeholder="Mohammad Rahim"
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="name_bn">Bangla name</label>
                  <input
                    id="name_bn"
                    name="name_bn"
                    className="form-input"
                    value={registerForm.name_bn}
                    onChange={updateRegister}
                    placeholder="Optional"
                  />
                </div>
              </>
            )}

            <div className="form-group">
              <label className="form-label" htmlFor="mobile_number">Mobile number</label>
              <input
                id="mobile_number"
                name="mobile_number"
                className="form-input"
                value={activeForm.mobile_number}
                onChange={isRegister ? updateRegister : updateLogin}
                placeholder="01711223344"
                inputMode="numeric"
                minLength={11}
                maxLength={11}
                required
              />
            </div>

            {isRegister && (
              <div className="auth-form-row">
                <div className="form-group">
                  <label className="form-label" htmlFor="role">Account type</label>
                  <select
                    id="role"
                    name="role"
                    className="form-select"
                    value={registerForm.role}
                    onChange={updateRegister}
                  >
                    {roleOptions.map((role) => (
                      <option key={role.value} value={role.value}>{role.label}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="district">District</label>
                  <select
                    id="district"
                    name="district"
                    className="form-select"
                    value={registerForm.district}
                    onChange={updateRegister}
                  >
                    {districts.map((district) => (
                      <option key={district} value={district}>{district}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            <div className="form-group">
              <label className="form-label" htmlFor="password">Password</label>
              <input
                id="password"
                name="password"
                type="password"
                className="form-input"
                value={activeForm.password}
                onChange={isRegister ? updateRegister : updateLogin}
                placeholder="Minimum 6 characters"
                minLength={6}
                required
              />
            </div>

            {isRegister && (
              <div className="form-group">
                <label className="form-label" htmlFor="confirm_password">Confirm password</label>
                <input
                  id="confirm_password"
                  name="confirm_password"
                  type="password"
                  className="form-input"
                  value={registerForm.confirm_password}
                  onChange={updateRegister}
                  placeholder="Repeat your password"
                  minLength={6}
                  required
                />
              </div>
            )}

            {!isRegister && (
              <div style={{ textAlign: 'right', marginTop: -8, marginBottom: 8 }}>
                <Link to="/forgot-password"
                  style={{ fontSize: 13, color: 'var(--green)', textDecoration: 'none', fontWeight: 500 }}>
                  🔑 Forgot Password?
                </Link>
              </div>
            )}

            <button className="btn btn-primary btn-full auth-submit" disabled={isSubmitting} type="submit">
              {isSubmitting ? (
                <>
                  <span className="spinner auth-spinner" /> Processing </>
              ) : isRegister ? (
                <>
                  <FiUserPlus /> Create account
                </>
              ) : (
                <>
                  <FiLock /> Login securely
                </>
              )}
            </button>
          </form>

          <div className="auth-switch">
            {isRegister ? 'Already have an account?' : 'New to AgroMitra?'}
            <button type="button" onClick={() => updateMode(isRegister ? 'login' : 'register')}>
              {isRegister ? 'Login now' : 'Create account'}
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}

export default AuthPage
