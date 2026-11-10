import PageHeader from '../../components/PageHeader'
import { useEffect, useState } from 'react'
import { Alert, Box, Button, Card, MenuItem, Stack, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material'
import Layout from '../../components/Layout'
import ScrollTable from '../../components/ScrollTable'
import { adminAPI, getErrorMessage } from '../../services/api'
import { StatStrip, RevenueChart, reportDate, vietnamDate, shiftDate } from '../../components/ReportingWidgets'
import { formatMoney } from '../../components/SessionReceipt'
import { formatParkingTime } from '../../utils/reservationTime'

const today = () => vietnamDate()
export default function Reports() {
  const [draft, setDraft] = useState(() => ({ fromDate: shiftDate(today(), -6), toDate: today(), parkingLotId: 'all' }))
  const [filters, setFilters] = useState(draft)
  const [lots, setLots] = useState([])
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [formError, setFormError] = useState('')
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    let current = true
    setLoading(true); setError(''); setData(null)
    Promise.all([adminAPI.getReports({ ...filters, parkingLotId: filters.parkingLotId === 'all' ? undefined : filters.parkingLotId }), adminAPI.getParkingLots()])
      .then(([report, parking]) => { if (current) { setData(report.data); setLots(parking.data) } })
      .catch(e => { if (current) setError(getErrorMessage(e)) })
      .finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [filters, revision])
  const preset = mode => {
    const end = today()
    const next = { ...draft, fromDate: mode === 'month' ? `${end.slice(0, 7)}-01` : mode === 'week' ? shiftDate(end, -6) : end, toDate: end }
    setDraft(next); setFilters(next); setFormError('')
  }
  const submit = e => {
    e.preventDefault()
    if (!draft.fromDate || !draft.toDate || draft.fromDate > draft.toDate || (Date.parse(draft.toDate) - Date.parse(draft.fromDate)) / 86400000 >= 366) {
      setFormError('Chọn khoảng ngày hợp lệ, tối đa 366 ngày.')
      return
    }
    setFormError(''); setFilters({ ...draft })
  }
  const totals = data?.totals
  return <Layout>
    <PageHeader title="Báo cáo vận hành" description="Lượt xe và tổng thu đã ghi nhận theo ngày Việt Nam." action={<Button variant="outlined" disabled={loading} onClick={() => setRevision(r => r + 1)}>Làm mới</Button>} />
    <Box component="form" aria-label="Lọc báo cáo" onSubmit={submit} sx={{ mb: 2.5 }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'minmax(135px, 155px) minmax(135px, 155px) minmax(170px, 240px) auto' }, justifyContent: { md: 'start' }, gap: 1.25, mb: 1.25 }}>
        <TextField label="Từ ngày" size="small" required type="date" value={draft.fromDate} onChange={e => setDraft(f => ({ ...f, fromDate: e.target.value }))}
          slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: '2000-01-01', max: '2099-12-31' } }} />
        <TextField label="Đến hết ngày" size="small" required type="date" value={draft.toDate} onChange={e => setDraft(f => ({ ...f, toDate: e.target.value }))}
          slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: '2000-01-01', max: '2099-12-31' } }} />
        <TextField select size="small" label="Bãi đỗ xe" value={draft.parkingLotId} onChange={e => setDraft(f => ({ ...f, parkingLotId: e.target.value }))}>
          <MenuItem value="all">Tất cả bãi</MenuItem>{lots.map(l => <MenuItem key={l.id} value={l.id}>{l.name}{!l.isActive ? ' (ngừng hoạt động)' : ''}</MenuItem>)}
        </TextField><Button type="submit" variant="contained">Xem báo cáo</Button>
      </Box>
      <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap' }}>{[['today', 'Hôm nay'], ['week', '7 ngày'], ['month', 'Tháng này']].map(([id, label]) => <Button key={id} variant="outlined" size="small" onClick={() => preset(id)}>{label}</Button>)}</Stack>
    </Box>
    {formError && <Alert severity="error" sx={{ mb: 2 }}>{formError}</Alert>}
    {loading && <Typography role="status">Đang tải báo cáo...</Typography>}
    {error && <Alert severity="error" sx={{ mb: 2 }}>{error} Nhấn Làm mới để thử lại.</Alert>}
    {data && <>
      <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1.5 }}>Từ {reportDate(data.fromDate)} đến hết {reportDate(data.toDate)}. {data.parkingLotId ? lots.find(l => l.id === data.parkingLotId)?.name : 'Tất cả bãi'}. Cập nhật {formatParkingTime(data.generatedAt)}.</Typography>
      <StatStrip items={[
        { label: 'Lượt xe vào', value: totals.checkInCount }, { label: 'Lượt xe ra', value: totals.checkOutCount },
        { label: 'Phiếu thu đã ghi nhận', value: totals.paymentCount }, { label: 'Tổng thu ghi nhận', value: formatMoney(totals.revenueVnd) }
      ]} />
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Tiền mặt {formatMoney(totals.cashRevenueVnd)}, thanh toán mô phỏng {formatMoney(totals.simulatedRevenueVnd)}. Tổng thu tính theo ngày ghi nhận phiếu thu.</Typography>
      <Card sx={{ p: 2, mb: 2 }}><Typography component="h2" variant="h6">Tổng thu theo ngày</Typography>
        {totals.paymentCount ? <RevenueChart days={data.days} /> : <Typography sx={{ color: 'text.secondary', mt: 2 }}>Chưa có phiếu thu trong khoảng ngày này.</Typography>}
      </Card>
      <Typography component="h2" variant="h6" sx={{ mb: 1 }}>Chi tiết theo ngày</Typography>
      <ScrollTable label="Chi tiết theo ngày" minWidth={700} sx={{ mb: 2 }}>
        <TableHead><TableRow>{['Ngày', 'Lượt vào', 'Lượt ra', 'Phiếu thu', 'Tổng thu', 'Tiền mặt', 'Mô phỏng'].map(t => <TableCell key={t}>{t}</TableCell>)}</TableRow></TableHead>
        <TableBody>{data.days.map(d => <TableRow key={d.date}><TableCell>{reportDate(d.date)}</TableCell><TableCell>{d.checkInCount}</TableCell><TableCell>{d.checkOutCount}</TableCell>
          <TableCell>{d.paymentCount}</TableCell><TableCell sx={{ fontWeight: 600 }}>{formatMoney(d.revenueVnd)}</TableCell><TableCell>{formatMoney(d.cashRevenueVnd)}</TableCell><TableCell>{formatMoney(d.simulatedRevenueVnd)}</TableCell></TableRow>)}</TableBody>
      </ScrollTable>
      <Typography component="h2" variant="h6" sx={{ mb: 1 }}>Tổng hợp theo bãi</Typography>
      <ScrollTable label="Tổng hợp theo bãi" minWidth={700}>
        <TableHead><TableRow>{['Bãi đỗ', 'Lượt vào', 'Lượt ra', 'Phiếu thu', 'Tổng thu', 'Tiền mặt', 'Mô phỏng'].map(t => <TableCell key={t}>{t}</TableCell>)}</TableRow></TableHead>
        <TableBody>{data.lots.map(l => <TableRow key={l.parkingLotId}><TableCell>{l.parkingLotName}{!l.isActive ? ' (ngừng hoạt động)' : ''}</TableCell>
          <TableCell>{l.checkInCount}</TableCell><TableCell>{l.checkOutCount}</TableCell><TableCell>{l.paymentCount}</TableCell><TableCell sx={{ fontWeight: 600 }}>{formatMoney(l.revenueVnd)}</TableCell><TableCell>{formatMoney(l.cashRevenueVnd)}</TableCell><TableCell>{formatMoney(l.simulatedRevenueVnd)}</TableCell></TableRow>)}
          {!data.lots.length && <TableRow><TableCell colSpan={7}>Chưa có bãi đỗ.</TableCell></TableRow>}
        </TableBody>
      </ScrollTable>
    </>}
  </Layout>
}
