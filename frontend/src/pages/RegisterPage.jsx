import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { authAPI, getErrorMessage } from '../services/api'
import {
  Box, TextField, Button, Typography, Alert
} from '@mui/material'
import AuthShell from '../components/AuthShell'

function RegisterPage() {
  const [formData, setFormData] = useState({ name: '', email: '', password: '', phone: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value })

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (formData.password.length < 8) {
      setError('Mật khẩu mới cần ít nhất 8 ký tự.')
      return
    }
    setLoading(true)
    try {
      await authAPI.register(formData)
      alert('Đăng ký thành công! Vui lòng đăng nhập.')
      navigate('/login')
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return <AuthShell>
    <Typography component="h1" variant="h4">Đăng ký tài khoản</Typography>
    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75, mb: 2.5 }}>Tạo tài khoản khách hàng để lưu xe và đặt chỗ.</Typography>
    {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
    <Box component="form" onSubmit={handleSubmit} sx={{ display: 'grid', gap: 2 }}>
      <TextField label="Họ tên" name="name" fullWidth value={formData.name} onChange={handleChange} required autoComplete="name" />
      <TextField label="Email" name="email" type="email" fullWidth value={formData.email} onChange={handleChange} required autoComplete="email" />
      <TextField label="Số điện thoại" name="phone" type="tel" fullWidth value={formData.phone} onChange={handleChange} required autoComplete="tel" />
      <TextField label="Mật khẩu" name="password" type="password" fullWidth value={formData.password} onChange={handleChange} required autoComplete="new-password" helperText="Mật khẩu cần ít nhất 8 ký tự." />
      <Button type="submit" variant="contained" fullWidth size="large" disabled={loading} sx={{ py: 1.5 }}>{loading ? 'Đang xử lý...' : 'Đăng ký'}</Button>
    </Box>
    <Typography variant="body2" sx={{ mt: 2 }}>Đã có tài khoản? <Link to="/login" style={{ color: '#087f73', fontWeight: 700 }}>Đăng nhập</Link></Typography>
  </AuthShell>
}
export default RegisterPage
