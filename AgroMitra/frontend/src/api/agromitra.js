// ============================================================
//   AgroMitra API Service
//   FastAPI backend calls
// ============================================================

import axios from 'axios'

// Vite এ .env / .env.production ফাইলে VITE_API_URL সেট করে দিলে
// deploy করার সময় আর এই ফাইল ছোঁয়া লাগবে না।
const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const API = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' }
})

API.interceptors.request.use((config) => {
  const token = localStorage.getItem('agromitra_access_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
}, (error) => Promise.reject(error))

// ============================================================
//   Auto refresh access token on 401
//   Access token 15 মিনিটে expire হয়, কিন্তু আগে কোনো refresh
//   logic ছিল না — তাই user silently logged-out হয়ে যেত।
//   এখন 401 পেলে refresh_token দিয়ে নতুন access_token নিয়ে
//   আগের request-টা আবার পাঠানো হয়। একসাথে একাধিক request
//   401 পেলেও refresh মাত্র একবারই কল হবে (queue করা আছে)।
// ============================================================
let isRefreshing = false
let pendingQueue = []

const processQueue = (error, token = null) => {
  pendingQueue.forEach(({ resolve, reject }) => {
    if (error) reject(error)
    else resolve(token)
  })
  pendingQueue = []
}

API.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config

    // Network error বা response নাই → refresh চেষ্টা করার মানে নাই
    if (!error.response) {
      return Promise.reject(error)
    }

    const isAuthRoute = originalRequest.url?.includes('/api/v1/auth/login') ||
                        originalRequest.url?.includes('/api/v1/auth/refresh-token')

    if (error.response.status === 401 && !originalRequest._retry && !isAuthRoute) {
      const refreshToken = localStorage.getItem('agromitra_refresh_token')

      // Refresh token-ই না থাকলে সরাসরি লগআউট
      if (!refreshToken) {
        clearAuthSession()
        window.location.href = '/auth'
        return Promise.reject(error)
      }

      if (isRefreshing) {
        // একটা refresh চলমান — এই request-টা লাইনে বসিয়ে রাখো
        return new Promise((resolve, reject) => {
          pendingQueue.push({ resolve, reject })
        }).then((newToken) => {
          originalRequest.headers.Authorization = `Bearer ${newToken}`
          return API(originalRequest)
        }).catch((err) => Promise.reject(err))
      }

      originalRequest._retry = true
      isRefreshing = true

      try {
        const { data } = await axios.post(`${BASE_URL}/api/v1/auth/refresh-token`, {
          refresh_token: refreshToken
        })
        localStorage.setItem('agromitra_access_token', data.access_token)
        processQueue(null, data.access_token)
        originalRequest.headers.Authorization = `Bearer ${data.access_token}`
        return API(originalRequest)
      } catch (refreshError) {
        processQueue(refreshError, null)
        clearAuthSession()
        window.location.href = '/auth'
        return Promise.reject(refreshError)
      } finally {
        isRefreshing = false
      }
    }

    return Promise.reject(error)
  }
)

// ── Image URL Helper ────────────────────────────────────────
// Backend থেকে asche relative path (যেমন /uploads/product_photos/x.jpg) —
// ব্রাউজার সেটা frontend-এর নিজের origin (localhost:5173) ধরে নিয়ে খোঁজে,
// ফলে ছবি broken দেখায়। এই helper সবসময় backend-এর BASE_URL জুড়ে দেয়।
export const resolveImageUrl = (url) => {
  if (!url) return null
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('blob:')) {
    return url  // আগে থেকেই full/local URL হলে হাত না দিয়ে ফেরত দাও
  }
  return `${BASE_URL}${url}`
}

export const uploadProfilePhoto = (file) => {
  const formData = new FormData()
  formData.append('file', file)
  return API.post('/api/v1/auth/upload-photo', formData, {
    headers: { 'Content-Type': undefined }  // ← এটাই fix
  })
}
// ── Auth Session Helpers ─────────────────────────────────────
export const saveAuthSession = ({ access_token, refresh_token, user }) => {
  localStorage.setItem('agromitra_access_token', access_token)
  localStorage.setItem('agromitra_refresh_token', refresh_token)
  localStorage.setItem('agromitra_user', JSON.stringify(user))
  window.dispatchEvent(new Event('agromitra-auth-changed'))
}

export const clearAuthSession = () => {
  localStorage.removeItem('agromitra_access_token')
  localStorage.removeItem('agromitra_refresh_token')
  localStorage.removeItem('agromitra_user')
  window.dispatchEvent(new Event('agromitra-auth-changed'))
}

export const getStoredUser = () => {
  try {
    return JSON.parse(localStorage.getItem('agromitra_user'))
  } catch {
    return null
  }
}

// ── Auth ─────────────────────────────────────────────────────
export const loginUser      = (credentials) => API.post('/api/v1/auth/login', credentials)
export const registerUser   = (payload)     => API.post('/api/v1/auth/register', payload)
export const getCurrentUser = ()            => API.get('/api/v1/auth/me')
export const updateProfile  = (data)        => API.put('/api/v1/auth/profile', data)
export const forgotPassword = (mobile)      => API.post('/api/v1/auth/forgot-password', { mobile_number: mobile })
export const resetPassword  = (mobile, otp, newPassword) => API.post('/api/v1/auth/reset-password', { mobile_number: mobile, otp, new_password: newPassword })

// ── Products ─────────────────────────────────────────────────
export const getMyProducts    = ()           => API.get('/api/v1/products/my')
export const getAllProducts    = (params)     => API.get('/api/v1/products/', { params })
export const getProduct        = (id)         => API.get(`/api/v1/products/${id}`)
// createProduct/updateProduct এখন সবসময় FormData নেয় (ছবি থাকতে পারে বলে)।
// axios instance-এর default Content-Type: application/json থাকায় সেটা override
// করে multipart/form-data + boundary নিজে থেকে বসাতে দেওয়া হচ্ছে (Content-Type: undefined ট্রিক)।
export const createProduct     = (formData)       => API.post('/api/v1/products/', formData, { headers: { 'Content-Type': undefined } })
export const updateProduct     = (id, formData)   => API.put(`/api/v1/products/${id}`, formData, { headers: { 'Content-Type': undefined } })
export const deleteProduct     = (id)         => API.delete(`/api/v1/products/${id}`)

// ── Orders ───────────────────────────────────────────────────
export const getMyOrders       = ()           => API.get('/api/v1/orders/')
export const getOrder          = (id)         => API.get(`/api/v1/orders/${id}`)
export const placeOrder        = (data)       => API.post('/api/v1/orders/', data)
export const cancelOrder       = (id)         => API.delete(`/api/v1/orders/${id}`)
export const updateOrderStatus = (id, status) => API.put(`/api/v1/orders/${id}/status`, { status })
export const getAllOrders       = ()           => API.get('/api/v1/orders/admin/all')

// ── AI ───────────────────────────────────────────────────────
export const getPricePrediction    = (cropName, district, days = 7) =>
  API.post('/api/v1/ai/price-prediction', { crop_name: cropName, district, days })

export const getDemandForecast     = (cropName, district, days = 7) =>
  API.post('/api/v1/ai/demand-forecast', { crop_name: cropName, district, days })

export const getCropRecommendation = (profile) =>
  API.post('/api/v1/ai/crop-recommendation', profile)

export const getFairPrice          = (cropName, district) =>
  API.get('/api/v1/ai/fair-price', { params: { crop_name: cropName, district } })

// ── Market ───────────────────────────────────────────────────
export const getMarketPrices = (cropName = null, district = null) => {
  const params = {}
  if (cropName) params.crop_name = cropName
  if (district) params.district  = district
  return API.get('/api/v1/market/prices', { params })
}

// ── Misc ─────────────────────────────────────────────────────
export const getCrops     = () => API.get('/api/v1/crops')
export const getDistricts = () => API.get('/api/v1/districts')
export const getHealth    = () => API.get('/health')

// ── Admin ────────────────────────────────────────────────────
export const getAllUsers      = (params)            => API.get('/api/v1/auth/admin/users', { params })
export const updateUserStatus = (userId, isActive)  =>
  API.put(`/api/v1/auth/admin/users/${userId}/status`, null, { params: { is_active: isActive } })
export const verifyUser       = (userId)            => API.put(`/api/v1/auth/admin/users/${userId}/verify`)

// ── Weather & Calendar ───────────────────────────────────────
export const getWeatherAlert   = (district)  => API.get('/api/v1/weather/alert', { params: { district } })
export const getSowingCalendar = (month)     => API.get('/api/v1/crops/sowing-calendar', { params: month ? { month } : {} })

// ── Platform Settings ───────────────────────────────────────
export const getPlatformFee    = ()              => API.get('/api/v1/admin/settings/platform-fee')
export const updatePlatformFee = (feePercent)    => API.put('/api/v1/admin/settings/platform-fee', { platform_fee_percent: feePercent })

export default API
