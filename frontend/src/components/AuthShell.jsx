import { Box, Button, Container } from '@mui/material'
import { Link } from 'react-router-dom'
import Brand from './Brand'

export default function AuthShell({ children }) {
  return <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
    <Box component="header" sx={{ bgcolor: 'background.paper', borderBottom: 1, borderColor: 'divider' }}>
      <Container maxWidth="md" sx={{ py: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
        <Brand />
        <Button component={Link} to="/" size="small" variant="outlined">Về trang chủ</Button>
      </Container>
    </Box>
    <Box component="main" sx={{ maxWidth: 480, mx: 'auto', p: 2, pt: { sm: 5 } }}>
      <Box sx={{ bgcolor: 'background.paper', border: 1, borderColor: 'divider', borderRadius: 1, p: { xs: 2, sm: 3.5 } }}>{children}</Box>
    </Box>
  </Box>
}
