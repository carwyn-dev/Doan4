import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || '/api'

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json'
  }
})

// Add token to requests
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

api.interceptors.response.use(
  response => response,
  error => {
    const route = error.config?.url || ''
    if (error.response?.status === 401 && route !== '/auth/login' && route !== '/auth/register') {
      window.dispatchEvent(new Event('auth:expired'))
    }
    return Promise.reject(error)
  }
)

export const getErrorMessage = error => error.response?.data?.message
  || 'Không kết nối được máy chủ. Vui lòng kiểm tra backend rồi thử lại.'

// Auth API
export const authAPI = {
  login: (email, password) => api.post('/auth/login', { email, password }),
  register: (userData) => api.post('/auth/register', userData),
  getCurrentUser: () => api.get('/auth/me')
}

// Vehicle API
export const vehicleAPI = {
  getAll: () => api.get('/vehicles'),
  create: (vehicleData, key) => api.post('/vehicles', vehicleData, { headers: { 'Idempotency-Key': key } }),
  update: (id, vehicleData, key) => api.patch(`/vehicles/${id}`, vehicleData, { headers: { 'Idempotency-Key': key } })
}

// Parking Lot API
export const parkingLotAPI = {
  getAll: () => api.get('/parking-lots'),
  getById: (id) => api.get(`/parking-lots/${id}`),
  getAvailability: (id, params, signal) =>
    api.get(`/parking-lots/${id}/availability`, { params, signal })
}

// Reservation API
export const reservationAPI = {
  create: (reservationData, key) => api.post('/reservations', reservationData, { headers: { 'Idempotency-Key': key } }),
  getMyReservations: (page = 1, pageSize = 20) => api.get('/reservations/my', { params: { page, pageSize } }),
  cancel: (id, key) => api.post(`/reservations/${id}/cancel`, null, { headers: { 'Idempotency-Key': key } }),
  getById: (id) => api.get(`/reservations/${id}`),
  recordIssue: (id, data, key) => api.post(`/reservations/${id}/service-issue`, data, { headers: { 'Idempotency-Key': key } }),
  markUnfulfilled: (id, data, key) => api.post(`/reservations/${id}/unfulfilled`, data, { headers: { 'Idempotency-Key': key } })
}

// Xe vào/ra và lịch sử; server giới hạn theo tài khoản.
export const sessionAPI = {
  getOperations: () => api.get('/staff/operations'),
  setMaintenance: (id, data, key) => api.put(`/staff/slots/${id}/maintenance`, data, { headers: { 'Idempotency-Key': key } }),
  findReservation: code => api.get('/staff/reservations/lookup', { params: { code } }),
  findReservationsByPlate: plate => api.get('/staff/reservations/by-plate', { params: { plate } }),
  checkIn: (data, key) => api.post('/sessions/checkin', data, { headers: { 'Idempotency-Key': key } }),
  getAll: params => api.get('/sessions', { params }),
  getById: id => api.get(`/sessions/${id}`),
  getFee: id => api.get(`/sessions/${id}/fee`),
  checkOut: (id, data, key) => api.post(`/sessions/${id}/checkout`, data, { headers: { 'Idempotency-Key': key } }),
  correctPlate: (id, data, key) => api.patch(`/sessions/${id}/plate`, data, { headers: { 'Idempotency-Key': key } })
}

export const dashboardAPI = { get: () => api.get('/dashboard') }

// Admin APIs
export const adminAPI = {
  // Parking Lots
  getParkingLots: () => api.get('/admin/parking-lots'),
  createParkingLot: (data, key) => api.post('/admin/parking-lots', data, { headers: { 'Idempotency-Key': key } }),
  updateParkingLot: (id, data, key) => api.put(`/admin/parking-lots/${id}`, data, { headers: { 'Idempotency-Key': key } }),
  
  // Zones
  getZones: (parkingLotId) => api.get(`/admin/parking-lots/${parkingLotId}/zones`),
  createZone: (data, key) => api.post('/admin/zones', data, { headers: { 'Idempotency-Key': key } }),
  updateZone: (id, data, key) => api.put(`/admin/zones/${id}`, data, { headers: { 'Idempotency-Key': key } }),
  
  // Slots
  getSlots: (zoneId) => api.get(`/admin/zones/${zoneId}/slots`),
  createSlot: (data, key) => api.post('/admin/slots', data, { headers: { 'Idempotency-Key': key } }),
  updateSlot: (id, data, key) => api.put(`/admin/slots/${id}`, data, { headers: { 'Idempotency-Key': key } }),
  setSlotMaintenance: (id, data, key) => api.put(`/admin/slots/${id}/maintenance`, data, { headers: { 'Idempotency-Key': key } }),
  
  // Pricing
  getPricing: (params) => api.get('/admin/pricing', { params }),
  updatePricing: (vehicleType, data, key) => api.put(`/admin/pricing/${vehicleType}`, data, { headers: { 'Idempotency-Key': key } }),
  
  // Users
  getUsers: params => api.get('/admin/users', { params }),
  createUser: (data, key) => api.post('/admin/users', data, { headers: { 'Idempotency-Key': key } }),
  updateUser: (id, data, key) => api.put(`/admin/users/${id}`, data, { headers: { 'Idempotency-Key': key } }),
  
  // Reports
  getReports: (params) => api.get('/admin/reports', { params })
}

export default api
