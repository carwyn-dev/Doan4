-- Dữ liệu mô phỏng để trình diễn, không dùng cho bãi đang vận hành thật.
-- Chạy bằng SSMS sau khi đã khởi tạo ParkingLotOnline. Chạy lại không thêm trùng.
USE [ParkingLotOnline];
GO
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET ARITHABORT ON;
SET NUMERIC_ROUNDABORT OFF;
SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @SeedKey varchar(128) = 'ParkingLotOnline.DemoActivity.v1';

BEGIN TRY
    BEGIN TRANSACTION;
    EXEC dbo.usp_InternalLock;

    IF EXISTS (SELECT 1 FROM dbo.AuditLog WHERE action = 'DEMO_DATA_IMPORTED' AND request_id = @SeedKey)
    BEGIN
        SELECT N'Bộ dữ liệu mô phỏng đã được nạp.' AS message, details_json AS imported_counts
        FROM dbo.AuditLog WHERE action = 'DEMO_DATA_IMPORTED' AND request_id = @SeedKey;
        COMMIT;
        RETURN;
    END;

    DECLARE @Now datetime2(7) = SYSUTCDATETIME();
    DECLARE @TodayUtc datetime2(7) = DATEADD(HOUR, -7, CONVERT(datetime2(7), CONVERT(date, DATEADD(HOUR, 7, @Now))));
    DECLARE @HistoryStart datetime2(7) = DATEADD(DAY, -13, @TodayUtc);
    DECLARE @DemoHash nvarchar(512) = N'AQAAAAIAAYagAAAAEJr8QlthgK7YODXAtsncCxrygp19qGe66weahLvmsz9Rym4vixN4isviG8cBG9pRKg==';
    DECLARE @Lots table (lot_no int PRIMARY KEY, lot_id int NOT NULL, staff_id int NOT NULL);
    INSERT @Lots (lot_no, lot_id, staff_id)
    SELECT d.lot_no, p.id, u.id
    FROM (VALUES (1, N'Bãi Trung Tâm', N'staff1@parking.test'), (2, N'Bãi Đại Học', N'staff2@parking.test')) d(lot_no, lot_name, email)
    JOIN dbo.Users u ON u.normalized_email = d.email AND u.role = 'Staff' AND u.is_active = 1
    JOIN dbo.ParkingLot p ON p.id = u.assigned_parking_lot_id AND p.name = d.lot_name AND p.is_active = 1;

    IF (SELECT COUNT(*) FROM @Lots) <> 2 OR (SELECT COUNT(*) FROM dbo.PricingRule WHERE is_active = 1) <> 2
        THROW 51009, N'Cần đủ hai bãi demo, nhân viên được phân công và bảng giá hoạt động trước khi nạp dữ liệu.', 1;

    DECLARE @Customers table (
        sample_no int PRIMARY KEY, name nvarchar(100), email nvarchar(256) COLLATE Latin1_General_100_BIN2,
        plate nvarchar(32), vehicle_type varchar(12) COLLATE Latin1_General_100_BIN2
    );
    INSERT @Customers VALUES
        (1, N'Nguyễn Hoàng Minh', N'hoang.minh01@parking.test', N'59-P2 482.76', 'MOTORBIKE'),
        (2, N'Trần Ngọc Hà', N'ngoc.ha02@parking.test', N'51K-478.26', 'CAR'),
        (3, N'Lê Thị Mai Anh', N'mai.anh03@parking.test', N'59-N3 516.29', 'MOTORBIKE'),
        (4, N'Phạm Quốc Bảo', N'quoc.bao04@parking.test', N'51L-536.47', 'CAR'),
        (5, N'Võ Thanh Tâm', N'thanh.tam05@parking.test', N'59-D2 397.58', 'MOTORBIKE'),
        (6, N'Đặng Minh Khang', N'minh.khang06@parking.test', N'61K-264.89', 'CAR'),
        (7, N'Bùi Thảo Vy', N'thao.vy07@parking.test', N'59-X3 728.16', 'MOTORBIKE'),
        (8, N'Đỗ Gia Huy', N'gia.huy08@parking.test', N'51H-851.72', 'CAR'),
        (9, N'Hồ Anh Thư', N'anh.thu09@parking.test', N'59-L2 231.84', 'MOTORBIKE'),
        (10, N'Phan Đức Thành', N'duc.thanh10@parking.test', N'60K-392.64', 'CAR'),
        (11, N'Vũ Khánh Linh', N'khanh.linh11@parking.test', N'59-U2 689.53', 'MOTORBIKE'),
        (12, N'Ngô Nhật Nam', N'nhat.nam12@parking.test', N'51M-734.18', 'CAR'),
        (13, N'Trương Mỹ Duyên', N'my.duyen13@parking.test', N'59-S3 306.95', 'MOTORBIKE'),
        (14, N'Đinh Tuấn Kiệt', N'tuan.kiet14@parking.test', N'62A-572.83', 'CAR'),
        (15, N'Lý Quỳnh Như', N'quynh.nhu15@parking.test', N'59-F2 853.24', 'MOTORBIKE'),
        (16, N'Cao Trọng Nghĩa', N'trong.nghia16@parking.test', N'51K-915.63', 'CAR'),
        (17, N'Dương Thu Hằng', N'thu.hang17@parking.test', N'59-B3 647.31', 'MOTORBIKE'),
        (18, N'Lâm Hải Đăng', N'hai.dang18@parking.test', N'61A-683.42', 'CAR'),
        (19, N'Mai Phương Nhi', N'phuong.nhi19@parking.test', N'59-K2 564.97', 'MOTORBIKE'),
        (20, N'Tạ Xuân Phúc', N'xuan.phuc20@parking.test', N'51L-284.61', 'CAR');

    -- Dừng nếu thông tin định danh của bộ mẫu đã được dùng bên ngoài lần nạp này.
    IF EXISTS (SELECT 1 FROM @Customers c JOIN dbo.Users u ON u.normalized_email = c.email)
        OR EXISTS (SELECT 1 FROM @Customers c JOIN dbo.Vehicle v ON v.normalized_plate_number = dbo.fn_NormalizePlate(c.plate))
        THROW 51009, N'Email hoặc biển số trong bộ mẫu đã có trong database. Dừng để giữ dữ liệu cũ.', 1;

    INSERT dbo.Users (name, normalized_email, password_hash, role, created_at)
    SELECT name, email, @DemoHash, 'Customer', DATEADD(DAY, -sample_no % 6 - 22, @TodayUtc) FROM @Customers;
    DECLARE @NewUsers int = @@ROWCOUNT;
    INSERT dbo.Vehicle (user_id, plate_number, normalized_plate_number, vehicle_type, created_at)
    SELECT u.id, c.plate, dbo.fn_NormalizePlate(c.plate), c.vehicle_type, DATEADD(HOUR, 2, u.created_at)
    FROM @Customers c JOIN dbo.Users u ON u.normalized_email = c.email;
    DECLARE @NewVehicles int = @@ROWCOUNT;

    DECLARE @Vehicles table (
        vehicle_id int PRIMARY KEY, user_id int, plate nvarchar(32), vehicle_type varchar(12) COLLATE Latin1_General_100_BIN2, sample_no int NULL,
        type_order int, type_count int
    );
    INSERT @Vehicles
    SELECT v.id, u.id, v.plate_number, v.vehicle_type, c.sample_no,
        ROW_NUMBER() OVER (PARTITION BY v.vehicle_type ORDER BY v.id), COUNT(*) OVER (PARTITION BY v.vehicle_type)
    FROM dbo.Users u
    JOIN dbo.Vehicle v ON v.user_id = u.id AND v.is_active = 1
    LEFT JOIN @Customers c ON c.email = u.normalized_email
    WHERE u.role = 'Customer' AND u.is_active = 1 AND v.created_at <= DATEADD(DAY, -1, @HistoryStart)
        AND (c.sample_no IS NOT NULL OR u.normalized_email IN (N'customer1@parking.test', N'customer2@parking.test'));

    -- Chỉ dùng vị trí đang rảnh, hết đệm và chưa có giao dịch/lịch sử sử dụng trong khoảng dữ liệu mẫu.
    DECLARE @Stock table (
        slot_id int PRIMARY KEY, lot_no int, staff_id int, vehicle_type varchar(12) COLLATE Latin1_General_100_BIN2, reserved bit
    );
    INSERT @Stock
    SELECT i.slot_id, l.lot_no, l.staff_id, i.vehicle_type, i.accepts_reservations
    FROM dbo.vw_SlotInventory i JOIN @Lots l ON l.lot_id = i.parking_lot_id
    WHERE i.slot_is_active = 1 AND i.zone_is_active = 1 AND i.lot_is_active = 1
        AND i.operational_status = 'AVAILABLE' AND (i.buffer_until IS NULL OR i.buffer_until <= @Now)
        AND NOT EXISTS (SELECT 1 FROM dbo.ParkingSession s WHERE s.slot_id = i.slot_id AND (s.status = 'OPEN' OR s.check_out_time >= @HistoryStart))
        AND NOT EXISTS (SELECT 1 FROM dbo.Reservation r WHERE r.slot_id = i.slot_id AND r.status IN ('CONFIRMED', 'CHECKED_IN', 'COMPLETED') AND r.end_time >= @HistoryStart);

    DECLARE @Plan table (
        slot_id int, staff_id int, vehicle_type varchar(12) COLLATE Latin1_General_100_BIN2,
        user_id int NULL, vehicle_id int NULL, plate nvarchar(32),
        outcome varchar(15), reservation_code varchar(40) NULL, session_code varchar(40) NULL,
        planned_start datetime2(7) NULL, planned_end datetime2(7) NULL,
        arrived_at datetime2(7) NULL, departed_at datetime2(7) NULL, payment_method varchar(12) NULL
    );

    -- Các lượt trong 14 ngày gần nhất. Bãi đại học thưa hơn vào cuối tuần.
    INSERT @Plan
    SELECT s.slot_id, s.staff_id, t.vehicle_type, v.user_id, v.vehicle_id, COALESCE(v.plate, plate.walk_in_plate),
        status.outcome,
        CASE WHEN t.reserved = 1 THEN CONCAT('RS-', REPLACE(CONVERT(varchar(36), NEWID()), '-', '')) END,
        CASE WHEN status.outcome = 'COMPLETED' THEN CONCAT('PS-', REPLACE(CONVERT(varchar(36), NEWID()), '-', '')) END,
        CASE WHEN t.reserved = 1 THEN DATEADD(MINUTE, (d.day_no + t.n * 3) % 17 - 8, arrival.at) END,
        CASE WHEN t.reserved = 1 THEN DATEADD(MINUTE, CASE WHEN duration.minutes > 70 AND (d.day_no + t.n) % 5 = 0 THEN -10 ELSE 12 END, departure.at) END,
        CASE WHEN status.outcome = 'COMPLETED' THEN arrival.at END,
        CASE WHEN status.outcome = 'COMPLETED' THEN departure.at END,
        CASE WHEN (d.day_no + t.n) % 5 = 0 THEN 'SIMULATED' ELSE 'CASH' END
    FROM (VALUES (0),(1),(2),(3),(4),(5),(6),(7),(8),(9),(10),(11),(12),(13)) d(day_no)
    CROSS JOIN (VALUES
        (1,1,'MOTORBIKE',1,490,45), (2,1,'CAR',0,515,55),
        (3,2,'MOTORBIKE',1,425,80), (4,2,'CAR',1,560,50),
        (5,2,'MOTORBIKE',0,730,55), (6,1,'MOTORBIKE',0,755,40),
        (7,1,'CAR',1,935,75), (8,2,'MOTORBIKE',1,1020,55),
        (9,1,'CAR',0,1140,55), (10,1,'MOTORBIKE',1,1170,40)
    ) t(n, lot_no, vehicle_type, reserved, minute_of_day, base_duration)
    CROSS APPLY (VALUES (DATEADD(DAY, -d.day_no, @TodayUtc))) day_start(at)
    CROSS APPLY (VALUES (DATEADD(MINUTE, t.minute_of_day + (d.day_no * 17 + t.n * 13) % 33 - 12, day_start.at))) arrival(at)
    CROSS APPLY (VALUES (t.base_duration + (d.day_no * 31 + t.n * 19) % 65)) duration(minutes)
    CROSS APPLY (VALUES (DATEADD(MINUTE, duration.minutes, arrival.at))) departure(at)
    CROSS APPLY (VALUES (CASE WHEN t.reserved = 1 AND (d.day_no * 3 + t.n) % 13 = 0 THEN 'CANCELLED'
        WHEN t.reserved = 1 AND (d.day_no * 3 + t.n) % 13 = 1 THEN 'EXPIRED' ELSE 'COMPLETED' END)) status(outcome)
    CROSS APPLY (VALUES (CONVERT(varchar(5), 68000 + d.day_no * 10 + t.n))) digits(plate_suffix)
    CROSS APPLY (VALUES (CONCAT(CASE WHEN t.vehicle_type = 'CAR' THEN N'51H-' ELSE N'59-P2 ' END,
        LEFT(digits.plate_suffix, 3), N'.', RIGHT(digits.plate_suffix, 2)))) plate(walk_in_plate)
    CROSS APPLY (SELECT TOP (1) i.slot_id, i.staff_id FROM @Stock i
        WHERE i.lot_no = t.lot_no AND i.vehicle_type = t.vehicle_type AND i.reserved = t.reserved
        ORDER BY CHECKSUM(i.slot_id, d.day_no, t.n), i.slot_id) s
    LEFT JOIN @Vehicles v ON t.reserved = 1 AND v.vehicle_type = t.vehicle_type
        AND v.type_order = (d.day_no * 3 + t.n) % v.type_count + 1
    WHERE departure.at < DATEADD(MINUTE, -120, @Now)
        AND (d.day_no + t.n * 2) % 6 <> 0
        AND (DATEDIFF(DAY, '20000103', DATEADD(HOUR, 7, day_start.at)) % 7 < 5 OR t.lot_no = 1 OR (d.day_no + t.n) % 3 = 0)
        AND (v.vehicle_id IS NOT NULL OR (t.reserved = 0 AND NOT EXISTS (
            SELECT 1 FROM dbo.Vehicle existing WHERE existing.normalized_plate_number = dbo.fn_NormalizePlate(plate.walk_in_plate))));

    -- Mỗi bãi có tối đa hai xe đang gửi, dùng cả nhóm đặt trước và khách trực tiếp.
    INSERT @Plan
    SELECT s.slot_id, s.staff_id, d.vehicle_type, v.user_id, v.vehicle_id, COALESCE(v.plate, d.walk_in_plate), 'OPEN',
        CASE WHEN d.sample_no IS NOT NULL THEN CONCAT('RS-', REPLACE(CONVERT(varchar(36), NEWID()), '-', '')) END,
        CONCAT('PS-', REPLACE(CONVERT(varchar(36), NEWID()), '-', '')),
        CASE WHEN d.sample_no IS NOT NULL THEN DATEADD(MINUTE, 5, a.arrived_at) END,
        CASE WHEN d.sample_no IS NOT NULL THEN DATEADD(MINUTE, 65, @Now) END,
        a.arrived_at, NULL, NULL
    FROM (VALUES
        (1,'MOTORBIKE',1,42,CAST(NULL AS nvarchar(32))), (1,'CAR',NULL,73,N'51K-683.57'),
        (2,'CAR',4,28,NULL), (2,'MOTORBIKE',NULL,55,N'59-P2 687.41')
    ) d(lot_no, vehicle_type, sample_no, minutes_ago, walk_in_plate)
    CROSS APPLY (VALUES (DATEADD(MINUTE, -d.minutes_ago, @Now))) a(arrived_at)
    CROSS APPLY (SELECT TOP (1) i.slot_id, i.staff_id FROM @Stock i WHERE i.lot_no = d.lot_no
        AND i.vehicle_type = d.vehicle_type AND i.reserved = CASE WHEN d.sample_no IS NULL THEN 0 ELSE 1 END ORDER BY i.slot_id) s
    LEFT JOIN @Vehicles v ON v.sample_no = d.sample_no
    WHERE (v.vehicle_id IS NOT NULL OR d.sample_no IS NULL)
        AND NOT EXISTS (SELECT 1 FROM dbo.ParkingSession p WHERE p.status = 'OPEN'
            AND p.normalized_plate_number_snapshot = dbo.fn_NormalizePlate(COALESCE(v.plate, d.walk_in_plate)))
        AND NOT EXISTS (SELECT 1 FROM dbo.Vehicle owned WHERE d.sample_no IS NULL
            AND owned.normalized_plate_number = dbo.fn_NormalizePlate(d.walk_in_plate));

    -- Khách có lịch sắp tới dùng xe khác với các lượt OPEN.
    INSERT @Plan
    SELECT s.slot_id, s.staff_id, v.vehicle_type, v.user_id, v.vehicle_id, v.plate, 'CONFIRMED',
        CONCAT('RS-', REPLACE(CONVERT(varchar(36), NEWID()), '-', '')), NULL,
        a.start_time, DATEADD(MINUTE, d.duration, a.start_time), NULL, NULL, NULL
    FROM (VALUES (5,1,1,510,90),(6,1,1,630,120),(7,2,1,455,110),(8,2,1,890,70),
        (9,1,2,1010,75),(10,1,2,1110,125),(11,2,3,465,95),(12,2,3,545,100)) d(sample_no, lot_no, day_no, minutes, duration)
    JOIN @Vehicles v ON v.sample_no = d.sample_no
    CROSS APPLY (VALUES (DATEADD(MINUTE, d.minutes, DATEADD(DAY, d.day_no, @TodayUtc)))) a(start_time)
    CROSS APPLY (SELECT TOP (1) i.slot_id, i.staff_id FROM @Stock i
        WHERE i.lot_no = d.lot_no AND i.vehicle_type = v.vehicle_type AND i.reserved = 1
            AND NOT EXISTS (SELECT 1 FROM @Plan p WHERE p.slot_id = i.slot_id AND p.outcome = 'OPEN')
        ORDER BY i.slot_id) s;

    INSERT dbo.Reservation (reservation_code, user_id, vehicle_id, slot_id, plate_number_snapshot, vehicle_type_snapshot,
        start_time, end_time, expires_at, status, created_at, cancelled_at)
    SELECT reservation_code, user_id, vehicle_id, slot_id, plate, vehicle_type,
        planned_start, planned_end, DATEADD(MINUTE, 15, planned_start), CASE WHEN outcome = 'OPEN' THEN 'CHECKED_IN' ELSE outcome END,
        CASE WHEN outcome = 'CONFIRMED' THEN @Now ELSE DATEADD(HOUR, -7, planned_start) END,
        CASE WHEN outcome = 'CANCELLED' THEN DATEADD(MINUTE, -45, planned_start) END
    FROM @Plan WHERE reservation_code IS NOT NULL;

    INSERT dbo.ParkingSession (session_code, reservation_id, customer_id, vehicle_id, slot_id, plate_number_snapshot,
        normalized_plate_number_snapshot, vehicle_type_snapshot, check_in_staff_id, check_out_staff_id, check_in_time,
        check_out_time, pricing_rule_id, applied_price_per_hour, billable_hours, total_fee, status, created_at)
    SELECT p.session_code, r.id, p.user_id, p.vehicle_id, p.slot_id, p.plate, dbo.fn_NormalizePlate(p.plate), p.vehicle_type,
        p.staff_id, CASE WHEN p.outcome = 'COMPLETED' THEN p.staff_id END, p.arrived_at, p.departed_at,
        price.id, price.price_per_hour, fee.hours, fee.hours * price.price_per_hour, p.outcome, p.arrived_at
    FROM @Plan p
    LEFT JOIN dbo.Reservation r ON r.reservation_code = p.reservation_code
    JOIN dbo.PricingRule price ON price.vehicle_type = p.vehicle_type AND price.is_active = 1
    CROSS APPLY (VALUES (dbo.fn_BillableHours(p.arrived_at, p.departed_at))) fee(hours)
    WHERE p.session_code IS NOT NULL;

    INSERT dbo.Payment (session_id, amount, method, status, paid_at, confirmed_by_staff_id)
    SELECT s.id, s.total_fee, p.payment_method, 'PAID', s.check_out_time, s.check_out_staff_id
    FROM @Plan p JOIN dbo.ParkingSession s ON s.session_code = p.session_code WHERE p.outcome = 'COMPLETED';
    DECLARE @NewPayments int = @@ROWCOUNT;

    UPDATE s SET operational_status = 'OCCUPIED'
    FROM dbo.ParkingSlot s JOIN @Plan p ON p.slot_id = s.id WHERE p.outcome = 'OPEN';

    DECLARE @Summary nvarchar(max) = (SELECT @NewUsers AS customers, @NewVehicles AS vehicles,
        COALESCE(SUM(CASE WHEN reservation_code IS NOT NULL THEN 1 ELSE 0 END), 0) AS reservations,
        COALESCE(SUM(CASE WHEN outcome = 'CONFIRMED' THEN 1 ELSE 0 END), 0) AS upcoming,
        COALESCE(SUM(CASE WHEN outcome = 'CANCELLED' THEN 1 ELSE 0 END), 0) AS cancelled,
        COALESCE(SUM(CASE WHEN outcome = 'EXPIRED' THEN 1 ELSE 0 END), 0) AS expired,
        COALESCE(SUM(CASE WHEN outcome = 'OPEN' THEN 1 ELSE 0 END), 0) AS currently_parked,
        @NewPayments AS paid_receipts FROM @Plan FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);

    INSERT dbo.AuditLog (action, entity_type, entity_id, reason, details_json, request_id)
    SELECT 'DEMO_DATA_IMPORTED', 'ParkingLot', lot_id, N'Dữ liệu mô phỏng cho đồ án 4.', @Summary, @SeedKey
    FROM @Lots WHERE lot_no = 1;

    COMMIT;
    SELECT N'Đã nạp dữ liệu mô phỏng.' AS message, @Summary AS imported_counts;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK;
    THROW;
END CATCH;
GO
