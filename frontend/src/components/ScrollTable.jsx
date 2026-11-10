import { Box, Card, Table, TableContainer, Typography } from '@mui/material'

export default function ScrollTable({ label, minWidth, fixed = false, children, sx }) {
  return <Box sx={{ containerType: 'inline-size', ...sx }}>
    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.75, [`@container (min-width: ${minWidth + 2}px)`]: { display: 'none' } }}>
      Cuộn ngang để xem các cột còn lại.
    </Typography>
    <TableContainer component={Card} role="region" aria-label={label} tabIndex={0}>
      <Table size="small" sx={{
        minWidth, tableLayout: fixed ? 'fixed' : 'auto', '& .MuiTableCell-root': { overflowWrap: 'anywhere' },
        '& .MuiTableCell-head': { whiteSpace: fixed ? 'normal' : undefined },
      }}>{children}</Table>
    </TableContainer>
  </Box>
}
