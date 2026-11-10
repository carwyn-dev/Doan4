# Hướng dẫn demo đồ án 4

Đề tài **Quản lý bãi đỗ xe trực tuyến**

## 1. Chuẩn bị trước khi trình bày

### 1.1. Chuẩn bị SQL Server

1. Mở SQL Server Management Studio (SSMS), kết nối `localhost` bằng **Windows Authentication**. Trong Object Explorer, mở **Databases → ParkingLotOnline**.
2. Nếu chưa có database, chạy khối SQL ở **mục 1** của [sql.md](sql.md#1-script-khởi-tạo-và-nghiệp-vụ). Nếu dùng database cũ chưa có tra lượt đặt theo biển số, mở [file cập nhật thủ tục](scripts/sql/20261111_staff_reservation_plate.sql) trong SSMS rồi nhấn **F5**. Bản demo trên máy hiện tại đã được cập nhật.
3. Nếu cần lịch sử mẫu, mở [demo_data.sql](scripts/sql/demo_data.sql) trong SSMS bằng **Ctrl+O** rồi nhấn **F5**. Nếu đã nạp trước đó, script sẽ hiện số lượng đã nạp. Các tên, email, biển số và giao dịch mẫu dùng để trình diễn.

### 1.2. Chạy bằng VS Code

1. Mở VS Code, chọn **File → Open Folder** rồi mở thư mục `C:\Code\doan4` để thấy cả `backend` và `frontend`.
2. Chọn **Terminal → New Terminal** và dùng PowerShell. Chạy backend trong terminal thứ nhất.

   ```powershell
   .\scripts\chay-backend.ps1
   ```

3. Giữ terminal backend mở. Bấm dấu **+** trong bảng Terminal để mở terminal thứ hai và chạy frontend.

   ```powershell
   .\scripts\chay-frontend.ps1
   ```

4. Chờ backend báo đang lắng nghe ở cổng `5143` và Vite hiện địa chỉ `http://127.0.0.1:3000/`. Mở [trang đăng nhập](http://127.0.0.1:3000/login) để demo. Khi kết thúc, bấm **Ctrl+C** trong từng terminal.

Backend cần **.NET 10 SDK**. Nếu máy mới chưa có `frontend\node_modules`, cài **Node.js 22.12 trở lên** kèm npm. Sau đó mở PowerShell ở thư mục gốc của dự án, chạy các lệnh dưới đây. `npm.cmd ci` dùng để cài gói lần đầu hoặc sau khi `package-lock.json` thay đổi. Những lần chạy sau chỉ cần `npm.cmd run dev` trong thư mục `frontend`.

```powershell
cd C:\Code\doan4\frontend
npm.cmd ci
npm.cmd run dev
```

### 1.3. Chạy bằng Visual Studio

1. Dùng **Visual Studio 2026** có workload **ASP.NET and web development**. Mở **File → Open → Project/Solution** và chọn file `C:\Code\doan4\backend\ParkingLotAPI.csproj`. [Yêu cầu Visual Studio cho .NET 10](https://learn.microsoft.com/en-us/dotnet/core/install/windows#net-versions-and-visual-studio)
2. Trên thanh công cụ, chọn cấu hình chạy **http** cạnh nút tam giác xanh. Bấm **Ctrl+F5** để chạy backend hoặc **F5** nếu cần đặt breakpoint. Kiểm tra [trạng thái API](http://localhost:5143/api/health) để xác nhận đã kết nối database. [Cách mở và chạy project C# trong Visual Studio](https://learn.microsoft.com/en-us/visualstudio/get-started/csharp/run-program)
3. Mở **View → Terminal**, chọn PowerShell rồi chạy frontend từ thư mục dự án. Có thể dùng một cửa sổ PowerShell riêng cho bước này.

   ```powershell
   cd C:\Code\doan4
   .\scripts\chay-frontend.ps1
   ```

4. Giữ cả backend và frontend chạy, rồi mở [trang đăng nhập](http://127.0.0.1:3000/login).

### 1.4. Kiểm tra trước khi demo

- Mở [trạng thái API](http://localhost:5143/api/health). Kết quả cần thấy là `status: ready` và `database: connected`. Nếu báo lỗi kết nối, kiểm tra SQL Server có chạy và SSMS có mở được `ParkingLotOnline` trên `localhost`.
- Nếu cổng `5143` hoặc `3000` đang được dùng, kiểm tra cửa sổ chạy lần trước. Dùng phiên đang hoạt động hoặc dừng phiên cũ trước khi khởi động lại.
- Tại [trang đăng nhập](http://127.0.0.1:3000/login), chọn vai trò trong mục **Tài khoản demo** để điền sẵn email và mật khẩu.

| Vai trò | Email | Mật khẩu |
| --- | --- | --- |
| Quản trị viên | `admin@parking.test` | `123456` |
| Nhân viên Bãi Trung Tâm | `staff1@parking.test` | `123456` |
| Nhân viên Bãi Đại Học | `staff2@parking.test` | `123456` |
| Khách hàng đã có lịch sử mẫu | `customer1@parking.test` | `123456` |

Dùng các hồ sơ trình duyệt độc lập nếu muốn mở nhiều vai trò cùng lúc. Nếu chỉ dùng một hồ sơ, bấm **Đăng xuất** mỗi khi đổi vai trò.

## 2. Luồng chính trên web

**Đăng ký khách → thêm xe → đặt chỗ → nhận xe → trả xe và thu tiền → lưu PDF → xem báo cáo.**

### 2.1. Nhập khách hàng và phương tiện

Ở trang đăng nhập, chọn **Đăng ký ngay** và nhập mẫu sau.

| Trường | Dữ liệu để nhập |
| --- | --- |
| Họ tên | Nguyễn Minh Khôi |
| Email | `minh.khoi.demo01@parking.test` |
| Số điện thoại | `0000000826` |
| Mật khẩu | `KhachDemo2026!` |

Bấm **Đăng ký**, xác nhận thông báo rồi đăng nhập bằng tài khoản vừa tạo. Nếu đã tạo tài khoản này khi tập trước, đăng nhập lại bằng thông tin đó hoặc đổi `demo01` thành `demo02` khi muốn trình bày một lượt đăng ký mới.

Mở **Phương tiện → Thêm xe**. Nhập biển số `59-Z2 928.41`, chọn **Xe máy**, rồi bấm **Thêm mới**. Nếu tài khoản đã có xe đó, dùng lại xe trong danh sách. Nếu biển số thuộc một tài khoản khác, dùng biển số mẫu khác, ví dụ `59-Z2 928.42`, và dùng cùng biển số ở các bước sau.

### 2.2. Khách đặt chỗ ở Bãi Trung Tâm

1. Mở **Đặt chỗ gửi xe**. Chọn xe vừa thêm và **Bãi Trung Tâm**.
2. Đặt **Giờ bắt đầu** sau thời điểm hiện tại khoảng **5 phút** và **Giờ kết thúc** sau giờ bắt đầu **1 giờ**. Ví dụ nếu đang là 09:00 ngày demo, nhập 09:05 và 10:05 cùng ngày. Giao diện dùng giờ Việt Nam (UTC+7).
3. Bấm **Tìm chỗ trống**. Chọn một vị trí xe máy trong kết quả, ví dụ `M-R02` nếu đang trống. Để nhận xe ngay trong buổi demo, ưu tiên vị trí nhân viên thấy **chưa có xe** và đã hết khoảng đệm.
4. Kiểm tra biển số, bãi, vị trí và thời gian, rồi bấm **Xác nhận đặt chỗ**. Web chuyển sang **Lịch sử đặt chỗ**. Khách có thể mở lại mã `RS-...` ở đây nếu cần tra theo mã.

Lượt đặt có trạng thái **Đã xác nhận**, kèm mã `RS-...` và vị trí đã chọn.

### 2.3. Nhân viên nhận xe

1. Đăng nhập `staff1@parking.test` và mở **Nhận xe**.
2. Chọn **Có đặt chỗ trước**, nhập biển số `59-Z2 928.41` vào ô **Biển số hoặc mã đặt chỗ** rồi bấm **Tra cứu**. Nếu xe có nhiều lịch còn hiệu lực tại bãi, chọn đúng khung giờ. Bạn cũng có thể dán mã `RS-...` vào cùng ô để tra chính xác một lượt đặt.
3. Đối chiếu biển số, giờ gửi và vị trí trên phiếu đặt chỗ. Chọn đúng **Vị trí thực tế** rồi bấm **Xác nhận xe vào**. Có thể nhận sớm tối đa 15 phút, nên với lịch bắt đầu sau 5 phút bạn có thể thao tác ngay.
4. Ghi lại mã lượt gửi `PS-...`. Có thể bấm **Xem lượt gửi xe** trong thông báo nhận thành công để sang trang trả xe với mã đã điền sẵn.

Ở màn hình **Trạng thái bãi**, vị trí chuyển sang **Có xe**. Lượt đặt của khách chuyển sang **Đang gửi xe**.

### 2.4. Nhân viên trả xe, thu tiền và lưu PDF

1. Mở **Trả xe và thu tiền**. Tìm bằng đúng biển số hoặc mã `PS-...` vừa tạo, rồi bấm **Tra cứu → Xem phí và xe ra**.
2. Chỉ cho thầy số tiền tạm tính, giờ vào và đơn giá. Hệ thống tính theo thời gian gửi thực tế, làm tròn lên từng giờ, tối thiểu một giờ. Nếu đơn giá xe máy vẫn là 5.000 đ/giờ và lượt demo dưới một giờ, phí là **5.000 đ**.
3. Chọn **Thanh toán mô phỏng**. Đánh dấu **Đã thu đủ số tiền hiển thị và xe sẵn sàng ra**, rồi bấm **Xác nhận thu tiền và xe ra**.
4. Khi phiếu hiện **Đã thanh toán**, bấm **In phiếu thu**. Trong hộp thoại in, chọn **Lưu dưới dạng PDF** và đặt tên `PhieuThu-Demo.pdf`.
5. Để mở lại phiếu từ phía nhân viên, chọn trạng thái **Đã kết thúc**, tra mã phiên rồi bấm **Xem phiếu thu**. Từ phía khách hàng, đăng nhập lại tài khoản đã đặt và mở **Lịch sử gửi xe → Xem phiếu thu**.

Phiếu thu có biển số, giờ vào, giờ ra, số tiền và phương thức thanh toán. Sau khi xe ra, vị trí hiển thị **Còn đệm** trong 15 phút trước khi sẵn sàng nhận xe mới.

### 2.5. Quản trị viên đối chiếu số liệu

Đăng nhập `admin@parking.test`, mở **Báo cáo**, chọn **Bãi Trung Tâm** và **Hôm nay**. Xem **Lượt xe vào**, **Lượt xe ra**, **Phiếu thu đã ghi nhận** và **Tổng thu ghi nhận**. Dùng **7 ngày** nếu muốn trình bày thêm xu hướng trên biểu đồ. Muốn chỉ rõ tác động của lượt vừa nhập, ghi lại số phiếu và tổng thu trước khi chạy luồng chính, sau đó mở lại cùng bộ lọc để so sánh.

## 3. Các tình huống trình bày thêm

### Khách đến trực tiếp

Đăng nhập nhân viên Bãi Trung Tâm. Mở **Nhận xe → Khách đến trực tiếp**. Nhập biển số `59-Z2 929.51`, chọn **Xe máy** và một vị trí đang phục vụ khách trực tiếp, ví dụ `M-W05` nếu chọn được. Bấm **Xác nhận xe vào** để lấy mã `PS-...`, rồi trả xe và thu tiền như mục 2.4.

### Hủy đặt chỗ và bảo trì

- **Hủy đặt chỗ**. Tạo một lịch mới cho ngày mai. Trong **Lịch sử đặt chỗ**, chọn đúng lượt rồi bấm **Hủy → Xác nhận hủy** trước giờ bắt đầu. Trạng thái sẽ thành **Đã hủy**.
- **Bảo trì**. Trong tài khoản nhân viên, mở **Trạng thái bãi**, chọn một vị trí chưa có xe và ưu tiên vị trí có **0 lịch còn hiệu lực**. Bấm **Bảo trì**, nhập lý do `Kiểm tra đèn tại vị trí đỗ`, đánh dấu xác nhận và lưu. Khi trình bày xong, bấm **Kết thúc bảo trì**, nhập lý do `Đã kiểm tra và đưa vị trí vào phục vụ`, đánh dấu xác nhận rồi lưu.

### Quản trị viên nhập thêm danh mục

Thử mục này nếu thầy yêu cầu nhập cấu hình bãi từ đầu. Dùng một bãi riêng để bạn dễ tìm lại các bản ghi vừa nhập.

| Thứ tự | Màn hình | Dữ liệu nhập |
| --- | --- | --- |
| 1 | **Bãi đỗ xe → Thêm bãi đỗ xe** | Tên `Bãi Thực Hành An Phú`, địa chỉ `Khu An Phú, TP. Hồ Chí Minh`, bật **Đang hoạt động**. |
| 2 | **Khu vực → Thêm khu vực** | Chọn bãi vừa tạo. Tên `Khu xe máy`, tầng `Tầng trệt`, loại xe **Xe máy**, bật **Đang hoạt động**. Có thể thêm `Khu ô tô` theo cùng cách. |
| 3 | **Vị trí đỗ → Thêm vị trí đỗ** | Chọn đúng bãi và khu. Tạo `M-R01` với **Cho phép đặt trước** được đánh dấu và `M-W01` với ô này để trống. Cả hai bật **Đang hoạt động**. |
| 4 | **Tài khoản → Thêm tài khoản** | Họ tên `Trần Hải An`, email `hai.an.nhanvien@parking.test`, mật khẩu ban đầu `NhanVienDemo2026!`, vai trò **Nhân viên**, bãi phân công `Bãi Thực Hành An Phú`, bật **Đang hoạt động**. Số điện thoại có thể để trống. |

Điền **Lý do thay đổi** là `Tạo dữ liệu trình diễn` cho mỗi bản ghi rồi lưu. Nếu đã tạo bãi trong lần tập trước, tìm và dùng lại bãi đó. Sau khi phân công, có thể đăng nhập tài khoản mới để trình bày phạm vi một bãi.

Nếu thầy yêu cầu trình bày sửa giá, mở **Bảng giá → Sửa giá**, nhập mức giá mới và lý do, rồi bấm **Lưu giá**. Ghi lại giá cũ trước khi sửa để khôi phục sau phần demo nếu cần. **Lịch sử giá** cho thấy cả phiên bản cũ và mới. Lượt xe đang gửi được tính theo đơn giá đã lưu lúc xe vào.

## 4. Chạy SQL bằng tay trong SSMS

Trong SSMS, chọn **ParkingLotOnline → New Query**. Dán từng khối SQL vào tab riêng hoặc bôi đen khối muốn chạy rồi nhấn **F5**. Giữ các dòng `GO`. Hai khối đầu để xem dữ liệu, hai khối sau ghi nhận một lượt gửi mẫu mới.

### 4.1. Kiểm tra bộ dữ liệu và tình trạng bãi

```sql
USE [ParkingLotOnline];
GO

SELECT DB_NAME() AS database_name;

SELECT TOP (1) occurred_at, details_json
FROM dbo.AuditLog
WHERE action = 'DEMO_DATA_IMPORTED'
ORDER BY id DESC;

SELECT parking_lot_name, total_active_slots, available_slots,
       occupied_slots, maintenance_slots
FROM dbo.vw_CurrentOccupancy
ORDER BY parking_lot_id;
```

### 4.2. Đối chiếu lượt vừa tạo trên web

Điền biển số đã dùng ở mục 2.1 vào `@Plate`. Kết quả cho thấy mã đặt chỗ, mã lượt gửi và phiếu thu của cùng một lượt.

```sql
USE [ParkingLotOnline];
GO

DECLARE @Plate nvarchar(32) = N'59-Z2 928.41';

SELECT TOP (10)
    reservation_code, session_code, plate_number_snapshot, parking_lot_name,
    slot_code, status, check_in_time, check_out_time, payment_id, paid_amount
FROM dbo.vw_SessionDetails
WHERE normalized_plate_number_snapshot = dbo.fn_NormalizePlate(@Plate)
ORDER BY check_in_time DESC, id DESC;
```

### 4.3. Tự nhập một lượt khách trực tiếp bằng SQL

Chạy khối sau để tạo một lượt gửi mới ở Bãi Trung Tâm cho xe máy mẫu `59-Z2 929.52`. Lệnh chọn chỗ còn phục vụ được trong nhóm khách đến trực tiếp.

```sql
USE [ParkingLotOnline];
GO

DECLARE @Staff int, @Lot int, @Slot int,
        @Plate nvarchar(32) = N'59-Z2 929.52',
        @RequestKey varchar(128) = CONVERT(varchar(36), NEWID());

SELECT @Staff = id, @Lot = assigned_parking_lot_id
FROM dbo.Users
WHERE normalized_email = N'staff1@parking.test'
  AND role = 'Staff' AND is_active = 1;

SELECT TOP (1) @Slot = slot_id
FROM dbo.vw_SlotInventory
WHERE parking_lot_id = @Lot AND vehicle_type = 'MOTORBIKE'
  AND accepts_reservations = 0 AND operational_status = 'AVAILABLE'
  AND slot_is_active = 1 AND zone_is_active = 1 AND lot_is_active = 1
  AND (buffer_until IS NULL OR buffer_until <= SYSUTCDATETIME())
ORDER BY code;

IF @Slot IS NULL
    THROW 51009, N'Không có vị trí xe máy nhận trực tiếp đang sẵn sàng.', 1;

EXEC dbo.usp_CheckIn @ActorId = @Staff, @SlotId = @Slot,
    @Key = @RequestKey, @Plate = @Plate, @VehicleType = 'MOTORBIKE';
```

Khi nhận thành công, **Results** trả mã `PS-...` trong `response_json`. Để thu tiền và trả đúng xe vừa nhập, chạy khối sau. Nếu bạn đã thay biển số ở khối trên, dùng cùng biển số ở đây.

```sql
USE [ParkingLotOnline];
GO

DECLARE @Staff int, @Lot int, @Session int, @Amount decimal(18,0),
        @Plate nvarchar(32) = N'59-Z2 929.52',
        @RequestKey varchar(128) = CONVERT(varchar(36), NEWID());

SELECT @Staff = id, @Lot = assigned_parking_lot_id
FROM dbo.Users
WHERE normalized_email = N'staff1@parking.test'
  AND role = 'Staff' AND is_active = 1;

SELECT @Session = id,
       @Amount = dbo.fn_BillableHours(check_in_time, SYSUTCDATETIME()) * applied_price_per_hour
FROM dbo.vw_SessionDetails
WHERE parking_lot_id = @Lot AND status = 'OPEN'
  AND normalized_plate_number_snapshot = dbo.fn_NormalizePlate(@Plate);

IF @Session IS NULL
    THROW 51004, N'Không tìm thấy lượt gửi đang mở của biển số mẫu tại bãi.', 1;

EXEC dbo.usp_GetSessionFee @ActorId = @Staff, @SessionId = @Session;

EXEC dbo.usp_CheckOut @ActorId = @Staff, @SessionId = @Session,
    @PaymentMethod = 'SIMULATED', @ConfirmedAmount = @Amount, @Key = @RequestKey;

SELECT id AS payment_id, amount, method, paid_at
FROM dbo.Payment
WHERE session_id = @Session;
```

Mở lại **Trả xe và thu tiền** trên web, chọn **Đã kết thúc** rồi tìm biển số vừa dùng. Bạn có thể mở và in phiếu của lượt đã nhập từ SSMS. Nếu thầy yêu cầu xem mã của một thủ tục, vào **Programmability → Stored Procedures**, nhấp phải vào `dbo.usp_CheckIn` hoặc `dbo.usp_CheckOut` và chọn **Modify** để mở mã SQL.

## 5. Nếu thao tác không ra kết quả như dự kiến

| Tình huống | Cách xử lý khi demo |
| --- | --- |
| Tra biển số hoặc mã `RS-...` mà không thấy lượt | Kiểm tra biển số, trạng thái lượt đặt và bãi đã chọn. `staff1` thuộc Bãi Trung Tâm, `staff2` thuộc Bãi Đại Học. Có thể dùng mã `RS-...` để xem trạng thái của một lượt cụ thể. |
| Lượt đặt chưa đến giờ hoặc đã hết hạn | Kiểm tra giờ Việt Nam. Tạo lượt mới bắt đầu sau khoảng 5 phút để nhận xe ngay trong phần trình bày. |
| Vị trí vừa bị chiếm hoặc còn đệm | Chọn một vị trí khác đang sẵn sàng. Nếu đã đặt vị trí cũ và đổi khi nhận xe, điền lý do và đánh dấu khách đã đồng ý. |
| Phí đổi ngay lúc bấm xác nhận | Đối chiếu mức phí mới, đánh dấu lại ô xác nhận và thu theo số tiền vừa hiển thị. |
| Không thấy nút in | Trong tài khoản nhân viên, mở lượt có trạng thái **Đã kết thúc** và xem phiếu đã thanh toán. |
| Báo cáo đang hiện số 0 | Kiểm tra ngày và bãi đã chọn. Thử bộ lọc **7 ngày** hoặc chọn đúng ngày vừa thu tiền. |
| Cần trình bày nhanh mà chưa kịp tạo lượt mới | Dùng `customer1@parking.test` để mở lịch sử gửi xe. Dùng `staff1@parking.test`, chọn **Đã kết thúc** để mở và in một phiếu mẫu. |
