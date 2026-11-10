import { Link } from 'react-router-dom'
import { Box, Button, Container, Stack, Typography } from '@mui/material'
import Brand from '../components/Brand'

const bookingSteps = [
  ['Chọn xe và khung giờ', 'Đăng nhập, thêm phương tiện rồi chọn bãi và thời gian dự kiến gửi.'],
  ['Đặt vị trí', 'Chọn chỗ còn trống và lưu mã đặt chỗ để tra cứu khi đến bãi.'],
  ['Nhận và trả xe', 'Đọc mã đặt chỗ cho nhân viên khi vào bãi. Thanh toán tại quầy khi lấy xe.'],
]

export default function HomePage() {
  return (
    <Box sx={{ bgcolor: 'background.paper', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Box component="header" sx={{ borderBottom: '1px solid', borderColor: 'divider' }}>
        <Container maxWidth="md" sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, py: 1.5 }}>
          <Brand />
          <Button component={Link} to="/login" variant="outlined">Đăng nhập</Button>
        </Container>
      </Box>

      <Container component="main" maxWidth="md" sx={{ flex: 1, py: { xs: 4, md: 8 } }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: { md: 'minmax(0, 1.12fr) minmax(0, 1fr)' }, gap: { xs: 4, md: 6 }, alignItems: 'start' }}>
          <Box>
            <Typography component="h1" variant="h3" sx={{ fontSize: { xs: 30, md: 42 }, lineHeight: 1.2, mb: 2, textWrap: 'balance' }}>
              Quản lý bãi đỗ xe trực tuyến
            </Typography>
            <Typography sx={{ color: 'text.secondary', mb: 3 }}>
              Tìm và đặt chỗ cho ô tô hoặc xe máy theo khung giờ. Xem lại lịch đặt, lượt gửi xe và phiếu thu trong tài khoản của bạn.
            </Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ gap: 1 }}>
              <Button component={Link} to="/login" variant="contained">Đăng nhập để đặt chỗ</Button>
              <Button component={Link} to="/register" variant="outlined">Đăng ký tài khoản</Button>
            </Stack>
          </Box>

          <Box component="section" aria-labelledby="booking-steps" sx={{ borderTop: '1px solid', borderColor: 'divider', pt: 2 }}>
            <Typography id="booking-steps" component="h2" variant="h6" sx={{ mb: 2 }}>Quy trình đặt và gửi xe</Typography>
            <Box component="ol" sx={{ m: 0, pl: 2.5, '& li::marker': { color: 'primary.dark', fontWeight: 700 } }}>
              {bookingSteps.map(([title, description]) => (
                <Box component="li" key={title} sx={{ pl: 0.5, mb: 2, '&:last-child': { mb: 0 } }}>
                  <Typography sx={{ fontWeight: 600, fontSize: 14 }}>{title}</Typography>
                  <Typography variant="body2" sx={{ color: 'text.secondary' }}>{description}</Typography>
                </Box>
              ))}
            </Box>
          </Box>
        </Box>

        <Box component="section" aria-labelledby="walk-in" sx={{ borderTop: '1px solid', borderColor: 'divider', mt: 4, pt: 2.5 }}>
          <Typography id="walk-in" component="h2" variant="h6" sx={{ mb: 0.5 }}>Gửi xe trực tiếp</Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', maxWidth: '70ch' }}>
            Nếu đến bãi mà chưa đặt chỗ, bạn có thể gặp nhân viên để kiểm tra vị trí dành cho khách gửi trực tiếp.
          </Typography>
        </Box>
      </Container>

      <Box component="footer" sx={{ borderTop: '1px solid', borderColor: 'divider', bgcolor: 'background.default' }}>
        <Container maxWidth="md" sx={{ py: 2 }}>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>ParkingLot — Đồ án 4</Typography>
        </Container>
      </Box>
    </Box>
  )
}
