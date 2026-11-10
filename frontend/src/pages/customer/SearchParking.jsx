import PageHeader from '../../components/PageHeader'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Alert, Box, Button, MenuItem, Stack, TextField, Typography } from '@mui/material'
import Layout from '../../components/Layout'
import { getErrorMessage, parkingLotAPI, reservationAPI, vehicleAPI } from '../../services/api'
import { formatParkingTime, toUtc, vietnamInput } from '../../utils/reservationTime'

const bookingSteps = ['Xe và giờ', 'Vị trí', 'Xác nhận']
const fieldGrid = { display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }
const headingSx = { scrollMarginTop: '80px', mb: 1.5 }

function BookingDetails({ lot, vehicle, search }) {
  return <Box component="dl" sx={{
    display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: { xs: 1.25, sm: 2 }, m: 0,
    p: { xs: 1.5, sm: 2 }, bgcolor: 'background.default', overflowWrap: 'anywhere',
    '& dt': { color: 'text.secondary', typography: 'caption' },
    '& dd': { m: 0, typography: 'body2', fontWeight: 600, fontVariantNumeric: 'tabular-nums' },
  }}>
    <div><dt>Bãi đỗ</dt><dd>{lot?.name}{lot?.address && <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{lot.address}</Typography>}</dd></div>
    <div><dt>Biển số</dt><dd>{vehicle?.plateNumber}</dd></div>
    <div><dt>Giờ bắt đầu (UTC+7)</dt><dd>{formatParkingTime(search.params.startTime)}</dd></div>
    <div><dt>Giờ kết thúc (UTC+7)</dt><dd>{formatParkingTime(search.params.endTime)}</dd></div>
  </Box>
}

export default function SearchParking() {
  const navigate = useNavigate()
  const [lots, setLots] = useState([])
  const [vehicles, setVehicles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [conflict, setConflict] = useState('')
  const [step, setStep] = useState(0)
  const previousStep = useRef(step)
  const stepHeading = useRef(null)
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [form, setForm] = useState(() => ({ lotId: '', vehicleId: '',
    startTime: vietnamInput(new Date(Date.now() + 15 * 60000)), endTime: vietnamInput(new Date(Date.now() + 75 * 60000)) }))
  const [search, setSearch] = useState(null)
  const [slots, setSlots] = useState([])
  const [slot, setSlot] = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  const [updatedAt, setUpdatedAt] = useState(null)
  const request = useRef(null)
  const load = async () => {
    setLoading(true); setError('')
    try {
      const [lotResponse, vehicleResponse] = await Promise.all([parkingLotAPI.getAll(), vehicleAPI.getAll()])
      setLots(lotResponse.data); setVehicles(vehicleResponse.data.filter(v => v.isActive))
    } catch (err) { setError(getErrorMessage(err)) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])
  useEffect(() => {
    if (previousStep.current === step) return
    previousStep.current = step
    stepHeading.current?.focus()
  }, [step])
  useEffect(() => {
    if (!search) return
    let active = true, controller, running = false
    const refresh = async () => {
      if (running) return
      running = true; controller = new AbortController(); setRefreshing(true)
      try {
        const { data } = await parkingLotAPI.getAvailability(search.lotId, search.params, controller.signal)
        if (!active) return
        setSlots(data); setUpdatedAt(new Date()); setError('')
      } catch (err) {
        if (active && err.code !== 'ERR_CANCELED') { setSlots([]); setError(getErrorMessage(err)) }
      } finally { running = false; if (active) setRefreshing(false) }
    }
    refresh()
    const timer = setInterval(refresh, 30000)
    return () => { active = false; controller?.abort(); clearInterval(timer) }
  }, [search])
  const find = event => {
    event.preventDefault()
    try {
      const start = toUtc(form.startTime), end = toUtc(form.endTime)
      const duration = Date.parse(end) - Date.parse(start)
      if (Date.parse(start) <= Date.now() || Date.parse(start) > Date.now() + 7 * 86400000 || duration < 30 * 60000 || duration > 24 * 3600000)
        throw new Error('Chọn giờ bắt đầu trong 7 ngày tới và thời gian gửi từ 30 phút đến 24 giờ.')
      setSearch({ lotId: Number(form.lotId), params: { vehicleId: Number(form.vehicleId), startTime: start, endTime: end } })
      setSlot(null); setSlots([]); setUpdatedAt(null); setStep(1); setError(''); setConflict(''); request.current = null
    } catch (err) { setError(err.message || 'Thời gian không hợp lệ.') }
  }
  const confirm = async () => {
    if (busyRef.current) return
    const data = { ...search.params, slotId: slot.id }, fingerprint = JSON.stringify(data)
    if (request.current?.fingerprint !== fingerprint) request.current = { fingerprint, key: crypto.randomUUID() }
    busyRef.current = true; setBusy(true); setError('')
    try {
      const result = await reservationAPI.create(data, request.current.key)
      request.current = null
      navigate('/customer/history', { state: { reservationCode: result.data.reservationCode } })
    } catch (err) {
      const message = getErrorMessage(err)
      if (err.response?.status === 409) {
        setConflict(message); setSlot(null); setSlots([]); setUpdatedAt(null); setStep(1); setSearch({ ...search })
      } else setError(message)
    } finally { busyRef.current = false; setBusy(false) }
  }
  const lot = lots.find(l => l.id === search?.lotId)
  const vehicle = vehicles.find(v => v.id === search?.params.vehicleId)
  const slotsByZone = new Map()
  for (const position of slots) {
    if (!slotsByZone.has(position.zoneId)) slotsByZone.set(position.zoneId, [])
    slotsByZone.get(position.zoneId).push(position)
  }

  return <Layout>
    <Box sx={{ maxWidth: 960 }}>
      <PageHeader title="Đặt chỗ gửi xe" description="Chọn bãi, xe và khung giờ gửi." />
      <Box component="ol" aria-label="Các bước đặt chỗ" sx={{
        display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 1, listStyle: 'none', m: 0, mb: 2, p: 0,
      }}>
        {bookingSteps.map((label, index) => <Box component="li" key={label} aria-current={step === index ? 'step' : undefined} sx={{
          pb: 1, borderBottom: '2px solid', borderColor: step === index ? 'primary.main' : 'divider',
          color: step === index ? 'primary.dark' : 'text.secondary', typography: 'body2', fontWeight: step === index ? 700 : 400,
        }}>{index + 1}. {label}</Box>)}
      </Box>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <Box sx={{ bgcolor: 'background.paper', border: 1, borderColor: 'divider', borderRadius: 1, p: { xs: 2, sm: 3 } }}>
        {loading ? <Typography role="status" variant="body2">Đang tải danh sách bãi và xe…</Typography> : step === 0 ? <>
          <Typography component="h2" variant="h6" ref={stepHeading} tabIndex={-1} sx={headingSx}>Xe, bãi và thời gian gửi</Typography>
          {vehicles.length && lots.length ? <Box component="form" onSubmit={find}>
            <Box sx={fieldGrid}>
              <TextField select required label="Phương tiện" value={form.vehicleId} onChange={e => setForm({ ...form, vehicleId: e.target.value })}>
                {vehicles.map(v => <MenuItem key={v.id} value={v.id}>{v.plateNumber} — {v.vehicleType === 'CAR' ? 'Ô tô' : 'Xe máy'}</MenuItem>)}
              </TextField>
              <TextField select required label="Bãi đỗ" value={form.lotId} onChange={e => setForm({ ...form, lotId: e.target.value })}>
                {lots.map(l => <MenuItem key={l.id} value={l.id}>{l.name}</MenuItem>)}
              </TextField>
              <TextField required type="datetime-local" label="Giờ bắt đầu" slotProps={{ inputLabel: { shrink: true } }} value={form.startTime} onChange={e => setForm({ ...form, startTime: e.target.value })} />
              <TextField required type="datetime-local" label="Giờ kết thúc" slotProps={{ inputLabel: { shrink: true } }} value={form.endTime} onChange={e => setForm({ ...form, endTime: e.target.value })} />
            </Box>
            <Typography variant="body2" color="text.secondary" sx={{ my: 2 }}>Giờ Việt Nam (UTC+7). Đặt trước tối đa 7 ngày, mỗi lượt từ 30 phút đến 24 giờ.</Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ gap: 1 }}>
              <Button type="submit" variant="contained">Tìm chỗ trống</Button>
              <Button onClick={load}>Tải lại danh sách bãi và xe</Button>
            </Stack>
          </Box> : <>
            {!error && <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              {!vehicles.length ? 'Bạn cần thêm phương tiện đang hoạt động trước khi đặt chỗ.' : 'Chưa có bãi đang hoạt động.'}
            </Typography>}
            <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ gap: 1 }}>
              {!vehicles.length && !error && <Button component={Link} to="/customer/vehicles" variant="outlined">Quản lý phương tiện</Button>}
              <Button onClick={load}>Tải lại danh sách bãi và xe</Button>
            </Stack>
          </>}
        </> : step === 1 ? <>
          <Typography component="h2" variant="h6" ref={stepHeading} tabIndex={-1} sx={headingSx}>Chọn vị trí</Typography>
          <BookingDetails lot={lot} vehicle={vehicle} search={search} />
          {conflict && <Alert severity="warning" sx={{ mt: 2 }}>{conflict} Vui lòng chọn lại vị trí hoặc đổi điều kiện.</Alert>}
          {refreshing && <Typography role="status" variant="body2" sx={{ mt: 2 }}>Đang kiểm tra chỗ trống…</Typography>}
          {updatedAt && !refreshing && !error && !slots.length && <Alert severity="warning" sx={{ mt: 2 }}>Không còn vị trí phù hợp. Bạn hãy chọn bãi hoặc khung giờ khác.</Alert>}
          {[...slotsByZone].map(([zoneId, positions]) => {
            const zoneName = positions[0].zoneName
            return <Box component="section" aria-labelledby={`booking-zone-${zoneId}`} key={zoneId} sx={{ mt: 2, pt: 1.5, borderTop: 1, borderColor: 'divider' }}>
              <Stack direction="row" sx={{ alignItems: 'baseline', gap: 1.5, flexWrap: 'wrap', mb: 1 }}>
                <Typography id={`booking-zone-${zoneId}`} component="h3" variant="body2" sx={{ fontWeight: 700 }}>{zoneName}</Typography>
                <Typography variant="caption" color="text.secondary">{positions.length} vị trí trống</Typography>
              </Stack>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                {positions.map(position => <Button key={position.id} aria-label={`${zoneName} · ${position.code}`} variant="outlined" disabled={refreshing}
                  sx={{ minWidth: 84, maxWidth: '100%', borderRadius: 1, overflowWrap: 'anywhere', fontVariantNumeric: 'tabular-nums' }}
                  onClick={() => { setSlot(position); setStep(2); setError(''); setConflict('') }}>{position.code}</Button>)}
              </Box>
            </Box>
          })}
          {updatedAt && <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
            Cập nhật {formatParkingTime(updatedAt)}. Tự tải lại mỗi 30 giây.
          </Typography>}
          <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ gap: 1, mt: 2 }}>
            <Button onClick={() => { setSearch(null); setStep(0); setError('') }}>Đổi điều kiện</Button>
            <Button variant="outlined" disabled={refreshing} onClick={() => setSearch({ ...search })}>Kiểm tra lại chỗ trống</Button>
          </Stack>
        </> : <>
          <Typography component="h2" variant="h6" ref={stepHeading} tabIndex={-1} sx={headingSx}>Xác nhận đặt chỗ</Typography>
          <Stack direction="row" sx={{ alignItems: 'baseline', gap: 1.5, flexWrap: 'wrap', p: 1.5, bgcolor: 'primary.light', overflowWrap: 'anywhere' }}>
            <Typography variant="h5" color="primary.dark" sx={{ fontVariantNumeric: 'tabular-nums' }}>{slot.code}</Typography>
            <Typography variant="body2">{slot.zoneName}</Typography>
          </Stack>
          <BookingDetails lot={lot} vehicle={vehicle} search={search} />
          <Typography variant="body2" color="text.secondary" sx={{ my: 2, maxWidth: '70ch' }}>
            Có thể đến sớm tối đa 15 phút. Lượt đặt hết hạn nếu chưa vào bãi sau giờ bắt đầu 15 phút. Chỉ hủy trước giờ bắt đầu. Thanh toán tại quầy khi xe ra.
          </Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ gap: 1 }}>
            <Button disabled={busy} variant="contained" onClick={confirm}>{busy ? 'Đang đặt…' : 'Xác nhận đặt chỗ'}</Button>
            <Button disabled={busy} onClick={() => setStep(1)}>Quay lại chọn vị trí</Button>
          </Stack>
        </>}
      </Box>
    </Box>
  </Layout>
}
