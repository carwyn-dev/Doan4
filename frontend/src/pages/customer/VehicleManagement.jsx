import PageHeader from '../../components/PageHeader'
import { useState, useEffect } from 'react'
import Layout from '../../components/Layout'
import useMutationRequest from '../../hooks/useMutationRequest'
import { vehicleAPI, getErrorMessage } from '../../services/api'
import {
  Box, Typography, Button, Card, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, Select, MenuItem,
  FormControl, InputLabel, Chip, Alert, IconButton, Tooltip, Avatar
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/Edit'
import PowerSettingsNewIcon from '@mui/icons-material/PowerSettingsNew'
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar'
import TwoWheelerIcon from '@mui/icons-material/TwoWheeler'

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
      <Box>
        <PageHeader title="Quản lý Phương tiện" eyebrow="Phương tiện của bạn" description="Thêm và quản lý xe để đặt chỗ nhanh hơn cho mỗi chuyến đi."
          action={<Button variant="contained" startIcon={<AddIcon />} onClick={() => handleOpenDialog()}>Thêm xe</Button>} />

        {mutation.error && !openDialog && <Alert severity="error" sx={{ mb: 2 }}>{mutation.error}</Alert>}
        {error && !openDialog && <Alert severity="error" sx={{ mb: 2 }} action={<Button onClick={loadVehicles} disabled={loading}>Tải lại</Button>}>{error}</Alert>}
        <Card sx={{ borderRadius: 3 }}>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow sx={{ bgcolor: '#f7f9fa' }}>
                  <TableCell sx={{ fontWeight: 700, color: '#087f73' }}>STT</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: '#087f73' }}>Biển số xe</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: '#087f73' }}>Loại xe</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: '#087f73' }}>Trạng thái</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 700, color: '#087f73' }}>Thao tác</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={5} align="center" sx={{ py: 4 }}>Đang tải...</TableCell></TableRow>
                ) : vehicles.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} align="center" sx={{ py: 6 }}>
                      <TwoWheelerIcon sx={{ fontSize: 48, color: '#cbd5e1', mb: 1 }} />
                      <Typography color="text.secondary">Chưa có phương tiện nào</Typography>
                      <Button variant="contained" sx={{ mt: 2 }} onClick={() => handleOpenDialog()}>Thêm xe ngay</Button>
                    </TableCell>
                  </TableRow>
                ) : vehicles.map((vehicle, index) => (
                  <TableRow key={vehicle.id} hover sx={{ '&:hover': { bgcolor: '#f7f9fa' } }}>
                    <TableCell sx={{ color: '#64748b' }}>{index + 1}</TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <Avatar sx={{ bgcolor: vehicle.vehicleType === 'CAR' ? '#edf6f2' : '#f1f6f8', width: 36, height: 36 }}>
                          {vehicle.vehicleType === 'CAR'
                            ? <DirectionsCarIcon sx={{ color: '#087f73', fontSize: 20 }} />
                            : <TwoWheelerIcon sx={{ color: '#386989', fontSize: 20 }} />}
                        </Avatar>
                        <Typography sx={{ fontWeight: 700, fontSize: 15 }}>{vehicle.plateNumber}</Typography>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={vehicle.vehicleType === 'CAR' ? 'Ô tô' : 'Xe máy'}
                        size="small"
                        sx={{
                          bgcolor: vehicle.vehicleType === 'CAR' ? '#edf6f2' : '#f1f6f8',
                          color: vehicle.vehicleType === 'CAR' ? '#087f73' : '#386989',
                          fontWeight: 600, border: 'none'
                        }}
                      />
                    </TableCell>
                    <TableCell><Chip size="small" label={vehicle.isActive ? 'Đang sử dụng' : 'Đã ngừng sử dụng'} color={vehicle.isActive ? 'success' : 'default'} /></TableCell>
                    <TableCell align="center">
                      <Tooltip title="Chỉnh sửa">
                        <IconButton
                          disabled={saving}
                          onClick={() => handleOpenDialog(vehicle)}
                          sx={{ color: '#087f73', '&:hover': { bgcolor: '#edf6f2' } }}
                        >
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title={vehicle.isActive ? 'Ngừng sử dụng' : 'Kích hoạt lại'}>
                        <IconButton
                          disabled={saving}
                          onClick={() => handleToggle(vehicle)}
                          sx={{ color: '#dc2626', '&:hover': { bgcolor: '#fff1f1' } }}
                        >
                          <PowerSettingsNewIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>

        <Dialog open={openDialog} onClose={() => !saving && setOpenDialog(false)} maxWidth="xs" fullWidth>
          <DialogTitle sx={{ fontWeight: 700, pb: 1 }}>
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
            <FormControl fullWidth margin="normal">
              <InputLabel>Loại xe</InputLabel>
              <Select value={formData.vehicleType} label="Loại xe" onChange={(e) => setFormData({ ...formData, vehicleType: e.target.value })}>
                <MenuItem value="MOTORBIKE">🛵 Xe máy</MenuItem>
                <MenuItem value="CAR">🚗 Ô tô</MenuItem>
              </Select>
            </FormControl>
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
