import PageHeader from '../../components/PageHeader'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Alert, Box, Button, Card, Chip, MenuItem, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography } from '@mui/material'
import Layout from '../../components/Layout'
import SlotMaintenanceDialog from '../../components/SlotMaintenanceDialog'
import { getErrorMessage, sessionAPI } from '../../services/api'
import { formatParkingTime } from '../../utils/reservationTime'

const states = { AVAILABLE: ['Chưa có xe', 'success'], OCCUPIED: ['Có xe', 'info'], MAINTENANCE: ['Bảo trì', 'warning'], BUFFER: ['Còn đệm', 'default'], INACTIVE: ['Ngừng hoạt động', 'default'] }
const displayState = slot => !slot.isActive ? 'INACTIVE' : slot.status === 'AVAILABLE' && slot.isInBuffer ? 'BUFFER' : slot.status
const emptyFilters = { zone: 'all', type: 'all', group: 'all', state: 'all', query: '' }
export default function ParkingStatus() {
  const [slots, setSlots] = useState([]), [filters, setFilters] = useState(emptyFilters)
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [notice, setNotice] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [action, setAction] = useState(null)
  const revision = useRef(0), currentLot = useRef(null)
  const load = useCallback(async () => {
    const version = ++revision.current
    setLoading(true)
    try {
      const { data } = await sessionAPI.getOperations()
      if (version !== revision.current) return
      const lot = data[0]?.parkingLotId ?? null
      if (currentLot.current !== lot) setFilters(emptyFilters)
      currentLot.current = lot
      setSlots(data); setError(''); setLoaded(true)
    } catch (e) { if (version === revision.current) { setSlots([]); setError(getErrorMessage(e)) } }
    finally { if (version === revision.current) setLoading(false) }
  }, [])
  useEffect(() => {
    load(); const timer = setInterval(load, 30000)
    return () => { revision.current++; clearInterval(timer) }
  }, [load])
  const zones = useMemo(() => [...new Map(slots.map(s => [s.zoneId, `${s.zoneName}${s.floorLabel ? ` · ${s.floorLabel}` : ''}`])).entries()], [slots])
  const filtered = slots.filter(s => (filters.zone === 'all' || s.zoneId === filters.zone)
    && (filters.type === 'all' || s.vehicleType === filters.type)
    && (filters.group === 'all' || s.acceptsReservations === (filters.group === 'reserved'))
    && (filters.state === 'all' || (filters.state === 'BUFFER' ? s.isActive && s.isInBuffer : displayState(s) === filters.state))
    && `${s.code} ${s.zoneName} ${s.plateNumber ?? ''}`.toLocaleLowerCase('vi-VN').includes(filters.query.trim().toLocaleLowerCase('vi-VN')))
  const change = (key, value) => setFilters(f => ({ ...f, [key]: value }))
  const active = slots.filter(s => s.isActive)
  const select = (name, label, options) => <TextField select label={label} value={filters[name]} onChange={e => change(name, e.target.value)} size="small" fullWidth>
    <MenuItem value="all">Tất cả</MenuItem>{options.map(([value, title]) => <MenuItem key={value} value={value}>{title}</MenuItem>)}
  </TextField>
  return <Layout>
    <PageHeader title="Trạng thái bãi và bảo trì" description={slots[0]?.parkingLotName ?? 'Bãi được phân công'}
      action={<Button variant="outlined" size="small" disabled={loading} onClick={load}>Làm mới vị trí</Button>} />
    {notice && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setNotice('')}>{notice}</Alert>}
    {error && <Alert severity="error" sx={{ mb: 2 }}>{error} Nhấn Làm mới vị trí để thử lại.</Alert>}
    {loading && <Typography role="status" sx={{ mb: 2 }}>Đang tải trạng thái bãi…</Typography>}
    {loaded && !error && <>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 1fr))' }, gap: { xs: 1.5, md: 2 }, py: 1.5, mb: 2.5, borderBlock: '1px solid', borderColor: 'divider' }}>
        {[
          ['Vị trí hoạt động', active.length],
          ['Vị trí có xe', active.filter(s => s.status === 'OCCUPIED').length],
          ['Vị trí bảo trì', active.filter(s => s.status === 'MAINTENANCE').length],
          ['Vị trí còn đệm', active.filter(s => s.isInBuffer).length],
        ].map(([label, count]) => (
          <Box key={label} role="group" aria-label={label}>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>{label}</Typography>
            <Typography sx={{ fontWeight: 700, fontSize: 22, fontVariantNumeric: 'tabular-nums' }}>{count}</Typography>
          </Box>
        ))}
      </Box>

      <Stack direction="row" sx={{ alignItems: 'center', gap: 1, mb: 1.5 }}>
        <TextField label="Tìm mã vị trí, khu hoặc biển số" value={filters.query} onChange={e => change('query', e.target.value)} size="small" slotProps={{ htmlInput: { maxLength: 150 } }} sx={{ minWidth: 0, flex: 1, maxWidth: 360 }} />
        <Button size="small" onClick={() => setFilters(emptyFilters)}>Xóa bộ lọc</Button>
      </Stack>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(4, minmax(0, 1fr))' }, gap: 1.5, mb: 2 }}>
        {select('zone', 'Khu vực', zones)}
        {select('type', 'Loại xe', [['CAR', 'Ô tô'], ['MOTORBIKE', 'Xe máy']])}
        {select('group', 'Nhóm vị trí', [['reserved', 'Đặt trước'], ['walkin', 'Khách trực tiếp']])}
        {select('state', 'Trạng thái vị trí', Object.entries(states).map(([id, value]) => [id, value[0]]))}
      </Box>

      <Typography variant="body2" sx={{ mb: 1, color: 'text.secondary' }}>Hiển thị {filtered.length} / {slots.length} vị trí. Tự cập nhật mỗi 30 giây.</Typography>
      <Typography variant="caption" sx={{ display: { xs: 'block', lg: 'none' }, mb: 1, color: 'text.secondary' }}>Cuộn ngang để xem chi tiết vị trí và lượt gửi.</Typography>
      <TableContainer component={Card} role="region" aria-label="Danh sách vị trí đỗ" tabIndex={0} sx={{ borderRadius: 1, boxShadow: 'none' }}>
        <Table size="small" sx={{ minWidth: 880, tableLayout: 'fixed', '& .MuiTableCell-root': { px: 1.5, py: 1.25, overflowWrap: 'anywhere' } }}>
          <TableHead>
            <TableRow>
              <TableCell sx={{ width: { xs: 132, lg: 180 } }}>Vị trí / trạng thái</TableCell>
              <TableCell sx={{ width: 148 }}>Thao tác</TableCell>
              {['Loại xe / nhóm', 'Cấu hình', 'Khoảng đệm', 'Lịch còn hiệu lực', 'Xe đang gửi'].map(label => <TableCell key={label}>{label}</TableCell>)}
            </TableRow>
          </TableHead>
          <TableBody>
            {filtered.map(s => {
              const status = states[s.status] ?? [s.status, 'default']
              const busy = s.status === 'OCCUPIED' || s.openSessionId !== null
              return <TableRow key={s.id} aria-label={`${s.zoneName} · ${s.code}`}>
                <TableCell>
                  <Stack direction="row" sx={{ alignItems: 'center', flexWrap: 'wrap', gap: 0.5, mb: 0.5 }}>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>{s.code}</Typography>
                    <Chip size="small" label={status[0]} color={status[1]} />
                  </Stack>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{s.zoneName}{s.floorLabel ? ` · ${s.floorLabel}` : ''}</Typography>
                </TableCell>
                <TableCell>
                  <Button size="small" color={s.status === 'MAINTENANCE' ? 'success' : 'warning'} disabled={busy}
                    onClick={() => setAction({ ...s, isMaintenance: s.status !== 'MAINTENANCE' })}>{s.status === 'MAINTENANCE' ? 'Kết thúc bảo trì' : 'Bảo trì'}</Button>
                  {busy && <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>Có xe, chưa thể bảo trì</Typography>}
                </TableCell>
                <TableCell>{s.vehicleType === 'CAR' ? 'Ô tô' : 'Xe máy'}<Typography variant="body2">{s.acceptsReservations ? 'Đặt trước' : 'Khách trực tiếp'}</Typography></TableCell>
                <TableCell><Chip size="small" label={s.isActive ? 'Hoạt động' : 'Ngừng hoạt động'} color={s.isActive ? 'success' : 'default'} /></TableCell>
                <TableCell>{s.isInBuffer ? <><Chip size="small" label="Còn đệm" /><Typography variant="body2">Đến {formatParkingTime(s.bufferUntil)}</Typography></> : '—'}</TableCell>
                <TableCell>{s.confirmedReservationCount}</TableCell>
                <TableCell>{s.plateNumber || '—'}{s.openSessionId && s.plateNumber && <Button component={Link} to={`/staff/checkout?query=${encodeURIComponent(s.plateNumber)}`} size="small">Xem lượt gửi</Button>}</TableCell>
              </TableRow>
            })}
            {!filtered.length && <TableRow><TableCell colSpan={7}>{slots.length ? 'Không có vị trí phù hợp với bộ lọc.' : 'Chưa có vị trí trong bãi được phân công.'}</TableCell></TableRow>}
          </TableBody>
        </Table>
      </TableContainer>
      <Typography variant="body2" sx={{ mt: 1.5, color: 'text.secondary' }}>
        Số liệu tổng hợp tính theo các vị trí đang hoạt động trong toàn bãi. Vị trí chưa có xe vẫn có thể còn lịch đặt hoặc khoảng đệm. Bảo trì giữ nguyên lịch đặt và thời gian đệm.
      </Typography>
    </>}
    <SlotMaintenanceDialog action={action} onClose={() => setAction(null)} onSuccess={async code => {
      setAction(null); setNotice(`Đã lưu thao tác bảo trì cho vị trí ${code}.`); await load()
    }} />
  </Layout>
}
