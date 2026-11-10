import PageHeader from '../../components/PageHeader'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Alert, Box, Button, Card, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material'
import Layout from '../../components/Layout'
import { getErrorMessage, reservationAPI } from '../../services/api'
import { formatParkingTime } from '../../utils/reservationTime'

const statuses = {
  CONFIRMED: ['Đã xác nhận', 'success'], CHECKED_IN: ['Đang gửi xe', 'info'],
  COMPLETED: ['Hoàn thành', 'primary'], CANCELLED: ['Đã hủy', 'error'],
  EXPIRED: ['Hết hạn', 'default'], UNFULFILLED: ['Không phục vụ được', 'warning']
}
const PAGE_SIZE = 20
export default function ReservationHistory() {
  const location = useLocation()
  const navigate = useNavigate()
  const [rows, setRows] = useState([])
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState(location.state?.reservationCode ? `Đặt chỗ thành công! Mã: ${location.state.reservationCode}` : '')
  const [selected, setSelected] = useState(null)
  const [saving, setSaving] = useState(false)
  const pending = useRef(new Map())
  const savingRef = useRef(false)
  const generation = useRef(0)
  useEffect(() => {
    if (location.state?.reservationCode) navigate(location.pathname, { replace: true, state: null })
  }, [location.state, location.pathname, navigate])
  const load = useCallback(async () => {
    const current = ++generation.current
    setLoading(true)
    try {
      const { data } = await reservationAPI.getMyReservations(page, PAGE_SIZE)
      if (current === generation.current) { setRows(data); setError('') }
    } catch (err) {
      if (current === generation.current) { setRows([]); setError(getErrorMessage(err)) }
    } finally { if (current === generation.current) setLoading(false) }
  }, [page])
  useEffect(() => {
    load()
    const timer = setInterval(load, 30000)
    return () => { generation.current++; clearInterval(timer) }
  }, [load])
  const cancel = async () => {
    if (savingRef.current) return
    const id = selected.id
    if (!pending.current.has(id)) pending.current.set(id, crypto.randomUUID())
    savingRef.current = true; setSaving(true); setError('')
    try {
      await reservationAPI.cancel(id, pending.current.get(id))
      pending.current.delete(id); setSelected(null); setNotice('Đã hủy lượt đặt chỗ.'); await load()
    } catch (err) { setError(getErrorMessage(err)) }
    finally { savingRef.current = false; setSaving(false) }
  }
  return <Layout>
    <PageHeader title="Lịch sử đặt chỗ" description="Xem mã đặt chỗ, thời gian gửi và trạng thái. Giờ hiển thị theo UTC+7."
      action={<Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap' }}>
        <Button component={Link} to="/customer/search" variant="contained">Đặt chỗ mới</Button>
        <Button disabled={loading || saving} onClick={load}>Làm mới</Button>
      </Stack>} />
    {notice && <Alert severity="success" onClose={() => setNotice('')} sx={{ mb: 2 }}>{notice}</Alert>}
    {error && <Alert severity="error" sx={{ mb: 2 }}>{error}<Button onClick={load} disabled={loading}>Tải lại</Button></Alert>}
    <Card><TableContainer><Table aria-label="Danh sách đặt chỗ" sx={{ tableLayout: 'fixed', '& .MuiTableCell-root': { px: { xs: 1, sm: 2 }, overflowWrap: 'anywhere' } }}>
      <TableHead><TableRow><TableCell>Lượt đặt</TableCell><TableCell sx={{ width: { xs: '36%', sm: '28%' } }}>Thời gian</TableCell><TableCell sx={{ width: { xs: 66, sm: 116 } }}>Thao tác</TableCell></TableRow></TableHead>
      <TableBody>
        {loading ? <TableRow><TableCell colSpan={3}>Đang tải lịch đặt…</TableCell></TableRow> : !rows.length ? <TableRow><TableCell colSpan={3}>{error ? 'Chưa tải được dữ liệu.' : page === 1 ? 'Chưa có lượt đặt chỗ nào' : 'Không có lượt đặt ở trang này.'}</TableCell></TableRow> : rows.map(row => {
          const [label, color] = statuses[row.status] || [row.status, 'default']
          return <TableRow key={row.id}>
            <TableCell>
              <Stack direction="row" sx={{ gap: 0.75, flexWrap: 'wrap', alignItems: 'center', mb: 0.5 }}>
                <Typography variant="body2" sx={{ fontWeight: 700, minWidth: 0 }}>{row.reservationCode}</Typography>
                <Chip label={label} color={color} size="small" sx={{ maxWidth: '100%', '& .MuiChip-label': { overflow: 'visible', whiteSpace: 'normal' }, height: 'auto', minHeight: 24 }} />
              </Stack>
              <Typography variant="body2">{row.parkingLotName} ({row.slotCode})</Typography>
              <Typography variant="caption" color="text.secondary" component="div">{row.zoneName}</Typography>
              <Typography variant="caption" color="text.secondary" component="div">{row.plateNumber} ({row.vehicleType === 'CAR' ? 'Ô tô' : 'Xe máy'})</Typography>
              {row.serviceIssueAt && <Typography variant="body2" sx={{ mt: 1 }}>Đã ghi nhận sự cố lúc {formatParkingTime(row.serviceIssueAt)}.{row.status === 'CONFIRMED' && ` Hạn xử lý: ${formatParkingTime(row.resolutionDeadline)}.`}</Typography>}
              {row.issueReason && <Typography variant="body2">Lý do: {row.issueReason}</Typography>}
              {row.resolvedAt && <Typography variant="caption">Kết thúc xử lý: {formatParkingTime(row.resolvedAt)}</Typography>}
            </TableCell>
            <TableCell sx={{ fontVariantNumeric: 'tabular-nums' }}>
              <Typography component="div" variant="caption" color="text.secondary">Từ</Typography>{formatParkingTime(row.startTime)}
              <Typography component="div" variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>Đến</Typography>{formatParkingTime(row.endTime)}
            </TableCell>
            <TableCell>{row.canCancel && Date.now() < Date.parse(row.startTime) && <Button size="small" sx={{ minWidth: 0 }} color="error" disabled={saving} onClick={() => { setSelected(row); setError('') }}>Hủy</Button>}</TableCell>
          </TableRow>
        })}
      </TableBody>
    </Table></TableContainer></Card>
    <Stack direction="row" sx={{ justifyContent: 'flex-end', alignItems: 'center', gap: 2, mt: 2, flexWrap: 'wrap' }}>
      <Button disabled={loading || saving || page === 1} onClick={() => setPage(page - 1)}>Trang trước</Button>
      <Typography>Trang {page}</Typography>
      <Button disabled={loading || saving || rows.length < PAGE_SIZE || page >= 1000000} onClick={() => setPage(page + 1)}>Trang sau</Button>
    </Stack>
    <Dialog open={Boolean(selected)} onClose={() => { if (!saving) setSelected(null) }}>
      <DialogTitle>Hủy đặt chỗ</DialogTitle>
      <DialogContent>
        <Typography>Bạn muốn hủy lượt {selected?.reservationCode}? Chỉ có thể hủy trước giờ bắt đầu.</Typography>
        {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
      </DialogContent>
      <DialogActions><Button disabled={saving} onClick={() => setSelected(null)}>Đóng</Button><Button disabled={saving} color="error" onClick={cancel}>{saving ? 'Đang hủy…' : 'Xác nhận hủy'}</Button></DialogActions>
    </Dialog>
  </Layout>
}
