import { Alert, Box, Button, ButtonBase, Stack, Typography } from '@mui/material'
import LoginIcon from '@mui/icons-material/Login'
import LogoutOutlinedIcon from '@mui/icons-material/LogoutOutlined'
import { Link } from 'react-router-dom'
import Layout from './Layout'
import PageHeader from './PageHeader'
import { reportDate } from './ReportingWidgets'
import { formatParkingTime } from '../utils/reservationTime'

const gateActions = [
  { path: '/staff/checkin', title: 'Nhận xe vào bãi', hint: 'Tra mã hoặc nhận khách trực tiếp', Icon: LoginIcon },
  { path: '/staff/checkout', title: 'Trả xe và thu tiền', hint: 'Xem phí và phiếu thu', Icon: LogoutOutlinedIcon },
]

function MetricList({ items }) {
  return <Box component="dl" sx={{ m: 0, fontVariantNumeric: 'tabular-nums' }}>
    {items.map(([label, value]) => <Box key={label} role="group" aria-label={label} sx={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 2, py: 0.75,
      '&:not(:last-child)': { borderBottom: 1, borderColor: 'divider' },
    }}>
      <Typography component="dt" variant="body2" color="text.secondary">{label}</Typography>
      <Typography component="dd" variant="body2" sx={{ m: 0, fontWeight: 700 }}>{value}</Typography>
    </Box>)}
  </Box>
}

export default function StaffShiftOverview({ data, loading, error, onRefresh }) {
  const summary = data?.summary
  const lot = data?.lots[0]

  return <Layout>
    <PageHeader title="Quầy trực bãi" description={data?.scopeName || 'Bãi được phân công'} />
    <Box component="nav" aria-label="Thao tác tại quầy" sx={{
      display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
      border: 1, borderColor: 'divider', borderRadius: 1, bgcolor: 'background.paper',
    }}>
      {gateActions.map(({ path, title, hint, Icon }) => <ButtonBase key={path} component={Link} to={path} aria-label={title} sx={{
        display: 'flex', justifyContent: 'flex-start', alignItems: 'flex-start',
        gap: { xs: 0.75, sm: 1.5 }, p: { xs: 1.5, sm: 2.25 }, textAlign: 'left',
        '& + &': { borderLeft: 1, borderColor: 'divider' },
        '&:hover': { bgcolor: 'action.hover' }, '&.Mui-focusVisible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: -3 },
      }}>
        <Icon aria-hidden="true" sx={{ color: 'primary.main', fontSize: { xs: 19, sm: 22 }, mt: 0.25, flexShrink: 0 }} />
        <Box component="span" sx={{ minWidth: 0 }}>
          <Typography component="span" sx={{ display: 'block', fontSize: { xs: 14, sm: 16 }, fontWeight: 700, lineHeight: 1.4 }}>{title}</Typography>
          <Typography component="span" variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>{hint}</Typography>
        </Box>
      </ButtonBase>)}
    </Box>
    <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', gap: 1, my: 1.5 }}>
      {loading ? <Typography role="status" variant="body2" color="text.secondary">Đang tải số liệu…</Typography>
        : <Typography variant="caption" color="text.secondary">{data ? `Cập nhật ${formatParkingTime(data.generatedAt)}. Tự làm mới mỗi 30 giây.` : 'Chưa có số liệu mới.'}</Typography>}
      <Button variant="outlined" size="small" disabled={loading} onClick={onRefresh}>Làm mới</Button>
    </Stack>
    {error && <Alert severity="error" sx={{ mb: 2 }}>{error} Nhấn Làm mới để thử lại.</Alert>}
    {summary && <Box sx={{ display: 'grid', gridTemplateColumns: { md: 'minmax(0, 1.65fr) minmax(0, 1fr)' }, gap: 2 }}>
      <Box component="section" aria-labelledby="shift-lot-heading" sx={{ bgcolor: 'background.paper', border: 1, borderColor: 'divider', borderRadius: 1, p: { xs: 2, sm: 2.5 } }}>
        <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap', mb: 1 }}>
          <Typography id="shift-lot-heading" component="h2" variant="h6">Tình trạng bãi</Typography>
          <Button component={Link} to="/staff/parking-status" size="small">Xem từng vị trí</Button>
        </Stack>
        {lot && !lot.isActive && <Alert severity="warning" sx={{ mb: 1.5 }}>Bãi đang ngừng hoạt động.</Alert>}
        <Stack direction="row" role="group" aria-label="Chỗ nhận trực tiếp" sx={{
          alignItems: 'center', justifyContent: 'space-between', gap: 2, bgcolor: 'primary.light', borderRadius: 1,
          p: 1.5, mb: 1.25,
        }}>
          <Box>
            <Typography variant="body2" sx={{ fontWeight: 700 }}>Chỗ nhận trực tiếp</Typography>
            <Typography variant="caption" color="text.secondary">Vị trí trống dành cho khách đến trực tiếp, hiện không còn đệm.</Typography>
          </Box>
          <Typography variant="h5" color="primary.dark" sx={{ fontVariantNumeric: 'tabular-nums' }}>{summary.walkInReadySlots}</Typography>
        </Stack>
        <MetricList items={[
          ['Vị trí hoạt động', summary.totalActiveSlots], ['Chỗ chưa có xe', summary.availableSlots],
          ['Vị trí có xe', summary.occupiedSlots], ['Vị trí bảo trì', summary.maintenanceSlots],
          ['Vị trí còn đệm', summary.bufferSlots], ['Tỷ lệ lấp đầy', lot?.occupancyPercent == null ? '—' : `${lot.occupancyPercent}%`],
        ]} />
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.25 }}>
          Chỗ chưa có xe có thể còn đệm hoặc có lịch đặt trước. Tỷ lệ lấp đầy tính trên các vị trí đang phục vụ.
        </Typography>
      </Box>
      <Box component="section" aria-labelledby="shift-sessions-heading" sx={{ borderTop: 1, borderColor: 'divider', px: { xs: 0.5, sm: 1 }, pt: { xs: 1.5, md: 2.5 } }}>
        <Typography id="shift-sessions-heading" component="h2" variant="h6">Lượt xe</Typography>
        <Typography variant="caption" color="text.secondary">Ngày {reportDate(data.dateVn)} (giờ Việt Nam)</Typography>
        <Box sx={{ mt: 1 }}>
          <MetricList items={[
            ['Xe vào hôm nay', summary.todayCheckIns], ['Xe ra hôm nay', summary.todayCheckOuts],
            ['Xe đang gửi', summary.openSessions], ['Đặt chỗ còn hiệu lực', summary.confirmedReservations],
          ]} />
        </Box>
      </Box>
    </Box>}
  </Layout>
}
