import PageHeader from '../components/PageHeader'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Alert, Box, Button, Card, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, GlobalStyles, MenuItem, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography } from '@mui/material'
import Layout from '../components/Layout'
import SessionReceipt from '../components/SessionReceipt'
import StaffActionDialog from '../components/StaffActionDialog'
import { useAuth } from '../context/AuthContext'
import { getErrorMessage, sessionAPI } from '../services/api'
import { formatParkingTime } from '../utils/reservationTime'

const SIZE = 20
const desktopCell = { display: { xs: 'none', sm: 'table-cell' } }
const receiptPrintStyles = {
  '@media print': {
    '@page': { size: 'A4', margin: 0 },
    'html, body': { overflow: 'visible !important', padding: '0 !important', background: '#fff' },
    // Dialog được MUI đưa ra ngoài cây giao diện, làm con trực tiếp của body.
    'body > :not(.receipt-print-dialog)': { display: 'none !important' },
    '.receipt-print-dialog.MuiDialog-root': {
      position: 'static !important',
      '& .MuiBackdrop-root, & .MuiDialogActions-root': { display: 'none !important' },
      '& .MuiDialog-container': { display: 'block', height: 'auto' },
      '& .MuiDialog-paper': {
        display: 'block', width: '100%', maxWidth: 'none', maxHeight: 'none', overflow: 'visible',
        margin: 0, padding: '16mm', borderRadius: 0, boxShadow: 'none',
      },
      '& .MuiDialogTitle-root, & .MuiDialogContent-root': { paddingInline: 0, overflow: 'visible' },
    },
  },
}

export default function SessionHistory() {
  const { user } = useAuth(), staff = user.role === 'Staff'
  const [searchParams] = useSearchParams()
  const [query, setQuery] = useState(searchParams.get('query') || '')
  const [filters, setFilters] = useState({ query: searchParams.get('query') || '', status: staff ? 'OPEN' : '' })
  const [page, setPage] = useState(1), [rows, setRows] = useState([]), [loading, setLoading] = useState(true)
  const [error, setError] = useState(''), [notice, setNotice] = useState('')
  const [selected, setSelected] = useState(null), [fee, setFee] = useState(null), [detailError, setDetailError] = useState('')
  const [detailLoading, setDetailLoading] = useState(false), [dialogOpen, setDialogOpen] = useState(false)
  const [method, setMethod] = useState('CASH'), [confirmed, setConfirmed] = useState(false), [saving, setSaving] = useState(false)
  const [correction, setCorrection] = useState(null)
  const revision = useRef(0), detailRevision = useRef(0), locked = useRef(false), pending = useRef(null)
  const load = useCallback(async () => {
    const version = ++revision.current
    setLoading(true)
    try {
      const { data } = await sessionAPI.getAll({ ...filters, status: filters.status || undefined, query: filters.query || undefined, page, pageSize: SIZE })
      if (version === revision.current) { setRows(data); setError('') }
    } catch (err) { if (version === revision.current) { setRows([]); setError(getErrorMessage(err)) } }
    finally { if (version === revision.current) setLoading(false) }
  }, [filters, page])
  useEffect(() => {
    load(); const timer = setInterval(load, 30000)
    return () => { revision.current++; clearInterval(timer) }
  }, [load])
  useEffect(() => () => { detailRevision.current++ }, [])
  const open = async id => {
    const version = ++detailRevision.current
    setDialogOpen(true); setDetailLoading(true); setDetailError(''); setConfirmed(false)
    setSelected({ id }); setFee(null)
    try {
      const [sessionResponse, feeResponse] = await Promise.all([sessionAPI.getById(id), sessionAPI.getFee(id)])
      if (version === detailRevision.current) { setSelected(sessionResponse.data); setFee(feeResponse.data) }
    } catch (err) { if (version === detailRevision.current) setDetailError(getErrorMessage(err)) }
    finally { if (version === detailRevision.current) setDetailLoading(false) }
  }
  const checkout = async () => {
    if (locked.current || !confirmed || !selected || !fee) return
    const id = selected.id, data = { paymentMethod: method, confirmedAmount: fee.amount }
    const fingerprint = JSON.stringify({ id, ...data })
    if (pending.current?.fingerprint !== fingerprint) pending.current = { fingerprint, key: crypto.randomUUID() }
    locked.current = true; setSaving(true); setDetailError('')
    try {
      const { data: result } = await sessionAPI.checkOut(id, data, pending.current.key)
      pending.current = null; setConfirmed(false)
      // Hiển thị kết quả đã commit ngay cả khi truy vấn phiếu thu sau đó mất mạng.
      setSelected(previous => ({ ...previous, status: 'COMPLETED', paymentId: result.paymentId, totalFee: result.amount,
        paidAmount: result.amount, billableHours: result.billableHours, checkOutTime: result.checkOutTime, paidAt: result.checkOutTime, paymentMethod: method, isOverstay: false }))
      setNotice(`Đã thu tiền và xác nhận xe ra. Phiếu thu #${result.paymentId}.`)
      await load()
    } catch (err) {
      if (err.response?.status === 409) {
        // Không tự thu lại theo giá mới: tải lại và bắt buộc nhân viên xác nhận lần nữa.
        await open(id)
        setDetailError(`${getErrorMessage(err)} Vui lòng đối chiếu lại trạng thái và phí trước khi xác nhận.`)
      } else setDetailError(getErrorMessage(err))
    } finally { locked.current = false; setSaving(false) }
  }
  const close = () => { if (!saving) { detailRevision.current++; setDialogOpen(false); setSelected(null); setFee(null) } }
  const canPrintReceipt = staff && dialogOpen && !detailLoading && selected?.status === 'COMPLETED'
    && selected.paymentId != null && Boolean(selected.sessionCode && fee)
  return <Layout>
    <PageHeader title={staff ? 'Trả xe và thu tiền' : 'Lịch sử gửi xe'}
      description={`${staff ? 'Lượt gửi trong bãi được phân công.' : 'Lượt gửi của bạn và phiếu thu sau khi thanh toán.'} Tự tải lại mỗi 30 giây.`} />
    {notice && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setNotice('')}>{notice}</Alert>}
    {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
    <Box component="form" aria-label="Tra cứu lượt gửi" onSubmit={e => { e.preventDefault(); setPage(1); setFilters({ ...filters, query: query.trim() }) }}
      sx={{ mb: 2 }}>
      <Box sx={{
        display: 'grid', alignItems: 'center', gap: 1, gridTemplateColumns: { xs: 'minmax(0, 1fr) auto auto', sm: 'minmax(0, 400px) minmax(140px, 180px) auto auto' },
        justifyContent: { sm: 'start' },
      }}>
        <TextField label="Biển số hoặc mã phiên" size="small" value={query} onChange={e => setQuery(e.target.value)} slotProps={{ htmlInput: { maxLength: 40 } }}
          sx={{ gridColumn: { xs: '1 / -1', sm: 'auto' } }} />
        <TextField select label="Trạng thái" size="small" value={filters.status} onChange={e => { setPage(1); setFilters({ ...filters, status: e.target.value }) }} sx={{ minWidth: 0 }}>
          <MenuItem value="">Tất cả</MenuItem><MenuItem value="OPEN">Đang gửi</MenuItem><MenuItem value="COMPLETED">Đã kết thúc</MenuItem>
        </TextField>
        <Button type="submit" variant="contained" disabled={loading}>Tra cứu</Button><Button onClick={load} disabled={loading}>Làm mới</Button>
      </Box>
    </Box>
    <Card>
      <TableContainer>
        <Table aria-label="Danh sách lượt gửi xe" sx={{ '& .MuiTableCell-root': { px: { xs: 1.5, sm: 2 }, py: 1.25 } }}>
          <TableHead>
            <TableRow>
              <TableCell>Xe / mã phiên</TableCell>
              <TableCell sx={desktopCell}>Bãi / vị trí</TableCell>
              <TableCell sx={desktopCell}>Giờ vào</TableCell>
              <TableCell>Thao tác</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading || !rows.length ? <TableRow><TableCell colSpan={4}>
              {loading ? 'Đang tải lượt gửi xe…' : error ? 'Chưa tải được dữ liệu.' : 'Không có lượt gửi phù hợp. Kiểm tra biển số, mã phiên hoặc trạng thái đã chọn.'}
            </TableCell></TableRow> : rows.map(row => (
              <TableRow key={row.id}>
                <TableCell>
                  <Typography variant="body2" sx={{ fontWeight: 700, overflowWrap: 'anywhere' }}>{row.plateNumber}</Typography>
                  <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', overflowWrap: 'anywhere', mb: 0.5 }}>{row.sessionCode}</Typography>
                  <Chip label={row.status === 'OPEN' ? 'Đang gửi' : 'Đã kết thúc'} color={row.status === 'OPEN' ? 'info' : 'success'} size="small" />
                  {row.isOverstay && <Typography variant="caption" sx={{ display: 'block', color: 'error.main' }}>Quá giờ dự kiến</Typography>}
                </TableCell>
                <TableCell sx={desktopCell}>{row.parkingLotName}<Typography variant="body2">{row.zoneName} · {row.slotCode}</Typography></TableCell>
                <TableCell sx={desktopCell}>{formatParkingTime(row.checkInTime)}</TableCell>
                <TableCell><Stack sx={{ alignItems: 'flex-start' }}>
                  <Button size="small" sx={{ textAlign: 'left' }} onClick={() => { setMethod('CASH'); open(row.id) }}>
                    {row.status === 'COMPLETED' ? 'Xem phiếu thu' : staff ? 'Xem phí và xe ra' : 'Xem phí'}
                  </Button>
                  {staff && row.canCorrectPlate && <Button size="small" color="warning" onClick={() => setCorrection({ kind: 'plate', id: row.id, code: row.sessionCode, plateNumber: row.plateNumber, deadline: row.plateCorrectionDeadline })}>Sửa biển số</Button>}
                </Stack></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Card>
    <Stack direction="row" sx={{ justifyContent: 'flex-end', alignItems: 'center', gap: 2, mt: 2, flexWrap: 'wrap' }}>
      <Button disabled={loading || page === 1} onClick={() => setPage(page - 1)}>Trang trước</Button><Typography>Trang {page}</Typography>
      <Button disabled={loading || rows.length < SIZE || page >= 1000000} onClick={() => setPage(page + 1)}>Trang sau</Button>
    </Stack>
    {staff && <Typography variant="body2" color="text.secondary" sx={{ mt: 2, maxWidth: '70ch' }}>
      Chỉ sửa được biển số khách đến trực tiếp trong 5 phút đầu và khi lượt gửi còn mở. Đối chiếu xe thực tế và ghi lý do khi sửa.
    </Typography>}
    {canPrintReceipt && <GlobalStyles styles={receiptPrintStyles} />}
    <Dialog open={dialogOpen} onClose={close} fullWidth maxWidth="sm" aria-labelledby="session-detail-title"
      className={canPrintReceipt ? 'receipt-print-dialog' : undefined}
      slotProps={{ paper: { sx: { borderRadius: 2 } } }}>
      <DialogTitle id="session-detail-title" sx={{ p: { xs: 2, sm: '24px 24px 16px' } }}>
        {selected?.status === 'COMPLETED' ? 'Phiếu thu tiền gửi xe' : 'Đối chiếu phí gửi xe'}
      </DialogTitle>
      <DialogContent sx={{ px: { xs: 2, sm: 3 }, pb: { xs: 1, sm: 2 } }}>
        {detailLoading ? <Typography role="status">Đang tính phí gửi xe…</Typography> : selected?.sessionCode && fee && <SessionReceipt session={selected} fee={fee} />}
        {detailError && <Alert severity="error" sx={{ mt: 2 }}>{detailError}</Alert>}
        {staff && !detailLoading && selected?.status === 'OPEN' && fee && <Stack spacing={1} sx={{ mt: 2, pt: 2, borderTop: 1, borderColor: 'divider' }}>
          <TextField select size="small" label="Phương thức thu tiền" disabled={saving} value={method} onChange={e => { setMethod(e.target.value); setConfirmed(false) }} sx={{ maxWidth: { sm: 260 } }}>
            <MenuItem value="CASH">Tiền mặt</MenuItem><MenuItem value="SIMULATED">Thanh toán mô phỏng</MenuItem>
          </TextField>
          <FormControlLabel control={<Checkbox size="small" disabled={saving} checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />}
            label="Đã thu đủ số tiền hiển thị và xe sẵn sàng ra" slotProps={{ typography: { variant: 'body2' } }} />
        </Stack>}
      </DialogContent>
      <DialogActions disableSpacing sx={{ flexWrap: 'wrap', px: { xs: 2, sm: 3 }, pt: { xs: 1, sm: 2 }, pb: { xs: 2, sm: 3 } }}>
        <Button disabled={saving} onClick={close}>Đóng</Button>
        <Button disabled={saving || detailLoading || !selected} onClick={() => open(selected.id)}>Cập nhật phí / trạng thái</Button>
        {canPrintReceipt && <Button variant="contained" onClick={() => window.print()} sx={{ width: { xs: '100%', sm: 'auto' } }}>In phiếu thu</Button>}
        {staff && selected?.status === 'OPEN' && fee && <Button variant="contained" disabled={saving || !confirmed || detailLoading} onClick={checkout} sx={{ width: { xs: '100%', sm: 'auto' } }}>{saving ? 'Đang xác nhận…' : 'Xác nhận thu tiền và xe ra'}</Button>}
      </DialogActions>
    </Dialog>
    {staff && <StaffActionDialog action={correction} onClose={() => setCorrection(null)} onSuccess={async response => {
      setCorrection(null); setNotice(`Đã sửa biển số ${response.oldPlate} thành ${response.newPlate}.`); await load()
    }} />}
  </Layout>
}
