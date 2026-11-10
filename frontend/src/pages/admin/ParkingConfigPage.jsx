import PageHeader from '../../components/PageHeader'
import { useEffect, useState } from 'react'
import {
  Alert, Box, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent,
  DialogTitle, FormControlLabel, MenuItem, Stack, TableBody, TableCell,
  TableHead, TableRow, TextField, Typography
} from '@mui/material'
import Layout from '../../components/Layout'
import ScrollTable from '../../components/ScrollTable'
import { adminAPI, getErrorMessage } from '../../services/api'
import { formatParkingTime } from '../../utils/reservationTime'
import useAdminMutation from './useAdminMutation'

const labels = { lot: 'bãi đỗ xe', zone: 'khu vực', slot: 'vị trí đỗ' }
const types = { CAR: 'Ô tô', MOTORBIKE: 'Xe máy' }
const statuses = { AVAILABLE: 'Sẵn sàng', OCCUPIED: 'Có xe', MAINTENANCE: 'Bảo trì' }
const activeChip = active => <Chip size="small" color={active ? 'success' : 'default'} label={active ? 'Hoạt động' : 'Ngừng hoạt động'} />

export default function ParkingConfigPage({ kind }) {
  const [lots, setLots] = useState([])
  const [zones, setZones] = useState([])
  const [rows, setRows] = useState([])
  const [lotId, setLotId] = useState('')
  const [zoneId, setZoneId] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const [dialog, setDialog] = useState(null)
  const [form, setForm] = useState({})
  const [notice, setNotice] = useState('')
  const mutation = useAdminMutation()
  const lot = lots.find(r => r.id === lotId)
  const zone = zones.find(r => r.id === zoneId)
  const parentReady = kind === 'lot' || (lot?.isActive && (kind === 'zone' || zone?.isActive))

  // Một chuỗi đọc có cờ hủy: phản hồi từ lựa chọn bãi/khu trước không ghi đè lựa chọn mới.
  useEffect(() => {
    let current = true
    setLoading(true)
    setError('')
    setRows([])
    const load = async () => {
      let selectionChanged = false
      try {
        const list = (await adminAPI.getParkingLots()).data
        if (!current) return
        setLots(list)
        if (kind === 'lot') { setRows(list); return }
        const selectedLot = list.some(r => r.id === lotId) ? lotId : list[0]?.id ?? ''
        if (selectedLot !== lotId) { selectionChanged = true; setLotId(selectedLot); return }
        if (!selectedLot) { setZones([]); return }
        const children = (await adminAPI.getZones(selectedLot)).data
        if (!current) return
        setZones(children)
        if (kind === 'zone') { setRows(children); return }
        const selectedZone = children.some(r => r.id === zoneId) ? zoneId : children[0]?.id ?? ''
        if (selectedZone !== zoneId) { selectionChanged = true; setZoneId(selectedZone); return }
        if (!selectedZone) return
        const slots = (await adminAPI.getSlots(selectedZone)).data
        if (current) setRows(slots)
      } catch (e) { if (current) setError(getErrorMessage(e)) }
      // Giữ bộ lọc khóa cho đến khi chuỗi chọn bãi/khu mặc định tải xong.
      finally { if (current && !selectionChanged) setLoading(false) }
    }
    load()
    return () => { current = false }
  }, [kind, lotId, zoneId, revision])

  const open = (row = null, toggle = false, maintenance = false) => {
    mutation.setError('')
    setNotice('')
    setDialog({ id: row?.id, maintenance })
    setForm({
      name: row?.name ?? '', address: row?.address ?? '', floorLabel: row?.floorLabel ?? '',
      vehicleType: row?.vehicleType ?? 'MOTORBIKE', code: row?.code ?? '',
      isActive: toggle ? !row.isActive : row?.isActive ?? true,
      acceptsReservations: row?.acceptsReservations ?? true,
      isMaintenance: row?.operationalStatus !== 'MAINTENANCE', reason: ''
    })
  }
  const field = (name, value) => setForm(f => ({ ...f, [name]: value }))
  const submit = async event => {
    event.preventDefault()
    if (!form.reason.trim()) { mutation.setError('Vui lòng nhập lý do thay đổi.'); return }
    let data, action
    const common = { isActive: form.isActive, reason: form.reason.trim() }
    if (dialog.maintenance) {
      data = { isMaintenance: form.isMaintenance, reason: common.reason }
      action = key => adminAPI.setSlotMaintenance(dialog.id, data, key)
    } else if (kind === 'lot') {
      data = { ...common, name: form.name.trim(), address: form.address.trim() }
      action = key => dialog.id ? adminAPI.updateParkingLot(dialog.id, data, key) : adminAPI.createParkingLot(data, key)
    } else if (kind === 'zone') {
      data = { ...common, parkingLotId: lotId, name: form.name.trim(), floorLabel: form.floorLabel.trim() || null, vehicleType: form.vehicleType }
      action = key => dialog.id ? adminAPI.updateZone(dialog.id, data, key) : adminAPI.createZone(data, key)
    } else {
      data = { ...common, zoneId, code: form.code, acceptsReservations: form.acceptsReservations }
      action = key => dialog.id ? adminAPI.updateSlot(dialog.id, data, key) : adminAPI.createSlot(data, key)
    }
    if (await mutation.save(`${kind}:${dialog.id ?? 'new'}:${dialog.maintenance}`, data, action)) {
      setDialog(null)
      setNotice('Đã lưu thay đổi vào cơ sở dữ liệu.')
      setRevision(r => r + 1)
    }
  }
  const input = (name, label, maxLength, required = true) => <TextField
    label={label} required={required} fullWidth value={form[name] ?? ''}
    onChange={e => field(name, e.target.value)} slotProps={{ htmlInput: { maxLength } }} />

  return <Layout>
    <PageHeader title={`Quản lý ${labels[kind]}`} description={{ lot: 'Địa chỉ và trạng thái của từng bãi.', zone: 'Phân khu theo tầng và loại xe.', slot: 'Phân nhóm đặt trước, khách trực tiếp và bảo trì.' }[kind]} action={<Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap' }}>
        <Button variant="outlined" disabled={loading || mutation.saving} onClick={() => setRevision(r => r + 1)}>Tải lại</Button>
        <Button variant="contained" disabled={loading || !!error || !parentReady || mutation.saving} onClick={() => open()}>Thêm {labels[kind]}</Button>
      </Stack>} />
    {kind !== 'lot' && <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }}>
      <TextField select size="small" label="Bãi đỗ xe" value={lotId} sx={{ minWidth: 220 }} disabled={mutation.saving || loading}
        onChange={e => { setLotId(e.target.value); setZoneId(''); setZones([]) }}>
        {lots.map(r => <MenuItem key={r.id} value={r.id}>{r.name}{!r.isActive ? ' (ngừng hoạt động)' : ''}</MenuItem>)}
      </TextField>
      {kind === 'slot' && <TextField select size="small" label="Khu vực" value={zoneId} sx={{ minWidth: 220 }} disabled={mutation.saving || loading}
        onChange={e => setZoneId(e.target.value)}>
        {zones.map(r => <MenuItem key={r.id} value={r.id}>{r.name} · {types[r.vehicleType]}{!r.isActive ? ' (ngừng hoạt động)' : ''}</MenuItem>)}
      </TextField>}
    </Stack>}
    {notice && <Alert severity="success" sx={{ mb: 2 }}>{notice}</Alert>}
    {error && <Alert severity="error" sx={{ mb: 2 }}>{error} Nhấn Tải lại để thử lại.</Alert>}
    {!loading && !error && !parentReady && <Alert severity="info" sx={{ mb: 2 }}>
      {lot && (kind === 'zone' || zone) ? 'Kích hoạt bãi và khu vực cha trước khi sửa hoặc thêm cấu hình bên trong.' : 'Tạo bãi và khu vực trước khi thêm vị trí đỗ.'}
    </Alert>}
    {loading ? <Typography role="status">Đang tải dữ liệu…</Typography> : !error && <ScrollTable label={`Danh sách ${labels[kind]}`} minWidth={kind === 'slot' ? 760 : 650} fixed>
        <TableHead><TableRow>
          <TableCell sx={{ width: { xs: 132, lg: '19%' } }}>{kind === 'slot' ? 'Mã vị trí' : 'Tên'}</TableCell>
          <TableCell sx={{ width: { xs: 164, lg: '25%' } }}>Thao tác</TableCell>
          {kind === 'lot' ? <><TableCell>Địa chỉ</TableCell><TableCell>Khu vực / vị trí</TableCell></> : kind === 'zone' ?
            <><TableCell>Tầng</TableCell><TableCell>Loại xe / vị trí</TableCell></> :
            <><TableCell>Nhóm vị trí</TableCell><TableCell>Vận hành / khoảng đệm</TableCell></>}
          <TableCell>Trạng thái</TableCell>
        </TableRow></TableHead>
        <TableBody>{rows.map(r => <TableRow key={r.id}>
          <TableCell sx={{ fontWeight: 600 }}>{r.name ?? r.code}</TableCell>
          <TableCell><Stack direction="row" sx={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <Button size="small" sx={{ minWidth: 0 }} disabled={!parentReady || mutation.saving} onClick={() => open(r)}>Sửa</Button>
            <Button size="small" color={r.isActive ? 'warning' : 'success'} disabled={!parentReady || mutation.saving} onClick={() => open(r, true)}>{r.isActive ? 'Ngừng hoạt động' : 'Kích hoạt lại'}</Button>
            {kind === 'slot' && <Button size="small" disabled={mutation.saving || r.operationalStatus === 'OCCUPIED'} onClick={() => open(r, false, true)}>{r.operationalStatus === 'MAINTENANCE' ? 'Kết thúc bảo trì' : 'Bảo trì'}</Button>}
          </Stack></TableCell>
          {kind === 'lot' ? <><TableCell>{r.address}</TableCell><TableCell>{r.zoneCount} khu · {r.slotCount} vị trí<br />{r.activeSlotCount} vị trí hoạt động</TableCell></> : kind === 'zone' ?
            <><TableCell>{r.floorLabel || '—'}</TableCell><TableCell>{types[r.vehicleType]} · {r.slotCount} vị trí</TableCell></> :
            <><TableCell>{r.acceptsReservations ? 'Đặt trước' : 'Khách trực tiếp'}</TableCell><TableCell>
              <Chip size="small" color={r.operationalStatus === 'MAINTENANCE' ? 'warning' : 'default'} label={statuses[r.operationalStatus] ?? r.operationalStatus} />
              {r.bufferUntil && new Date(r.bufferUntil) > new Date() && <Typography variant="caption" component="div">Đệm đến {formatParkingTime(r.bufferUntil)}</Typography>}
            </TableCell></>}
          <TableCell>{activeChip(r.isActive)}</TableCell>
        </TableRow>)}
          {!rows.length && <TableRow><TableCell colSpan={5}>Chưa có {labels[kind]} trong lựa chọn này.</TableCell></TableRow>}
        </TableBody>
    </ScrollTable>}
    <Dialog open={!!dialog} onClose={() => !mutation.saving && setDialog(null)} fullWidth maxWidth="sm">
      <Box component="form" onSubmit={submit}>
        <DialogTitle>{dialog?.maintenance ? (form.isMaintenance ? 'Bảo trì vị trí' : 'Kết thúc bảo trì') : `${dialog?.id ? 'Sửa' : 'Thêm'} ${labels[kind]}`}</DialogTitle>
        <DialogContent><Stack spacing={2} sx={{ pt: 1 }}>
          {mutation.error && <Alert severity="error">{mutation.error}</Alert>}
          <Box component="fieldset" disabled={mutation.saving} sx={{ border: 0, p: 0, m: 0, minWidth: 0 }}><Stack spacing={2}>
            {dialog?.maintenance ? <Alert severity="info">Bảo trì chặn nhận xe tại vị trí. Lịch đặt tương lai vẫn được giữ và cần được nhân viên xử lý khi phục vụ.</Alert> : <>
              {kind !== 'lot' && <Typography sx={{ color: 'text.secondary' }}>Bãi: {lot?.name}{kind === 'slot' ? ` · Khu: ${zone?.name}` : ''}. Muốn chuyển bãi/khu, hãy tạo cấu hình mới.</Typography>}
              {kind === 'slot' ? <TextField label="Mã vị trí" required fullWidth value={form.code ?? ''} onChange={e => field('code', e.target.value)}
                helperText="Tối đa 30 ký tự chữ không dấu, số, dấu _ hoặc -" slotProps={{ htmlInput: { maxLength: 30, pattern: '[A-Za-z0-9_-]+' } }} /> : input('name', 'Tên', kind === 'lot' ? 150 : 100)}
              {kind === 'lot' && input('address', 'Địa chỉ', 500)}
              {kind === 'zone' && <>{input('floorLabel', 'Tầng', 50, false)}
                <TextField select label="Loại xe" required value={form.vehicleType ?? 'MOTORBIKE'} onChange={e => field('vehicleType', e.target.value)}>
                  {Object.entries(types).map(([id, name]) => <MenuItem key={id} value={id}>{name}</MenuItem>)}
                </TextField></>}
              {kind === 'slot' && <FormControlLabel control={<Checkbox checked={!!form.acceptsReservations} onChange={e => field('acceptsReservations', e.target.checked)} />} label="Cho phép đặt trước" />}
              <FormControlLabel control={<Checkbox checked={!!form.isActive} onChange={e => field('isActive', e.target.checked)} />} label="Đang hoạt động" />
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>Ngừng hoạt động giữ lịch sử. Hệ thống chặn thay đổi nếu ảnh hưởng lịch đã xác nhận hoặc xe đang gửi.</Typography>
            </>}
            {input('reason', 'Lý do thay đổi', 1000)}
          </Stack></Box>
        </Stack></DialogContent>
        <DialogActions><Button disabled={mutation.saving} onClick={() => setDialog(null)}>Đóng</Button><Button type="submit" variant="contained" disabled={mutation.saving}>{mutation.saving ? 'Đang lưu...' : 'Lưu thay đổi'}</Button></DialogActions>
      </Box>
    </Dialog>
  </Layout>
}
