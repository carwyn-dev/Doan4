# Quản lý bãi đỗ xe trực tuyến

## Tiến độ ngày 25/10/2026

Đã nối database SQL Server với backend ASP.NET Core và hoàn thành đăng ký, đăng nhập, phân quyền, phương tiện, tìm/đặt/hủy chỗ, nhận xe, xem phí, thu tiền và xác nhận xe ra. Khách hàng có lịch sử gửi xe và phiếu thu của mình. Admin quản lý bãi, khu vực, vị trí, bảo trì, phiên bản bảng giá và tài khoản bằng dữ liệu thật. Ba vai trò có dashboard theo phạm vi quyền; Admin xem báo cáo theo ngày Việt Nam và theo bãi.

| Phần | Trạng thái |
|---|---|
| Database, ràng buộc, chỉ mục và thủ tục nghiệp vụ | Có trong `sql.md`; đã khởi tạo lại sau khi cài Windows |
| Đăng ký | Tạo Customer thật trong SQL, hash mật khẩu bằng ASP.NET Core Identity |
| Đăng nhập và `/auth/me` | JWT thật; kiểm tra lại trạng thái/vai trò trong database mỗi yêu cầu |
| Bảo vệ route | Chưa đăng nhập về trang đăng nhập; sai vai trò về dashboard của mình |
| Phương tiện | Đọc xe của mình, thêm, sửa, ngừng sử dụng/kích hoạt lại; lưu thật, giữ lịch sử |
| Gửi lại thao tác lưu xe | Có `Idempotency-Key`, không tạo thêm xe với cùng yêu cầu |
| Tìm chỗ | Chọn xe của mình, bãi và giờ; chỉ trả vị trí phù hợp và cập nhật mỗi 30 giây |
| Đặt / hủy / lịch sử | Lưu thật, chống trùng khi đặt đồng thời; retry giữ cùng key; lịch sử có phân trang, chỉ dữ liệu của mình |
| Hết hạn đặt chỗ | BackgroundService chạy lúc khởi động và mỗi 60 giây, ghi trạng thái và audit qua SQL |
| Nhận xe | Staff tra đúng mã đặt trong bãi được phân công hoặc nhập xe đến trực tiếp; chọn vị trí, đổi vị trí có lý do và đồng ý của khách |
| Xe ra và thu tiền | Phí từ server theo đơn giá lúc vào; đối chiếu số tiền, ghi Payment và đóng phiên trong cùng transaction; chống thu trùng |
| Lịch sử gửi xe / phiếu thu | Customer chỉ xem lượt của mình; Staff xem trong bãi; tìm theo biển số/mã phiên, phân trang và xem phiếu thu |
| Quản trị bãi / khu / vị trí | Thêm, sửa, ngừng hoạt động và kích hoạt lại; bắt buộc lý do, audit và mã yêu cầu; giữ lịch sử |
| Bảo trì vị trí | Admin hoặc Staff đúng bãi bật/tắt bảo trì; Staff phải đối chiếu vị trí thực tế; chặn khi có xe, giữ lịch đặt và khoảng đệm |
| Trạng thái bãi của Staff | Xem từng vị trí, khu/tầng, nhóm xe, vận hành/cấu hình, đệm, lịch còn hiệu lực, xe đang gửi; lọc và mở lượt gửi liên quan; tự làm mới 30 giây |
| Bảng giá | Sửa giá theo loại xe, tạo phiên bản mới, xem lịch sử có phân trang; xe đã vào giữ đơn giá cũ |
| Quản lý tài khoản | Thêm tài khoản với mật khẩu hash, sửa thông tin/vai trò/phân công, khóa/mở; tìm kiếm, lọc và phân trang từ SQL; giữ ít nhất một Admin hoạt động |
| Hiệu lực quyền | API đọc lại trạng thái, vai trò, bãi phân công ở mỗi yêu cầu; tự sửa tài khoản sẽ cập nhật phiên và điều hướng theo quyền mới |
| Dashboard | SQL tổng hợp theo vai trò; tự làm mới mỗi 30 giây; tách chỗ chưa có xe, bảo trì, đệm và lượt đặt còn hiệu lực |
| Báo cáo | Admin lọc ngày/bãi, xem biểu đồ thu và bảng tổng hợp ngày/bãi; tách tiền mặt/mô phỏng, giữ lịch sử bãi đã ngừng |
| Sự cố phục vụ | Staff xác nhận khách đã đến, ghi lý do và hạn xử lý; check-in để giải quyết hoặc kết thúc UNFULFILLED; quá hạn được job xử lý, khách xem lý do trong lịch sử |
| Sửa biển số walk-in | Staff sửa lỗi trong 5 phút đầu của phiên OPEN; đối chiếu xe và lý do bắt buộc; chống trùng biển số, giữ tài khoản/xe/giờ vào/giá |

Các trang đã nối dữ liệu không hiển thị số liệu mẫu khi lỗi kết nối. Dashboard và báo cáo hiện phản ánh dữ liệu SQL thật. Phần cơ sở lý thuyết trong baocao.md đã được đối chiếu với SqlClient và stored procedure. Tệp chuong4.md cũ đã được xóa theo yêu cầu; nội dung Chương 4 và kết luận đã soạn trong chat để đưa vào bản báo cáo riêng.

## Giao diện

Giao diện dùng nền sáng, menu xanh đậm và màu nhấn xanh ngọc thống nhất cho ba vai trò. Trang chủ có sơ đồ bãi minh họa; đăng nhập/đăng ký dùng chung bố cục và nhận diện ParkingLot. Các trang nghiệp vụ dùng tiêu đề, bảng, bộ lọc, thẻ thống kê và hộp thoại cùng phong cách. Số liệu trên dashboard vẫn lấy từ API; sơ đồ trang chủ chỉ là minh họa.

Theme nằm ở `frontend/src/theme.js`; `Brand`, `Layout`, `AuthShell` và `PageHeader` là các thành phần dùng chung. Điện thoại có menu thu gọn, thẻ số liệu hai cột và bảng cuộn ngang trong khung riêng. Có nhãn cho nút hiện/ẩn mật khẩu, đánh dấu mục menu hiện tại, liên kết bỏ qua menu bằng bàn phím và hỗ trợ tùy chọn giảm chuyển động.

Bản này không thay schema, không cần chạy lại SQL. Khi ứng dụng đang mở, tải lại trang để xem giao diện mới.

## Chạy trên máy hiện tại

Database đã được tạo tại server **`localhost`**, database **`ParkingLotOnline`**. Sau khi cài lại Windows, instance đang chạy là instance mặc định, không phải `localhost\SQLEXPRESS` như trước. Không cần chạy lại script khởi tạo nếu database hiện đã có.

Bản cập nhật nhận/trả xe bổ sung tham số lọc mã cho hai thủ tục tra cứu. **Máy hiện tại đã được cập nhật**, không cần chạy lại SQL. Với database cũ trên máy khác, chạy `scripts/sql/20261022_staff_queries.sql` (UTF-8) hoặc lệnh sau từ thư mục dự án; script không đổi bảng/xóa dữ liệu. Khởi tạo mới bằng mục 1 của `sql.md` đã có sẵn thay đổi này.

```powershell
sqlcmd -S localhost -d ParkingLotOnline -E -C -b -f 65001 -i scripts/sql/20261022_staff_queries.sql
```

Bản quản lý tài khoản bổ sung fingerprint cho yêu cầu tạo tài khoản và bộ lọc cho thủ tục danh sách. **Máy hiện tại đã được cập nhật**, bạn không cần chạy lại. Khi dùng database cũ trên máy khác, chạy thêm migration dưới đây; chỉ sửa hai procedure, không đổi bảng, không tạo/xóa user hoặc đổi mật khẩu. Script khởi tạo mục 1 của `sql.md` đã có nội dung mới.

```powershell
sqlcmd -S localhost -d ParkingLotOnline -E -C -b -f 65001 -i scripts/sql/20261022_admin_users.sql
```

Bản dashboard/báo cáo bổ sung `usp_GetDashboard` và `usp_AdminDailyReport`, kèm quyền EXEC cho role `parking_backend`. **Máy hiện tại đã được cập nhật**, không cần chạy lại. Với database cũ trên máy khác, chạy migration dưới đây; chỉ thêm/cập nhật thủ tục đọc, không đổi bảng hoặc giao dịch. Khởi tạo mới bằng mục 1 `sql.md` đã có sẵn.

```powershell
sqlcmd -S localhost -d ParkingLotOnline -E -C -b -f 65001 -i scripts/sql/20261022_reports.sql
```

Bản xử lý sự cố ngày 25/10 bổ sung hạn xử lý và các cờ thao tác từ server cho lịch đặt/lượt gửi. **Máy hiện tại đã được cập nhật**, không cần chạy lại. Với database cũ trên máy khác, chạy migration sau **sau các migration ngày 22/10**; chỉ sửa ba procedure, không đổi bảng hoặc xóa giao dịch. Mục 1 của `sql.md` đã có nội dung mới nhất.

```powershell
sqlcmd -S localhost -d ParkingLotOnline -E -C -b -f 65001 -i scripts/sql/20261025_staff_exceptions.sql
```

Bản kiểm tra sẵn sàng ngày 02/11 kiểm tra các procedure nghiệp vụ và metadata kết quả của lịch đặt/lượt gửi, phát hiện database thiếu migration thay vì chỉ xác nhận kết nối. Role `parking_backend` cần quyền xem định nghĩa của đúng hai procedure này; migration dưới đây chỉ bổ sung quyền metadata, không đổi bảng hoặc dữ liệu. Máy hiện tại đã được áp dụng.

```powershell
sqlcmd -S localhost -d ParkingLotOnline -E -C -b -f 65001 -i scripts/sql/20261102_readiness.sql
```

Mở hai cửa sổ PowerShell tại `C:\Code\doan4`:

**Cửa sổ 1 — backend:**

```powershell
.\scripts\chay-backend.ps1
```

**Cửa sổ 2 — frontend:**

```powershell
.\scripts\chay-frontend.ps1
```

Mở **http://127.0.0.1:3000**. API chạy tại **http://localhost:5143**; kiểm tra kết nối SQL bằng **http://localhost:5143/api/health**.

Script frontend ưu tiên Node.js trong PATH, nếu chưa có sẽ dùng Node đi kèm Codex khi thư mục runtime hiện hữu. Vì máy vừa cài Windows chưa có `npm` trong PATH, cách này cho phép chạy ngay với các gói frontend đã có. Khi cài môi trường mới hoàn toàn, cần cài Node.js phù hợp với Vite và chạy `npm install` trong thư mục `frontend` trước.

Nếu máy đã có đầy đủ Node.js/npm và .NET SDK, có thể dùng lệnh thông thường:

```powershell
dotnet run --project backend/ParkingLotAPI.csproj --launch-profile http
```

```powershell
cd frontend
npm install
npm run dev
```

### Đăng nhập demo

| Vai trò | Email | Mật khẩu |
|---|---|---|
| Khách hàng | `customer1@parking.test` | `123456` |
| Khách hàng thứ hai | `customer2@parking.test` | `123456` |
| Nhân viên Bãi Trung Tâm | `staff1@parking.test` | `123456` |
| Nhân viên Bãi Đại Học | `staff2@parking.test` | `123456` |
| Quản trị viên | `admin@parking.test` | `123456` |

Đây là tài khoản seed từ SQL. Các email `customer@test.com`, `staff@test.com`, `admin@test.com` của bản mô phỏng trước đây không còn được dùng để đăng nhập. Đăng ký tài khoản mới yêu cầu mật khẩu từ 8 đến 128 ký tự; vai trò luôn là Customer.

Để thử phần đã tích hợp, đăng nhập khách hàng → **Phương tiện** → thêm/sửa/ngừng sử dụng xe → tải lại trang để đối chiếu. Ngừng sử dụng không xóa phương tiện hoặc lịch sử. Xe có lịch đặt/phiên đang gửi không được sửa theo quy tắc trong SQL.

Để thử đặt chỗ: **Tìm bãi đỗ xe** → chọn phương tiện đang hoạt động và bãi → chọn thời gian → **Tìm chỗ trống** → chọn vị trí → xác nhận → xem mã trong **Lịch sử đặt chỗ**. Thử tải lại trang để kiểm tra dữ liệu vẫn còn; dùng nút **Hủy** trước giờ bắt đầu để hủy. Mỗi lượt từ 30 phút đến 24 giờ, bắt đầu trong 7 ngày tới. Thời gian nhập/hiển thị là giờ Việt Nam (UTC+7), API và SQL dùng UTC. Không thu tiền trước khi đặt chỗ.

Danh sách khả dụng là kết quả tại thời điểm tìm, không giữ chỗ trong lúc chọn. Nếu vị trí/xe vừa có lịch khác, API trả 409 và giao diện tải lại để chọn tiếp. Sau khi quá giờ bắt đầu 15 phút mà chưa check-in, lịch có hiệu lực hết hạn; tác vụ nền lưu trạng thái `EXPIRED`. Chỗ dành cho walk-in không được hiển thị cho khách đặt trước.

### Thử luồng xe vào, thu tiền và xe ra

1. Customer đặt chỗ với giờ bắt đầu sau khoảng 5 phút, copy mã `RS-...` trong lịch sử.
2. Đăng nhập Staff đúng bãi → **Check-in xe** → tra mã → đối chiếu xe thực tế và vị trí → **Xác nhận xe vào**. Chọn vị trí thay thế phải có lý do và khách đồng ý. Với xe chưa đặt, chọn **Khách đến trực tiếp**, nhập biển số/loại xe và chọn vị trí nhóm walk-in. Không tự liên kết lượt vãng lai với tài khoản chỉ dựa vào biển số.
3. Mở **Check-out xe** → tìm theo biển số hoặc mã `PS-...` → **Xem phí và xe ra**. Server tính phí, làm tròn lên từng giờ, tối thiểu một giờ. Đơn giá đã chụp lúc nhận xe.
4. Chọn `Tiền mặt` hoặc `Thanh toán mô phỏng`, kiểm tra thực tế đã nhận đủ tiền/xe sẵn sàng ra, đánh dấu xác nhận → **Xác nhận thu tiền và xe ra**. Đây là thanh toán tại quầy, chưa kết nối ngân hàng.
5. Nếu phí đổi trước khi xác nhận, API trả 409; giao diện tải lại và bỏ dấu xác nhận để nhân viên đối chiếu lại, không tự thu theo số tiền mới. Mất phản hồi thì thử lại giữ nguyên nội dung/mã yêu cầu, không thu thêm lần nữa.
6. Xem phiếu thu ngay trong hộp thoại. Staff chọn trạng thái **Đã kết thúc** để tra lại; Customer mở **Lịch sử gửi xe** để xem phiếu thu của mình. Slot hết xe vẫn chờ khoảng đệm 15 phút trước khi nhận lượt tiếp theo.

## Cấu hình

- `backend/appsettings.json`: kết nối Windows Authentication tới `localhost`, database `ParkingLotOnline`; không có mật khẩu SQL hay khóa JWT mặc định trong mã nguồn.
- Nếu dùng server khác, ghi đè bằng cấu hình `ConnectionStrings:ParkingDatabase`/biến môi trường `ConnectionStrings__ParkingDatabase`.
- Frontend dùng `/api`, proxy Vite chuyển tới `http://127.0.0.1:5143`. Có thể cấu hình theo `frontend/.env.example`.
- JWT có thời hạn 1 giờ. Trong Development, nếu chưa cấu hình khóa, backend tạo khóa ngẫu nhiên trong bộ nhớ; khởi động lại backend sẽ yêu cầu đăng nhập lại.
- Môi trường ngoài Development yêu cầu cấu hình `Jwt:SigningKey` bằng giá trị bí mật ít nhất 32 byte qua môi trường/secret store. Giữ HTTPS và cấu hình chứng chỉ/SQL phù hợp môi trường; `TrustServerCertificate=True` trong cấu hình hiện tại phục vụ máy cục bộ.
- Khi phát hành, tài khoản database của API nên chỉ thuộc role `parking_backend`, không dùng quyền quản trị. Các lệnh ghi hiện gọi procedure bằng tham số, không đi vòng qua transaction SQL.
- `ReservationExpiry:IntervalSeconds`: chu kỳ hết hạn, mặc định 60 giây (giới hạn 1–3600 giây). Tác vụ gọi `usp_ExpireReservations`, không cần SQL Server Agent. Lỗi database được ghi log và thử lại ở chu kỳ sau. API lịch sử/khả dụng vẫn xét thời hạn trong lúc chờ tác vụ.

## API đã có

| Method | Đường dẫn | Quyền |
|---|---|---|
| GET | `/api/health` | Công khai, kiểm tra kết nối và schema cần thiết |
| POST | `/api/auth/register` | Công khai; giới hạn tần suất |
| POST | `/api/auth/login` | Công khai; giới hạn tần suất |
| GET | `/api/auth/me` | Đã đăng nhập và còn hoạt động |
| GET | `/api/vehicles` | Customer, chỉ xe của mình, gồm xe đã ngừng sử dụng |
| POST | `/api/vehicles` | Customer; bắt buộc `Idempotency-Key` |
| PATCH | `/api/vehicles/{id}` | Customer chủ xe; bắt buộc `Idempotency-Key` |
| GET | `/api/parking-lots` | Customer; bãi đang hoạt động |
| GET | `/api/parking-lots/{id}/availability` | Customer; nhận `vehicleId`, `startTime`, `endTime` |
| POST | `/api/reservations` | Customer chủ xe; bắt buộc `Idempotency-Key` |
| GET | `/api/reservations/my?page=1&pageSize=20` | Customer; lịch của mình; pageSize tối đa 200 |
| GET | `/api/reservations/{id}` | Customer chủ lịch; ngoài phạm vi trả 404 |
| POST | `/api/reservations/{id}/cancel` | Customer chủ lịch; bắt buộc `Idempotency-Key` |
| GET | `/api/staff/operations` | Staff; vị trí trong bãi được phân công, không nhận lotId từ client |
| GET | `/api/staff/reservations/lookup?code=RS-...` | Staff; mã đặt đúng bãi; ngoài phạm vi trả 404 |
| POST | `/api/sessions/checkin` | Staff đúng bãi; bắt buộc `Idempotency-Key` |
| GET | `/api/sessions?status=OPEN&query=...&page=1&pageSize=20` | Customer chủ lượt / Staff đúng bãi; query là biển số hoặc mã phiên chính xác |
| GET | `/api/sessions/{id}` | Customer chủ lượt / Staff đúng bãi; gồm dữ liệu phiếu thu nếu đã trả xe |
| GET | `/api/sessions/{id}/fee` | Customer chủ lượt / Staff đúng bãi; phí tạm tính hoặc phí đã chốt |
| POST | `/api/sessions/{id}/checkout` | Staff đúng bãi; bắt buộc `Idempotency-Key` |
| GET / POST | `/api/admin/parking-lots` | Admin; đọc cả bãi đã ngừng / tạo bãi |
| PUT | `/api/admin/parking-lots/{id}` | Admin; sửa tên, địa chỉ và trạng thái hoạt động |
| GET | `/api/admin/parking-lots/{id}/zones` | Admin; đọc cả khu đã ngừng trong bãi |
| POST / PUT | `/api/admin/zones` / `/api/admin/zones/{id}` | Admin; tạo / sửa khu vực |
| GET | `/api/admin/zones/{id}/slots` | Admin; đọc vị trí, trạng thái vận hành và khoảng đệm |
| POST / PUT | `/api/admin/slots` / `/api/admin/slots/{id}` | Admin; tạo / sửa vị trí |
| PUT | `/api/admin/slots/{id}/maintenance` | Admin; bật/tắt bảo trì, bắt buộc lý do |
| GET | `/api/admin/pricing?includeHistory=false&page=1&pageSize=20` | Admin; giá hiện hành hoặc toàn bộ phiên bản; pageSize tối đa 200 |
| PUT | `/api/admin/pricing/{vehicleType}` | Admin; `MOTORBIKE` hoặc `CAR`, tạo phiên bản giá mới |
| GET | `/api/admin/users?page=1&pageSize=20&role=Staff&isActive=true&query=...` | Admin; tìm tên/email/điện thoại, lọc vai trò và trạng thái; pageSize tối đa 200 |
| POST | `/api/admin/users` | Admin; tạo tài khoản, bắt buộc mật khẩu 8–128 ký tự và `Idempotency-Key` |
| PUT | `/api/admin/users/{id}` | Admin; sửa đủ thông tin, vai trò/phân công/trạng thái, bắt buộc `Idempotency-Key`; không nhận mật khẩu |
| GET | `/api/dashboard` | Customer: tài khoản mình; Staff: bãi được phân công hiện tại; Admin: toàn hệ thống |
| GET | `/api/admin/reports?fromDate=2026-10-01&toDate=2026-10-22&parkingLotId=1` | Admin; ngày bắt đầu và kết thúc đều được tính; bỏ parkingLotId để xem tất cả bãi |
| POST | `/api/reservations/{id}/service-issue` | Staff đúng bãi; ghi khách đã đến gặp sự cố; bắt buộc lý do, xác nhận đối chiếu và Idempotency-Key |
| POST | `/api/reservations/{id}/unfulfilled` | Staff đúng bãi; kết thúc không phục vụ được; cùng yêu cầu xác nhận/lý do/key |
| PATCH | `/api/sessions/{id}/plate` | Staff đúng bãi; sửa biển số walk-in OPEN trong 5 phút đầu, bắt buộc lý do/đối chiếu/key |
| PUT | `/api/staff/slots/{id}/maintenance` | Staff đúng bãi; bắt buộc isMaintenance, reason, positionVerified=true và Idempotency-Key |

POST/PATCH phương tiện nhận đầy đủ trạng thái biểu mẫu để nội dung yêu cầu lặp ổn định:

```json
{
  "plateNumber": "59-C1 112.23",
  "vehicleType": "MOTORBIKE",
  "isActive": true
}
```

Để ngừng sử dụng, gửi cùng biển số/loại xe với `isActive=false`. Không có API xóa vật lý. Giữ cùng key/cùng dữ liệu khi thử lại một yêu cầu chưa rõ kết quả; thao tác mới dùng key mới. Cùng key nhưng đổi dữ liệu trả 409. Các DTO không nhận thuộc tính bổ sung như `role` khi đăng ký hoặc `userId` khi lưu phương tiện.

Phản hồi lỗi có `code`, `message`, `traceId`; lỗi biểu mẫu có thêm `errors`. Các trường hợp chính: 400 dữ liệu sai, 401 chưa đăng nhập/token không hợp lệ, 403 sai quyền, 404 không tìm thấy dữ liệu thuộc tài khoản, 409 xung đột, 429 quá nhiều yêu cầu đăng nhập/đăng ký, 503 database chưa sẵn sàng. Mật khẩu và password hash không trả ra API.

Đặt chỗ nhận `vehicleId`, `slotId`, `startTime`, `endTime`. Hai trường thời gian cần ISO 8601 có giây và múi giờ, ví dụ `2026-10-23T09:00:00+07:00` hoặc `2026-10-23T02:00:00Z`. Không nhận `userId`, giá, trạng thái do client tự gửi. Đặt thành công trả 201 gồm `id`, `reservationCode`, `status`; hủy trả 200. Gửi lại cùng mã yêu cầu/cùng nội dung trả kết quả cũ và header `Idempotency-Replayed: true`; cùng mã nhưng đổi nội dung trả 409. Lịch sử trả thời gian có `Z`, trạng thái có hiệu lực và `canCancel`.

Nhận xe đã đặt: `{ "slotId": 1, "reservationCode": "RS-..." }`; biển số/loại xe lấy từ snapshot SQL, không được ghi đè. Đổi vị trí thêm `replacementReason` và `customerAgreed=true`. Nhận xe trực tiếp: `{ "slotId": 5, "plateNumber": "59-C1 112.23", "vehicleType": "MOTORBIKE" }`. API không nhận `customerId`, `vehicleId`, giờ vào hoặc đơn giá tùy ý.

Xe ra nhận `{ "paymentMethod": "CASH", "confirmedAmount": 5000 }` (`CASH`/`SIMULATED`, số nguyên VND). Số tiền cần khớp phí server ở thời điểm xác nhận. Payment, Session, Reservation, vị trí, AuditLog và RequestRecord commit/rollback cùng nhau. Khách không có API tự đánh dấu đã trả tiền.

Các thao tác ghi quản trị đều bắt buộc `Idempotency-Key` và `reason` (tối đa 1.000 ký tự), ghi audit trong transaction. Dùng cùng key/cùng nội dung khi thử lại yêu cầu chưa rõ kết quả. Cùng key nhưng đổi nội dung trả 409. Tạo cấu hình trả 201, sửa trả 200; gửi lại không tạo bản ghi hoặc phiên bản giá trùng.

Ví dụ nội dung tạo/sửa quản trị (PUT gửi đủ biểu mẫu, không gửi các trường chỉ đọc):

```json
{ "name": "Bãi mới", "address": "Địa chỉ bãi", "isActive": true, "reason": "Mở thêm bãi" }
```

```json
{ "parkingLotId": 1, "name": "Khu ô tô", "floorLabel": "Tầng 1", "vehicleType": "CAR", "isActive": true, "reason": "Thêm khu vực" }
```

```json
{ "zoneId": 1, "code": "A_01", "acceptsReservations": true, "isActive": true, "reason": "Thêm vị trí" }
```

Giữ nguyên ID bãi/khu cha khi sửa; muốn chuyển thì tạo cấu hình mới. Ngừng hoạt động thay cho xóa; hệ thống chặn ngừng bãi/khu/vị trí hoặc đổi loại xe/nhóm vị trí khi còn lịch `CONFIRMED` hoặc phiên `OPEN` liên quan. Bãi/khu cha phải hoạt động khi sửa cấu hình con. Vị trí nhận mã ASCII tối đa 30 ký tự chữ, số, `_`, `-`.

Bảo trì nhận `{ "isMaintenance": true, "reason": "Sửa đèn" }`; không ghi đè trạng thái vận hành từ biểu mẫu sửa vị trí. Lịch đặt tương lai vẫn giữ để nhân viên xử lý; bảo trì không xóa thời gian đệm sau trả xe. Giá nhận `{ "pricePerHour": 6000, "reason": "Điều chỉnh phí" }`, số nguyên từ 1 đến 1.000.000.000 VND. SQL giữ phiên bản giá cũ; cột “Cập nhật lần cuối” của phiên bản cũ có thể là thời điểm bị thay thế, không phải thời điểm bắt đầu áp dụng.

Bản quản trị bãi/giá dùng các thủ tục đã có trong `sql.md`; tài khoản có migration riêng như phần hướng dẫn bên trên. Máy hiện tại không cần chạy lại SQL.

Tạo tài khoản nhận dữ liệu sau; sửa bằng PUT gửi cùng các trường **trừ `password`**:

```json
{
  "name": "Nhân viên mới",
  "email": "nhanvien@example.com",
  "phone": "0901234567",
  "password": "MatKhauBanDau123!",
  "role": "Staff",
  "assignedParkingLotId": 1,
  "isActive": true,
  "reason": "Bổ sung nhân viên cho bãi"
}
```

Staff phải có đúng một bãi phân công đang hoạt động; Customer/Admin gửi `assignedParkingLotId=null`. Tài khoản Staff đã thuộc bãi ngừng hoạt động vẫn được khóa với phân công cũ, nhưng không được mở lại hoặc phân công mới vào bãi đó. Chặn khóa/hạ quyền Admin hoạt động cuối cùng, kể cả khi hai yêu cầu chạy đồng thời. Chặn đổi vai trò Customer khi còn lịch CONFIRMED hoặc phiên OPEN. Khóa tài khoản giữ lịch sử và phiên gửi xe; nhân viên hợp lệ vẫn có thể thu tiền và trả xe.

Mật khẩu lưu trong Users bằng ASP.NET Core Identity với salt ngẫu nhiên. Backend tạo thêm fingerprint PBKDF2 theo actor/key để yêu cầu tạo tài khoản có thể gửi lại dù hash Identity mỗi lần khác nhau. Thay mật khẩu nhưng dùng lại key cũ trả 409; không tạo user trùng. Mật khẩu/hash/fingerprint không trả ra API hoặc ghi trong audit; RequestRecord chỉ lưu hash nội dung và phản hồi không chứa mật khẩu. Chức năng đặt lại/đổi mật khẩu chưa thuộc bản quản lý tài khoản này. Không có API xóa vật lý tài khoản.

## Trạng thái bãi và bảo trì cho nhân viên

Staff mở mục **Trạng thái bãi** (`/staff/parking-status`). Màn hình chỉ đọc vị trí trong bãi đang được phân công từ `/api/staff/operations`; không cho chọn bãi khác từ client. Danh sách gồm ID bãi/khu, tầng, cấu hình hoạt động, trạng thái vận hành, thời gian đệm, số lịch CONFIRMED còn hiệu lực và biển số của phiên đang mở. Số lịch đã loại các lịch quá hạn dù job chưa cập nhật. Nút **Xem lượt gửi** dẫn đến tra cứu xe ra bằng biển số trong cùng phạm vi quyền.

Các thẻ số liệu chỉ tính vị trí có đủ bãi/khu/slot hoạt động và tính toàn bãi, không đổi theo bộ lọc. Còn đệm là một thuộc tính riêng: vị trí đang bảo trì vẫn có thể còn thời gian đệm. Bộ lọc cho phép chọn khu/tầng, loại xe, nhóm đặt trước/trực tiếp, trạng thái và tìm mã vị trí/khu/biển số. Cấu hình ngừng hoạt động được hiển thị riêng, không bị hiểu là vị trí có thể nhận xe.

Chọn **Bảo trì** hoặc **Kết thúc bảo trì**, ghi lý do và xác nhận đã kiểm tra vị trí thực tế. PUT nhận ví dụ `{ "isMaintenance": true, "reason": "Sửa đèn vị trí", "positionVerified": true }`. Vị trí có xe OPEN không được bật hoặc tắt bảo trì. Nếu trạng thái đổi sau khi mở biểu mẫu, SQL kiểm tra lại trong transaction và trả 409; giao diện không coi thao tác thất bại là thành công.

Bảo trì không hủy lịch đã xác nhận, không xóa/kéo dài buffer_until và không kích hoạt lại cấu hình đã ngừng. Biểu mẫu cảnh báo số lịch còn hiệu lực để nhân viên điều phối khi khách đến. Mỗi thay đổi ghi Staff, vị trí, lý do và mã yêu cầu trong audit. Khi mất phản hồi sau commit, thử lại giữ nguyên nội dung/key; không lặp audit. Sau khi lưu, bảng tải lại trạng thái thực tế. Lỗi tải dữ liệu ẩn bảng và số liệu cũ, có nút thử lại.

Phần này dùng `usp_GetSlotOperations` và `usp_SetSlotMaintenance` đã có sẵn; **không cần migration hoặc chạy lại SQL**.

## Xử lý sự cố và sửa biển số

Tại **Check-in xe**, tra mã đặt rồi chọn **Ghi nhận sự cố** khi khách và xe đã đến, có trở ngại thực tế. Biểu mẫu yêu cầu lý do và xác nhận đã đối chiếu khách/xe. Gửi JSON `{ "reason": "Vị trí đang bảo trì, khách đã đến", "customerPresent": true }`. Không nhận thời điểm hay trạng thái từ client.

Chỉ ghi sự cố cho lịch CONFIRMED từ 15 phút trước giờ bắt đầu đến trước expires_at. Sau khi ghi, hạn xử lý là mốc sớm hơn giữa service_issue_at + 15 phút và end_time, hiển thị theo giờ Việt Nam. Ghi lại bằng key mới không kéo dài hạn. Trong cửa sổ xử lý, Staff nhận xe tại vị trí phù hợp (đổi vị trí cần khách đồng ý), hoặc chọn **Không phục vụ được** với lý do; có thể ghi kết quả không phục vụ được ngay khi khách đến. UNFULFILLED không tạo Session/Payment. Không phục hồi lịch đã hết hạn.

Tác vụ nền mặc định mỗi 60 giây kết thúc sự cố quá hạn bằng UNFULFILLED, ghi thời điểm và audit hệ thống. API đọc coi lịch đó hết hiệu lực ngay cả khi job chưa cập nhật. Lịch sử của khách hiển thị sự cố, lý do và thời điểm kết thúc nếu đã ghi nhận. `canRecordIssue`/`canMarkUnfulfilled` chỉ bật cho Staff đúng điều kiện; server kiểm tra lại dưới khóa transaction khi lưu.

Tại **Check-out xe**, nút **Sửa biển số** xuất hiện cho lượt walk-in còn được sửa. PATCH nhận `{ "plateNumber": "51A-123.45", "reason": "Nhập thiếu một chữ số", "vehicleVerified": true }`. Chỉ sửa snapshot biển số của phiên OPEN, không có reservation, tối đa 5 phút sau giờ vào. Không đổi loại xe, tài khoản, phương tiện liên kết, giờ vào hoặc đơn giá. Nếu walk-in đã gắn Vehicle thì chỉ cho thay cách trình bày, giữ cùng biển số chuẩn hóa. Từ chối biển số đang có phiên OPEN hoặc lịch CONFIRMED còn hiệu lực ở bất kỳ bãi nào. Mỗi lần sửa ghi audit gồm biển cũ/mới, Staff và lý do.

Cả ba thao tác dùng Idempotency-Key; mất phản hồi sau commit thì giữ nguyên key và nội dung để thử lại, kể cả đã qua hạn hoặc trạng thái đã đổi. Không lặp audit hoặc tạo thêm giao dịch. Phản hồi lỗi mạng không được coi là đã thành công; sau khi lưu thành công nhưng lỗi tải lại, giao diện giữ thông báo kết quả đã ghi và yêu cầu tra cứu lại dữ liệu.

## Dashboard và cách đọc báo cáo

- `/dashboard` trả `role`, `scopeName`, `dateVn`, `generatedAt`, `summary`, `lots`. Timestamp có `Z`; ngày vận hành tính UTC+7 tại SQL Server.
- Customer chỉ có số xe đang hoạt động, lịch còn hiệu lực, phiên OPEN/COMPLETED và tổng phiếu thu gắn `customer_id` của mình. Walk-in trùng biển số nhưng không liên kết tài khoản không được cộng vào số liệu của khách.
- Staff chỉ nhận số liệu bãi phân công hiện tại và không nhận trường `todayRevenue`. Admin nhận tổng hệ thống, thu hôm nay và bảng bãi; bãi ngừng hoạt động vẫn hiển thị nhưng không đóng góp sức chứa hoạt động.
- `availableSlots` là chỗ hoạt động chưa có xe, có thể còn đệm hoặc lịch đặt; `bufferSlots` là phần đang có đệm; `walkInReadySlots` chỉ tính vị trí nhóm trực tiếp AVAILABLE đã hết đệm. Các số này không thay thế API tìm khả dụng theo xe và khung giờ.
- Lấp đầy hiện tại = OCCUPIED / (AVAILABLE + OCCUPIED), chỉ lấy vị trí có đủ bãi/khu/slot hoạt động; loại bảo trì khỏi mẫu số. Nếu mẫu số bằng 0, API trả `null`, giao diện hiển thị `—`.

Báo cáo nhận ngày `yyyy-MM-dd`, từ năm 2000 đến hết 2099, tối đa 366 ngày. API chuyển ngày kết thúc sang mốc đầu ngày kế tiếp để SQL lọc khoảng UTC `[fromVN-7h, nextDayVN-7h)`. Ngày không có giao dịch vẫn trả một dòng 0. Không có bãi hoặc bãi đã ngừng vẫn có thể xem số liệu lịch sử phù hợp.

Phản hồi gồm `fromDate`, `toDate`, `parkingLotId`, `generatedAt`, `totals`, `days`, `lots`. Tổng thu lấy từ Payment PAID theo `paid_at`; lượt vào theo `check_in_time`, lượt ra theo `check_out_time`. Hai đại lượng không bắt buộc bằng số phiếu thu của ngày. Các tổng được tính độc lập để không nhân đôi tiền khi ghép lượt xe với thanh toán. `cashRevenueVnd` và `simulatedRevenueVnd` cộng thành `revenueVnd`; biểu đồ và nhãn tổng thu ghi rõ có cả mô phỏng. Không tự suy ra tỷ lệ lấp đầy lịch sử từ trạng thái chỗ hiện tại.

Hai thủ tục mới đọc trong transaction với shared application lock cùng tên khóa ghi nghiệp vụ, giúp các phần trong một phản hồi nhất quán với nhau; không chuyển trạng thái đặt chỗ từ API đọc. Dashboard dùng `fn_EffectiveReservations` để loại lịch hết hiệu lực ngay cả khi job chưa đổi trạng thái. Lỗi hoặc phản hồi đến chậm không làm màn hình hiển thị số liệu mẫu hay ghi đè bộ lọc mới.

## Kiểm tra đã chạy

- `dotnet build backend/ParkingLotAPI.csproj --no-restore`: thành công, 0 lỗi/cảnh báo.
- Đóng gói frontend bằng Vite: thành công. Có cảnh báo kích thước bundle hiện tại; chưa thực hiện chia nhỏ theo route.
- `tests/auth_vehicles_integration.py`: 50 kiểm tra HTTP/dữ liệu, gồm đăng ký, mật khẩu sai, phạm vi xe, request lặp, dữ liệu lưu thật, đổi vai trò và khóa tài khoản khi token vẫn còn hạn.
- `tests/ui-auth-vehicles.cjs`: kiểm tra mất phản hồi sau khi thêm xe, đóng/mở lại biểu mẫu vẫn gửi cùng khóa và nhận lại kết quả đã lưu; trình duyệt kiểm tra lỗi đăng nhập, đăng nhập thật, thêm/sửa/ngừng xe, lưu sau reload, chặn route sai quyền, bỏ quyền giả trong localStorage và bỏ token mock cũ; không có lỗi JavaScript ở trang.
- Các kiểm tra tạo tài khoản riêng có tên ngẫu nhiên và dọn đúng dữ liệu của các tài khoản đó. Không xóa dữ liệu demo hoặc tài khoản người dùng khác.
- `tests/reservations_integration.py`: kiểm tra HTTP + SQL về thời gian/múi giờ, chủ xe/lịch, đặt đồng thời cùng chỗ, trùng lịch xe, replay đồng thời, hủy, phân trang, trạng thái hết hạn và audit của tác vụ nền thật. Bài kiểm tra đợi tối đa 70 giây cho chu kỳ hết hạn mặc định.
- `tests/ui-reservations.cjs`: kiểm tra trình duyệt chọn xe đang hoạt động, tìm/đặt thật, xung đột 409, giả lập mất phản hồi sau khi SQL commit rồi gửi lại cùng key, giờ Việt Nam trong trình duyệt UTC, reload lịch sử/hủy và hiển thị lỗi kết nối thay cho dữ liệu mẫu.
- `tests/sessions_integration.py`: 81 kiểm tra về phân quyền/chủ lượt/bãi, đổi vị trí và audit, check-in/checkout đồng thời, replay, số tiền sai, phí server, một thanh toán duy nhất, khoảng đệm, walk-in và phiếu thu của Customer.
- `tests/ui-sessions.cjs`: trình duyệt kiểm tra nhận xe đặt trước và walk-in, mất phản hồi khi nhận xe/thu tiền, phí thay đổi phải xác nhận lại, phiếu thu đã lưu và màn hình chỉ đọc của Customer; kiểm tra bố cục phiếu thu trên màn hình nhỏ.
- `tests/admin_integration.py`: 128 kiểm tra HTTP/SQL về quyền Admin, kiểm tra biểu mẫu, lưu/đọc cấu hình, ngừng/kích hoạt, cha không hoạt động, cấu hình đang có giao dịch, bảo trì, audit, replay đồng thời, phiên bản giá và snapshot phí xe đã vào.
- `tests/ui-admin.cjs`: trình duyệt thêm/sửa/ngừng/kích hoạt bãi, khu, vị trí; bật/tắt bảo trì, lỗi xung đột thật từ SQL, sửa/xem lịch sử giá, reload và mất phản hồi sau commit. Kiểm tra giao diện nhỏ và lỗi đọc dữ liệu.
- `tests/users_integration.py`: 121 kiểm tra quyền, dữ liệu đầu vào, tạo/replay đồng thời có mật khẩu, audit, tìm kiếm/lọc/phân trang, phân công và vai trò trên token cũ, khóa/mở, giữ Admin cuối cùng, giao dịch đang mở, lịch sử và quyền database của backend.
- `tests/ui-users.cjs`: kiểm tra tạo/sửa/phân công/khóa/mở, lọc từ server, mất phản hồi khi tạo và sửa, lưu sau reload, Admin cuối cùng, tự hạ quyền và điều hướng, lỗi đọc dữ liệu và bố cục di động.
- `tests/reports_integration.py`: 153 kiểm tra dashboard theo vai trò/chủ tài khoản/bãi, token cũ khi đổi phân công/khóa, lịch hết hiệu lực, chỗ bảo trì/đệm, tỷ lệ không có mẫu số, ranh giới ngày Việt Nam đến 100ns, năm nhuận, doanh thu theo paid_at, tiền mặt/mô phỏng, bãi đã ngừng và ngày rỗng; kiểm tra role backend không có SELECT bảng thanh toán riêng tư.
- `tests/ui-reports.cjs`: ba dashboard, làm mới theo giao dịch thật, chọn ngày/bãi, preset ngày Việt Nam trong browser UTC, biểu đồ, số liệu 0, lỗi mạng, phản hồi cũ sau khi đổi bãi và bố cục di động.
- `tests/operations_integration.py`: 144 kiểm tra quyền, điều kiện, audit và replay đồng thời; xử lý sau hạn no-show nhưng còn hạn sự cố; UNFULFILLED không tạo lượt/thu tiền; đua check-in/kết thúc; sửa biển số không đổi chủ/giá, chống trùng toàn hệ thống, đua với checkout và quan sát tác vụ nền thật kết thúc sự cố quá hạn.
- `tests/ui-operations.cjs`: ghi sự cố, hạn xử lý, không phục vụ được, check-in giải quyết sự cố, lỗi khi quá hạn, sửa biển số, mất phản hồi sau commit, lưu sau reload, lịch sử khách và bố cục di động.
- `tests/maintenance_integration.py`: 103 kiểm tra phạm vi bãi/role/token, không nhận bãi do client tự chọn, kiểm tra dữ liệu, bảo trì có lịch đặt, chống replay/audit trùng, giữ đệm, chặn khi có xe, cấu hình đã ngừng, lịch quá hạn và đua bảo trì với nhận xe.
- `tests/ui-maintenance.cjs`: bảng trạng thái thật, các bộ lọc, giữ số liệu toàn bãi, cảnh báo lịch đặt, mất phản hồi/retry, trạng thái đổi trong lúc mở biểu mẫu, đệm sau mở lại, liên kết lượt gửi, lỗi mạng/thử lại, bảo vệ route và bố cục di động.

Các bài API cũ dưới đây cần mở backend (và frontend khi chạy bài trình duyệt nhận/trả xe). Các bài trình duyệt phương tiện/đặt chỗ đã chuyển sang bộ điều phối database tạm ở phần tiếp theo:

```powershell
python tests/auth_vehicles_integration.py
python tests/reservations_integration.py
python tests/sessions_integration.py
node tests/ui-sessions.cjs DUONG_DAN_NODE_MODULES_CO_PLAYWRIGHT
```

Kiểm thử quản trị có thay giá và quyền tài khoản nên chạy bằng bộ điều phối riêng, **không chạy trực tiếp các file kiểm thử quản trị trên database đồ án**:

```powershell
dotnet build backend/ParkingLotAPI.csproj --no-restore
python tests/run_admin_tests.py --node DUONG_DAN_NODE_EXE --node-modules DUONG_DAN_NODE_MODULES_CO_PLAYWRIGHT
```

Bộ điều phối tự tạo `ParkingAdminVerify_<mã ngẫu nhiên>`, khởi tạo bằng mục 1 của `sql.md`, chạy lại các migration để kiểm tra, mở backend/frontend riêng ở các cổng trống, chạy kiểm thử bãi/giá, dashboard/báo cáo, bảo trì Staff, sự cố, nhận/trả xe, phương tiện/đặt chỗ, giao diện và tài khoản rồi dừng đúng tiến trình và xóa đúng database do nó tạo. Có thể chọn `--suite parking`, `--suite users`, `--suite reports`, `--suite maintenance`, `--suite operations`, `--suite sessions`, `--suite customer`, `--suite design` hoặc `--suite readiness` khi chỉ cần kiểm tra một phần. Các bài kiểm thử mới từ chối tên database khác mẫu này; các bài nhận/trả xe cũ cũng dùng database tạm khi chạy qua bộ điều phối. Không cần mở ứng dụng chính; Node ưu tiên PATH rồi runtime Codex nếu có, các tham số Node có thể bỏ qua trên máy hiện tại. Bài sự cố có thể đợi tối đa 70 giây để quan sát job thực tế. Log và ảnh kiểm tra nằm trong `.work/`, không đưa lên Git.

Kiểm tra riêng các phần giao diện vừa cập nhật:

```powershell
python tests/run_admin_tests.py --suite customer
python tests/run_admin_tests.py --suite design
```

`customer` kiểm tra đăng nhập lỗi/đúng, thêm/sửa/ngừng phương tiện, đặt/hủy chỗ, xung đột, mất phản hồi sau khi lưu và múi giờ Việt Nam. `design` kiểm tra 19 trang ở 360, 390, 768 và 1440 px, liên kết trang chủ, đăng ký, hiện/ẩn mật khẩu, đăng nhập demo, menu điện thoại, mục menu hiện tại và điều hướng bàn phím. Bài này lưu ảnh máy tính/điện thoại trong thư mục `design/` thuộc mỗi lần chạy; không chấp nhận tràn ngang toàn trang, lỗi JavaScript hoặc cảnh báo MUI. Hai bài trình duyệt khách hàng từ chối chạy trực tiếp khi chưa có môi trường database tạm do bộ điều phối cung cấp.

## Phần tiếp theo

Các luồng sự cố phục vụ, sửa biển số và trạng thái/bảo trì cho Staff đã có API/giao diện và kiểm thử. Tiếp theo nên rà soát các yêu cầu còn lại trong blueprint, chuẩn bị kịch bản demo và hoàn thiện báo cáo học phần. Các chức năng nâng cao như xuất báo cáo thành tệp và tự đổi mật khẩu chưa thuộc bản này.

## Các chỉnh sửa sau rà soát ngày 02/11/2026

- Phương tiện dùng cơ chế khóa thử lại chung, giữ các yêu cầu chưa rõ kết quả qua đóng/mở biểu mẫu.
- `tests/readiness_integration.py` kiểm tra thiếu procedure, procedure trả schema cũ, khôi phục migration và quyền metadata của role backend trên database tạm.
- Blueprint công bố đúng chu kỳ 30 giây. Tạm dừng tải ở tab ẩn, sơ đồ đầy đủ trạng thái và gia hạn còn thuộc phần chưa triển khai; bản hiện tại cho khách chọn danh sách vị trí đặt được và Staff xem bảng trạng thái.
- Tệp chương 4 cũ đã được xóa. Những sơ đồ và minh chứng cho báo cáo Word riêng cần được hoàn thiện theo yêu cầu học phần.
