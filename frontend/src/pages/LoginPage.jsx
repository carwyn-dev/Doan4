import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { authAPI, getErrorMessage } from '../services/api'
import { dashboardPath } from '../components/ProtectedRoute'
import {
  Box, TextField, Button, Typography,
  Alert, InputAdornment, IconButton
} from '@mui/material'
import AuthShell from '../components/AuthShell'
import Visibility from '@mui/icons-material/Visibility'
import VisibilityOff from '@mui/icons-material/VisibilityOff'

function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const { login } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const { data } = await authAPI.login(email.trim(), password)
      login(data.user, data.token)
      navigate(dashboardPath(data.user.role), { replace: true })
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  const quickLogin = (testEmail) => {
    setEmail(testEmail)
    setPassword('123456')
  }

  return <AuthShell>
    <Typography component="h1" variant="h4">Đăng nhập</Typography>
    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75, mb: 2.5 }}>Nhập email và mật khẩu tài khoản ParkingLot.</Typography>
    {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
    <Box component="form" onSubmit={handleSubmit} sx={{ display: 'grid', gap: 2 }}>
      <TextField label="Email" type="email" fullWidth value={email} onChange={e => setEmail(e.target.value)} required autoComplete="username" />
      <TextField label="Mật khẩu" type={showPassword ? 'text' : 'password'} fullWidth value={password} onChange={e => setPassword(e.target.value)} required autoComplete="current-password"
        slotProps={{ input: {
          endAdornment: <InputAdornment position="end"><IconButton aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} onClick={() => setShowPassword(!showPassword)} edge="end" size="small">{showPassword ? <VisibilityOff sx={{ fontSize: 20 }} /> : <Visibility sx={{ fontSize: 20 }} />}</IconButton></InputAdornment>
        } }} />
      <Button type="submit" variant="contained" fullWidth size="large" disabled={loading} sx={{ py: 1.5 }}>{loading ? 'Đang xử lý...' : 'Đăng nhập'}</Button>
    </Box>
    <Typography variant="body2" sx={{ my: 2 }}>Chưa có tài khoản? <Link to="/register" style={{ color: '#087f73', fontWeight: 700 }}>Đăng ký ngay</Link></Typography>
    <Box sx={{ pt: 2, borderTop: 1, borderColor: 'divider' }}>
      <Typography component="h2" variant="h6">Tài khoản demo</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>Chọn vai trò để điền sẵn email và mật khẩu.</Typography>
      <Box sx={{ display: 'flex', gap: .8, flexWrap: 'wrap' }}>
        {[{ label: 'Khách hàng', email: 'customer1@parking.test' }, { label: 'Nhân viên', email: 'staff1@parking.test' }, { label: 'Quản trị viên', email: 'admin@parking.test' }].map(item =>
          <Button key={item.email} variant="outlined" size="small" disabled={loading} onClick={() => quickLogin(item.email)}>{item.label}</Button>)}
      </Box>
    </Box>
  </AuthShell>
}
export default LoginPage
