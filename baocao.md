**Tên đề tài: Quản lý bãi đỗ xe trực tuyến.**

# CHƯƠNG 1: TỔNG QUAN VỀ ĐỀ TÀI

## 1.1. Lý do chọn đề tài

Với mô hình gửi xe truyền thống, khách hàng chỉ biết còn chỗ hay không sau khi đã đến tận nơi, nhân viên xử lý thủ công bằng vé giấy dễ sai sót, và đơn vị quản lý không có dữ liệu thời gian thực để tối ưu vận hành.

Từ thực tế đó, nhóm lựa chọn đề tài **Quản lý bãi đỗ xe trực tuyến**, xây dựng ứng dụng web cho phép khách hàng xem tình trạng khả dụng và đặt trước vị trí đỗ xe; hỗ trợ nhân viên xử lý xe vào/ra, đối chiếu đặt chỗ và tính phí tự động; giúp quản trị viên cấu hình bãi và theo dõi báo cáo vận hành.

Trọng tâm của đề tài là quản lý vận hành bãi đỗ xe trên ứng dụng web, kết hợp đặt chỗ theo khung giờ, kiểm soát đặt trùng và xử lý no-show. Vòng đời nghiệp vụ gồm **đặt chỗ (nếu có) → check-in → gửi xe → tính phí → thanh toán tại quầy → xác nhận xe ra**. Phạm vi được giới hạn phù hợp với Đồ án 4; chức năng nâng cao được phân biệt với phiên bản đầu.

## 1.2. Mục tiêu của đề tài

### 1.2.1. Mục tiêu tổng quát

Xây dựng hệ thống Quản lý bãi đỗ xe trực tuyến phục vụ khách hàng, nhân viên vận hành và quản trị viên; quản lý tập trung cấu hình bãi, lịch đặt, lượt gửi thực tế và thanh toán, hỗ trợ tra cứu khả dụng và xử lý vòng đời xe vào/ra.

### 1.2.2. Mục tiêu cụ thể

- Xây dựng chức năng đặt trước theo khung giờ, kiểm tra xung đột và ghi dữ liệu có kiểm soát đồng thời; tự động hết hạn no-show. Giữ chỗ tạm khi khách đang chọn là hướng mở rộng.
- Hỗ trợ nhân viên thực hiện check-in/check-out xe, đối chiếu với lượt đặt chỗ hoặc xử lý walk-in khi khách không đặt trước.
- Tự động tính phí dựa trên thời gian gửi thực tế và loại phương tiện (xe máy/ô tô), xử lý các trường hợp lệch giờ so với đặt chỗ.
- Cho phép quản trị viên cấu hình bãi đỗ, khu vực, vị trí, bảng giá và xem báo cáo thống kê vận hành.

## 1.3. Giới hạn và phạm vi của đề tài

### 1.3.1. Đối tượng nghiên cứu

Hệ thống Quản lý bãi đỗ xe trực tuyến cho một đơn vị vận hành nhiều bãi, có tích hợp đặt chỗ trước, phục vụ ba nhóm: khách hàng gửi xe (xe máy/ô tô), nhân viên được phân công một bãi trong MVP và quản trị viên.

### 1.3.2. Phạm vi nghiên cứu

**Phạm vi thực hiện (trong đề tài):**

- Chức năng đăng ký/đăng nhập, quản lý tài khoản và phương tiện.
- Tìm kiếm bãi đỗ, xem tình trạng chỗ trống, đặt chỗ và hủy đặt chỗ.
- Check-in/check-out xe, tính phí theo thời gian thực tế với đơn giá lưu khi vào; Staff ghi nhận thanh toán tại quầy bằng tiền mặt hoặc mô phỏng.
- Cấu hình bãi đỗ, khu vực, vị trí và bảng giá (dành cho Admin).
- Báo cáo thống kê vận hành cơ bản (lượt xe, doanh thu, tỷ lệ lấp đầy).

**Giả định và giới hạn của phiên bản đầu:**

- Chia nhóm vị trí đặt trước và walk-in; chưa tối ưu việc dùng chung hai nhóm.
- Slot có phiên OPEN chưa nhận đặt mới cho ngày khác; xe có lịch CONFIRMED chưa giải quyết không mở walk-in. Các chính sách bảo thủ này được công bố cho người dùng.
- Khi xe ra, giữ khoảng đệm 15 phút theo giờ ra thực tế; không thu phí khoảng đệm. Hủy/no-show không tạo khoảng đệm.
- Có chính sách đổi vị trí hoặc ghi nhận không phục vụ được khi có sự cố; không cam kết tuyệt đối vị trí trong mọi tình huống.
- Dữ liệu cập nhật gần thời gian thực bằng polling; không thu tiền trước hoặc thanh toán ngân hàng online trong MVP.

**Phạm vi không thực hiện (ngoài đề tài):**

- Không tích hợp phần cứng thực tế (camera, barrier, thiết bị quét QR vật lý, IoT).
- Không tích hợp cổng thanh toán ngân hàng thật.
- Không áp dụng AI nhận diện biển số hoặc GPS định vị xe.
- Không xây dựng ứng dụng di động (mobile app).

## 1.4. Nội dung thực hiện

Đề tài được thực hiện theo các nội dung chính sau:

1. **Phân tích nghiệp vụ:** Xác định bài toán, phân tích các vai trò người dùng (Customer, Staff, Admin), xây dựng quy trình nghiệp vụ toàn trình từ đặt chỗ đến thanh toán và xác định các trường hợp ngoại lệ cần xử lý.

2. **Thiết kế hệ thống:** Xây dựng sơ đồ use case, thiết kế cơ sở dữ liệu (ERD) với 9 entity nghiệp vụ chính cùng AuditLog và dữ liệu hạ tầng chống lặp, đặc tả API cho các nhóm chức năng và thiết kế giao diện người dùng cho từng vai trò.

3. **Xây dựng backend:** Cài đặt hệ thống xác thực, các API CRUD cấu hình bãi đỗ, logic đặt chỗ (khả dụng theo thời gian, kiểm soát đồng thời, hết hạn tự động), check-in/check-out và tính phí tự động.

4. **Xây dựng frontend:** Giao diện khách hàng (tìm bãi, đặt chỗ, lịch sử, xem phí/hóa đơn), giao diện nhân viên (check-in/check-out, tra cứu) và giao diện quản trị viên (cấu hình, báo cáo).

5. **Kiểm thử:** Kiểm thử các luồng nghiệp vụ chính và các trường hợp ngoại lệ (no-show, race condition, quá giờ đặt, walk-in...).

6. **Viết báo cáo và chuẩn bị demo:** Hoàn thiện tài liệu và xây dựng kịch bản demo trọn vòng đời một lượt gửi xe.

## 1.5. Phương pháp tiếp cận

Đề tài sử dụng kết hợp các phương pháp sau:

- **Phân tích nghiệp vụ thực tế:** Khảo sát quy trình gửi xe truyền thống, xác định điểm nghẽn và nhu cầu của từng nhóm người dùng để định hình yêu cầu hệ thống.

- **Phát triển theo hướng nghiệp vụ:** Ưu tiên xây dựng các logic nghiệp vụ cốt lõi (đặt chỗ, tính phí, check-in/check-out) trước, sau đó mới phát triển giao diện và tích hợp.

- **Phát triển lặp tăng dần (Iterative):** Chia hệ thống thành các nhóm chức năng (MUST HAVE → SHOULD HAVE → NICE TO HAVE), ưu tiên hoàn thiện các chức năng bắt buộc trước khi mở rộng.

- **Kiểm thử theo kịch bản và kiểm thử tích hợp:** Kiểm tra luồng chính/ngoại lệ trên giao diện, đồng thời kiểm tra request đồng thời, phân quyền, rollback và chống ghi trùng với SQL Server. Chỉ ghi nhận đã đạt khi có kết quả kiểm thử.

---

# CHƯƠNG 2: CƠ SỞ LÝ THUYẾT

## 2.1. Quy trình phát triển phần mềm

Đề tài áp dụng quy trình phát triển theo mô hình **Agile kết hợp phát triển lặp tăng dần (Iterative)**. Hệ thống được chia thành các nhóm chức năng theo mức độ ưu tiên (MUST HAVE → SHOULD HAVE → NICE TO HAVE), mỗi vòng lặp hoàn thiện một nhóm chức năng trước khi chuyển sang nhóm tiếp theo.

Quy trình thực hiện gồm các bước: phân tích yêu cầu → thiết kế hệ thống → lập trình → kiểm thử → hoàn thiện. Cách tiếp cận này giúp kiểm soát phạm vi đề tài, ưu tiên các nghiệp vụ cốt lõi và dễ dàng điều chỉnh khi có thay đổi yêu cầu.

## 2.2. Công nghệ Backend - ASP.NET Core

**ASP.NET Core** là framework phát triển ứng dụng web mã nguồn mở, đa nền tảng do Microsoft phát triển. Đây là lựa chọn phù hợp cho backend của hệ thống vì:

- Hỗ trợ xây dựng **RESTful API** mạnh mẽ, dễ tích hợp với frontend.
- Tích hợp sẵn **Dependency Injection**, giúp code có cấu trúc rõ ràng, dễ bảo trì.
- Dự án sử dụng **Microsoft.Data.SqlClient** để gọi các thủ tục lưu trữ bằng tham số; các quy tắc giao dịch và ràng buộc dữ liệu được xử lý tại SQL Server.
- Có cơ chế xác thực và phân quyền tích hợp (**JWT Authentication**), phù hợp với ba vai trò Customer, Staff, Admin trong hệ thống.
- Hiệu năng cao, phù hợp với các nghiệp vụ cần xử lý đồng thời như đặt chỗ và kiểm tra khả dụng theo thời gian thực.

## 2.3. Công nghệ Frontend - React

**React** là thư viện JavaScript mã nguồn mở do Meta phát triển, được sử dụng để xây dựng giao diện người dùng theo kiến trúc component. React được lựa chọn cho frontend vì:

- Kiến trúc **component-based** giúp tái sử dụng giao diện hiệu quả, phù hợp với hệ thống có nhiều màn hình và vai trò khác nhau.
- **Virtual DOM** giúp cập nhật giao diện nhanh, phù hợp với các màn hình cần hiển thị trạng thái thời gian thực (sơ đồ vị trí đỗ xe, trạng thái chỗ trống).
- Hệ sinh thái phong phú với các thư viện hỗ trợ như React Router (điều hướng), Axios (gọi API) và các thư viện UI component.
- Dễ phân tách giao diện theo từng vai trò (Customer, Staff, Admin) thông qua routing và bảo vệ route.

## 2.4. Cơ sở dữ liệu - SQL Server

**Microsoft SQL Server** là hệ quản trị cơ sở dữ liệu quan hệ (RDBMS) được lựa chọn để lưu trữ dữ liệu của hệ thống vì:

- Hỗ trợ tốt các ràng buộc quan hệ (khóa ngoại, khóa chính), phù hợp với mô hình dữ liệu có nhiều quan hệ liên kết giữa các entity như Reservation, ParkingSession, ParkingSlot.
- Kết nối với ASP.NET Core qua **Microsoft.Data.SqlClient**; sử dụng stored procedure để tập trung quy tắc nghiệp vụ và quản lý giao dịch.
- Hỗ trợ **transaction** và cơ chế khóa (locking) giúp xử lý an toàn các tình huống đặt chỗ đồng thời (race condition).
- Công cụ quản lý trực quan với **SQL Server Management Studio (SSMS)**, dễ kiểm tra và theo dõi dữ liệu trong quá trình phát triển.
