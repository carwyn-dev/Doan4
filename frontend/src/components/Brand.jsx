import { Box, Typography } from '@mui/material'
import LocalParkingRoundedIcon from '@mui/icons-material/LocalParkingRounded'
import { Link } from 'react-router-dom'

export default function Brand() {
  return <Box component={Link} to="/" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1.2, color: 'text.primary', textDecoration: 'none', flexShrink: 0 }}>
    <Box sx={{ width: 39, height: 39, borderRadius: '12px 12px 12px 3px', display: 'grid', placeItems: 'center', bgcolor: 'primary.main', color: 'common.white' }}><LocalParkingRoundedIcon sx={{ fontSize: 27 }} /></Box>
    <Box><Typography sx={{ fontWeight: 700, fontSize: 20, letterSpacing: '-.6px', lineHeight: 1.2 }}>ParkingLot<Box component="span" sx={{ color: 'primary.main' }}>.</Box></Typography>
      <Typography sx={{ fontSize: 11, color: 'text.secondary', mt: 0.25 }}>Bãi đỗ xe trực tuyến</Typography></Box>
  </Box>
}
