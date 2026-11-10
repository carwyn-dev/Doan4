import { Box, Stack, Typography } from '@mui/material'

export default function PageHeader({ title, description, action }) {
  return <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' }, gap: 2, mb: 3.5 }}>
    <Box sx={{ minWidth: 0 }}>
      <Typography component="h1" variant="h4" sx={{ fontSize: { xs: 24, sm: 28 }, overflowWrap: 'anywhere' }}>{title}</Typography>
      {description && <Typography sx={{ color: 'text.secondary', mt: .8, fontSize: 14, maxWidth: 780 }}>{description}</Typography>}
    </Box>
    {action && <Box sx={{ display: 'flex', gap: 1, alignSelf: { xs: 'flex-start', sm: 'center' }, flexShrink: 0 }}>{action}</Box>}
  </Stack>
}
