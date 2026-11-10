import PageHeader from '../components/PageHeader'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Alert, Box, Button, ButtonBase, Chip, Stack, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material'
import Layout from '../components/Layout'
import StaffShiftOverview from '../components/StaffShiftOverview'
import ScrollTable from '../components/ScrollTable'
import { useAuth } from '../context/AuthContext'
import { dashboardAPI, getErrorMessage } from '../services/api'
import { StatStrip } from '../components/ReportingWidgets'
import { formatMoney } from '../components/SessionReceipt'
import { formatParkingTime } from '../utils/reservationTime'

const shortcuts = {
  Admin: [['Bãi đỗ xe', 'Cấu hình bãi hoạt động', '/admin/parking-lots'], ['Khu vực', 'Phân loại xe và tầng', '/admin/zones'],
    ['Vị trí đỗ', 'Nhóm đặt trước, trực tiếp và bảo trì', '/admin/slots'], ['Bảng giá', 'Giá hiện hành và lịch sử', '/admin/pricing'],
    ['Tài khoản', 'Phân quyền và phân công bãi', '/admin/users'], ['Báo cáo', 'Tổng thu và lượt xe theo ngày, bãi', '/admin/reports']],
  Customer: [['Phương tiện', 'Thêm xe hoặc cập nhật biển số', '/customer/vehicles'],
    ['Lịch sử đặt chỗ', 'Theo dõi và hủy lịch của bạn', '/customer/history'], ['Lịch sử gửi xe', 'Xem lượt gửi và phiếu thu của bạn', '/customer/sessions']]
}
export default function Dashboard() {
  const { user, refreshUser } = useAuth()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => setRevision(r => r + 1), 30000)
    return () => clearInterval(timer)
  }, [])
  useEffect(() => {
    let current = true
    setLoading(true); setError(''); setData(null)
    dashboardAPI.get().then(async r => {
      if (!current) return
      if (r.data.role !== user.role) { await refreshUser(); return }
      setData(r.data)
    }).catch(e => { if (current) setError(getErrorMessage(e)) })
      .finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [revision, user.role, refreshUser])
  const refresh = () => setRevision(r => r + 1)
  if (user.role === 'Staff') return <StaffShiftOverview data={data} loading={loading} error={error} onRefresh={refresh} />

  const s = data?.summary
  const customer = user.role === 'Customer'
  const items = !s ? [] : customer ? [
    { label: 'Phương tiện hoạt động', value: s.activeVehicleCount }, { label: 'Đặt chỗ còn hiệu lực', value: s.confirmedReservations },
    { label: 'Xe đang gửi', value: s.openSessions }, { label: 'Tổng tiền đã trả', value: formatMoney(s.totalPaid), hint: 'Các phiếu thu gắn với tài khoản' }
  ] : [
    { label: 'Bãi đang hoạt động', value: s.activeLotCount }, { label: 'Vị trí hoạt động', value: s.totalActiveSlots },
    { label: 'Xe đang gửi', value: s.openSessions }, { label: 'Thu ghi nhận hôm nay', value: formatMoney(s.todayRevenue), hint: 'Gồm tiền mặt và thanh toán mô phỏng' }
  ]
  return <Layout>
    <PageHeader title={customer ? 'Tổng quan tài khoản' : 'Tổng quan vận hành'}
      description={customer ? user.name : 'Số liệu toàn hệ thống'} action={<Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap' }}>
        {customer && <Button component={Link} to="/customer/search" variant="contained">Đặt chỗ mới</Button>}
        <Button variant="outlined" disabled={loading} onClick={refresh}>Làm mới</Button>
      </Stack>} />
    {loading && <Typography role="status">Đang tải số liệu...</Typography>}
    {error && <Alert severity="error" sx={{ mb: 2 }}>{error} Nhấn Làm mới để thử lại.</Alert>}
    {data && <>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>Cập nhật {formatParkingTime(data.generatedAt)} theo giờ Việt Nam. Tự làm mới mỗi 30 giây.</Typography>
      <StatStrip items={items} />
      {customer ? <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Bạn đã hoàn tất {s.completedSessions} lượt gửi xe.</Typography> : <>
        <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1, mb: 2 }}>
          <Chip label={`Xe vào hôm nay: ${s.todayCheckIns}`} /><Chip label={`Xe ra hôm nay: ${s.todayCheckOuts}`} />
          <Chip label={`Bảo trì: ${s.maintenanceSlots}`} /><Chip label={`Đang có đệm: ${s.bufferSlots}`} />
          <Chip label={`Chỗ nhận trực tiếp: ${s.walkInReadySlots}`} />
          <Chip label={`Đặt chỗ còn hiệu lực: ${s.confirmedReservations}`} />
        </Stack>
        <Typography component="h2" variant="h6" sx={{ mb: 1 }}>Tình trạng từng bãi</Typography>
        <ScrollTable label="Tình trạng từng bãi" minWidth={760}>
          <TableHead><TableRow>{['Bãi đỗ', 'Vị trí hoạt động', 'Chưa có xe', 'Có xe', 'Bảo trì', 'Còn đệm', 'Lấp đầy'].map(t => <TableCell key={t}>{t}</TableCell>)}</TableRow></TableHead>
          <TableBody>{data.lots.map(l => <TableRow key={l.parkingLotId}>
            <TableCell>{l.parkingLotName}{!l.isActive && <Chip size="small" label="Ngừng hoạt động" sx={{ ml: 1 }} />}</TableCell>
            <TableCell>{l.totalActiveSlots}</TableCell><TableCell>{l.availableSlots}</TableCell><TableCell>{l.occupiedSlots}</TableCell>
            <TableCell>{l.maintenanceSlots}</TableCell><TableCell>{l.bufferSlots}</TableCell><TableCell>{l.occupancyPercent === null ? '—' : `${l.occupancyPercent}%`}</TableCell>
          </TableRow>)}{!data.lots.length && <TableRow><TableCell colSpan={7}>Chưa có bãi đỗ trong phạm vi này.</TableCell></TableRow>}</TableBody>
        </ScrollTable>
        <Typography variant="caption" component="p" color="text.secondary" sx={{ mt: 1, mb: 2, maxWidth: '80ch' }}>
          Chỗ chưa có xe có thể còn đệm hoặc có lịch đặt trước. Chỗ nhận trực tiếp chỉ tính nhóm khách trực tiếp đang sẵn sàng. Tỷ lệ lấp đầy tính trên các vị trí đang phục vụ.
        </Typography>
      </>}
    </>}
    <Typography component="h2" variant="h6" sx={{ mt: 3, mb: 1 }}>Truy cập nhanh</Typography>
    <Box component="nav" aria-label="Truy cập nhanh" sx={{
      display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(3, minmax(0, 1fr))' },
      gap: '1px', bgcolor: 'divider', border: 1, borderColor: 'divider', borderRadius: 1,
    }}>
      {shortcuts[user.role].map(([title, desc, path]) => <ButtonBase key={path} component={Link} to={path} sx={{
        display: 'block', p: 1.75, bgcolor: 'background.paper', textAlign: 'left', '&:hover': { bgcolor: 'primary.light' },
      }}>
        <Typography component="span" variant="body2" sx={{ display: 'block', fontWeight: 700, color: 'primary.dark' }}>{title}</Typography>
        <Typography component="span" variant="caption" color="text.secondary">{desc}</Typography>
      </ButtonBase>)}
    </Box>
  </Layout>
}
