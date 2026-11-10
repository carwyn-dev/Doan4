import PageHeader from '../../components/PageHeader'
import { useEffect, useState } from 'react'
import {
  Alert, Box, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent,
  DialogTitle, FormControlLabel, MenuItem, Stack, TableBody, TableCell,
  TableHead, TableRow, TextField, Typography
} from '@mui/material'
import Layout from '../../components/Layout'
import ScrollTable from '../../components/ScrollTable'
import { useAuth } from '../../context/AuthContext'
import { adminAPI, getErrorMessage } from '../../services/api'
import { formatParkingTime } from '../../utils/reservationTime'
import useAdminMutation from './useAdminMutation'

const roles = { Customer: 'Khách hàng', Staff: 'Nhân viên', Admin: 'Quản trị viên' }
// Không giữ bản sao mật khẩu trong map retry. Đây chỉ là digest cục bộ để chọn key,
// server vẫn xác thực nội dung bằng fingerprint PBKDF2 và hash Identity riêng.
const fingerprintOf = async data => {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(data)))
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('')
}

export default function ManageUsers() {
  const { user: currentUser, refreshUser } = useAuth()
  const [users, setUsers] = useState([])
  const [lots, setLots] = useState([])
  const [filters, setFilters] = useState({ role: 'all', active: 'all', query: '' })
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const [notice, setNotice] = useState('')
  const [dialog, setDialog] = useState(null)
  const [form, setForm] = useState({})
  const mutation = useAdminMutation({ fingerprintOf })
  useEffect(() => {
    let current = true
    setLoading(true)
    setError('')
    setUsers([])
    Promise.all([
      adminAPI.getUsers({ page, pageSize: 20, role: filters.role === 'all' ? undefined : filters.role,
        query: filters.query || undefined, isActive: filters.active === 'all' ? undefined : filters.active === 'true' }),
      adminAPI.getParkingLots()
    ]).then(([list, parking]) => {
      if (current) { setUsers(list.data); setLots(parking.data) }
    }).catch(e => { if (current) setError(getErrorMessage(e)) })
      .finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [page, filters, revision])
  const filter = (key, value) => { setFilters(f => ({ ...f, [key]: value })); setPage(1) }
  const field = (key, value) => setForm(f => ({ ...f, [key]: value }))
  const close = () => { if (!mutation.saving) { setDialog(null); setForm({}) } }
  const open = (row = null, toggle = false) => {
    mutation.setError('')
    setNotice('')
    setDialog({ id: row?.id })
    setForm({ name: row?.name ?? '', email: row?.email ?? '', phone: row?.phone ?? '',
      role: row?.role ?? 'Staff', assignedParkingLotId: row?.assignedParkingLotId ?? '',
      isActive: toggle ? !row.isActive : row?.isActive ?? true, password: '', reason: '' })
  }
  const submit = async event => {
    event.preventDefault()
    if (!form.name.trim() || !form.reason.trim() || (form.role === 'Staff' && !form.assignedParkingLotId)) {
      mutation.setError('Vui lòng nhập họ tên, lý do và bãi phân công cho nhân viên.')
      return
    }
    const body = { name: form.name.trim(), email: form.email.trim().toLowerCase(), phone: form.phone.trim() || null,
      role: form.role, isActive: form.isActive, assignedParkingLotId: form.role === 'Staff' ? form.assignedParkingLotId : null,
      reason: form.reason.trim(), ...(!dialog.id ? { password: form.password } : {}) }
    const id = dialog.id
    if (await mutation.save(`user:${id ?? 'new'}`, body, key => id ? adminAPI.updateUser(id, body, key) : adminAPI.createUser(body, key))) {
      setDialog(null)
      setForm({})
      setNotice('Đã lưu tài khoản. Quyền và trạng thái mới có hiệu lực từ yêu cầu tiếp theo.')
      if (id === currentUser.id) { await refreshUser(); return }
      setRevision(r => r + 1)
    }
  }
  const lotName = id => lots.find(l => l.id === id)?.name ?? `Bãi #${id}`
  return <Layout>
    <PageHeader title="Quản lý tài khoản" description="Phân quyền, phân công bãi và quản lý trạng thái truy cập." action={<Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap' }}>
        <Button variant="outlined" disabled={loading || mutation.saving} onClick={() => setRevision(r => r + 1)}>Tải lại</Button>
        <Button variant="contained" disabled={loading || !!error || mutation.saving} onClick={() => open()}>Thêm tài khoản</Button>
      </Stack>} />
    <Box component="form" aria-label="Tìm tài khoản" onSubmit={e => { e.preventDefault(); filter('query', search.trim()) }} sx={{ mb: 2 }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ flexWrap: 'wrap', gap: 1.25 }}>
        <TextField label="Tìm tên, email, số điện thoại" size="small" value={search} onChange={e => setSearch(e.target.value)} disabled={mutation.saving} sx={{ flex: 1, minWidth: 200 }} slotProps={{ htmlInput: { maxLength: 256 } }} />
        <TextField select size="small" label="Lọc vai trò" value={filters.role} sx={{ minWidth: 160 }} disabled={mutation.saving} onChange={e => filter('role', e.target.value)}>
          <MenuItem value="all">Tất cả vai trò</MenuItem>{Object.entries(roles).map(([id, label]) => <MenuItem key={id} value={id}>{label}</MenuItem>)}
        </TextField>
        <TextField select size="small" label="Lọc trạng thái" value={filters.active} sx={{ minWidth: 160 }} disabled={mutation.saving} onChange={e => filter('active', e.target.value)}>
          <MenuItem value="all">Tất cả trạng thái</MenuItem><MenuItem value="true">Hoạt động</MenuItem><MenuItem value="false">Đã khóa</MenuItem>
        </TextField>
        <Button type="submit" variant="contained" disabled={mutation.saving}>Tìm kiếm</Button>
      </Stack>
    </Box>
    {notice && <Alert severity="success" sx={{ mb: 2 }}>{notice}</Alert>}
    {error && <Alert severity="error" sx={{ mb: 2 }}>{error} Nhấn Tải lại để thử lại.</Alert>}
    {loading ? <Typography role="status">Đang tải dữ liệu...</Typography> : !error && <>
      <ScrollTable label="Danh sách tài khoản" minWidth={940} fixed>
        <TableHead><TableRow>
          <TableCell sx={{ width: { xs: 146, lg: '18%' } }}>Họ tên</TableCell><TableCell sx={{ width: { xs: 150, lg: '18%' } }}>Thao tác</TableCell>
          {['Email / điện thoại', 'Vai trò', 'Bãi phân công', 'Trạng thái', 'Ngày tạo'].map(label => <TableCell key={label}>{label}</TableCell>)}
        </TableRow></TableHead>
        <TableBody>{users.map(u => <TableRow key={u.id}>
          <TableCell sx={{ fontWeight: 600 }}>{u.name}{u.id === currentUser.id ? ' (Bạn)' : ''}</TableCell>
          <TableCell><Stack direction="row" sx={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <Button size="small" sx={{ minWidth: 0 }} disabled={mutation.saving} onClick={() => open(u)}>Sửa</Button>
            <Button size="small" color={u.isActive ? 'warning' : 'success'} disabled={mutation.saving} onClick={() => open(u, true)}>{u.isActive ? 'Khóa tài khoản' : 'Mở khóa'}</Button>
          </Stack></TableCell>
          <TableCell sx={{ overflowWrap: 'anywhere' }}>{u.email}<Typography variant="body2" sx={{ color: 'text.secondary' }}>{u.phone || '—'}</Typography></TableCell>
          <TableCell><Chip size="small" color={u.role === 'Admin' ? 'secondary' : u.role === 'Staff' ? 'success' : 'primary'} label={roles[u.role]} /></TableCell>
          <TableCell>{u.assignedParkingLotId ? lotName(u.assignedParkingLotId) : '—'}</TableCell>
          <TableCell><Chip size="small" color={u.isActive ? 'success' : 'default'} label={u.isActive ? 'Hoạt động' : 'Đã khóa'} /></TableCell>
          <TableCell>{formatParkingTime(u.createdAt)}</TableCell>
        </TableRow>)}{!users.length && <TableRow><TableCell colSpan={7}>Không có tài khoản phù hợp.</TableCell></TableRow>}</TableBody>
      </ScrollTable>
      <Stack direction="row" sx={{ mt: 2, alignItems: 'center', justifyContent: 'flex-end', gap: 1, flexWrap: 'wrap' }}>
        <Button disabled={page === 1 || mutation.saving} onClick={() => setPage(p => p - 1)}>Trang trước</Button><Typography>Trang {page}</Typography>
        <Button disabled={users.length < 20 || mutation.saving} onClick={() => setPage(p => p + 1)}>Trang sau</Button>
      </Stack>
    </>}
    <Dialog open={!!dialog} onClose={close} fullWidth maxWidth="sm">
      <Box component="form" onSubmit={submit}>
        <DialogTitle>{dialog?.id ? 'Sửa tài khoản' : 'Thêm tài khoản'}</DialogTitle>
        <DialogContent><Stack spacing={2} sx={{ pt: 1 }}>
          {mutation.error && <Alert severity="error">{mutation.error}</Alert>}
          {dialog?.id === currentUser.id && <Alert severity="warning">Bạn đang sửa tài khoản của mình. Nếu khóa hoặc đổi vai trò, hệ thống sẽ cập nhật phiên đăng nhập sau khi lưu.</Alert>}
          <Box component="fieldset" disabled={mutation.saving} sx={{ border: 0, p: 0, m: 0, minWidth: 0 }}><Stack spacing={2}>
            <TextField label="Họ tên" required value={form.name ?? ''} onChange={e => field('name', e.target.value)} slotProps={{ htmlInput: { maxLength: 100 } }} />
            <TextField label="Email" type="email" required value={form.email ?? ''} onChange={e => field('email', e.target.value)} slotProps={{ htmlInput: { maxLength: 256 } }} />
            <TextField label="Số điện thoại" value={form.phone ?? ''} onChange={e => field('phone', e.target.value)} slotProps={{ htmlInput: { maxLength: 20 } }} />
            {!dialog?.id && <TextField label="Mật khẩu ban đầu" type="password" required autoComplete="new-password" value={form.password ?? ''} onChange={e => field('password', e.target.value)} helperText="Từ 8 đến 128 ký tự" slotProps={{ htmlInput: { minLength: 8, maxLength: 128 } }} />}
            <TextField select label="Vai trò" required value={form.role ?? 'Staff'} onChange={e => setForm(f => ({ ...f, role: e.target.value, assignedParkingLotId: '' }))}>
              {Object.entries(roles).map(([id, label]) => <MenuItem key={id} value={id}>{label}</MenuItem>)}
            </TextField>
            {form.role === 'Staff' && <TextField select label="Bãi phân công" required value={form.assignedParkingLotId ?? ''} onChange={e => field('assignedParkingLotId', e.target.value)} helperText="Mỗi nhân viên làm việc tại một bãi đang hoạt động.">
              {lots.map(l => <MenuItem key={l.id} value={l.id} disabled={!l.isActive}>{l.name}{!l.isActive ? ' (ngừng hoạt động)' : ''}</MenuItem>)}
            </TextField>}
            <FormControlLabel control={<Checkbox checked={!!form.isActive} onChange={e => field('isActive', e.target.checked)} />} label="Đang hoạt động" />
            <TextField label="Lý do thay đổi" required value={form.reason ?? ''} onChange={e => field('reason', e.target.value)} slotProps={{ htmlInput: { maxLength: 1000 } }} />
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>Khóa tài khoản giữ nguyên lịch sử và lượt gửi xe. Luôn phải còn một quản trị viên hoạt động. Khách đang có lịch xác nhận hoặc xe đang gửi chưa thể đổi vai trò.</Typography>
          </Stack></Box>
        </Stack></DialogContent>
        <DialogActions><Button disabled={mutation.saving} onClick={close}>Đóng</Button><Button type="submit" variant="contained" disabled={mutation.saving}>{mutation.saving ? 'Đang lưu...' : 'Lưu tài khoản'}</Button></DialogActions>
      </Box>
    </Dialog>
  </Layout>
}
