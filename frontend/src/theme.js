import { alpha, createTheme } from '@mui/material/styles'

// Một bảng màu chung cho trang công khai và cả ba vai trò.
const theme = createTheme({
  palette: {
    primary: { main: '#087f73', dark: '#05665c', light: '#e9f6f2' },
    secondary: { main: '#304e64' },
    success: { main: '#23764f' }, warning: { main: '#a76512' },
    error: { main: '#c44242' }, info: { main: '#386989' },
    background: { default: '#f5f7f8', paper: '#ffffff' },
    text: { primary: '#19333e', secondary: '#637680' },
    divider: '#e5ecee',
  },
  typography: {
    fontFamily: 'Roboto, sans-serif', fontSize: 14,
    h1: { fontWeight: 700, letterSpacing: '-.04em' },
    h2: { fontWeight: 700, letterSpacing: '-.035em' },
    h3: { fontWeight: 700, letterSpacing: '-.025em' },
    h4: { fontSize: '1.75rem', fontWeight: 700, letterSpacing: '-.025em', lineHeight: 1.3 },
    h5: { fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-.02em', lineHeight: 1.35 },
    h6: { fontSize: '1.05rem', fontWeight: 700, lineHeight: 1.5 },
    body1: { lineHeight: 1.65 }, body2: { lineHeight: 1.6 },
    button: { textTransform: 'none', fontWeight: 600, letterSpacing: 0 },
  },
  shape: { borderRadius: 6 },
  components: {
    MuiCssBaseline: { styleOverrides: {
      body: { WebkitFontSmoothing: 'antialiased' },
      'a': { textDecoration: 'none' },
      'button, a, input, select, textarea': { WebkitTapHighlightColor: 'transparent' },
      ':focus-visible': { outline: '3px solid #72bcb0', outlineOffset: 3 },
      '::selection': { background: '#cdece3' },
      '@media (prefers-reduced-motion: reduce)': {
        '*, *::before, *::after': { animation: 'none !important', transition: 'none !important', scrollBehavior: 'auto !important' },
      },
    } },
    MuiButton: { defaultProps: { disableElevation: true }, styleOverrides: {
      root: { borderRadius: 6, minHeight: 40, padding: '9px 17px', whiteSpace: 'normal', flexShrink: 0 },
      outlined: { borderColor: '#d5e1e4', backgroundColor: '#fff' },
      sizeSmall: { minHeight: 34, padding: '5px 11px' },
    } },
    MuiCard: { styleOverrides: { root: ({ theme }) => ({ border: `1px solid ${theme.palette.divider}`, boxShadow: 'none', borderRadius: theme.shape.borderRadius }) } },
    MuiCardContent: { styleOverrides: { root: { padding: 24, '&:last-child': { paddingBottom: 24 }, '@media(max-width:600px)': { padding: 18, '&:last-child': { paddingBottom: 18 } } } } },
    MuiOutlinedInput: { styleOverrides: {
      root: { backgroundColor: '#fff', borderRadius: 6, fontSize: 14 },
      notchedOutline: { borderColor: '#d5e0e4' },
    } },
    MuiInputLabel: { styleOverrides: { root: { fontSize: 14 } } },
    MuiTableCell: { styleOverrides: {
      root: { borderColor: '#eaf0f2', padding: '12px 16px', fontSize: 13, lineHeight: 1.55 },
      head: { backgroundColor: '#f7f9fa', color: '#617580', fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap' },
    } },
    MuiTableRow: { styleOverrides: { root: { '&:last-child td': { borderBottom: 0 }, '&:hover td': { backgroundColor: '#fafcfb' } } } },
    MuiTableContainer: { styleOverrides: { root: { maxWidth: '100%' } } },
    MuiTablePagination: { styleOverrides: { toolbar: { flexWrap: 'wrap', justifyContent: 'flex-end' }, spacer: { flex: '1 1 0%' } } },
    MuiChip: { styleOverrides: { root: ({ ownerState, theme }) => {
      const color = theme.palette[ownerState.color]?.main
      return { fontWeight: 500, borderRadius: 6, fontSize: 12, ...(color && { color, backgroundColor: alpha(color, .09), borderColor: alpha(color, .2) }) }
    } } },
    MuiAlert: { styleOverrides: { root: { borderRadius: 10, fontSize: 13, alignItems: 'flex-start' }, message: { minWidth: 0, overflowWrap: 'anywhere' } } },
    MuiDialog: { styleOverrides: { paper: { borderRadius: 8, backgroundImage: 'none', boxShadow: '0 16px 48px rgba(15, 38, 47, .16)', '@media(max-width:600px)': { margin: 16, width: 'calc(100% - 32px)' } } } },
    MuiDialogTitle: { styleOverrides: { root: { fontSize: 20, fontWeight: 700, padding: '24px 24px 16px' } } },
    MuiDialogActions: { styleOverrides: { root: { padding: '16px 24px 24px', gap: 8, flexWrap: 'wrap' } } },
    MuiTabs: { styleOverrides: { root: { minHeight: 48, borderBottom: '1px solid #e5ecee' }, indicator: { height: 3, borderRadius: 3 } } },
    MuiTab: { styleOverrides: { root: { textTransform: 'none', fontWeight: 600 } } },
  },
})
export default theme
