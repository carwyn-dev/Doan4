import PageHeader from '../../components/PageHeader'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Alert, Box, Button, Checkbox, FormControlLabel, MenuItem, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material'
import Layout from '../../components/Layout'
import { getErrorMessage, sessionAPI } from '../../services/api'
import { formatParkingTime } from '../../utils/reservationTime'
import { formatMoney } from '../../components/SessionReceipt'
import StaffActionDialog from '../../components/StaffActionDialog'

const reservationStatuses = {
  CONFIRMED: 'Đã xác nhận',
  CHECKED_IN: 'Đang gửi xe',
  COMPLETED: 'Hoàn thành',
  CANCELLED: 'Đã hủy',
  EXPIRED: 'Hết hạn',
  UNFULFILLED: 'Không phục vụ được',
}

export default function CheckIn() {
  const [mode, setMode] = useState('reservation')
  const [slots, setSlots] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const [query, setQuery] = useState('')
  const [matches, setMatches] = useState(null)
  const [reservation, setReservation] = useState(null)
  const [looking, setLooking] = useState(false)
  const [form, setForm] = useState({ plateNumber: '', vehicleType: 'MOTORBIKE', slotId: '', reason: '', agreed: false })
  const [saving, setSaving] = useState(false)
  const [staffAction, setStaffAction] = useState(null), [notice, setNotice] = useState('')
  const pending = useRef(null), locked = useRef(false), revision = useRef(0), lookupRevision = useRef(0)
  const load = useCallback(async () => {
    const version = ++revision.current
    try {
      const { data } = await sessionAPI.getOperations()
      if (version === revision.current) { setSlots(data); setLoadError('') }
    } catch (err) { if (version === revision.current) { setSlots([]); setLoadError(getErrorMessage(err)) } }
    finally { if (version === revision.current) setLoading(false) }
  }, [])
  useEffect(() => {
    load(); const timer = setInterval(load, 30000)
    return () => { revision.current++; lookupRevision.current++; clearInterval(timer) }
  }, [load])
  const selectReservation = row => {
    setReservation(row)
    setForm(previous => ({ ...previous, slotId: row.slotId, reason: '', agreed: false }))
  }
  const lookup = async event => {
    event.preventDefault(); const version = ++lookupRevision.current
    const search = query.trim().toUpperCase()
    const isCode = /^RS-[A-F0-9]{32}$/.test(search)
    setError(''); setResult(null); setNotice(''); setReservation(null); setMatches(null)
    if (!search || (search.length > 32 && !isCode)) {
      setError('Nhập biển số xe hoặc mã đặt chỗ RS đầy đủ.')
      return
    }
    setLooking(true)
    try {
      const rows = isCode
        ? [(await sessionAPI.findReservation(search)).data]
        : (await sessionAPI.findReservationsByPlate(search)).data
      if (version !== lookupRevision.current) return
      setMatches(rows)
      if (rows.length === 1) selectReservation(rows[0])
    } catch (err) { if (version === lookupRevision.current) setError(getErrorMessage(err)) }
    finally { if (version === lookupRevision.current) setLooking(false) }
  }
  const refreshReservation = async currentCode => {
    const version = ++lookupRevision.current
    setLooking(true); setReservation(null)
    try {
      const { data } = await sessionAPI.findReservation(currentCode)
      if (version === lookupRevision.current) {
        setReservation(data)
        setMatches(previous => previous?.map(row => row.id === data.id ? data : row) ?? null)
      }
    } catch (err) { if (version === lookupRevision.current) setError(getErrorMessage(err)) }
    finally { if (version === lookupRevision.current) setLooking(false) }
  }
  const issueSaved = async response => {
    const currentCode = reservation.reservationCode
    setStaffAction(null)
    setError('')
    setNotice(response.status === 'UNFULFILLED' ? 'Đã ghi nhận không phục vụ được. Lịch sử và lý do được giữ lại.' : 'Đã ghi nhận khách đến gặp sự cố. Hãy đối chiếu hạn xử lý bên dưới.')
    await refreshReservation(currentCode)
    await load()
  }
  const type = mode === 'reservation' ? reservation?.vehicleType : form.vehicleType
  const choices = slots.filter(s => s.vehicleType === type && s.acceptsReservations === (mode === 'reservation'))
  const replacement = mode === 'reservation' && reservation && Number(form.slotId) !== reservation.slotId
  const submit = async event => {
    event.preventDefault(); if (locked.current) return
    const data = mode === 'reservation'
      ? { slotId: Number(form.slotId), reservationCode: reservation.reservationCode,
          ...(replacement ? { replacementReason: form.reason.trim(), customerAgreed: form.agreed } : {}) }
      : { slotId: Number(form.slotId), plateNumber: form.plateNumber.trim(), vehicleType: form.vehicleType }
    const fingerprint = JSON.stringify(data)
    if (pending.current?.fingerprint !== fingerprint) pending.current = { fingerprint, key: crypto.randomUUID() }
    locked.current = true; setSaving(true); setError(''); setResult(null)
    try {
      const { data: received } = await sessionAPI.checkIn(data, pending.current.key)
      setResult(received); pending.current = null; setReservation(null); setQuery(''); setMatches(null)
      setForm(previous => ({ ...previous, plateNumber: '', slotId: '', reason: '', agreed: false }))
      await load()
    } catch (err) {
      setError(getErrorMessage(err))
      if (err.response?.status === 409) {
        await load()
        if (mode === 'reservation') await refreshReservation(data.reservationCode)
      }
    }
    finally { locked.current = false; setSaving(false) }
  }
  return <Layout>
    <PageHeader title="Nhận xe vào bãi" description={slots[0]?.parkingLotName || 'Bãi được phân công'} />
    {loadError && <Alert severity="error" sx={{ mb: 2 }}>{loadError}<Button onClick={load}>Tải lại vị trí</Button></Alert>}
    {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
    {notice && <Alert severity="success" sx={{ mb: 2 }}>{notice}</Alert>}
    {result && <Alert severity="success" sx={{ mb: 2 }}>Đã nhận xe! Mã phiên: {result.sessionCode}. Đơn giá: {formatMoney(result.appliedPricePerHour)}/giờ. <Typography component={Link} variant="inherit" to={`/staff/checkout?query=${result.sessionCode}`} sx={{ color: 'inherit', fontWeight: 600, textDecoration: 'underline', textUnderlineOffset: 3 }}>Xem lượt gửi xe</Typography></Alert>}
    <ToggleButtonGroup aria-label="Hình thức nhận xe" value={mode} exclusive disabled={saving || looking}
      onChange={(_, value) => {
        if (!value) return
        setMode(value); setReservation(null); setMatches(null); setForm({ ...form, slotId: '', reason: '', agreed: false }); setError(''); setResult(null)
      }} sx={{
        gap: 1, display: 'flex', width: '100%', borderBottom: 1, borderColor: 'divider',
        '& .MuiToggleButtonGroup-grouped': { border: 0, borderBottom: '3px solid transparent', borderRadius: 0, m: 0, px: { xs: 1.25, sm: 2 }, minHeight: 48 },
        '& .MuiToggleButtonGroup-grouped.Mui-selected': { color: 'primary.dark', borderBottomColor: 'primary.main', bgcolor: 'transparent' },
        '& .MuiToggleButtonGroup-grouped:focus-visible': { outlineOffset: -4 },
      }}>
      <ToggleButton value="reservation">Có đặt chỗ trước</ToggleButton>
      <ToggleButton value="walkin">Khách đến trực tiếp</ToggleButton>
    </ToggleButtonGroup>
    <Box sx={{ mt: 2, border: 1, borderColor: 'divider', borderRadius: 1, bgcolor: 'background.paper' }}>
      {mode === 'reservation' && <Box sx={{ display: 'grid', gridTemplateColumns: { md: 'minmax(0, 1fr) minmax(0, 1fr)' } }}>
        <Box component="form" aria-labelledby="lookup-heading" onSubmit={lookup} sx={{ p: { xs: 2, sm: 3 } }}>
          <Typography id="lookup-heading" component="h2" variant="h6">Tra lượt đặt</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2 }}>Tra bằng biển số xe, ví dụ 59-Z2 928.41. Bạn cũng có thể dùng mã đặt chỗ RS.</Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ gap: 1, alignItems: { sm: 'center' } }}>
            <TextField fullWidth required size="small" label="Biển số hoặc mã đặt chỗ" value={query} disabled={saving || looking}
              autoComplete="off" slotProps={{ htmlInput: { maxLength: 40, spellCheck: false, autoCapitalize: 'characters' } }}
              onChange={e => { setQuery(e.target.value); setReservation(null); setMatches(null); setError('') }} />
            <Button type="submit" variant="contained" disabled={looking || saving} sx={{ flexShrink: 0 }}>{looking ? 'Đang tra cứu…' : 'Tra cứu'}</Button>
          </Stack>
          {matches?.length === 0 && <Alert severity="info" sx={{ mt: 2 }}>Biển số này chưa có lượt đặt đã xác nhận tại bãi. Kiểm tra biển số hoặc tra bằng mã RS.</Alert>}
          {matches?.length > 1 && <TextField select fullWidth size="small" label="Chọn khung giờ đặt" value={reservation?.id ?? ''}
            disabled={saving || looking} onChange={e => selectReservation(matches.find(row => row.id === Number(e.target.value)))}
            sx={{ mt: 2, '& .MuiSelect-select': { whiteSpace: 'normal' } }}>
            {matches.map(row => <MenuItem key={row.id} value={row.id} disabled={row.status !== 'CONFIRMED'} sx={{ whiteSpace: 'normal' }}>
              {formatParkingTime(row.startTime)} → {formatParkingTime(row.endTime)} · {row.slotCode}
              {row.status !== 'CONFIRMED' && ` · ${reservationStatuses[row.status] ?? row.status}`}
            </MenuItem>)}
          </TextField>}
        </Box>
        <Box component="section" aria-labelledby="reservation-slip-heading" sx={theme => ({
          p: { xs: 2, sm: 3 }, bgcolor: 'background.default',
          borderTop: { xs: `1px solid ${theme.palette.divider}`, md: 0 },
          borderLeft: { md: `1px solid ${theme.palette.divider}` },
        })}>
          <Typography id="reservation-slip-heading" component="h2" variant="h6">Phiếu đặt chỗ</Typography>
          {reservation ? <>
            <Typography variant="h5" sx={{ mt: 1, fontVariantNumeric: 'tabular-nums', overflowWrap: 'anywhere' }}>{reservation.plateNumber}</Typography>
            <Box component="dl" sx={{ display: 'grid', gridTemplateColumns: 'max-content minmax(0, 1fr)', columnGap: 1.5, rowGap: 0.5, my: 1.5, typography: 'body2', overflowWrap: 'anywhere', '& dt': { color: 'text.secondary' }, '& dd': { m: 0 } }}>
              <dt>Vị trí đã đặt</dt>
              <dd><strong>{reservation.slotCode}</strong> · {reservation.parkingLotName}</dd>
              <dt>Dự kiến đến</dt>
              <dd>{formatParkingTime(reservation.startTime)}</dd>
              <dt>Dự kiến rời</dt>
              <dd>{formatParkingTime(reservation.endTime)}</dd>
              <dt>Trạng thái</dt>
              <dd>{reservationStatuses[reservation.status] ?? reservation.status}</dd>
            </Box>
            {reservation.serviceIssueAt && <Alert severity={reservation.status === 'CONFIRMED' ? 'warning' : 'info'} sx={{ mb: 1 }}>
              Khách đến gặp sự cố: {formatParkingTime(reservation.serviceIssueAt)}.<br />
              Hạn giải quyết: {formatParkingTime(reservation.resolutionDeadline)}.<br />Lý do: {reservation.issueReason}
              {reservation.resolvedAt && <Typography variant="body2">Đã kết thúc xử lý: {formatParkingTime(reservation.resolvedAt)}.</Typography>}
            </Alert>}
            <Stack direction="row" sx={{ gap: 0.5, flexWrap: 'wrap' }}>
              <Button size="small" disabled={saving || looking} onClick={() => refreshReservation(reservation.reservationCode)}>Cập nhật lượt đặt</Button>
              {reservation.status === 'CONFIRMED' && <>
                <Button size="small" color="warning" disabled={saving || looking || !reservation.canRecordIssue} onClick={() => setStaffAction({ kind: 'issue', id: reservation.id, code: reservation.reservationCode, plateNumber: reservation.plateNumber, deadline: reservation.expiresAt })}>Ghi nhận sự cố</Button>
                <Button size="small" color="error" disabled={saving || looking || !reservation.canMarkUnfulfilled} onClick={() => setStaffAction({ kind: 'unfulfilled', id: reservation.id, code: reservation.reservationCode, plateNumber: reservation.plateNumber, deadline: reservation.resolutionDeadline ?? reservation.expiresAt })}>Không phục vụ được</Button>
              </>}
            </Stack>
          </> : <Typography role="status" variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {looking ? 'Đang tải thông tin lượt đặt…' : matches?.length > 1 ? 'Chọn đúng khung giờ để xem phiếu đặt chỗ.' : 'Biển số, vị trí và giờ gửi sẽ hiện khi tìm được lượt đặt.'}
          </Typography>}
        </Box>
      </Box>}
      {(mode === 'walkin' || reservation?.status === 'CONFIRMED') && <Box component="form" aria-labelledby="checkin-heading" onSubmit={submit}
        sx={{ p: { xs: 2, sm: 3 }, borderTop: mode === 'reservation' ? 1 : 0, borderColor: 'divider' }}>
        <Typography id="checkin-heading" component="h2" variant="h6" sx={{ mb: 0.5 }}>{mode === 'walkin' ? 'Thông tin xe' : 'Xác nhận vị trí'}</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {mode === 'walkin' ? 'Chọn vị trí thuộc nhóm dành cho khách đến trực tiếp.' : 'Đối chiếu biển số và vị trí thực tế trước khi nhận xe.'}
        </Typography>
        <Stack spacing={2}>
          {mode === 'walkin' && <Box sx={{ display: 'grid', gridTemplateColumns: { sm: 'minmax(0, 1fr) minmax(0, 1fr)' }, gap: 2, maxWidth: 560 }}>
            <TextField required label="Biển số xe" disabled={saving} value={form.plateNumber} slotProps={{ htmlInput: { maxLength: 32 } }} onChange={e => setForm({ ...form, plateNumber: e.target.value })} />
            <TextField select label="Loại xe" disabled={saving} value={form.vehicleType} onChange={e => setForm({ ...form, vehicleType: e.target.value, slotId: '' })}>
              <MenuItem value="MOTORBIKE">Xe máy</MenuItem><MenuItem value="CAR">Ô tô</MenuItem>
            </TextField>
          </Box>}
          <TextField select required label="Vị trí thực tế" disabled={saving || loading || Boolean(loadError)} value={form.slotId} onChange={e => setForm({ ...form, slotId: e.target.value, reason: '', agreed: false })} sx={{ maxWidth: 560 }}>
            {choices.map(s => <MenuItem key={s.id} value={s.id} disabled={!s.isActive || s.status !== 'AVAILABLE' || s.isInBuffer || s.openSessionId != null}>
              {s.zoneName} · {s.code}{s.isInBuffer ? ' — Đang chờ hết đệm' : s.status !== 'AVAILABLE' || !s.isActive ? ' — Chưa phục vụ được' : ''}
            </MenuItem>)}
          </TextField>
          {!loading && !choices.length && <Alert severity="warning">Chưa có vị trí thuộc nhóm và loại xe này.</Alert>}
          {replacement && <>
            <TextField required label="Lý do đổi vị trí" value={form.reason} disabled={saving} slotProps={{ htmlInput: { maxLength: 1000 } }} onChange={e => setForm({ ...form, reason: e.target.value })} sx={{ maxWidth: 560 }} />
            <FormControlLabel control={<Checkbox checked={form.agreed} disabled={saving} onChange={e => setForm({ ...form, agreed: e.target.checked })} />} label="Khách đã đồng ý đổi vị trí" />
          </>}
          <Typography variant="body2" color="text.secondary" sx={{ maxWidth: '68ch' }}>
            {mode === 'walkin' ? 'Lượt gửi trực tiếp được lưu theo biển số.' : 'Có thể nhận xe sớm tối đa 15 phút. Lượt đặt phải còn hạn hoặc vẫn trong thời gian xử lý sự cố đã ghi nhận.'}
          </Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ gap: 1 }}>
            <Button type="submit" variant="contained" color="success" disabled={saving || looking || loading || Boolean(loadError) || !form.slotId || (replacement && (!form.agreed || !form.reason.trim()))}>{saving ? 'Đang nhận xe…' : 'Xác nhận xe vào'}</Button>
            <Button disabled={saving} onClick={load}>Cập nhật vị trí</Button>
          </Stack>
        </Stack>
      </Box>}
      {loading && <Typography role="status" variant="body2" color="text.secondary" sx={{ px: { xs: 2, sm: 3 }, pb: 2 }}>Đang tải vị trí…</Typography>}
    </Box>
    <StaffActionDialog action={staffAction} onClose={() => setStaffAction(null)} onSuccess={issueSaved} />
  </Layout>
}
