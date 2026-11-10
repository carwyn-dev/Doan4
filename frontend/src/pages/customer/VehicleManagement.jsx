import PageHeader from '../../components/PageHeader'
import { useState, useEffect } from 'react'
import Layout from '../../components/Layout'
import useMutationRequest from '../../hooks/useMutationRequest'
import { vehicleAPI, getErrorMessage } from '../../services/api'
import {
  Box, Typography, Button, Card, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, MenuItem, Stack, Chip, Alert
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'

function VehicleManagement() {
  const [vehicles, setVehicles] = useState([])
  const [loading, setLoading] = useState(true)
  const [openDialog, setOpenDialog] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [formData, setFormData] = useState({ plateNumber: '', vehicleType: 'MOTORBIKE', isActive: true })
  const [error, setError] = useState('')
  const mutation = useMutationRequest()
  const { saving } = mutation

  useEffect(() => { loadVehicles() }, [])

  const loadVehicles = async () => {
    setLoading(true)
    try {
      const response = await vehicleAPI.getAll()
      setVehicles(response.data)
      setError('')
    } catch (error) {
      setError(getErrorMessage(error))
    } finally {
      setLoading(false)
    }
  }

  const handleOpenDialog = (vehicle = null) => {
    if (vehicle) {
      setEditingId(vehicle.id)
      setFormData({ plateNumber: vehicle.plateNumber, vehicleType: vehicle.vehicleType, isActive: vehicle.isActive })
    } else {
      setEditingId(null)
      setFormData({ plateNumber: '', vehicleType: 'MOTORBIKE', isActive: true })
    }
    setError('')
    mutation.setError('')
    setOpenDialog(true)
  }

  const handleSubmit = async () => {
    if (saving) return
    if (!formData.plateNumber.trim()) { setError('Vui lòng nhập biển số xe'); return }
    const data = { ...formData, plateNumber: formData.plateNumber.trim() }
    if (await mutation.save(editingId ? `update:${editingId}` : 'create', data,
      key => editingId ? vehicleAPI.update(editingId, data, key) : vehicleAPI.create(data, key))) {
      setOpenDialog(false)
      await loadVehicles()
    }
  }

  const handleToggle = async (vehicle) => {
    if (saving) return
    if (!window.confirm(vehicle.isActive ? 'Ngừng sử dụng xe này? Lịch sử gửi xe vẫn được giữ.' : 'Kích hoạt lại xe này?')) return
    const data = { plateNumber: vehicle.plateNumber, vehicleType: vehicle.vehicleType, isActive: !vehicle.isActive }
    if (await mutation.save(`toggle:${vehicle.id}`, data, key => vehicleAPI.update(vehicle.id, data, key))) await loadVehicles()
  }

  return (
    <Layout>
      <Box sx={{ maxWidth: 960 }}>
        <PageHeader title="Phương tiện" description="Thêm xe hoặc cập nhật biển số để dùng khi đặt chỗ."
          action={<Button variant="contained" startIcon={<AddIcon />} onClick={() => handleOpenDialog()}>Thêm xe</Button>} />

        {mutation.error && !openDialog && <Alert severity="error" sx={{ mb: 2 }}>{mutation.error}</Alert>}
        {error && !openDialog && <Alert severity="error" sx={{ mb: 2 }} action={<Button onClick={loadVehicles} disabled={loading}>Tải lại</Button>}>{error}</Alert>}
        <Card>
          <TableContainer>
            <Table aria-label="Danh sách phương tiện" sx={{ tableLayout: 'fixed', '& .MuiTableCell-root': { px: { xs: 1.5, sm: 2 }, overflowWrap: 'anywhere' } }}>
              <TableHead>
                <TableRow>
                  <TableCell>Phương tiện</TableCell>
                  <TableCell sx={{ width: { xs: '43%', sm: '34%' } }}>Thao tác</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={2}>Đang tải phương tiện…</TableCell></TableRow>
                ) : vehicles.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={2}>
                      <Typography variant="body2" color="text.secondary">{error ? 'Chưa tải được danh sách phương tiện.' : 'Chưa có phương tiện nào. Thêm xe để bắt đầu đặt chỗ.'}</Typography>
                    </TableCell>
                  </TableRow>
                ) : vehicles.map(vehicle => (
                  <TableRow key={vehicle.id}>
                    <TableCell>
                      <Typography sx={{ fontWeight: 700, fontSize: 15 }}>{vehicle.plateNumber}</Typography>
                      <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap', alignItems: 'center', mt: 0.5 }}>
                        <Typography variant="caption" color="text.secondary">{vehicle.vehicleType === 'CAR' ? 'Ô tô' : 'Xe máy'}</Typography>
                        <Chip size="small" label={vehicle.isActive ? 'Đang sử dụng' : 'Đã ngừng sử dụng'} color={vehicle.isActive ? 'success' : 'default'} />
                      </Stack>
                    </TableCell>
                    <TableCell>
                      <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ alignItems: 'flex-start', gap: 0.5, flexWrap: 'wrap' }}>
                        <Button size="small" disabled={saving} onClick={() => handleOpenDialog(vehicle)}>Chỉnh sửa</Button>
                        <Button size="small" disabled={saving} color={vehicle.isActive ? 'warning' : 'success'} onClick={() => handleToggle(vehicle)}>
                          {vehicle.isActive ? 'Ngừng sử dụng' : 'Kích hoạt lại'}
                        </Button>
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>

        <Dialog open={openDialog} onClose={() => !saving && setOpenDialog(false)} maxWidth="xs" fullWidth aria-labelledby="vehicle-dialog-title">
          <DialogTitle id="vehicle-dialog-title" sx={{ pb: 1 }}>
            {editingId ? 'Chỉnh sửa phương tiện' : 'Thêm phương tiện mới'}
          </DialogTitle>
          <DialogContent>
            {mutation.error && <Alert severity="error" sx={{ mb: 2 }}>{mutation.error}</Alert>}
            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
            <TextField
              label="Biển số xe" fullWidth
              value={formData.plateNumber}
              onChange={(e) => setFormData({ ...formData, plateNumber: e.target.value })}
              placeholder="VD: 29A-12345" margin="normal"
            />
            <TextField select fullWidth margin="normal" value={formData.vehicleType} label="Loại xe" onChange={e => setFormData({ ...formData, vehicleType: e.target.value })}>
              <MenuItem value="MOTORBIKE">Xe máy</MenuItem>
              <MenuItem value="CAR">Ô tô</MenuItem>
            </TextField>
          </DialogContent>
          <DialogActions sx={{ p: 2.5, gap: 1 }}>
            <Button onClick={() => setOpenDialog(false)} disabled={saving} variant="outlined">Hủy</Button>
            <Button variant="contained" onClick={handleSubmit} disabled={saving} sx={{ px: 3 }}>
              {saving ? 'Đang lưu...' : editingId ? 'Cập nhật' : 'Thêm mới'}
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    </Layout>
  )
}

export default VehicleManagement
