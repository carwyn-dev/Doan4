import { Alert, Box, Chip, Stack, Typography } from '@mui/material'
import { formatParkingTime } from '../utils/reservationTime'

export const formatMoney = value => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value)

function ReceiptFacts({ title, lines }) {
  return <Box>
    <Typography component="h3" variant="body2" sx={{ fontWeight: 700 }}>{title}</Typography>
    <Box component="dl" sx={{
      my: 0.5, typography: 'body2', overflowWrap: 'anywhere',
      '& div': { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.15fr)', gap: 1, py: 0.25 },
      '& dt': { color: 'text.secondary' }, '& dd': { m: 0, fontVariantNumeric: 'tabular-nums' },
    }}>
      {lines.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value ?? '—'}</dd></div>)}
    </Box>
  </Box>
}

export default function SessionReceipt({ session, fee }) {
  const paid = session.status === 'COMPLETED' && session.paymentId != null
  const parking = [
    ['Bãi đỗ', session.parkingLotName], ['Vị trí', `${session.slotCode} (${session.zoneName})`],
    ['Loại xe', session.vehicleType === 'CAR' ? 'Ô tô' : 'Xe máy'],
    ['Giờ vào', formatParkingTime(session.checkInTime)],
    ...(session.checkOutTime ? [['Giờ ra', formatParkingTime(session.checkOutTime)]] : []),
  ]
  const billing = [
    ['Đơn giá khi vào', `${formatMoney(session.appliedPricePerHour)}/giờ`],
    ['Số giờ tính phí', paid ? session.billableHours : fee?.billableHours],
    ...(paid ? [
      ['Mã thanh toán', `#${session.paymentId}`],
      ['Phương thức', session.paymentMethod === 'CASH' ? 'Tiền mặt' : 'Thanh toán mô phỏng'],
      ['Thời điểm thu', formatParkingTime(session.paidAt)],
    ] : []),
  ]
  return <Box>
    <Box sx={{
      display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 1fr)', gap: 1.5,
      p: { xs: 1.5, sm: 2 }, bgcolor: 'background.default', borderBottom: '1px dashed', borderColor: 'divider',
      fontVariantNumeric: 'tabular-nums', overflowWrap: 'anywhere',
    }}>
      <Box>
        <Typography variant="body2" color="text.secondary">Biển số</Typography>
        <Typography variant="h5" sx={{ fontSize: { xs: '1.25rem', sm: '1.5rem' } }}>{session.plateNumber}</Typography>
        <Chip size="small" label={paid ? 'Đã thanh toán' : 'Đang gửi xe'} color={paid ? 'success' : 'info'} sx={{ mt: 1 }} />
      </Box>
      <Box sx={{ textAlign: 'right' }}>
        <Typography variant="body2" color="text.secondary">{paid ? 'Tổng tiền đã thu' : 'Phí tạm tính'}</Typography>
        <Typography variant="h5" color="primary.dark" sx={{ fontSize: { xs: '1.375rem', sm: '1.75rem' } }}>
          {formatMoney(paid ? session.paidAmount : fee?.amount ?? 0)}
        </Typography>
        {!paid && fee && <Typography variant="caption" color="text.secondary">Tính lúc {formatParkingTime(fee.calculatedAt)}</Typography>}
      </Box>
    </Box>
    {session.isOverstay && <Alert severity="warning" sx={{ mt: 1.5 }}>Xe đang gửi quá giờ kết thúc dự kiến.</Alert>}
    <Typography variant="body2" sx={{ mt: 1.5, color: 'text.secondary', overflowWrap: 'anywhere' }}>Mã phiên <Box component="span" sx={{ color: 'text.primary' }}>{session.sessionCode}</Box></Typography>
    <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ mt: 1.5, gap: { xs: 1, sm: 3 }, '& > *': { flex: 1, minWidth: 0 } }}>
      <ReceiptFacts title="Lượt gửi" lines={parking} />
      <ReceiptFacts title={paid ? 'Thanh toán' : 'Cách tính phí'} lines={billing} />
    </Stack>
    <Typography variant="caption" sx={{ display: 'block', mt: 1, color: 'text.secondary' }}>
      Giờ Việt Nam. Làm tròn lên từng giờ, tối thiểu một giờ.{!paid && ' Phí được kiểm tra lại khi xác nhận xe ra.'}
    </Typography>
  </Box>
}
