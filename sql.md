# SQL — Quản lý bãi đỗ xe trực tuyến

Đối chiếu `blueprint.md`, cập nhật ngày 25/10/2026. Dùng **SQL Server 2019 trở lên** (Express, Developer hoặc LocalDB); không chạy script này trong MySQL. Backend hiện tại là ASP.NET Core/.NET 10, phù hợp với provider `Microsoft.EntityFrameworkCore.SqlServer` do Microsoft duy trì ([tài liệu](https://learn.microsoft.com/en-us/ef/core/providers/sql-server/)). MySQL cũng làm được đề tài này, nhưng với stack và script hiện tại nên chọn SQL Server.

## Cách chạy

1. Mở SQL Server Management Studio (SSMS), kết nối SQL Server của bạn, mở **New Query**.
2. Copy **toàn bộ phần bên trong khối SQL ở mục 1**, gồm các dòng `GO`, rồi Execute. Không copy các dấu Markdown ``` hoặc nội dung giải thích.
3. Database được tạo là **ParkingLotOnline**. Script không xóa database/bảng/dữ liệu cũ; chạy lại trên đúng schema này giữ dữ liệu và cập nhật function/view/procedure. Nếu đã có database cùng tên với schema khác, dùng database mới và đổi tên ở cả hai chỗ đầu script. Đây là script khởi tạo, không phải công cụ migration schema cũ.
4. Mục 2 là các lệnh dùng thử, chạy riêng sau khi khởi tạo; mục 3 giải thích cách nối backend.

Tất cả giờ trong database và tham số SQL là **UTC**, tiền là **VND**, làm tròn phí lên từng giờ, tối thiểu một giờ. Dữ liệu seed gồm 2 bãi, 4 khu vực, 24 vị trí (16 đặt trước, 8 walk-in), 5 tài khoản, 4 phương tiện và 2 mức giá. Không tạo doanh thu hay lịch sử gửi xe giả trong bước khởi tạo.

| Tài khoản demo | Vai trò | Bãi |
|---|---|---|
| admin@parking.test | Admin | Toàn hệ thống |
| staff1@parking.test | Staff | Bãi Trung Tâm |
| staff2@parking.test | Staff | Bãi Đại Học |
| customer1@parking.test | Customer | — |
| customer2@parking.test | Customer | — |

Mật khẩu demo: **123456**. Giá trị trong SQL là hash thật do `PasswordHasher<object>` của ASP.NET Core Identity sinh và đã xác minh bằng `VerifyHashedPassword`; backend phải dùng cùng cơ chế để đăng ký/đăng nhập. Các tài khoản này phục vụ demo cục bộ.

## 1. Script khởi tạo và nghiệp vụ

Script có 11 bảng, khóa ngoại/CHECK/unique/index, dữ liệu demo, function/view, procedure xử lý nghiệp vụ, báo cáo và role dành cho backend. Chỉ có một khối SQL cần copy ở mục này.

```sql
USE [master];
GO
IF DB_ID(N'ParkingLotOnline') IS NULL
    EXEC(N'CREATE DATABASE [ParkingLotOnline] COLLATE Latin1_General_100_CI_AS_SC;');
GO
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
GO

-- A. SCHEMA. Không có ON DELETE CASCADE; giữ lịch sử, dùng is_active.
BEGIN TRY
    BEGIN TRANSACTION;

    IF OBJECT_ID(N'dbo.ParkingLot', N'U') IS NULL
    CREATE TABLE dbo.ParkingLot (
        id int IDENTITY(1,1) NOT NULL CONSTRAINT PK_ParkingLot PRIMARY KEY,
        name nvarchar(150) NOT NULL,
        address nvarchar(500) NOT NULL,
        is_active bit NOT NULL CONSTRAINT DF_ParkingLot_Active DEFAULT (1),
        CONSTRAINT CK_ParkingLot_Name CHECK (LEN(LTRIM(RTRIM(name))) > 0),
        CONSTRAINT CK_ParkingLot_Address CHECK (LEN(LTRIM(RTRIM(address))) > 0)
    );

    IF OBJECT_ID(N'dbo.Users', N'U') IS NULL
    BEGIN
        CREATE TABLE dbo.Users (
            id int IDENTITY(1,1) NOT NULL CONSTRAINT PK_Users PRIMARY KEY,
            name nvarchar(100) NOT NULL,
            normalized_email nvarchar(256) COLLATE Latin1_General_100_BIN2 NOT NULL,
            password_hash nvarchar(512) NOT NULL,
            phone varchar(20) NULL,
            role varchar(20) COLLATE Latin1_General_100_BIN2 NOT NULL,
            is_active bit NOT NULL CONSTRAINT DF_Users_Active DEFAULT (1),
            assigned_parking_lot_id int NULL,
            created_at datetime2(7) NOT NULL CONSTRAINT DF_Users_Created DEFAULT SYSUTCDATETIME(),
            CONSTRAINT UQ_Users_Email UNIQUE (normalized_email),
            CONSTRAINT FK_Users_Lot FOREIGN KEY (assigned_parking_lot_id) REFERENCES dbo.ParkingLot(id),
            CONSTRAINT CK_Users_Name CHECK (LEN(LTRIM(RTRIM(name))) > 0),
            CONSTRAINT CK_Users_Email CHECK (LEN(normalized_email) > 3
                AND normalized_email = LOWER(LTRIM(RTRIM(normalized_email)))),
            CONSTRAINT CK_Users_Password CHECK (LEN(password_hash) >= 50),
            CONSTRAINT CK_Users_Role CHECK (role IN ('Customer','Staff','Admin')),
            CONSTRAINT CK_Users_Assignment CHECK (
                (role = 'Staff' AND assigned_parking_lot_id IS NOT NULL)
                OR (role IN ('Customer','Admin') AND assigned_parking_lot_id IS NULL))
        );
        CREATE INDEX IX_Users_Assignment ON dbo.Users(assigned_parking_lot_id, role, is_active);
    END;

    IF OBJECT_ID(N'dbo.Vehicle', N'U') IS NULL
    BEGIN
        CREATE TABLE dbo.Vehicle (
            id int IDENTITY(1,1) NOT NULL CONSTRAINT PK_Vehicle PRIMARY KEY,
            user_id int NOT NULL,
            plate_number nvarchar(32) NOT NULL,
            normalized_plate_number varchar(32) COLLATE Latin1_General_100_BIN2 NOT NULL,
            vehicle_type varchar(12) COLLATE Latin1_General_100_BIN2 NOT NULL,
            is_active bit NOT NULL CONSTRAINT DF_Vehicle_Active DEFAULT (1),
            created_at datetime2(7) NOT NULL CONSTRAINT DF_Vehicle_Created DEFAULT SYSUTCDATETIME(),
            CONSTRAINT FK_Vehicle_User FOREIGN KEY (user_id) REFERENCES dbo.Users(id),
            CONSTRAINT UQ_Vehicle_Plate UNIQUE (normalized_plate_number),
            CONSTRAINT CK_Vehicle_Type CHECK (vehicle_type IN ('MOTORBIKE','CAR')),
            CONSTRAINT CK_Vehicle_Plate CHECK (LEN(normalized_plate_number) BETWEEN 3 AND 20
                AND normalized_plate_number NOT LIKE '%[^A-Z0-9]%' COLLATE Latin1_General_100_BIN2
                AND normalized_plate_number = UPPER(REPLACE(REPLACE(REPLACE(LTRIM(RTRIM(plate_number)), N' ', N''), N'.', N''), N'-', N'')) COLLATE Latin1_General_100_BIN2)
        );
        CREATE INDEX IX_Vehicle_User ON dbo.Vehicle(user_id, is_active);
    END;

    IF OBJECT_ID(N'dbo.Zone', N'U') IS NULL
    BEGIN
        CREATE TABLE dbo.Zone (
            id int IDENTITY(1,1) NOT NULL CONSTRAINT PK_Zone PRIMARY KEY,
            parking_lot_id int NOT NULL,
            name nvarchar(100) NOT NULL,
            floor_label nvarchar(50) NULL,
            vehicle_type varchar(12) COLLATE Latin1_General_100_BIN2 NOT NULL,
            is_active bit NOT NULL CONSTRAINT DF_Zone_Active DEFAULT (1),
            CONSTRAINT FK_Zone_Lot FOREIGN KEY (parking_lot_id) REFERENCES dbo.ParkingLot(id),
            CONSTRAINT UQ_Zone_Name UNIQUE (parking_lot_id, name),
            CONSTRAINT CK_Zone_Name CHECK (LEN(LTRIM(RTRIM(name))) > 0),
            CONSTRAINT CK_Zone_Type CHECK (vehicle_type IN ('MOTORBIKE','CAR'))
        );
    END;

    IF OBJECT_ID(N'dbo.ParkingSlot', N'U') IS NULL
    BEGIN
        CREATE TABLE dbo.ParkingSlot (
            id int IDENTITY(1,1) NOT NULL CONSTRAINT PK_ParkingSlot PRIMARY KEY,
            zone_id int NOT NULL,
            code varchar(30) NOT NULL,
            operational_status varchar(15) COLLATE Latin1_General_100_BIN2 NOT NULL
                CONSTRAINT DF_ParkingSlot_Status DEFAULT ('AVAILABLE'),
            accepts_reservations bit NOT NULL,
            buffer_until datetime2(7) NULL,
            is_active bit NOT NULL CONSTRAINT DF_ParkingSlot_Active DEFAULT (1),
            CONSTRAINT FK_ParkingSlot_Zone FOREIGN KEY (zone_id) REFERENCES dbo.Zone(id),
            CONSTRAINT UQ_ParkingSlot_Code UNIQUE (zone_id, code),
            CONSTRAINT CK_ParkingSlot_Code CHECK (LEN(LTRIM(RTRIM(code))) > 0),
            CONSTRAINT CK_ParkingSlot_Status CHECK (operational_status IN ('AVAILABLE','OCCUPIED','MAINTENANCE'))
        );
        CREATE INDEX IX_ParkingSlot_Search ON dbo.ParkingSlot(zone_id, is_active, accepts_reservations, operational_status)
            INCLUDE (code, buffer_until);
        CREATE INDEX IX_ParkingSlot_Buffer ON dbo.ParkingSlot(buffer_until) WHERE buffer_until IS NOT NULL;
    END;

    IF OBJECT_ID(N'dbo.PricingRule', N'U') IS NULL
    BEGIN
        CREATE TABLE dbo.PricingRule (
            id int IDENTITY(1,1) NOT NULL CONSTRAINT PK_PricingRule PRIMARY KEY,
            vehicle_type varchar(12) COLLATE Latin1_General_100_BIN2 NOT NULL,
            price_per_hour decimal(18,0) NOT NULL,
            is_active bit NOT NULL CONSTRAINT DF_PricingRule_Active DEFAULT (1),
            updated_at datetime2(7) NOT NULL CONSTRAINT DF_PricingRule_Updated DEFAULT SYSUTCDATETIME(),
            CONSTRAINT CK_PricingRule_Type CHECK (vehicle_type IN ('MOTORBIKE','CAR')),
            CONSTRAINT CK_PricingRule_Price CHECK (price_per_hour > 0)
        );
        CREATE UNIQUE INDEX UX_PricingRule_ActiveType ON dbo.PricingRule(vehicle_type) WHERE is_active = 1;
    END;

    IF OBJECT_ID(N'dbo.Reservation', N'U') IS NULL
    BEGIN
        CREATE TABLE dbo.Reservation (
            id int IDENTITY(1,1) NOT NULL CONSTRAINT PK_Reservation PRIMARY KEY,
            reservation_code varchar(40) NOT NULL,
            user_id int NOT NULL,
            vehicle_id int NOT NULL,
            slot_id int NOT NULL,
            plate_number_snapshot nvarchar(32) NOT NULL,
            vehicle_type_snapshot varchar(12) COLLATE Latin1_General_100_BIN2 NOT NULL,
            start_time datetime2(7) NOT NULL,
            end_time datetime2(7) NOT NULL,
            expires_at datetime2(7) NOT NULL,
            status varchar(15) COLLATE Latin1_General_100_BIN2 NOT NULL
                CONSTRAINT DF_Reservation_Status DEFAULT ('CONFIRMED'),
            service_issue_at datetime2(7) NULL,
            issue_reason nvarchar(1000) NULL,
            resolved_by_staff_id int NULL,
            resolved_at datetime2(7) NULL,
            created_at datetime2(7) NOT NULL CONSTRAINT DF_Reservation_Created DEFAULT SYSUTCDATETIME(),
            cancelled_at datetime2(7) NULL,
            CONSTRAINT UQ_Reservation_Code UNIQUE (reservation_code),
            CONSTRAINT FK_Reservation_User FOREIGN KEY (user_id) REFERENCES dbo.Users(id),
            CONSTRAINT FK_Reservation_Vehicle FOREIGN KEY (vehicle_id) REFERENCES dbo.Vehicle(id),
            CONSTRAINT FK_Reservation_Slot FOREIGN KEY (slot_id) REFERENCES dbo.ParkingSlot(id),
            CONSTRAINT FK_Reservation_ResolvedBy FOREIGN KEY (resolved_by_staff_id) REFERENCES dbo.Users(id),
            CONSTRAINT CK_Reservation_Type CHECK (vehicle_type_snapshot IN ('MOTORBIKE','CAR')),
            CONSTRAINT CK_Reservation_Time CHECK (end_time >= DATEADD(MINUTE,30,start_time)
                AND end_time <= DATEADD(HOUR,24,start_time) AND expires_at = DATEADD(MINUTE,15,start_time)),
            CONSTRAINT CK_Reservation_Status CHECK (status IN ('CONFIRMED','CHECKED_IN','CANCELLED','EXPIRED','UNFULFILLED','COMPLETED')),
            CONSTRAINT CK_Reservation_Cancel CHECK ((status = 'CANCELLED' AND cancelled_at IS NOT NULL)
                OR (status <> 'CANCELLED' AND cancelled_at IS NULL)),
            CONSTRAINT CK_Reservation_Issue CHECK (service_issue_at IS NULL OR
                (issue_reason IS NOT NULL AND LEN(LTRIM(RTRIM(issue_reason))) > 0
                 AND service_issue_at >= DATEADD(MINUTE,-15,start_time) AND service_issue_at < expires_at)),
            CONSTRAINT CK_Reservation_Unfulfilled CHECK (status <> 'UNFULFILLED' OR
                (issue_reason IS NOT NULL AND LEN(LTRIM(RTRIM(issue_reason))) > 0 AND resolved_at IS NOT NULL))
        );
        CREATE INDEX IX_Reservation_SlotWindow ON dbo.Reservation(slot_id, status, start_time, end_time)
            INCLUDE (expires_at, service_issue_at, vehicle_id);
        CREATE INDEX IX_Reservation_VehicleWindow ON dbo.Reservation(vehicle_id, status, start_time, end_time)
            INCLUDE (expires_at, service_issue_at);
        CREATE INDEX IX_Reservation_User ON dbo.Reservation(user_id, created_at DESC);
        CREATE INDEX IX_Reservation_Expiry ON dbo.Reservation(status, expires_at)
            INCLUDE (service_issue_at, end_time);
    END;

    IF OBJECT_ID(N'dbo.ParkingSession', N'U') IS NULL
    BEGIN
        CREATE TABLE dbo.ParkingSession (
            id int IDENTITY(1,1) NOT NULL CONSTRAINT PK_ParkingSession PRIMARY KEY,
            session_code varchar(40) NOT NULL,
            reservation_id int NULL,
            customer_id int NULL,
            vehicle_id int NULL,
            slot_id int NOT NULL,
            plate_number_snapshot nvarchar(32) NOT NULL,
            normalized_plate_number_snapshot varchar(32) COLLATE Latin1_General_100_BIN2 NOT NULL,
            vehicle_type_snapshot varchar(12) COLLATE Latin1_General_100_BIN2 NOT NULL,
            check_in_staff_id int NOT NULL,
            check_out_staff_id int NULL,
            check_in_time datetime2(7) NOT NULL,
            check_out_time datetime2(7) NULL,
            pricing_rule_id int NOT NULL,
            applied_price_per_hour decimal(18,0) NOT NULL,
            billable_hours int NULL,
            total_fee decimal(18,0) NULL,
            status varchar(12) COLLATE Latin1_General_100_BIN2 NOT NULL
                CONSTRAINT DF_ParkingSession_Status DEFAULT ('OPEN'),
            created_at datetime2(7) NOT NULL CONSTRAINT DF_ParkingSession_Created DEFAULT SYSUTCDATETIME(),
            CONSTRAINT UQ_ParkingSession_Code UNIQUE (session_code),
            CONSTRAINT UQ_ParkingSession_IdFee UNIQUE (id, total_fee),
            CONSTRAINT FK_ParkingSession_Reservation FOREIGN KEY (reservation_id) REFERENCES dbo.Reservation(id),
            CONSTRAINT FK_ParkingSession_Customer FOREIGN KEY (customer_id) REFERENCES dbo.Users(id),
            CONSTRAINT FK_ParkingSession_Vehicle FOREIGN KEY (vehicle_id) REFERENCES dbo.Vehicle(id),
            CONSTRAINT FK_ParkingSession_Slot FOREIGN KEY (slot_id) REFERENCES dbo.ParkingSlot(id),
            CONSTRAINT FK_ParkingSession_InStaff FOREIGN KEY (check_in_staff_id) REFERENCES dbo.Users(id),
            CONSTRAINT FK_ParkingSession_OutStaff FOREIGN KEY (check_out_staff_id) REFERENCES dbo.Users(id),
            CONSTRAINT FK_ParkingSession_Price FOREIGN KEY (pricing_rule_id) REFERENCES dbo.PricingRule(id),
            CONSTRAINT CK_ParkingSession_Type CHECK (vehicle_type_snapshot IN ('MOTORBIKE','CAR')),
            CONSTRAINT CK_ParkingSession_Plate CHECK (LEN(normalized_plate_number_snapshot) BETWEEN 3 AND 20
                AND normalized_plate_number_snapshot NOT LIKE '%[^A-Z0-9]%' COLLATE Latin1_General_100_BIN2
                AND normalized_plate_number_snapshot = UPPER(REPLACE(REPLACE(REPLACE(LTRIM(RTRIM(plate_number_snapshot)),N' ',N''),N'.',N''),N'-',N'')) COLLATE Latin1_General_100_BIN2),
            CONSTRAINT CK_ParkingSession_Price CHECK (applied_price_per_hour > 0),
            CONSTRAINT CK_ParkingSession_Link CHECK (
                (customer_id IS NULL AND vehicle_id IS NULL AND reservation_id IS NULL)
                OR (customer_id IS NOT NULL AND vehicle_id IS NOT NULL)),
            CONSTRAINT CK_ParkingSession_State CHECK (
                (status = 'OPEN' AND check_out_time IS NULL AND check_out_staff_id IS NULL
                    AND billable_hours IS NULL AND total_fee IS NULL)
                OR (status = 'COMPLETED' AND check_out_time IS NOT NULL AND check_out_time >= check_in_time
                    AND check_out_staff_id IS NOT NULL AND billable_hours IS NOT NULL AND billable_hours >= 1
                    AND total_fee IS NOT NULL AND total_fee > 0 AND total_fee = billable_hours * applied_price_per_hour))
        );
        CREATE UNIQUE INDEX UX_ParkingSession_Reservation ON dbo.ParkingSession(reservation_id) WHERE reservation_id IS NOT NULL;
        CREATE UNIQUE INDEX UX_ParkingSession_OpenSlot ON dbo.ParkingSession(slot_id) WHERE status = 'OPEN';
        CREATE UNIQUE INDEX UX_ParkingSession_OpenPlate ON dbo.ParkingSession(normalized_plate_number_snapshot) WHERE status = 'OPEN';
        CREATE INDEX IX_ParkingSession_Plate ON dbo.ParkingSession(normalized_plate_number_snapshot, check_in_time DESC);
        CREATE INDEX IX_ParkingSession_Customer ON dbo.ParkingSession(customer_id, check_in_time DESC);
        CREATE INDEX IX_ParkingSession_CheckIn ON dbo.ParkingSession(check_in_time) INCLUDE (slot_id, status);
        CREATE INDEX IX_ParkingSession_CheckOut ON dbo.ParkingSession(check_out_time) INCLUDE (slot_id, total_fee);
    END;

    IF OBJECT_ID(N'dbo.Payment', N'U') IS NULL
    BEGIN
        CREATE TABLE dbo.Payment (
            id int IDENTITY(1,1) NOT NULL CONSTRAINT PK_Payment PRIMARY KEY,
            session_id int NOT NULL,
            amount decimal(18,0) NOT NULL,
            method varchar(12) COLLATE Latin1_General_100_BIN2 NOT NULL,
            status varchar(10) COLLATE Latin1_General_100_BIN2 NOT NULL CONSTRAINT DF_Payment_Status DEFAULT ('PAID'),
            paid_at datetime2(7) NOT NULL CONSTRAINT DF_Payment_PaidAt DEFAULT SYSUTCDATETIME(),
            confirmed_by_staff_id int NOT NULL,
            CONSTRAINT UQ_Payment_Session UNIQUE (session_id),
            CONSTRAINT FK_Payment_Session FOREIGN KEY (session_id) REFERENCES dbo.ParkingSession(id),
            -- Payment phải khớp phí chính thức; Session OPEN chưa có total_fee không thể được thu.
            CONSTRAINT FK_Payment_FinalFee FOREIGN KEY (session_id, amount) REFERENCES dbo.ParkingSession(id, total_fee),
            CONSTRAINT FK_Payment_Staff FOREIGN KEY (confirmed_by_staff_id) REFERENCES dbo.Users(id),
            CONSTRAINT CK_Payment_Amount CHECK (amount > 0),
            CONSTRAINT CK_Payment_Method CHECK (method IN ('CASH','SIMULATED')),
            CONSTRAINT CK_Payment_Status CHECK (status = 'PAID')
        );
        CREATE INDEX IX_Payment_PaidAt ON dbo.Payment(paid_at) INCLUDE (amount, session_id, method);
    END;

    IF OBJECT_ID(N'dbo.AuditLog', N'U') IS NULL
    BEGIN
        CREATE TABLE dbo.AuditLog (
            id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_AuditLog PRIMARY KEY,
            actor_user_id int NULL,
            action varchar(60) NOT NULL,
            entity_type varchar(40) NOT NULL,
            entity_id int NOT NULL,
            occurred_at datetime2(7) NOT NULL CONSTRAINT DF_AuditLog_Time DEFAULT SYSUTCDATETIME(),
            reason nvarchar(1000) NULL,
            details_json nvarchar(max) NOT NULL CONSTRAINT DF_AuditLog_Details DEFAULT (N'{}'),
            request_id varchar(128) COLLATE Latin1_General_100_BIN2 NULL,
            CONSTRAINT FK_AuditLog_Actor FOREIGN KEY (actor_user_id) REFERENCES dbo.Users(id),
            CONSTRAINT CK_AuditLog_JSON CHECK (ISJSON(details_json) = 1)
        );
        CREATE INDEX IX_AuditLog_Entity ON dbo.AuditLog(entity_type, entity_id, occurred_at DESC);
        CREATE INDEX IX_AuditLog_Actor ON dbo.AuditLog(actor_user_id, occurred_at DESC);
    END;

    IF OBJECT_ID(N'dbo.RequestRecord', N'U') IS NULL
    BEGIN
        CREATE TABLE dbo.RequestRecord (
            id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_RequestRecord PRIMARY KEY,
            actor_user_id int NOT NULL,
            operation varchar(60) COLLATE Latin1_General_100_BIN2 NOT NULL,
            idempotency_key varchar(128) COLLATE Latin1_General_100_BIN2 NOT NULL,
            request_hash binary(32) NOT NULL,
            resource_id int NOT NULL,
            response_status smallint NOT NULL,
            response_json nvarchar(max) NOT NULL,
            created_at datetime2(7) NOT NULL CONSTRAINT DF_RequestRecord_Time DEFAULT SYSUTCDATETIME(),
            CONSTRAINT FK_RequestRecord_Actor FOREIGN KEY (actor_user_id) REFERENCES dbo.Users(id),
            CONSTRAINT UQ_RequestRecord_Key UNIQUE (actor_user_id, operation, idempotency_key),
            CONSTRAINT CK_RequestRecord_Key CHECK (LEN(LTRIM(RTRIM(idempotency_key))) > 0),
            CONSTRAINT CK_RequestRecord_Status CHECK (response_status BETWEEN 200 AND 299),
            CONSTRAINT CK_RequestRecord_JSON CHECK (ISJSON(response_json) = 1)
        );
    END;

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO

-- B. FUNCTIONS / VIEWS.
CREATE OR ALTER FUNCTION dbo.fn_NormalizePlate(@Plate nvarchar(32))
RETURNS varchar(32)
AS
BEGIN
    RETURN CONVERT(varchar(32), UPPER(REPLACE(REPLACE(REPLACE(LTRIM(RTRIM(@Plate)),N' ',N''),N'.',N''),N'-',N'')));
END;
GO
CREATE OR ALTER FUNCTION dbo.fn_EffectiveReservations(@NowUtc datetime2(7))
RETURNS TABLE
AS RETURN (
    SELECT r.* FROM dbo.Reservation r
    WHERE r.status = 'CONFIRMED' AND (
        (r.service_issue_at IS NULL AND @NowUtc < r.expires_at)
        OR (r.service_issue_at IS NOT NULL AND @NowUtc < DATEADD(MINUTE,15,r.service_issue_at) AND @NowUtc < r.end_time))
);
GO
CREATE OR ALTER FUNCTION dbo.fn_BillableHours(@FromUtc datetime2(7), @ToUtc datetime2(7))
RETURNS int
AS
BEGIN
    -- NANOSECOND giữ đúng ranh giới: đúng 60 phút = 1, 60 phút + 100ns = 2.
    -- Chia theo ngày trước để không tràn DATEDIFF_BIG(NANOSECOND) với phiên dài.
    IF @FromUtc IS NULL OR @ToUtc IS NULL OR @ToUtc < @FromUtc RETURN NULL;
    DECLARE @Days int = DATEDIFF(DAY,@FromUtc,@ToUtc), @Remainder bigint, @Hours int;
    SET @Remainder = DATEDIFF_BIG(NANOSECOND,DATEADD(DAY,@Days,@FromUtc),@ToUtc);
    IF @Remainder < 0
    BEGIN
        SET @Days = @Days - 1;
        SET @Remainder = DATEDIFF_BIG(NANOSECOND,DATEADD(DAY,@Days,@FromUtc),@ToUtc);
    END;
    SET @Hours = @Days * 24 + CONVERT(int,(@Remainder + 3599999999999) / 3600000000000);
    RETURN CASE WHEN @Hours < 1 THEN 1 ELSE @Hours END;
END;
GO
CREATE OR ALTER VIEW dbo.vw_SlotInventory
AS
SELECT s.id AS slot_id, s.code, s.zone_id, z.name AS zone_name, z.floor_label,
    z.parking_lot_id, p.name AS parking_lot_name, p.address, z.vehicle_type,
    s.accepts_reservations, s.operational_status, s.buffer_until,
    s.is_active AS slot_is_active, z.is_active AS zone_is_active, p.is_active AS lot_is_active
FROM dbo.ParkingSlot s JOIN dbo.Zone z ON z.id = s.zone_id
JOIN dbo.ParkingLot p ON p.id = z.parking_lot_id;
GO
CREATE OR ALTER VIEW dbo.vw_SessionDetails
AS
SELECT ps.*, s.code AS slot_code, z.id AS zone_id, z.name AS zone_name,
    z.parking_lot_id, p.name AS parking_lot_name, r.reservation_code, r.end_time AS planned_end_time,
    pay.id AS payment_id, pay.amount AS paid_amount, pay.method AS payment_method, pay.paid_at
FROM dbo.ParkingSession ps JOIN dbo.ParkingSlot s ON s.id = ps.slot_id
JOIN dbo.Zone z ON z.id = s.zone_id JOIN dbo.ParkingLot p ON p.id = z.parking_lot_id
LEFT JOIN dbo.Reservation r ON r.id = ps.reservation_id
LEFT JOIN dbo.Payment pay ON pay.session_id = ps.id;
GO
CREATE OR ALTER VIEW dbo.vw_CurrentOccupancy
AS
SELECT p.id AS parking_lot_id, p.name AS parking_lot_name,
    COUNT(s.id) AS total_active_slots,
    SUM(CASE WHEN s.operational_status = 'AVAILABLE' THEN 1 ELSE 0 END) AS available_slots,
    SUM(CASE WHEN s.operational_status = 'OCCUPIED' THEN 1 ELSE 0 END) AS occupied_slots,
    SUM(CASE WHEN s.operational_status = 'MAINTENANCE' THEN 1 ELSE 0 END) AS maintenance_slots,
    CONVERT(decimal(6,2),100.0 * SUM(CASE WHEN s.operational_status = 'OCCUPIED' THEN 1 ELSE 0 END)
        / NULLIF(SUM(CASE WHEN s.operational_status IN ('AVAILABLE','OCCUPIED') THEN 1 ELSE 0 END),0)) AS occupancy_percent
FROM dbo.ParkingLot p
LEFT JOIN dbo.Zone z ON z.parking_lot_id = p.id AND z.is_active = 1
LEFT JOIN dbo.ParkingSlot s ON s.zone_id = z.id AND s.is_active = 1
WHERE p.is_active = 1
GROUP BY p.id,p.name;
GO

-- C. HELPERS NỘI BỘ: backend không gọi trực tiếp.
-- MVP tuần tự hóa lệnh ghi bằng application lock trong transaction.
-- Tất cả lệnh ghi nghiệp vụ phải dùng cùng lock; unique index là lớp bảo vệ bổ sung.
CREATE OR ALTER PROCEDURE dbo.usp_InternalLock
AS
BEGIN
    SET NOCOUNT ON;
    IF @@TRANCOUNT = 0 THROW 51000, N'Helper yêu cầu transaction.', 1;
    DECLARE @Result int;
    EXEC @Result = sys.sp_getapplock @Resource = N'ParkingLotOnline.BusinessWrite',
        @LockMode = 'Exclusive', @LockOwner = 'Transaction', @LockTimeout = 10000;
    IF @Result < 0 THROW 51010, N'Chưa lấy được khóa nghiệp vụ; có thể thử lại.', 1;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_InternalAssertActor
    @ActorId int, @RequiredRole varchar(20) = NULL, @ParkingLotId int = NULL
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT EXISTS (SELECT 1 FROM dbo.Users WHERE id = @ActorId AND is_active = 1
        AND (@RequiredRole IS NULL OR role = @RequiredRole)
        AND (@ParkingLotId IS NULL OR (role = 'Staff' AND assigned_parking_lot_id = @ParkingLotId)))
        THROW 51001, N'Tài khoản không có quyền hoặc không thuộc bãi này.', 1;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_InternalBeginRequest
    @ActorId int, @Operation varchar(60), @Key varchar(128), @Payload nvarchar(max),
    @Hash binary(32) OUTPUT, @Replay nvarchar(max) OUTPUT, @ReplayStatus smallint OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    IF @@TRANCOUNT = 0 THROW 51000, N'Helper yêu cầu transaction.', 1;
    IF @Key IS NULL OR LEN(LTRIM(RTRIM(@Key))) = 0 OR ISJSON(@Payload) <> 1
        THROW 51000, N'Idempotency-Key/payload không hợp lệ.', 1;
    SET @Hash = HASHBYTES('SHA2_256',CONVERT(varbinary(max),@Payload));
    SET @Replay = NULL; SET @ReplayStatus = NULL;
    DECLARE @OldHash binary(32);
    SELECT @OldHash = request_hash, @Replay = response_json, @ReplayStatus = response_status
    FROM dbo.RequestRecord WHERE actor_user_id = @ActorId AND operation = @Operation AND idempotency_key = @Key;
    IF @OldHash IS NOT NULL AND @OldHash <> @Hash
        THROW 51009, N'Idempotency-Key đã được dùng với nội dung khác.', 1;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_InternalSaveRequest
    @ActorId int, @Operation varchar(60), @Key varchar(128), @Hash binary(32),
    @ResourceId int, @ResponseStatus smallint, @Response nvarchar(max)
AS
BEGIN
    SET NOCOUNT ON;
    IF @@TRANCOUNT = 0 THROW 51000, N'Helper yêu cầu transaction.', 1;
    INSERT dbo.RequestRecord(actor_user_id,operation,idempotency_key,request_hash,resource_id,response_status,response_json)
    VALUES (@ActorId,@Operation,@Key,@Hash,@ResourceId,@ResponseStatus,@Response);
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_InternalExpireReservations @NowUtc datetime2(7)
AS
BEGIN
    SET NOCOUNT ON;
    IF @@TRANCOUNT = 0 THROW 51000, N'Helper yêu cầu transaction.', 1;
    DECLARE @Changed TABLE(id int, status varchar(15), reason nvarchar(1000));
    UPDATE dbo.Reservation
    SET status = CASE WHEN service_issue_at IS NULL THEN 'EXPIRED' ELSE 'UNFULFILLED' END,
        resolved_at = CASE WHEN service_issue_at IS NOT NULL THEN @NowUtc ELSE resolved_at END,
        resolved_by_staff_id = CASE WHEN service_issue_at IS NOT NULL THEN NULL ELSE resolved_by_staff_id END,
        issue_reason = CASE WHEN service_issue_at IS NOT NULL
            THEN LEFT(CONCAT(N'Hệ thống: hết thời gian xử lý sự cố. | ',issue_reason),1000) ELSE issue_reason END
    OUTPUT inserted.id,inserted.status,inserted.issue_reason INTO @Changed
    WHERE status = 'CONFIRMED' AND (
        (service_issue_at IS NULL AND expires_at <= @NowUtc)
        OR (service_issue_at IS NOT NULL AND (DATEADD(MINUTE,15,service_issue_at) <= @NowUtc OR end_time <= @NowUtc)));
    INSERT dbo.AuditLog(actor_user_id,action,entity_type,entity_id,occurred_at,reason,details_json)
    SELECT NULL,CONCAT('RESERVATION_',c.status),'Reservation',c.id,@NowUtc,c.reason,
        (SELECT c.status AS status FOR JSON PATH, WITHOUT_ARRAY_WRAPPER) FROM @Changed c;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_ExpireReservations
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRY
        BEGIN TRANSACTION;
        EXEC dbo.usp_InternalLock;
        DECLARE @Now datetime2(7) = SYSUTCDATETIME();
        EXEC dbo.usp_InternalExpireReservations @Now;
        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO

-- D. TRA CỨU KHẢ DỤNG: chỉ là ảnh chụp; lệnh đặt sẽ kiểm tra lại trong transaction.
CREATE OR ALTER PROCEDURE dbo.usp_GetAvailability
    @ActorId int, @VehicleId int, @ParkingLotId int,
    @StartUtc datetime2(7), @EndUtc datetime2(7)
AS
BEGIN
    SET NOCOUNT ON;
    EXEC dbo.usp_InternalAssertActor @ActorId, 'Customer';
    DECLARE @Now datetime2(7) = SYSUTCDATETIME(), @Type varchar(12), @Plate varchar(32);
    IF @StartUtc IS NULL OR @EndUtc IS NULL OR @StartUtc < @Now OR @StartUtc > DATEADD(DAY,7,@Now)
        OR @EndUtc < DATEADD(MINUTE,30,@StartUtc) OR @EndUtc > DATEADD(HOUR,24,@StartUtc)
        THROW 51000, N'Giờ đặt không hợp lệ (UTC, 30 phút–24 giờ, trong 7 ngày).', 1;
    SELECT @Type = vehicle_type,@Plate = normalized_plate_number FROM dbo.Vehicle
    WHERE id = @VehicleId AND user_id = @ActorId AND is_active = 1;
    IF @Type IS NULL THROW 51004, N'Không tìm thấy xe của khách hàng.', 1;
    SELECT i.* FROM dbo.vw_SlotInventory i
    WHERE i.parking_lot_id = @ParkingLotId AND i.slot_is_active = 1 AND i.zone_is_active = 1 AND i.lot_is_active = 1
      AND i.vehicle_type = @Type AND i.accepts_reservations = 1 AND i.operational_status = 'AVAILABLE'
      AND (i.buffer_until IS NULL OR @StartUtc >= i.buffer_until)
      AND NOT EXISTS (SELECT 1 FROM dbo.ParkingSession ps WHERE ps.status = 'OPEN'
        AND (ps.slot_id = i.slot_id OR ps.normalized_plate_number_snapshot = @Plate))
      AND NOT EXISTS (SELECT 1 FROM dbo.fn_EffectiveReservations(@Now) r WHERE r.slot_id = i.slot_id
        AND @StartUtc < DATEADD(MINUTE,15,r.end_time) AND r.start_time < DATEADD(MINUTE,15,@EndUtc))
      AND NOT EXISTS (SELECT 1 FROM dbo.fn_EffectiveReservations(@Now) r WHERE r.vehicle_id = @VehicleId
        AND @StartUtc < r.end_time AND r.start_time < @EndUtc)
    ORDER BY i.zone_id,i.code;
END;
GO

-- E. ĐẶT / HỦY / SỰ CỐ.
CREATE OR ALTER PROCEDURE dbo.usp_CreateReservation
    @ActorId int, @VehicleId int, @SlotId int, @StartUtc datetime2(7), @EndUtc datetime2(7), @Key varchar(128)
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    DECLARE @Payload nvarchar(max) = (SELECT @VehicleId AS vehicleId,@SlotId AS slotId,
        @StartUtc AS startTime,@EndUtc AS endTime FOR JSON PATH, INCLUDE_NULL_VALUES, WITHOUT_ARRAY_WRAPPER),
        @Hash binary(32),@Replay nvarchar(max),@Http smallint,@Response nvarchar(max);
    BEGIN TRY
        BEGIN TRANSACTION;
        EXEC dbo.usp_InternalLock;
        EXEC dbo.usp_InternalAssertActor @ActorId,'Customer';
        EXEC dbo.usp_InternalBeginRequest @ActorId,'CREATE_RESERVATION',@Key,@Payload,@Hash OUTPUT,@Replay OUTPUT,@Http OUTPUT;
        IF @Replay IS NOT NULL
        BEGIN
            COMMIT; SELECT @Http AS http_status,@Replay AS response_json,CAST(1 AS bit) AS is_replay; RETURN;
        END;
        DECLARE @Now datetime2(7) = SYSUTCDATETIME(),@Type varchar(12),@Plate nvarchar(32),@Normalized varchar(32),@Id int,
            @Code varchar(40) = CONCAT('RS-',REPLACE(CONVERT(varchar(36),NEWID()),'-',''));
        EXEC dbo.usp_InternalExpireReservations @Now;
        IF @StartUtc IS NULL OR @EndUtc IS NULL OR @StartUtc < @Now OR @StartUtc > DATEADD(DAY,7,@Now)
            OR @EndUtc < DATEADD(MINUTE,30,@StartUtc) OR @EndUtc > DATEADD(HOUR,24,@StartUtc)
            THROW 51000, N'Giờ đặt không hợp lệ (UTC, 30 phút–24 giờ, trong 7 ngày).', 1;
        SELECT @Type = vehicle_type,@Plate = plate_number,@Normalized = normalized_plate_number
        FROM dbo.Vehicle WHERE id = @VehicleId AND user_id = @ActorId AND is_active = 1;
        IF @Type IS NULL THROW 51004, N'Không tìm thấy xe của khách hàng.', 1;
        IF NOT EXISTS (SELECT 1 FROM dbo.vw_SlotInventory WHERE slot_id = @SlotId AND vehicle_type = @Type
            AND slot_is_active = 1 AND zone_is_active = 1 AND lot_is_active = 1
            AND accepts_reservations = 1 AND operational_status = 'AVAILABLE')
            THROW 51009, N'Vị trí không phục vụ đặt chỗ/loại xe này.', 1;
        IF EXISTS (SELECT 1 FROM dbo.ParkingSlot WHERE id = @SlotId AND buffer_until > @StartUtc)
            THROW 51009, N'Khung giờ đặt còn vướng đệm sau xe ra.', 1;
        IF EXISTS (SELECT 1 FROM dbo.ParkingSession WHERE status = 'OPEN'
            AND (slot_id = @SlotId OR normalized_plate_number_snapshot = @Normalized))
            THROW 51009, N'Vị trí hoặc xe đang có lượt gửi OPEN.', 1;
        IF EXISTS (SELECT 1 FROM dbo.Reservation WHERE slot_id = @SlotId AND status = 'CONFIRMED'
            AND @StartUtc < DATEADD(MINUTE,15,end_time) AND start_time < DATEADD(MINUTE,15,@EndUtc))
            THROW 51009, N'Vị trí bị trùng lịch hoặc khoảng đệm.', 1;
        IF EXISTS (SELECT 1 FROM dbo.Reservation WHERE vehicle_id = @VehicleId AND status = 'CONFIRMED'
            AND @StartUtc < end_time AND start_time < @EndUtc)
            THROW 51009, N'Xe đã có lịch đặt chồng thời gian.', 1;
        INSERT dbo.Reservation(reservation_code,user_id,vehicle_id,slot_id,plate_number_snapshot,vehicle_type_snapshot,
            start_time,end_time,expires_at,created_at)
        VALUES (@Code,@ActorId,@VehicleId,@SlotId,@Plate,@Type,@StartUtc,@EndUtc,DATEADD(MINUTE,15,@StartUtc),@Now);
        SET @Id = CONVERT(int,SCOPE_IDENTITY());
        SET @Response = (SELECT @Id AS id,@Code AS reservationCode,'CONFIRMED' AS status FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
        INSERT dbo.AuditLog(actor_user_id,action,entity_type,entity_id,details_json,request_id)
        VALUES (@ActorId,'RESERVATION_CREATED','Reservation',@Id,@Payload,@Key);
        EXEC dbo.usp_InternalSaveRequest @ActorId,'CREATE_RESERVATION',@Key,@Hash,@Id,201,@Response;
        COMMIT; SELECT 201 AS http_status,@Response AS response_json,CAST(0 AS bit) AS is_replay;
    END TRY
    BEGIN CATCH
        IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_CancelReservation @ActorId int,@ReservationId int,@Key varchar(128)
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    DECLARE @Payload nvarchar(max) = (SELECT @ReservationId AS reservationId FOR JSON PATH, WITHOUT_ARRAY_WRAPPER),
        @Hash binary(32),@Replay nvarchar(max),@Http smallint,@Response nvarchar(max);
    BEGIN TRY
        BEGIN TRANSACTION;
        EXEC dbo.usp_InternalLock;
        EXEC dbo.usp_InternalAssertActor @ActorId,'Customer';
        EXEC dbo.usp_InternalBeginRequest @ActorId,'CANCEL_RESERVATION',@Key,@Payload,@Hash OUTPUT,@Replay OUTPUT,@Http OUTPUT;
        IF @Replay IS NOT NULL BEGIN COMMIT; SELECT @Http AS http_status,@Replay AS response_json,CAST(1 AS bit) AS is_replay; RETURN; END;
        DECLARE @Now datetime2(7) = SYSUTCDATETIME();
        IF NOT EXISTS (SELECT 1 FROM dbo.Reservation WHERE id = @ReservationId AND user_id = @ActorId)
            THROW 51004, N'Không tìm thấy lượt đặt của khách hàng.', 1;
        UPDATE dbo.Reservation SET status = 'CANCELLED',cancelled_at = @Now
        WHERE id = @ReservationId AND user_id = @ActorId AND status = 'CONFIRMED' AND @Now < start_time;
        IF @@ROWCOUNT = 0 THROW 51009, N'Chỉ hủy lượt CONFIRMED trước giờ bắt đầu.', 1;
        SET @Response = (SELECT @ReservationId AS id,'CANCELLED' AS status FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
        INSERT dbo.AuditLog(actor_user_id,action,entity_type,entity_id,details_json,request_id)
        VALUES (@ActorId,'RESERVATION_CANCELLED','Reservation',@ReservationId,@Response,@Key);
        EXEC dbo.usp_InternalSaveRequest @ActorId,'CANCEL_RESERVATION',@Key,@Hash,@ReservationId,200,@Response;
        COMMIT; SELECT 200 AS http_status,@Response AS response_json,CAST(0 AS bit) AS is_replay;
    END TRY
    BEGIN CATCH
        IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_ReservationServiceIssue
    @ActorId int,@ReservationId int,@Reason nvarchar(1000),@MarkUnfulfilled bit,@Key varchar(128)
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    DECLARE @Payload nvarchar(max) = (SELECT @ReservationId AS reservationId,@Reason AS reason,@MarkUnfulfilled AS markUnfulfilled
        FOR JSON PATH, INCLUDE_NULL_VALUES, WITHOUT_ARRAY_WRAPPER),@Hash binary(32),@Replay nvarchar(max),@Http smallint,@Response nvarchar(max);
    BEGIN TRY
        BEGIN TRANSACTION;
        EXEC dbo.usp_InternalLock;
        DECLARE @Lot int,@Now datetime2(7),@Issue datetime2(7),@Start datetime2(7),@End datetime2(7),@Expires datetime2(7),@Status varchar(15);
        SELECT @Lot = z.parking_lot_id,@Issue = r.service_issue_at,@Start = r.start_time,@End = r.end_time,@Expires = r.expires_at,@Status = r.status
        FROM dbo.Reservation r JOIN dbo.ParkingSlot s ON s.id = r.slot_id JOIN dbo.Zone z ON z.id = s.zone_id WHERE r.id = @ReservationId;
        IF @Lot IS NULL THROW 51004, N'Không tìm thấy lượt đặt.', 1;
        EXEC dbo.usp_InternalAssertActor @ActorId,'Staff',@Lot;
        EXEC dbo.usp_InternalBeginRequest @ActorId,'RESERVATION_ISSUE',@Key,@Payload,@Hash OUTPUT,@Replay OUTPUT,@Http OUTPUT;
        IF @Replay IS NOT NULL BEGIN COMMIT; SELECT @Http AS http_status,@Replay AS response_json,CAST(1 AS bit) AS is_replay; RETURN; END;
        SET @Now = SYSUTCDATETIME();
        IF @Reason IS NULL OR LEN(LTRIM(RTRIM(@Reason))) = 0 OR @MarkUnfulfilled IS NULL
            THROW 51000, N'Phải có lý do và lựa chọn xử lý sự cố.', 1;
        IF @Status <> 'CONFIRMED' OR @Now < DATEADD(MINUTE,-15,@Start)
            OR (@Issue IS NULL AND @Now >= @Expires)
            OR (@Issue IS NOT NULL AND (@Now >= DATEADD(MINUTE,15,@Issue) OR @Now >= @End))
            THROW 51009, N'Lượt đặt không còn trong thời gian ghi nhận/xử lý sự cố.', 1;
        IF @MarkUnfulfilled = 0 AND @Issue IS NOT NULL
            THROW 51009, N'Sự cố đã được ghi; không được kéo dài deadline.', 1;
        UPDATE dbo.Reservation SET service_issue_at = COALESCE(service_issue_at,@Now),issue_reason = @Reason,
            status = CASE WHEN @MarkUnfulfilled = 1 THEN 'UNFULFILLED' ELSE 'CONFIRMED' END,
            resolved_by_staff_id = CASE WHEN @MarkUnfulfilled = 1 THEN @ActorId ELSE NULL END,
            resolved_at = CASE WHEN @MarkUnfulfilled = 1 THEN @Now ELSE NULL END
        WHERE id = @ReservationId;
        DECLARE @IssueAt datetime2(7)=COALESCE(@Issue,@Now),@Deadline datetime2(7);
        SET @Deadline=CASE WHEN DATEADD(MINUTE,15,@IssueAt)<@End THEN DATEADD(MINUTE,15,@IssueAt) ELSE @End END;
        SET @Response = (SELECT @ReservationId AS id,CASE WHEN @MarkUnfulfilled = 1 THEN 'UNFULFILLED' ELSE 'CONFIRMED' END AS status,
            @IssueAt AS serviceIssueAt,@Deadline AS resolutionDeadline,CASE WHEN @MarkUnfulfilled=1 THEN @Now END AS resolvedAt
            FOR JSON PATH, INCLUDE_NULL_VALUES, WITHOUT_ARRAY_WRAPPER);
        INSERT dbo.AuditLog(actor_user_id,action,entity_type,entity_id,reason,details_json,request_id)
        VALUES (@ActorId,CASE WHEN @MarkUnfulfilled = 1 THEN 'RESERVATION_UNFULFILLED' ELSE 'SERVICE_ISSUE_RECORDED' END,
            'Reservation',@ReservationId,@Reason,@Payload,@Key);
        EXEC dbo.usp_InternalSaveRequest @ActorId,'RESERVATION_ISSUE',@Key,@Hash,@ReservationId,200,@Response;
        COMMIT; SELECT 200 AS http_status,@Response AS response_json,CAST(0 AS bit) AS is_replay;
    END TRY
    BEGIN CATCH
        IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO

-- F. CHECK-IN. Có reservation: bỏ trống Plate/Type/Vehicle; server lấy snapshot.
-- Walk-in: ReservationCode NULL, cần Slot/Plate/Type; VehicleId tùy chọn.
CREATE OR ALTER PROCEDURE dbo.usp_CheckIn
    @ActorId int,@SlotId int,@Key varchar(128),@ReservationCode varchar(40) = NULL,
    @Plate nvarchar(32) = NULL,@VehicleType varchar(12) = NULL,@VehicleId int = NULL,
    @ReplacementReason nvarchar(1000) = NULL,@CustomerAgreed bit = 0
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    DECLARE @Payload nvarchar(max) = (SELECT @SlotId AS slotId,@ReservationCode AS reservationCode,@Plate AS plate,
        @VehicleType AS vehicleType,@VehicleId AS vehicleId,@ReplacementReason AS replacementReason,@CustomerAgreed AS customerAgreed
        FOR JSON PATH, INCLUDE_NULL_VALUES, WITHOUT_ARRAY_WRAPPER),@Hash binary(32),@Replay nvarchar(max),@Http smallint,@Response nvarchar(max);
    BEGIN TRY
        BEGIN TRANSACTION;
        EXEC dbo.usp_InternalLock;
        DECLARE @Lot int,@SlotType varchar(12),@CanReserve bit,@Now datetime2(7),@ReservationId int,@OriginalSlot int,
            @CustomerId int,@Start datetime2(7),@End datetime2(7),@Expires datetime2(7),@Issue datetime2(7),
            @Normalized varchar(32),@PriceId int,@Price decimal(18,0),@Id int,
            @Code varchar(40) = CONCAT('PS-',REPLACE(CONVERT(varchar(36),NEWID()),'-',''));
        SELECT @Lot = z.parking_lot_id,@SlotType = z.vehicle_type,@CanReserve = s.accepts_reservations
        FROM dbo.ParkingSlot s JOIN dbo.Zone z ON z.id = s.zone_id WHERE s.id = @SlotId;
        IF @Lot IS NULL THROW 51004, N'Không tìm thấy vị trí.', 1;
        EXEC dbo.usp_InternalAssertActor @ActorId,'Staff',@Lot;
        EXEC dbo.usp_InternalBeginRequest @ActorId,'CHECK_IN',@Key,@Payload,@Hash OUTPUT,@Replay OUTPUT,@Http OUTPUT;
        IF @Replay IS NOT NULL BEGIN COMMIT; SELECT @Http AS http_status,@Replay AS response_json,CAST(1 AS bit) AS is_replay; RETURN; END;
        SET @Now = SYSUTCDATETIME();
        EXEC dbo.usp_InternalExpireReservations @Now;
        IF NOT EXISTS (SELECT 1 FROM dbo.vw_SlotInventory WHERE slot_id = @SlotId AND slot_is_active = 1
            AND zone_is_active = 1 AND lot_is_active = 1 AND operational_status = 'AVAILABLE'
            AND (buffer_until IS NULL OR buffer_until <= @Now))
            THROW 51009, N'Vị trí chưa phục vụ được, đang bận/bảo trì/còn đệm.', 1;

        IF @ReservationCode IS NOT NULL
        BEGIN
            IF @VehicleId IS NOT NULL OR @Plate IS NOT NULL OR @VehicleType IS NOT NULL
                THROW 51000, N'Check-in đặt trước lấy xe từ reservation, không nhận ghi đè.', 1;
            SELECT @ReservationId = r.id,@OriginalSlot = r.slot_id,@CustomerId = r.user_id,@VehicleId = r.vehicle_id,
                @Plate = r.plate_number_snapshot,@VehicleType = r.vehicle_type_snapshot,@Start = r.start_time,@End = r.end_time,
                @Expires = r.expires_at,@Issue = r.service_issue_at
            FROM dbo.Reservation r JOIN dbo.ParkingSlot os ON os.id = r.slot_id JOIN dbo.Zone oz ON oz.id = os.zone_id
            WHERE r.reservation_code = @ReservationCode AND r.status = 'CONFIRMED' AND oz.parking_lot_id = @Lot;
            IF @ReservationId IS NULL THROW 51009, N'Lượt đặt không còn hiệu lực hoặc thuộc bãi khác.', 1;
            IF @Now < DATEADD(MINUTE,-15,@Start) OR (@Issue IS NULL AND @Now >= @Expires)
                OR (@Issue IS NOT NULL AND (@Now >= DATEADD(MINUTE,15,@Issue) OR @Now >= @End))
                THROW 51009, N'Không nằm trong thời gian check-in hợp lệ.', 1;
            IF NOT EXISTS (SELECT 1 FROM dbo.Users WHERE id = @CustomerId AND role = 'Customer' AND is_active = 1)
                OR NOT EXISTS (SELECT 1 FROM dbo.Vehicle WHERE id = @VehicleId AND user_id = @CustomerId AND is_active = 1)
                THROW 51009, N'Tài khoản hoặc xe đã ngừng hoạt động.', 1;
            IF @CanReserve <> 1 THROW 51009, N'Lượt đặt chỉ dùng nhóm vị trí đặt trước.', 1;
            IF @OriginalSlot <> @SlotId AND (@CustomerAgreed IS NULL OR @CustomerAgreed <> 1
                OR @ReplacementReason IS NULL OR LEN(LTRIM(RTRIM(@ReplacementReason))) = 0)
                THROW 51000, N'Đổi vị trí phải có lý do và đồng ý của khách.', 1;
            IF EXISTS (SELECT 1 FROM dbo.Reservation WHERE slot_id = @SlotId AND status = 'CONFIRMED'
                AND id <> @ReservationId AND @Now < DATEADD(MINUTE,15,end_time) AND start_time < DATEADD(MINUTE,15,@End))
                THROW 51009, N'Vị trí thực tế vướng lịch đặt khác.', 1;
        END
        ELSE
        BEGIN
            IF @CanReserve <> 0 THROW 51009, N'Walk-in chỉ sử dụng nhóm vị trí riêng.', 1;
            IF @VehicleId IS NOT NULL
            BEGIN
                DECLARE @StoredPlate nvarchar(32),@StoredType varchar(12);
                SELECT @StoredPlate = v.plate_number,@StoredType = v.vehicle_type,@CustomerId = v.user_id
                FROM dbo.Vehicle v JOIN dbo.Users u ON u.id = v.user_id
                WHERE v.id = @VehicleId AND v.is_active = 1 AND u.is_active = 1 AND u.role = 'Customer';
                IF @StoredType IS NULL THROW 51004, N'Không tìm thấy phương tiện hoạt động.', 1;
                IF (@Plate IS NOT NULL AND dbo.fn_NormalizePlate(@Plate) <> dbo.fn_NormalizePlate(@StoredPlate))
                    OR (@VehicleType IS NOT NULL AND @VehicleType <> @StoredType)
                    THROW 51009, N'Biển số/loại xe không khớp phương tiện đã đăng ký.', 1;
                SET @Plate = @StoredPlate; SET @VehicleType = @StoredType;
            END;
            -- Không tự gán tài khoản theo biển số của một xe vãng lai.
            SET @Normalized = dbo.fn_NormalizePlate(@Plate);
            IF EXISTS (SELECT 1 FROM dbo.Reservation r JOIN dbo.Vehicle v ON v.id = r.vehicle_id
                WHERE r.status = 'CONFIRMED' AND v.normalized_plate_number = @Normalized)
                THROW 51009, N'Xe có lượt đặt CONFIRMED; xử lý bằng check-in đặt trước.', 1;
        END;
        SET @Normalized = dbo.fn_NormalizePlate(@Plate);
        IF @Plate IS NULL OR @Normalized IS NULL OR LEN(@Normalized) NOT BETWEEN 3 AND 20
            OR @Normalized LIKE '%[^A-Z0-9]%' COLLATE Latin1_General_100_BIN2
            OR @Plate LIKE N'%[^-A-Za-z0-9 .]%' COLLATE Latin1_General_100_BIN2
            OR @VehicleType IS NULL OR @VehicleType NOT IN ('MOTORBIKE','CAR')
            THROW 51000, N'Biển số/loại xe không hợp lệ.', 1;
        IF @VehicleType <> @SlotType THROW 51009, N'Loại xe không phù hợp khu vực.', 1;
        IF EXISTS (SELECT 1 FROM dbo.ParkingSession WHERE status = 'OPEN'
            AND (slot_id = @SlotId OR normalized_plate_number_snapshot = @Normalized))
            THROW 51009, N'Vị trí hoặc biển số đã có phiên OPEN.', 1;
        SELECT @PriceId = id,@Price = price_per_hour FROM dbo.PricingRule WHERE vehicle_type = @VehicleType AND is_active = 1;
        IF @PriceId IS NULL THROW 51009, N'Chưa cấu hình giá hoạt động cho loại xe.', 1;
        INSERT dbo.ParkingSession(session_code,reservation_id,customer_id,vehicle_id,slot_id,plate_number_snapshot,
            normalized_plate_number_snapshot,vehicle_type_snapshot,check_in_staff_id,check_in_time,pricing_rule_id,applied_price_per_hour,created_at)
        VALUES (@Code,@ReservationId,@CustomerId,@VehicleId,@SlotId,@Plate,@Normalized,@VehicleType,@ActorId,@Now,@PriceId,@Price,@Now);
        SET @Id = CONVERT(int,SCOPE_IDENTITY());
        UPDATE dbo.ParkingSlot SET operational_status = 'OCCUPIED' WHERE id = @SlotId;
        IF @ReservationId IS NOT NULL
            UPDATE dbo.Reservation SET status = 'CHECKED_IN',
                resolved_by_staff_id = CASE WHEN service_issue_at IS NOT NULL THEN @ActorId ELSE resolved_by_staff_id END,
                resolved_at = CASE WHEN service_issue_at IS NOT NULL THEN @Now ELSE resolved_at END WHERE id = @ReservationId;
        SET @Response = (SELECT @Id AS id,@Code AS sessionCode,'OPEN' AS status,@Now AS checkInTime,
            @SlotId AS slotId,@Price AS appliedPricePerHour FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
        INSERT dbo.AuditLog(actor_user_id,action,entity_type,entity_id,details_json,request_id)
        VALUES (@ActorId,'CHECK_IN','ParkingSession',@Id,@Response,@Key);
        IF @ReservationId IS NOT NULL AND @OriginalSlot <> @SlotId
        BEGIN
            DECLARE @Swap nvarchar(max) = (SELECT @OriginalSlot AS originalSlotId,@SlotId AS actualSlotId,
                @CustomerId AS agreedByCustomerId,@CustomerAgreed AS customerAgreed,@Id AS sessionId
                FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
            INSERT dbo.AuditLog(actor_user_id,action,entity_type,entity_id,reason,details_json,request_id)
            VALUES (@ActorId,'SLOT_REASSIGNED','Reservation',@ReservationId,@ReplacementReason,@Swap,@Key);
        END;
        EXEC dbo.usp_InternalSaveRequest @ActorId,'CHECK_IN',@Key,@Hash,@Id,201,@Response;
        COMMIT; SELECT 201 AS http_status,@Response AS response_json,CAST(0 AS bit) AS is_replay;
    END TRY
    BEGIN CATCH
        IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO

-- G. XEM PHÍ / THU TIỀN + CHECK-OUT (không có INSERT Payment độc lập).
CREATE OR ALTER PROCEDURE dbo.usp_GetSessionFee @ActorId int,@SessionId int
AS
BEGIN
    SET NOCOUNT ON;
    EXEC dbo.usp_InternalAssertActor @ActorId;
    IF NOT EXISTS (SELECT 1 FROM dbo.vw_SessionDetails d JOIN dbo.Users u ON u.id = @ActorId
        WHERE d.id = @SessionId AND (u.role = 'Admin'
            OR (u.role = 'Customer' AND d.customer_id = @ActorId)
            OR (u.role = 'Staff' AND u.assigned_parking_lot_id = d.parking_lot_id)))
        THROW 51004, N'Không tìm thấy phiên trong phạm vi được phép.', 1;
    DECLARE @Now datetime2(7) = SYSUTCDATETIME();
    SELECT d.id,d.session_code,d.status,d.check_in_time,d.check_out_time,d.applied_price_per_hour,
        CASE WHEN d.status = 'OPEN' THEN dbo.fn_BillableHours(d.check_in_time,@Now) ELSE d.billable_hours END AS billable_hours,
        CASE WHEN d.status = 'OPEN' THEN dbo.fn_BillableHours(d.check_in_time,@Now) * d.applied_price_per_hour ELSE d.total_fee END AS amount,
        @Now AS calculated_at,CAST(CASE WHEN d.status = 'OPEN' THEN 1 ELSE 0 END AS bit) AS is_estimate
    FROM dbo.vw_SessionDetails d WHERE d.id = @SessionId;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_CheckOut
    @ActorId int,@SessionId int,@PaymentMethod varchar(12),@ConfirmedAmount decimal(18,0),@Key varchar(128)
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    DECLARE @Payload nvarchar(max) = (SELECT @SessionId AS sessionId,@PaymentMethod AS paymentMethod,@ConfirmedAmount AS confirmedAmount
        FOR JSON PATH, INCLUDE_NULL_VALUES, WITHOUT_ARRAY_WRAPPER),@Hash binary(32),@Replay nvarchar(max),@Http smallint,@Response nvarchar(max);
    BEGIN TRY
        BEGIN TRANSACTION;
        EXEC dbo.usp_InternalLock;
        DECLARE @Lot int,@Slot int,@Reservation int,@In datetime2(7),@Now datetime2(7),@Price decimal(18,0),
            @Fee decimal(18,0),@Hours int,@Status varchar(12),@PaymentId int;
        SELECT @Lot = z.parking_lot_id,@Slot = ps.slot_id,@Reservation = ps.reservation_id,
            @In = ps.check_in_time,@Price = ps.applied_price_per_hour,@Status = ps.status
        FROM dbo.ParkingSession ps JOIN dbo.ParkingSlot s ON s.id = ps.slot_id JOIN dbo.Zone z ON z.id = s.zone_id WHERE ps.id = @SessionId;
        IF @Lot IS NULL THROW 51004, N'Không tìm thấy lượt gửi.', 1;
        EXEC dbo.usp_InternalAssertActor @ActorId,'Staff',@Lot;
        EXEC dbo.usp_InternalBeginRequest @ActorId,'CHECK_OUT',@Key,@Payload,@Hash OUTPUT,@Replay OUTPUT,@Http OUTPUT;
        IF @Replay IS NOT NULL BEGIN COMMIT; SELECT @Http AS http_status,@Replay AS response_json,CAST(1 AS bit) AS is_replay; RETURN; END;
        IF @Status <> 'OPEN' THROW 51009, N'Phiên đã kết thúc; không được thu thêm.', 1;
        IF @PaymentMethod IS NULL OR @PaymentMethod NOT IN ('CASH','SIMULATED') OR @ConfirmedAmount IS NULL OR @ConfirmedAmount <= 0
            THROW 51000, N'Phương thức/số tiền xác nhận không hợp lệ.', 1;
        SET @Now = SYSUTCDATETIME();
        SET @Hours = dbo.fn_BillableHours(@In,@Now);
        IF @Hours IS NULL THROW 51009, N'Giờ server không hợp lệ so với giờ vào.', 1;
        SET @Fee = @Hours * @Price;
        IF @ConfirmedAmount <> @Fee THROW 51009, N'Phí đã thay đổi; xem lại phí trước khi xác nhận thu tiền.', 1;
        UPDATE dbo.ParkingSession SET status = 'COMPLETED',check_out_time = @Now,check_out_staff_id = @ActorId,
            billable_hours = @Hours,total_fee = @Fee WHERE id = @SessionId;
        INSERT dbo.Payment(session_id,amount,method,status,paid_at,confirmed_by_staff_id)
        VALUES (@SessionId,@Fee,@PaymentMethod,'PAID',@Now,@ActorId);
        SET @PaymentId = CONVERT(int,SCOPE_IDENTITY());
        IF @Reservation IS NOT NULL UPDATE dbo.Reservation SET status = 'COMPLETED' WHERE id = @Reservation AND status = 'CHECKED_IN';
        UPDATE dbo.ParkingSlot SET operational_status = 'AVAILABLE',buffer_until = DATEADD(MINUTE,15,@Now) WHERE id = @Slot;
        SET @Response = (SELECT @SessionId AS id,'COMPLETED' AS status,@PaymentId AS paymentId,@Fee AS amount,
            @Hours AS billableHours,@Now AS checkOutTime,DATEADD(MINUTE,15,@Now) AS bufferUntil
            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
        INSERT dbo.AuditLog(actor_user_id,action,entity_type,entity_id,details_json,request_id)
        VALUES (@ActorId,'CHECK_OUT_PAID','ParkingSession',@SessionId,@Response,@Key);
        EXEC dbo.usp_InternalSaveRequest @ActorId,'CHECK_OUT',@Key,@Hash,@SessionId,200,@Response;
        COMMIT; SELECT 200 AS http_status,@Response AS response_json,CAST(0 AS bit) AS is_replay;
    END TRY
    BEGIN CATCH
        IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO

-- H. SỬA LỖI BIỂN SỐ WALK-IN TRONG 5 PHÚT / BẢO TRÌ.
CREATE OR ALTER PROCEDURE dbo.usp_CorrectWalkInPlate
    @ActorId int,@SessionId int,@Plate nvarchar(32),@Reason nvarchar(1000),@Key varchar(128)
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    DECLARE @Payload nvarchar(max) = (SELECT @SessionId AS sessionId,@Plate AS plate,@Reason AS reason
        FOR JSON PATH, INCLUDE_NULL_VALUES, WITHOUT_ARRAY_WRAPPER),@Hash binary(32),@Replay nvarchar(max),@Http smallint,@Response nvarchar(max);
    BEGIN TRY
        BEGIN TRANSACTION;
        EXEC dbo.usp_InternalLock;
        DECLARE @Lot int,@OldPlate nvarchar(32),@Now datetime2(7),@Normalized varchar(32) = dbo.fn_NormalizePlate(@Plate);
        SELECT @Lot = parking_lot_id,@OldPlate = plate_number_snapshot FROM dbo.vw_SessionDetails WHERE id = @SessionId;
        IF @Lot IS NULL THROW 51004, N'Không tìm thấy phiên.', 1;
        EXEC dbo.usp_InternalAssertActor @ActorId,'Staff',@Lot;
        EXEC dbo.usp_InternalBeginRequest @ActorId,'CORRECT_PLATE',@Key,@Payload,@Hash OUTPUT,@Replay OUTPUT,@Http OUTPUT;
        IF @Replay IS NOT NULL BEGIN COMMIT; SELECT @Http AS http_status,@Replay AS response_json,CAST(1 AS bit) AS is_replay; RETURN; END;
        SET @Now = SYSUTCDATETIME();
        IF @Reason IS NULL OR LEN(LTRIM(RTRIM(@Reason))) = 0 OR @Normalized IS NULL OR LEN(@Normalized) NOT BETWEEN 3 AND 20
            OR @Normalized LIKE '%[^A-Z0-9]%' COLLATE Latin1_General_100_BIN2
            OR @Plate LIKE N'%[^-A-Za-z0-9 .]%' COLLATE Latin1_General_100_BIN2
            THROW 51000, N'Biển số hoặc lý do sửa không hợp lệ.', 1;
        IF NOT EXISTS (SELECT 1 FROM dbo.ParkingSession WHERE id = @SessionId AND status = 'OPEN'
            AND reservation_id IS NULL AND @Now <= DATEADD(MINUTE,5,check_in_time))
            THROW 51009, N'Chỉ sửa walk-in OPEN trong 5 phút đầu.', 1;
        IF EXISTS (SELECT 1 FROM dbo.ParkingSession WHERE status = 'OPEN' AND id <> @SessionId
            AND normalized_plate_number_snapshot = @Normalized)
            THROW 51009, N'Biển số đã có phiên OPEN khác.', 1;
        IF EXISTS (SELECT 1 FROM dbo.ParkingSession ps JOIN dbo.Vehicle v ON v.id = ps.vehicle_id
            WHERE ps.id = @SessionId AND v.normalized_plate_number <> @Normalized)
            THROW 51009, N'Không đổi sang xe khác trong phiên đã gắn phương tiện đăng ký.', 1;
        IF EXISTS (SELECT 1 FROM dbo.fn_EffectiveReservations(@Now) r JOIN dbo.Vehicle v ON v.id = r.vehicle_id
            WHERE v.normalized_plate_number = @Normalized)
            THROW 51009, N'Biển số có lịch CONFIRMED; cần đối chiếu lại xe.', 1;
        -- Sửa snapshot, không chuyển quyền sở hữu phiên sang một tài khoản khác.
        UPDATE dbo.ParkingSession SET plate_number_snapshot = LTRIM(RTRIM(@Plate)),normalized_plate_number_snapshot = @Normalized
        WHERE id = @SessionId;
        SET @Response = (SELECT @SessionId AS id,@OldPlate AS oldPlate,@Plate AS newPlate FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
        INSERT dbo.AuditLog(actor_user_id,action,entity_type,entity_id,reason,details_json,request_id)
        VALUES (@ActorId,'PLATE_CORRECTED','ParkingSession',@SessionId,@Reason,@Response,@Key);
        EXEC dbo.usp_InternalSaveRequest @ActorId,'CORRECT_PLATE',@Key,@Hash,@SessionId,200,@Response;
        COMMIT; SELECT 200 AS http_status,@Response AS response_json,CAST(0 AS bit) AS is_replay;
    END TRY
    BEGIN CATCH
        IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_SetSlotMaintenance
    @ActorId int,@SlotId int,@IsMaintenance bit,@Reason nvarchar(1000),@Key varchar(128)
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    DECLARE @Payload nvarchar(max) = (SELECT @SlotId AS slotId,@IsMaintenance AS isMaintenance,@Reason AS reason
        FOR JSON PATH, INCLUDE_NULL_VALUES, WITHOUT_ARRAY_WRAPPER),@Hash binary(32),@Replay nvarchar(max),@Http smallint,@Response nvarchar(max);
    BEGIN TRY
        BEGIN TRANSACTION;
        EXEC dbo.usp_InternalLock;
        DECLARE @Lot int,@Role varchar(20);
        SELECT @Lot = z.parking_lot_id FROM dbo.ParkingSlot s JOIN dbo.Zone z ON z.id = s.zone_id WHERE s.id = @SlotId;
        IF @Lot IS NULL THROW 51004, N'Không tìm thấy vị trí.', 1;
        EXEC dbo.usp_InternalAssertActor @ActorId;
        SELECT @Role = role FROM dbo.Users WHERE id = @ActorId;
        IF @Role = 'Staff' EXEC dbo.usp_InternalAssertActor @ActorId,'Staff',@Lot;
        ELSE IF @Role <> 'Admin' THROW 51001, N'Chỉ Admin/Staff được cập nhật bảo trì.', 1;
        EXEC dbo.usp_InternalBeginRequest @ActorId,'SET_MAINTENANCE',@Key,@Payload,@Hash OUTPUT,@Replay OUTPUT,@Http OUTPUT;
        IF @Replay IS NOT NULL BEGIN COMMIT; SELECT @Http AS http_status,@Replay AS response_json,CAST(1 AS bit) AS is_replay; RETURN; END;
        IF @IsMaintenance IS NULL OR @Reason IS NULL OR LEN(LTRIM(RTRIM(@Reason))) = 0
            THROW 51000, N'Phải có trạng thái và lý do bảo trì/mở lại.', 1;
        IF EXISTS (SELECT 1 FROM dbo.ParkingSession WHERE slot_id = @SlotId AND status = 'OPEN')
            THROW 51009, N'Không thể thay đổi bảo trì khi có xe OPEN.', 1;
        UPDATE dbo.ParkingSlot SET operational_status = CASE WHEN @IsMaintenance = 1 THEN 'MAINTENANCE' ELSE 'AVAILABLE' END WHERE id = @SlotId;
        -- Không xóa reservation tương lai; không xóa/kéo dài buffer_until.
        SET @Response = (SELECT @SlotId AS id,CASE WHEN @IsMaintenance = 1 THEN 'MAINTENANCE' ELSE 'AVAILABLE' END AS operationalStatus
            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
        INSERT dbo.AuditLog(actor_user_id,action,entity_type,entity_id,reason,details_json,request_id)
        VALUES (@ActorId,'MAINTENANCE_CHANGED','ParkingSlot',@SlotId,@Reason,@Response,@Key);
        EXEC dbo.usp_InternalSaveRequest @ActorId,'SET_MAINTENANCE',@Key,@Hash,@SlotId,200,@Response;
        COMMIT; SELECT 200 AS http_status,@Response AS response_json,CAST(0 AS bit) AS is_replay;
    END TRY
    BEGIN CATCH
        IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO

-- I. TÀI KHOẢN / PHƯƠNG TIỆN. PasswordHash do backend sinh, không nhận từ client.
CREATE OR ALTER PROCEDURE dbo.usp_RegisterCustomer
    @Name nvarchar(100),@Email nvarchar(256),@PasswordHash nvarchar(512),@Phone varchar(20) = NULL
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRY
        BEGIN TRANSACTION;
        EXEC dbo.usp_InternalLock;
        DECLARE @NormalizedEmail nvarchar(256) = LOWER(LTRIM(RTRIM(@Email))),@Id int,@Response nvarchar(max);
        IF @Name IS NULL OR LEN(LTRIM(RTRIM(@Name))) = 0 OR @NormalizedEmail IS NULL
            OR @NormalizedEmail NOT LIKE N'%_@_%._%' OR @PasswordHash IS NULL OR LEN(@PasswordHash) < 50
            THROW 51000, N'Tên, email hoặc hash mật khẩu không hợp lệ.', 1;
        IF EXISTS (SELECT 1 FROM dbo.Users WHERE normalized_email = @NormalizedEmail)
            THROW 51009, N'Email đã được đăng ký.', 1;
        INSERT dbo.Users(name,normalized_email,password_hash,phone,role)
        VALUES (LTRIM(RTRIM(@Name)),@NormalizedEmail,@PasswordHash,@Phone,'Customer');
        SET @Id = CONVERT(int,SCOPE_IDENTITY());
        SET @Response = (SELECT @Id AS id,@NormalizedEmail AS email,'Customer' AS role FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
        INSERT dbo.AuditLog(actor_user_id,action,entity_type,entity_id,details_json)
        VALUES (@Id,'CUSTOMER_REGISTERED','Users',@Id,@Response);
        COMMIT; SELECT 201 AS http_status,@Response AS response_json,CAST(0 AS bit) AS is_replay;
        -- Đăng ký chưa có actor: email unique chống tạo trùng; không phát token trong SQL.
    END TRY
    BEGIN CATCH
        IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_GetLoginUser @Email nvarchar(256)
AS
BEGIN
    SET NOCOUNT ON;
    -- Chỉ backend được đọc hash để VerifyHashedPassword; tuyệt đối không trả hash ra API.
    SELECT id,name,normalized_email,password_hash,phone,role,is_active,assigned_parking_lot_id
    FROM dbo.Users WHERE normalized_email = LOWER(LTRIM(RTRIM(@Email)));
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_GetUserProfile @ActorId int
AS
BEGIN
    SET NOCOUNT ON;
    EXEC dbo.usp_InternalAssertActor @ActorId;
    SELECT id,name,normalized_email,phone,role,is_active,assigned_parking_lot_id,created_at
    FROM dbo.Users WHERE id = @ActorId;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_SaveVehicle
    @ActorId int,@VehicleId int,@Plate nvarchar(32),@VehicleType varchar(12),@IsActive bit,@Key varchar(128)
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    -- VehicleId NULL tạo mới; có id cập nhật đúng xe của Customer.
    DECLARE @Payload nvarchar(max) = (SELECT @VehicleId AS vehicleId,@Plate AS plate,@VehicleType AS vehicleType,@IsActive AS isActive
        FOR JSON PATH, INCLUDE_NULL_VALUES, WITHOUT_ARRAY_WRAPPER),@Hash binary(32),@Replay nvarchar(max),@Http smallint,@Response nvarchar(max);
    BEGIN TRY
        BEGIN TRANSACTION;
        EXEC dbo.usp_InternalLock;
        EXEC dbo.usp_InternalAssertActor @ActorId,'Customer';
        EXEC dbo.usp_InternalBeginRequest @ActorId,'SAVE_VEHICLE',@Key,@Payload,@Hash OUTPUT,@Replay OUTPUT,@Http OUTPUT;
        IF @Replay IS NOT NULL BEGIN COMMIT; SELECT @Http AS http_status,@Replay AS response_json,CAST(1 AS bit) AS is_replay; RETURN; END;
        DECLARE @Normalized varchar(32) = dbo.fn_NormalizePlate(@Plate),@Now datetime2(7) = SYSUTCDATETIME(),@OldNormalized varchar(32);
        EXEC dbo.usp_InternalExpireReservations @Now;
        IF @Plate IS NULL OR @Normalized IS NULL OR LEN(@Normalized) NOT BETWEEN 3 AND 20
            OR @Normalized LIKE '%[^A-Z0-9]%' COLLATE Latin1_General_100_BIN2
            OR @Plate LIKE N'%[^-A-Za-z0-9 .]%' COLLATE Latin1_General_100_BIN2
            OR @VehicleType IS NULL OR @VehicleType NOT IN ('MOTORBIKE','CAR') OR @IsActive IS NULL
            THROW 51000, N'Biển số, loại xe hoặc trạng thái không hợp lệ.', 1;
        IF @VehicleId IS NOT NULL
        BEGIN
            SELECT @OldNormalized = normalized_plate_number FROM dbo.Vehicle WHERE id = @VehicleId AND user_id = @ActorId;
            IF @OldNormalized IS NULL THROW 51004, N'Không tìm thấy xe của khách hàng.', 1;
            IF EXISTS (SELECT 1 FROM dbo.Reservation WHERE vehicle_id = @VehicleId AND status = 'CONFIRMED')
                OR EXISTS (SELECT 1 FROM dbo.ParkingSession WHERE status = 'OPEN'
                    AND (vehicle_id = @VehicleId OR normalized_plate_number_snapshot = @OldNormalized))
                THROW 51009, N'Không sửa/ngừng xe khi còn lịch đặt hoặc đang gửi.', 1;
        END;
        IF EXISTS (SELECT 1 FROM dbo.Vehicle WHERE normalized_plate_number = @Normalized AND (@VehicleId IS NULL OR id <> @VehicleId))
            THROW 51009, N'Biển số đã được đăng ký.', 1;
        IF EXISTS (SELECT 1 FROM dbo.ParkingSession WHERE status = 'OPEN' AND normalized_plate_number_snapshot = @Normalized)
            THROW 51009, N'Biển số đang gửi trong một phiên OPEN.', 1;
        IF @VehicleId IS NULL
        BEGIN
            INSERT dbo.Vehicle(user_id,plate_number,normalized_plate_number,vehicle_type,is_active)
            VALUES (@ActorId,LTRIM(RTRIM(@Plate)),@Normalized,@VehicleType,@IsActive);
            SET @VehicleId = CONVERT(int,SCOPE_IDENTITY());
        END
        ELSE UPDATE dbo.Vehicle SET plate_number = LTRIM(RTRIM(@Plate)),normalized_plate_number = @Normalized,
            vehicle_type = @VehicleType,is_active = @IsActive WHERE id = @VehicleId;
        SET @Response = (SELECT @VehicleId AS id,@Plate AS plate,@VehicleType AS vehicleType,@IsActive AS isActive FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
        INSERT dbo.AuditLog(actor_user_id,action,entity_type,entity_id,details_json,request_id)
        VALUES (@ActorId,'VEHICLE_SAVED','Vehicle',@VehicleId,@Response,@Key);
        EXEC dbo.usp_InternalSaveRequest @ActorId,'SAVE_VEHICLE',@Key,@Hash,@VehicleId,200,@Response;
        COMMIT; SELECT 200 AS http_status,@Response AS response_json,CAST(0 AS bit) AS is_replay;
    END TRY
    BEGIN CATCH
        IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_AdminSaveUser
    @ActorId int,@UserId int,@Name nvarchar(100),@Email nvarchar(256),@Role varchar(20),@AssignedLotId int,
    @IsActive bit,@Reason nvarchar(1000),@Key varchar(128),@Phone varchar(20) = NULL,@PasswordHash nvarchar(512) = NULL,
    @PasswordRequestFingerprint binary(32) = NULL
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    -- Backend cung cấp fingerprint PBKDF2 theo ActorId/Key khi tạo user để hash Identity
    -- có salt ngẫu nhiên vẫn replay được. Không lưu mật khẩu/hash Identity trong audit/request.
    -- Caller SQL cũ không truyền tham số mới vẫn đối chiếu hash như trước.
    DECLARE @PasswordFingerprint varchar(64) = COALESCE(CONVERT(varchar(64),@PasswordRequestFingerprint,2),
        CONVERT(varchar(64),HASHBYTES('SHA2_256',CONVERT(varbinary(max),@PasswordHash)),2));
    DECLARE @Payload nvarchar(max) = (SELECT @UserId AS userId,@Name AS name,@Email AS email,@Role AS role,@AssignedLotId AS assignedLotId,
        @IsActive AS isActive,@Phone AS phone,@Reason AS reason,@PasswordFingerprint AS passwordFingerprint
        FOR JSON PATH, INCLUDE_NULL_VALUES, WITHOUT_ARRAY_WRAPPER),@Hash binary(32),@Replay nvarchar(max),@Http smallint,@Response nvarchar(max);
    BEGIN TRY
        BEGIN TRANSACTION;
        EXEC dbo.usp_InternalLock;
        EXEC dbo.usp_InternalAssertActor @ActorId,'Admin';
        EXEC dbo.usp_InternalBeginRequest @ActorId,'ADMIN_SAVE_USER',@Key,@Payload,@Hash OUTPUT,@Replay OUTPUT,@Http OUTPUT;
        IF @Replay IS NOT NULL BEGIN COMMIT; SELECT @Http AS http_status,@Replay AS response_json,CAST(1 AS bit) AS is_replay; RETURN; END;
        DECLARE @NormalizedEmail nvarchar(256) = LOWER(LTRIM(RTRIM(@Email))),@OldRole varchar(20),@OldLot int,@Now datetime2(7) = SYSUTCDATETIME();
        EXEC dbo.usp_InternalExpireReservations @Now;
        IF @Name IS NULL OR LEN(LTRIM(RTRIM(@Name))) = 0 OR @NormalizedEmail IS NULL OR @NormalizedEmail NOT LIKE N'%_@_%._%'
            OR @Role IS NULL OR @Role NOT IN ('Customer','Staff','Admin') OR @IsActive IS NULL
            OR @Reason IS NULL OR LEN(LTRIM(RTRIM(@Reason))) = 0
            OR (@PasswordHash IS NOT NULL AND LEN(@PasswordHash) < 50)
            OR (@Role = 'Staff' AND @AssignedLotId IS NULL) OR (@Role <> 'Staff' AND @AssignedLotId IS NOT NULL)
            THROW 51000, N'Thông tin tài khoản/phân công/lý do không hợp lệ.', 1;
        IF @UserId IS NOT NULL
        BEGIN
            SELECT @OldRole = role,@OldLot = assigned_parking_lot_id FROM dbo.Users WHERE id = @UserId;
            IF @OldRole IS NULL THROW 51004, N'Không tìm thấy tài khoản.', 1;
        END;
        IF @Role = 'Staff' AND NOT EXISTS (SELECT 1 FROM dbo.ParkingLot WHERE id = @AssignedLotId AND is_active = 1)
            AND NOT (@UserId IS NOT NULL AND @IsActive=0 AND EXISTS
                (SELECT 1 FROM dbo.Users WHERE id=@UserId AND role='Staff' AND assigned_parking_lot_id=@AssignedLotId))
            THROW 51009, N'Bãi phân công không hoạt động.', 1;
        IF EXISTS (SELECT 1 FROM dbo.Users WHERE normalized_email = @NormalizedEmail AND (@UserId IS NULL OR id <> @UserId))
            THROW 51009, N'Email đã tồn tại.', 1;
        IF @UserId IS NOT NULL
        BEGIN
            IF @OldRole = 'Admin' AND (@Role <> 'Admin' OR @IsActive = 0)
                AND NOT EXISTS (SELECT 1 FROM dbo.Users WHERE role = 'Admin' AND is_active = 1 AND id <> @UserId)
                THROW 51009, N'Phải còn ít nhất một Admin hoạt động.', 1;
            IF @OldRole = 'Customer' AND @Role <> 'Customer'
                AND (EXISTS (SELECT 1 FROM dbo.Reservation WHERE user_id = @UserId AND status = 'CONFIRMED')
                    OR EXISTS (SELECT 1 FROM dbo.ParkingSession WHERE customer_id = @UserId AND status = 'OPEN'))
                THROW 51009, N'Chưa đổi vai trò Customer khi còn giao dịch đang xử lý.', 1;
            UPDATE dbo.Users SET name = LTRIM(RTRIM(@Name)),normalized_email = @NormalizedEmail,phone = @Phone,role = @Role,
                assigned_parking_lot_id = @AssignedLotId,is_active = @IsActive,password_hash = COALESCE(@PasswordHash,password_hash) WHERE id = @UserId;
        END
        ELSE
        BEGIN
            IF @PasswordHash IS NULL THROW 51000, N'Tài khoản mới cần hash mật khẩu từ backend.', 1;
            INSERT dbo.Users(name,normalized_email,password_hash,phone,role,is_active,assigned_parking_lot_id)
            VALUES (LTRIM(RTRIM(@Name)),@NormalizedEmail,@PasswordHash,@Phone,@Role,@IsActive,@AssignedLotId);
            SET @UserId = CONVERT(int,SCOPE_IDENTITY());
        END;
        SET @Response = (SELECT @UserId AS id,@NormalizedEmail AS email,@OldRole AS oldRole,@Role AS role,
            @OldLot AS oldAssignedLotId,@AssignedLotId AS assignedLotId,@IsActive AS isActive
            FOR JSON PATH, INCLUDE_NULL_VALUES, WITHOUT_ARRAY_WRAPPER);
        INSERT dbo.AuditLog(actor_user_id,action,entity_type,entity_id,reason,details_json,request_id)
        VALUES (@ActorId,'USER_ROLE_ASSIGNMENT_SAVED','Users',@UserId,@Reason,@Response,@Key);
        EXEC dbo.usp_InternalSaveRequest @ActorId,'ADMIN_SAVE_USER',@Key,@Hash,@UserId,200,@Response;
        COMMIT; SELECT 200 AS http_status,@Response AS response_json,CAST(0 AS bit) AS is_replay;
    END TRY
    BEGIN CATCH
        IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO

-- J. CẤU HÌNH BÃI / KHU / SLOT. Entity = ParkingLot | Zone | ParkingSlot.
-- Id NULL tạo mới; Id có giá trị cập nhật. Không chuyển Zone sang bãi khác hoặc Slot sang Zone khác.
CREATE OR ALTER PROCEDURE dbo.usp_AdminSaveParkingConfig
    @ActorId int,@Entity varchar(20),@Id int,@Name nvarchar(150),@IsActive bit,@Key varchar(128),
    @ParentId int = NULL,@Address nvarchar(500) = NULL,@FloorLabel nvarchar(50) = NULL,
    @VehicleType varchar(12) = NULL,@AcceptsReservations bit = NULL,@Reason nvarchar(1000) = NULL
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    DECLARE @Payload nvarchar(max) = (SELECT @Entity AS entity,@Id AS id,@Name AS name,@IsActive AS isActive,
        @ParentId AS parentId,@Address AS address,@FloorLabel AS floorLabel,@VehicleType AS vehicleType,
        @AcceptsReservations AS acceptsReservations,@Reason AS reason
        FOR JSON PATH, INCLUDE_NULL_VALUES, WITHOUT_ARRAY_WRAPPER),@Hash binary(32),@Replay nvarchar(max),@Http smallint,@Response nvarchar(max);
    BEGIN TRY
        BEGIN TRANSACTION;
        EXEC dbo.usp_InternalLock;
        EXEC dbo.usp_InternalAssertActor @ActorId,'Admin';
        EXEC dbo.usp_InternalBeginRequest @ActorId,'ADMIN_SAVE_CONFIG',@Key,@Payload,@Hash OUTPUT,@Replay OUTPUT,@Http OUTPUT;
        IF @Replay IS NOT NULL BEGIN COMMIT; SELECT @Http AS http_status,@Replay AS response_json,CAST(1 AS bit) AS is_replay; RETURN; END;
        DECLARE @Now datetime2(7) = SYSUTCDATETIME(),@OldType varchar(12),@OldGroup bit,@OldParent int;
        EXEC dbo.usp_InternalExpireReservations @Now;
        IF @Entity IS NULL OR @Entity NOT IN ('ParkingLot','Zone','ParkingSlot') OR @Name IS NULL
            OR LEN(LTRIM(RTRIM(@Name))) = 0 OR @IsActive IS NULL OR @Reason IS NULL OR LEN(LTRIM(RTRIM(@Reason))) = 0
            THROW 51000, N'Loại cấu hình, tên, trạng thái hoặc lý do không hợp lệ.', 1;
        IF @Id IS NOT NULL AND (
            (@Entity = 'ParkingLot' AND NOT EXISTS (SELECT 1 FROM dbo.ParkingLot WHERE id = @Id))
            OR (@Entity = 'Zone' AND NOT EXISTS (SELECT 1 FROM dbo.Zone WHERE id = @Id))
            OR (@Entity = 'ParkingSlot' AND NOT EXISTS (SELECT 1 FROM dbo.ParkingSlot WHERE id = @Id)))
            THROW 51004, N'Không tìm thấy cấu hình cần sửa.', 1;
        DECLARE @RelatedSlots TABLE(id int PRIMARY KEY);
        IF @Entity = 'ParkingLot' INSERT @RelatedSlots SELECT s.id FROM dbo.ParkingSlot s JOIN dbo.Zone z ON z.id = s.zone_id WHERE z.parking_lot_id = @Id;
        IF @Entity = 'Zone' INSERT @RelatedSlots SELECT id FROM dbo.ParkingSlot WHERE zone_id = @Id;
        IF @Entity = 'ParkingSlot' AND @Id IS NOT NULL INSERT @RelatedSlots VALUES (@Id);
        IF @IsActive = 0 AND (EXISTS (SELECT 1 FROM dbo.ParkingSession ps JOIN @RelatedSlots x ON x.id = ps.slot_id WHERE ps.status = 'OPEN')
            OR EXISTS (SELECT 1 FROM dbo.Reservation r JOIN @RelatedSlots x ON x.id = r.slot_id WHERE r.status = 'CONFIRMED'))
            THROW 51009, N'Không ngừng cấu hình khi còn phiên OPEN/lịch CONFIRMED.', 1;
        IF @Entity = 'ParkingLot'
        BEGIN
            IF @Address IS NULL OR LEN(LTRIM(RTRIM(@Address))) = 0 THROW 51000, N'Bãi cần địa chỉ.', 1;
            IF @Id IS NULL
            BEGIN
                INSERT dbo.ParkingLot(name,address,is_active) VALUES (LTRIM(RTRIM(@Name)),LTRIM(RTRIM(@Address)),@IsActive);
                SET @Id = CONVERT(int,SCOPE_IDENTITY());
            END
            ELSE UPDATE dbo.ParkingLot SET name = LTRIM(RTRIM(@Name)),address = LTRIM(RTRIM(@Address)),is_active = @IsActive WHERE id = @Id;
        END
        ELSE IF @Entity = 'Zone'
        BEGIN
            IF LEN(@Name) > 100 OR @VehicleType IS NULL OR @VehicleType NOT IN ('MOTORBIKE','CAR')
                THROW 51000, N'Tên khu tối đa 100 ký tự và phải có loại xe hợp lệ.', 1;
            IF @ParentId IS NULL OR NOT EXISTS (SELECT 1 FROM dbo.ParkingLot WHERE id = @ParentId AND is_active = 1)
                THROW 51009, N'Bãi cha không hoạt động.', 1;
            SELECT @OldType = vehicle_type,@OldParent = parking_lot_id FROM dbo.Zone WHERE id = @Id;
            IF @OldParent IS NOT NULL AND @OldParent <> @ParentId THROW 51009, N'Không chuyển khu vực sang bãi khác; hãy tạo khu mới.', 1;
            IF @OldType <> @VehicleType AND (
                EXISTS (SELECT 1 FROM dbo.ParkingSession ps JOIN @RelatedSlots x ON x.id = ps.slot_id WHERE ps.status = 'OPEN')
                OR EXISTS (SELECT 1 FROM dbo.Reservation r JOIN @RelatedSlots x ON x.id = r.slot_id WHERE r.status = 'CONFIRMED'))
                THROW 51009, N'Không đổi loại khu khi còn giao dịch đang xử lý.', 1;
            IF EXISTS (SELECT 1 FROM dbo.Zone WHERE parking_lot_id = @ParentId AND name = @Name AND (@Id IS NULL OR id <> @Id))
                THROW 51009, N'Tên khu đã tồn tại trong bãi.', 1;
            IF @Id IS NULL
            BEGIN
                INSERT dbo.Zone(parking_lot_id,name,floor_label,vehicle_type,is_active)
                VALUES (@ParentId,LTRIM(RTRIM(@Name)),@FloorLabel,@VehicleType,@IsActive);
                SET @Id = CONVERT(int,SCOPE_IDENTITY());
            END
            ELSE UPDATE dbo.Zone SET name = LTRIM(RTRIM(@Name)),floor_label = @FloorLabel,vehicle_type = @VehicleType,is_active = @IsActive WHERE id = @Id;
        END
        ELSE
        BEGIN
            IF LEN(@Name) > 30 OR @Name LIKE N'%[^-A-Za-z0-9_]%' COLLATE Latin1_General_100_BIN2 OR @AcceptsReservations IS NULL
                THROW 51000, N'Mã slot tối đa 30 ký tự chữ/số/_/- và cần nhóm đặt chỗ.', 1;
            IF @ParentId IS NULL OR NOT EXISTS (SELECT 1 FROM dbo.Zone z JOIN dbo.ParkingLot p ON p.id = z.parking_lot_id
                WHERE z.id = @ParentId AND z.is_active = 1 AND p.is_active = 1)
                THROW 51009, N'Khu vực/bãi cha không hoạt động.', 1;
            SELECT @OldParent = zone_id,@OldGroup = accepts_reservations FROM dbo.ParkingSlot WHERE id = @Id;
            IF @OldParent IS NOT NULL AND @OldParent <> @ParentId THROW 51009, N'Không chuyển slot sang khu khác; hãy tạo slot mới.', 1;
            IF @OldGroup <> @AcceptsReservations AND (
                EXISTS (SELECT 1 FROM dbo.ParkingSession WHERE slot_id = @Id AND status = 'OPEN')
                OR EXISTS (SELECT 1 FROM dbo.Reservation WHERE slot_id = @Id AND status = 'CONFIRMED'))
                THROW 51009, N'Không đổi nhóm slot khi còn giao dịch đang xử lý.', 1;
            IF EXISTS (SELECT 1 FROM dbo.ParkingSlot WHERE zone_id = @ParentId AND code = @Name AND (@Id IS NULL OR id <> @Id))
                THROW 51009, N'Mã slot đã tồn tại trong khu vực.', 1;
            IF @Id IS NULL
            BEGIN
                INSERT dbo.ParkingSlot(zone_id,code,accepts_reservations,is_active)
                VALUES (@ParentId,CONVERT(varchar(30),LTRIM(RTRIM(@Name))),@AcceptsReservations,@IsActive);
                SET @Id = CONVERT(int,SCOPE_IDENTITY());
            END
            ELSE UPDATE dbo.ParkingSlot SET code = CONVERT(varchar(30),LTRIM(RTRIM(@Name))),accepts_reservations = @AcceptsReservations,
                is_active = @IsActive WHERE id = @Id;
            -- Không cập nhật operational_status/buffer_until từ CRUD cấu hình.
        END;
        SET @Response = (SELECT @Id AS id,@Entity AS entity,@Name AS name,@IsActive AS isActive FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
        INSERT dbo.AuditLog(actor_user_id,action,entity_type,entity_id,reason,details_json,request_id)
        VALUES (@ActorId,'PARKING_CONFIG_SAVED',@Entity,@Id,@Reason,@Payload,@Key);
        EXEC dbo.usp_InternalSaveRequest @ActorId,'ADMIN_SAVE_CONFIG',@Key,@Hash,@Id,200,@Response;
        COMMIT; SELECT 200 AS http_status,@Response AS response_json,CAST(0 AS bit) AS is_replay;
    END TRY
    BEGIN CATCH
        IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_AdminSetPrice
    @ActorId int,@VehicleType varchar(12),@PricePerHour decimal(18,0),@Reason nvarchar(1000),@Key varchar(128)
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    DECLARE @Payload nvarchar(max) = (SELECT @VehicleType AS vehicleType,@PricePerHour AS pricePerHour,@Reason AS reason
        FOR JSON PATH, INCLUDE_NULL_VALUES, WITHOUT_ARRAY_WRAPPER),@Hash binary(32),@Replay nvarchar(max),@Http smallint,@Response nvarchar(max);
    BEGIN TRY
        BEGIN TRANSACTION;
        EXEC dbo.usp_InternalLock;
        EXEC dbo.usp_InternalAssertActor @ActorId,'Admin';
        EXEC dbo.usp_InternalBeginRequest @ActorId,'ADMIN_SET_PRICE',@Key,@Payload,@Hash OUTPUT,@Replay OUTPUT,@Http OUTPUT;
        IF @Replay IS NOT NULL BEGIN COMMIT; SELECT @Http AS http_status,@Replay AS response_json,CAST(1 AS bit) AS is_replay; RETURN; END;
        IF @VehicleType IS NULL OR @VehicleType NOT IN ('MOTORBIKE','CAR') OR @PricePerHour IS NULL OR @PricePerHour <= 0
            OR @Reason IS NULL OR LEN(LTRIM(RTRIM(@Reason))) = 0 THROW 51000, N'Loại xe, giá hoặc lý do không hợp lệ.', 1;
        DECLARE @OldPrice decimal(18,0),@Id int,@Now datetime2(7) = SYSUTCDATETIME();
        SELECT @OldPrice = price_per_hour FROM dbo.PricingRule WHERE vehicle_type = @VehicleType AND is_active = 1;
        -- Tạo phiên bản giá mới để giữ lịch sử cấu hình; Session vẫn dùng snapshot khi vào.
        UPDATE dbo.PricingRule SET is_active = 0,updated_at = @Now WHERE vehicle_type = @VehicleType AND is_active = 1;
        INSERT dbo.PricingRule(vehicle_type,price_per_hour,is_active,updated_at) VALUES (@VehicleType,@PricePerHour,1,@Now);
        SET @Id = CONVERT(int,SCOPE_IDENTITY());
        SET @Response = (SELECT @Id AS id,@VehicleType AS vehicleType,@OldPrice AS oldPricePerHour,@PricePerHour AS pricePerHour
            FOR JSON PATH, INCLUDE_NULL_VALUES, WITHOUT_ARRAY_WRAPPER);
        INSERT dbo.AuditLog(actor_user_id,action,entity_type,entity_id,reason,details_json,request_id)
        VALUES (@ActorId,'PRICE_CHANGED','PricingRule',@Id,@Reason,@Response,@Key);
        EXEC dbo.usp_InternalSaveRequest @ActorId,'ADMIN_SET_PRICE',@Key,@Hash,@Id,200,@Response;
        COMMIT; SELECT 200 AS http_status,@Response AS response_json,CAST(0 AS bit) AS is_replay;
    END TRY
    BEGIN CATCH
        IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO

-- K. DANH SÁCH / LỊCH SỬ / HÓA ĐƠN CÓ KIỂM TRA QUYỀN.
CREATE OR ALTER PROCEDURE dbo.usp_GetMyVehicles @ActorId int
AS
BEGIN
    SET NOCOUNT ON;
    EXEC dbo.usp_InternalAssertActor @ActorId,'Customer';
    SELECT * FROM dbo.Vehicle WHERE user_id = @ActorId ORDER BY id;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_ListReservations
    @ActorId int,@ReservationId int = NULL,@ParkingLotId int = NULL,@Status varchar(15) = NULL,
    @Page int = 1,@PageSize int = 50,@ReservationCode varchar(40) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    EXEC dbo.usp_InternalAssertActor @ActorId;
    IF @Page IS NULL OR @Page < 1 OR @Page > 1000000 OR @PageSize IS NULL OR @PageSize NOT BETWEEN 1 AND 200
        THROW 51000, N'Tham số phân trang không hợp lệ.', 1;
    DECLARE @Now datetime2(7) = SYSUTCDATETIME();
    SELECT r.*,z.parking_lot_id,s.code AS slot_code,z.name AS zone_name,p.name AS parking_lot_name,
        CASE WHEN r.status = 'CONFIRMED' AND r.service_issue_at IS NULL AND @Now >= r.expires_at THEN 'EXPIRED'
            WHEN r.status = 'CONFIRMED' AND r.service_issue_at IS NOT NULL
                AND (@Now >= DATEADD(MINUTE,15,r.service_issue_at) OR @Now >= r.end_time) THEN 'UNFULFILLED'
            ELSE r.status END AS effective_status,
        CASE WHEN r.service_issue_at IS NOT NULL THEN
            CASE WHEN DATEADD(MINUTE,15,r.service_issue_at)<r.end_time THEN DATEADD(MINUTE,15,r.service_issue_at) ELSE r.end_time END END AS resolution_deadline,
        CAST(CASE WHEN u.role='Staff' AND r.status='CONFIRMED' AND r.service_issue_at IS NULL
            AND @Now>=DATEADD(MINUTE,-15,r.start_time) AND @Now<r.expires_at THEN 1 ELSE 0 END AS bit) AS can_record_issue,
        CAST(CASE WHEN u.role='Staff' AND r.status='CONFIRMED' AND @Now>=DATEADD(MINUTE,-15,r.start_time)
            AND ((r.service_issue_at IS NULL AND @Now<r.expires_at) OR (r.service_issue_at IS NOT NULL
                AND @Now<DATEADD(MINUTE,15,r.service_issue_at) AND @Now<r.end_time)) THEN 1 ELSE 0 END AS bit) AS can_mark_unfulfilled
    FROM dbo.Reservation r JOIN dbo.ParkingSlot s ON s.id = r.slot_id JOIN dbo.Zone z ON z.id = s.zone_id
    JOIN dbo.ParkingLot p ON p.id = z.parking_lot_id JOIN dbo.Users u ON u.id = @ActorId
    WHERE (@ReservationId IS NULL OR r.id = @ReservationId) AND (@ParkingLotId IS NULL OR z.parking_lot_id = @ParkingLotId)
        AND (@ReservationCode IS NULL OR r.reservation_code = @ReservationCode)
        AND (@Status IS NULL OR r.status = @Status)
        AND (u.role = 'Admin' OR (u.role = 'Customer' AND r.user_id = @ActorId)
            OR (u.role = 'Staff' AND u.assigned_parking_lot_id = z.parking_lot_id))
    ORDER BY r.created_at DESC,r.id DESC OFFSET (@Page - 1) * @PageSize ROWS FETCH NEXT @PageSize ROWS ONLY;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_ListSessions
    @ActorId int,@SessionId int = NULL,@ParkingLotId int = NULL,@Status varchar(12) = NULL,
    @Plate nvarchar(32) = NULL,@Page int = 1,@PageSize int = 50,@SessionCode varchar(40) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    EXEC dbo.usp_InternalAssertActor @ActorId;
    IF @Page IS NULL OR @Page < 1 OR @Page > 1000000 OR @PageSize IS NULL OR @PageSize NOT BETWEEN 1 AND 200
        THROW 51000, N'Tham số phân trang không hợp lệ.', 1;
    DECLARE @Normalized varchar(32) = dbo.fn_NormalizePlate(@Plate),@Now datetime2(7) = SYSUTCDATETIME();
    SELECT d.*,CAST(CASE WHEN d.status = 'OPEN' AND d.planned_end_time < @Now THEN 1 ELSE 0 END AS bit) AS is_overstay,
        CASE WHEN d.reservation_id IS NULL THEN DATEADD(MINUTE,5,d.check_in_time) END AS plate_correction_deadline,
        CAST(CASE WHEN u.role='Staff' AND d.reservation_id IS NULL AND d.status='OPEN'
            AND @Now<=DATEADD(MINUTE,5,d.check_in_time) THEN 1 ELSE 0 END AS bit) AS can_correct_plate
    FROM dbo.vw_SessionDetails d JOIN dbo.Users u ON u.id = @ActorId
    WHERE (@SessionId IS NULL OR d.id = @SessionId) AND (@ParkingLotId IS NULL OR d.parking_lot_id = @ParkingLotId)
        AND (@SessionCode IS NULL OR d.session_code = @SessionCode)
        AND (@Status IS NULL OR d.status = @Status) AND (@Plate IS NULL OR d.normalized_plate_number_snapshot = @Normalized)
        AND (u.role = 'Admin' OR (u.role = 'Customer' AND d.customer_id = @ActorId)
            OR (u.role = 'Staff' AND u.assigned_parking_lot_id = d.parking_lot_id))
    ORDER BY d.check_in_time DESC,d.id DESC OFFSET (@Page - 1) * @PageSize ROWS FETCH NEXT @PageSize ROWS ONLY;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_ListPayments
    @ActorId int,@PaymentId int = NULL,@Page int = 1,@PageSize int = 50
AS
BEGIN
    SET NOCOUNT ON;
    EXEC dbo.usp_InternalAssertActor @ActorId;
    IF @Page IS NULL OR @Page < 1 OR @Page > 1000000 OR @PageSize IS NULL OR @PageSize NOT BETWEEN 1 AND 200
        THROW 51000, N'Tham số phân trang không hợp lệ.', 1;
    SELECT pay.*,d.session_code,d.plate_number_snapshot,d.vehicle_type_snapshot,d.check_in_time,d.check_out_time,
        d.billable_hours,d.applied_price_per_hour,d.parking_lot_name,d.zone_name,d.slot_code
    FROM dbo.Payment pay JOIN dbo.vw_SessionDetails d ON d.id = pay.session_id JOIN dbo.Users u ON u.id = @ActorId
    WHERE (@PaymentId IS NULL OR pay.id = @PaymentId)
        AND (u.role = 'Admin' OR (u.role = 'Customer' AND d.customer_id = @ActorId)
            OR (u.role = 'Staff' AND u.assigned_parking_lot_id = d.parking_lot_id))
    ORDER BY pay.paid_at DESC,pay.id DESC OFFSET (@Page - 1) * @PageSize ROWS FETCH NEXT @PageSize ROWS ONLY;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_GetSlotOperations @ActorId int,@ParkingLotId int
AS
BEGIN
    SET NOCOUNT ON;
    EXEC dbo.usp_InternalAssertActor @ActorId;
    IF NOT EXISTS (SELECT 1 FROM dbo.Users WHERE id = @ActorId AND
        (role = 'Admin' OR (role = 'Staff' AND assigned_parking_lot_id = @ParkingLotId)))
        THROW 51001, N'Không có quyền xem vận hành bãi này.', 1;
    DECLARE @Now datetime2(7) = SYSUTCDATETIME();
    SELECT i.*,ps.id AS open_session_id,ps.plate_number_snapshot,
        CAST(CASE WHEN i.buffer_until > @Now THEN 1 ELSE 0 END AS bit) AS is_in_buffer,
        (SELECT COUNT(*) FROM dbo.fn_EffectiveReservations(@Now) r WHERE r.slot_id = i.slot_id) AS effective_confirmed_count
    FROM dbo.vw_SlotInventory i LEFT JOIN dbo.ParkingSession ps ON ps.slot_id = i.slot_id AND ps.status = 'OPEN'
    WHERE i.parking_lot_id = @ParkingLotId ORDER BY i.zone_id,i.code;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_AdminListUsers @ActorId int,@Page int = 1,@PageSize int = 50,
    @Role varchar(20) = NULL,@Query nvarchar(256) = NULL,@IsActive bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    EXEC dbo.usp_InternalAssertActor @ActorId,'Admin';
    IF @Page IS NULL OR @Page < 1 OR @Page > 1000000 OR @PageSize IS NULL OR @PageSize NOT BETWEEN 1 AND 200
        THROW 51000, N'Tham số phân trang không hợp lệ.', 1;
    IF @Role IS NOT NULL AND @Role NOT IN ('Customer','Staff','Admin')
        THROW 51000, N'Vai trò lọc không hợp lệ.', 1;
    SET @Query = NULLIF(LTRIM(RTRIM(@Query)),N'');
    SELECT id,name,normalized_email,phone,role,is_active,assigned_parking_lot_id,created_at
    FROM dbo.Users WHERE (@Role IS NULL OR role=@Role) AND (@IsActive IS NULL OR is_active=@IsActive)
        AND (@Query IS NULL OR CHARINDEX(@Query,name)>0 OR CHARINDEX(LOWER(@Query),normalized_email)>0
            OR CHARINDEX(@Query,phone)>0)
    ORDER BY id OFFSET (@Page - 1) * @PageSize ROWS FETCH NEXT @PageSize ROWS ONLY;
END;
GO

-- L. BÁO CÁO: ngày Việt Nam quy đổi UTC, khoảng [from, to).
CREATE OR ALTER PROCEDURE dbo.usp_GetOccupancy @ActorId int,@ParkingLotId int = NULL
AS
BEGIN
    SET NOCOUNT ON;
    EXEC dbo.usp_InternalAssertActor @ActorId;
    DECLARE @Role varchar(20),@AssignedLot int;
    SELECT @Role = role,@AssignedLot = assigned_parking_lot_id FROM dbo.Users WHERE id = @ActorId;
    IF @Role NOT IN ('Admin','Staff') THROW 51001, N'Không có quyền xem dashboard vận hành.', 1;
    SELECT * FROM dbo.vw_CurrentOccupancy WHERE (@ParkingLotId IS NULL OR parking_lot_id = @ParkingLotId)
        AND (@Role = 'Admin' OR parking_lot_id = @AssignedLot);
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_AdminRevenueReport
    @ActorId int,@FromDateVN date,@ToDateVNExclusive date,@ParkingLotId int = NULL
AS
BEGIN
    SET NOCOUNT ON;
    EXEC dbo.usp_InternalAssertActor @ActorId,'Admin';
    IF @FromDateVN IS NULL OR @ToDateVNExclusive IS NULL OR @ToDateVNExclusive <= @FromDateVN
        OR @FromDateVN < '20000101' OR @ToDateVNExclusive > '21000101'
        THROW 51000, N'Khoảng ngày báo cáo không hợp lệ.', 1;
    DECLARE @FromUtc datetime2(7) = DATEADD(HOUR,-7,CONVERT(datetime2(7),@FromDateVN)),
        @ToUtc datetime2(7) = DATEADD(HOUR,-7,CONVERT(datetime2(7),@ToDateVNExclusive));
    SELECT CONVERT(date,DATEADD(HOUR,7,pay.paid_at)) AS date_vn,z.parking_lot_id,p.name AS parking_lot_name,
        COUNT_BIG(*) AS payment_count,SUM(pay.amount) AS revenue_vnd
    FROM dbo.Payment pay JOIN dbo.ParkingSession ps ON ps.id = pay.session_id
    JOIN dbo.ParkingSlot s ON s.id = ps.slot_id JOIN dbo.Zone z ON z.id = s.zone_id JOIN dbo.ParkingLot p ON p.id = z.parking_lot_id
    WHERE pay.status = 'PAID' AND pay.paid_at >= @FromUtc AND pay.paid_at < @ToUtc
        AND (@ParkingLotId IS NULL OR z.parking_lot_id = @ParkingLotId)
    GROUP BY CONVERT(date,DATEADD(HOUR,7,pay.paid_at)),z.parking_lot_id,p.name
    ORDER BY date_vn,z.parking_lot_id;
    SELECT COALESCE(SUM(pay.amount),0) AS total_revenue_vnd,COUNT_BIG(*) AS total_payment_count
    FROM dbo.Payment pay JOIN dbo.ParkingSession ps ON ps.id = pay.session_id
    JOIN dbo.ParkingSlot s ON s.id = ps.slot_id JOIN dbo.Zone z ON z.id = s.zone_id
    WHERE pay.status = 'PAID' AND pay.paid_at >= @FromUtc AND pay.paid_at < @ToUtc
        AND (@ParkingLotId IS NULL OR z.parking_lot_id = @ParkingLotId);
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_GetTrafficReport
    @ActorId int,@FromDateVN date,@ToDateVNExclusive date,@ParkingLotId int = NULL
AS
BEGIN
    SET NOCOUNT ON;
    EXEC dbo.usp_InternalAssertActor @ActorId;
    DECLARE @Role varchar(20),@AssignedLot int;
    SELECT @Role = role,@AssignedLot = assigned_parking_lot_id FROM dbo.Users WHERE id = @ActorId;
    IF @Role NOT IN ('Admin','Staff') THROW 51001, N'Không có quyền xem lượt xe.', 1;
    IF @FromDateVN IS NULL OR @ToDateVNExclusive IS NULL OR @ToDateVNExclusive <= @FromDateVN
        OR @FromDateVN < '20000101' OR @ToDateVNExclusive > '21000101'
        THROW 51000, N'Khoảng ngày báo cáo không hợp lệ.', 1;
    DECLARE @FromUtc datetime2(7) = DATEADD(HOUR,-7,CONVERT(datetime2(7),@FromDateVN)),
        @ToUtc datetime2(7) = DATEADD(HOUR,-7,CONVERT(datetime2(7),@ToDateVNExclusive));
    SELECT p.id AS parking_lot_id,p.name AS parking_lot_name,
        (SELECT COUNT_BIG(*) FROM dbo.vw_SessionDetails d WHERE d.parking_lot_id = p.id AND d.check_in_time >= @FromUtc AND d.check_in_time < @ToUtc) AS check_in_count,
        (SELECT COUNT_BIG(*) FROM dbo.vw_SessionDetails d WHERE d.parking_lot_id = p.id AND d.check_out_time >= @FromUtc AND d.check_out_time < @ToUtc) AS check_out_count
    FROM dbo.ParkingLot p WHERE (@ParkingLotId IS NULL OR p.id = @ParkingLotId) AND (@Role = 'Admin' OR p.id = @AssignedLot)
    ORDER BY p.id;
END;
GO

-- Dashboard và báo cáo ngày đọc cùng một ảnh dữ liệu qua shared business lock.
CREATE OR ALTER PROCEDURE dbo.usp_GetDashboard @ActorId int
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRY
        BEGIN TRANSACTION;
        DECLARE @Lock int;
        EXEC @Lock=sys.sp_getapplock @Resource=N'ParkingLotOnline.BusinessWrite',@LockMode='Shared',@LockOwner='Transaction',@LockTimeout=10000;
        IF @Lock<0 THROW 51010,N'Chưa lấy được khóa đọc dữ liệu.',1;
        EXEC dbo.usp_InternalAssertActor @ActorId;
        DECLARE @Role varchar(20),@Lot int,@Scope nvarchar(150),@Now datetime2(7)=SYSUTCDATETIME();
        DECLARE @Today date=CONVERT(date,DATEADD(HOUR,7,@Now));
        DECLARE @From datetime2(7)=DATEADD(HOUR,-7,CONVERT(datetime2(7),@Today)),@To datetime2(7);
        SET @To=DATEADD(DAY,1,@From);
        SELECT @Role=role,@Lot=assigned_parking_lot_id FROM dbo.Users WHERE id=@ActorId;
        SELECT @Scope=name FROM dbo.ParkingLot WHERE id=@Lot;
        SELECT @Role AS role,@Now AS generated_at,@Today AS date_vn,
            CASE WHEN @Role='Admin' THEN N'Toàn hệ thống' WHEN @Role='Staff' THEN @Scope ELSE N'Tài khoản của bạn' END AS scope_name;
        IF @Role='Customer'
        BEGIN
            SELECT (SELECT COUNT(*) FROM dbo.Vehicle WHERE user_id=@ActorId AND is_active=1) AS active_vehicle_count,
                (SELECT COUNT(*) FROM dbo.fn_EffectiveReservations(@Now) WHERE user_id=@ActorId) AS confirmed_reservations,
                (SELECT COUNT(*) FROM dbo.ParkingSession WHERE customer_id=@ActorId AND status='OPEN') AS open_sessions,
                (SELECT COUNT(*) FROM dbo.ParkingSession WHERE customer_id=@ActorId AND status='COMPLETED') AS completed_sessions,
                (SELECT COALESCE(SUM(pay.amount),0) FROM dbo.Payment pay JOIN dbo.ParkingSession ps ON ps.id=pay.session_id
                    WHERE ps.customer_id=@ActorId AND pay.status='PAID') AS total_paid;
        END
        ELSE
        BEGIN
            SELECT p.id AS parking_lot_id,p.name AS parking_lot_name,p.is_active,
                COUNT(i.slot_id) AS total_active_slots,
                SUM(CASE WHEN i.operational_status='AVAILABLE' THEN 1 ELSE 0 END) AS available_slots,
                SUM(CASE WHEN i.operational_status='OCCUPIED' THEN 1 ELSE 0 END) AS occupied_slots,
                SUM(CASE WHEN i.operational_status='MAINTENANCE' THEN 1 ELSE 0 END) AS maintenance_slots,
                SUM(CASE WHEN i.operational_status='AVAILABLE' AND i.buffer_until>@Now THEN 1 ELSE 0 END) AS buffer_slots,
                SUM(CASE WHEN i.operational_status='AVAILABLE' AND i.accepts_reservations=0
                    AND (i.buffer_until IS NULL OR i.buffer_until<=@Now) THEN 1 ELSE 0 END) AS walk_in_ready_slots,
                CAST(100.0*SUM(CASE WHEN i.operational_status='OCCUPIED' THEN 1 ELSE 0 END)
                    /NULLIF(SUM(CASE WHEN i.operational_status IN ('AVAILABLE','OCCUPIED') THEN 1 ELSE 0 END),0) AS decimal(6,2)) AS occupancy_percent
            INTO #Lots FROM dbo.ParkingLot p LEFT JOIN dbo.vw_SlotInventory i ON i.parking_lot_id=p.id
                AND i.lot_is_active=1 AND i.zone_is_active=1 AND i.slot_is_active=1
            WHERE @Role='Admin' OR p.id=@Lot GROUP BY p.id,p.name,p.is_active;
            SELECT (SELECT COUNT(*) FROM #Lots WHERE is_active=1) AS active_lot_count,
                COALESCE(SUM(total_active_slots),0) AS total_active_slots,COALESCE(SUM(available_slots),0) AS available_slots,
                COALESCE(SUM(occupied_slots),0) AS occupied_slots,COALESCE(SUM(maintenance_slots),0) AS maintenance_slots,
                COALESCE(SUM(buffer_slots),0) AS buffer_slots,COALESCE(SUM(walk_in_ready_slots),0) AS walk_in_ready_slots,
                (SELECT COUNT(*) FROM dbo.fn_EffectiveReservations(@Now) r JOIN dbo.vw_SlotInventory i ON i.slot_id=r.slot_id
                    WHERE @Role='Admin' OR i.parking_lot_id=@Lot) AS confirmed_reservations,
                (SELECT COUNT(*) FROM dbo.ParkingSession ps JOIN dbo.vw_SlotInventory i ON i.slot_id=ps.slot_id
                    WHERE ps.status='OPEN' AND (@Role='Admin' OR i.parking_lot_id=@Lot)) AS open_sessions,
                (SELECT COUNT_BIG(*) FROM dbo.ParkingSession ps JOIN dbo.vw_SlotInventory i ON i.slot_id=ps.slot_id
                    WHERE ps.check_in_time>=@From AND ps.check_in_time<@To AND (@Role='Admin' OR i.parking_lot_id=@Lot)) AS today_check_ins,
                (SELECT COUNT_BIG(*) FROM dbo.ParkingSession ps JOIN dbo.vw_SlotInventory i ON i.slot_id=ps.slot_id
                    WHERE ps.check_out_time>=@From AND ps.check_out_time<@To AND (@Role='Admin' OR i.parking_lot_id=@Lot)) AS today_check_outs,
                CASE WHEN @Role='Admin' THEN (SELECT COALESCE(SUM(amount),0) FROM dbo.Payment WHERE status='PAID' AND paid_at>=@From AND paid_at<@To) END AS today_revenue
            FROM #Lots;
            SELECT * FROM #Lots ORDER BY parking_lot_id;
        END;
        COMMIT;
    END TRY
    BEGIN CATCH
        IF XACT_STATE()<>0 ROLLBACK;
        THROW;
    END CATCH;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_AdminDailyReport
    @ActorId int,@FromDateVN date,@ToDateVNExclusive date,@ParkingLotId int=NULL
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRY
        BEGIN TRANSACTION;
        DECLARE @Lock int;
        EXEC @Lock=sys.sp_getapplock @Resource=N'ParkingLotOnline.BusinessWrite',@LockMode='Shared',@LockOwner='Transaction',@LockTimeout=10000;
        IF @Lock<0 THROW 51010,N'Chưa lấy được khóa đọc dữ liệu.',1;
        EXEC dbo.usp_InternalAssertActor @ActorId,'Admin';
        IF @FromDateVN IS NULL OR @ToDateVNExclusive IS NULL OR @FromDateVN<'20000101' OR @ToDateVNExclusive>'21000101'
            OR @ToDateVNExclusive<=@FromDateVN OR DATEDIFF(DAY,@FromDateVN,@ToDateVNExclusive)>366
            THROW 51000,N'Chọn khoảng ngày từ 2000 đến 2099, tối đa 366 ngày.',1;
        IF @ParkingLotId IS NOT NULL AND NOT EXISTS(SELECT 1 FROM dbo.ParkingLot WHERE id=@ParkingLotId)
            THROW 51004,N'Không tìm thấy bãi báo cáo.',1;
        DECLARE @From datetime2(7)=DATEADD(HOUR,-7,CONVERT(datetime2(7),@FromDateVN)),
            @To datetime2(7)=DATEADD(HOUR,-7,CONVERT(datetime2(7),@ToDateVNExclusive));
        SELECT SYSUTCDATETIME() AS generated_at;
        SELECT CONVERT(date,DATEADD(HOUR,7,ps.check_in_time)) AS date_vn,i.parking_lot_id,COUNT_BIG(*) AS total
        INTO #Ins FROM dbo.ParkingSession ps JOIN dbo.vw_SlotInventory i ON i.slot_id=ps.slot_id
        WHERE ps.check_in_time>=@From AND ps.check_in_time<@To AND (@ParkingLotId IS NULL OR i.parking_lot_id=@ParkingLotId)
        GROUP BY CONVERT(date,DATEADD(HOUR,7,ps.check_in_time)),i.parking_lot_id;
        SELECT CONVERT(date,DATEADD(HOUR,7,ps.check_out_time)) AS date_vn,i.parking_lot_id,COUNT_BIG(*) AS total
        INTO #Outs FROM dbo.ParkingSession ps JOIN dbo.vw_SlotInventory i ON i.slot_id=ps.slot_id
        WHERE ps.check_out_time>=@From AND ps.check_out_time<@To AND (@ParkingLotId IS NULL OR i.parking_lot_id=@ParkingLotId)
        GROUP BY CONVERT(date,DATEADD(HOUR,7,ps.check_out_time)),i.parking_lot_id;
        SELECT CONVERT(date,DATEADD(HOUR,7,pay.paid_at)) AS date_vn,i.parking_lot_id,COUNT_BIG(*) AS total,SUM(pay.amount) AS revenue,
            SUM(CASE WHEN pay.method='CASH' THEN pay.amount ELSE 0 END) AS cash,
            SUM(CASE WHEN pay.method='SIMULATED' THEN pay.amount ELSE 0 END) AS simulated
        INTO #Paid FROM dbo.Payment pay JOIN dbo.ParkingSession ps ON ps.id=pay.session_id JOIN dbo.vw_SlotInventory i ON i.slot_id=ps.slot_id
        WHERE pay.status='PAID' AND pay.paid_at>=@From AND pay.paid_at<@To AND (@ParkingLotId IS NULL OR i.parking_lot_id=@ParkingLotId)
        GROUP BY CONVERT(date,DATEADD(HOUR,7,pay.paid_at)),i.parking_lot_id;
        ;WITH Days AS (SELECT @FromDateVN AS d UNION ALL SELECT DATEADD(DAY,1,d) FROM Days WHERE DATEADD(DAY,1,d)<@ToDateVNExclusive)
        SELECT d AS date_vn,
            COALESCE((SELECT SUM(total) FROM #Ins WHERE date_vn=d),0) AS check_in_count,
            COALESCE((SELECT SUM(total) FROM #Outs WHERE date_vn=d),0) AS check_out_count,
            COALESCE((SELECT SUM(total) FROM #Paid WHERE date_vn=d),0) AS payment_count,
            COALESCE((SELECT SUM(revenue) FROM #Paid WHERE date_vn=d),0) AS revenue_vnd,
            COALESCE((SELECT SUM(cash) FROM #Paid WHERE date_vn=d),0) AS cash_revenue_vnd,
            COALESCE((SELECT SUM(simulated) FROM #Paid WHERE date_vn=d),0) AS simulated_revenue_vnd
        FROM Days ORDER BY d OPTION(MAXRECURSION 366);
        SELECT p.id AS parking_lot_id,p.name AS parking_lot_name,p.is_active,
            COALESCE((SELECT SUM(total) FROM #Ins WHERE parking_lot_id=p.id),0) AS check_in_count,
            COALESCE((SELECT SUM(total) FROM #Outs WHERE parking_lot_id=p.id),0) AS check_out_count,
            COALESCE((SELECT SUM(total) FROM #Paid WHERE parking_lot_id=p.id),0) AS payment_count,
            COALESCE((SELECT SUM(revenue) FROM #Paid WHERE parking_lot_id=p.id),0) AS revenue_vnd,
            COALESCE((SELECT SUM(cash) FROM #Paid WHERE parking_lot_id=p.id),0) AS cash_revenue_vnd,
            COALESCE((SELECT SUM(simulated) FROM #Paid WHERE parking_lot_id=p.id),0) AS simulated_revenue_vnd
        FROM dbo.ParkingLot p WHERE @ParkingLotId IS NULL OR p.id=@ParkingLotId ORDER BY p.id;
        COMMIT;
    END TRY
    BEGIN CATCH
        IF XACT_STATE()<>0 ROLLBACK;
        THROW;
    END CATCH;
END;
GO

-- M. DỮ LIỆU DEMO. Chạy lại không ghi đè mật khẩu, giá, cấu hình hoặc các giao dịch đã có.
BEGIN TRY
    BEGIN TRANSACTION;
    EXEC dbo.usp_InternalLock;
    DECLARE @DemoHash nvarchar(512) = N'AQAAAAIAAYagAAAAEJr8QlthgK7YODXAtsncCxrygp19qGe66weahLvmsz9Rym4vixN4isviG8cBG9pRKg==';
    IF NOT EXISTS (SELECT 1 FROM dbo.ParkingLot WHERE name = N'Bãi Trung Tâm')
        INSERT dbo.ParkingLot(name,address) VALUES (N'Bãi Trung Tâm',N'Quận 1, Thành phố Hồ Chí Minh (dữ liệu demo)');
    IF NOT EXISTS (SELECT 1 FROM dbo.ParkingLot WHERE name = N'Bãi Đại Học')
        INSERT dbo.ParkingLot(name,address) VALUES (N'Bãi Đại Học',N'Thành phố Hồ Chí Minh (dữ liệu demo)');
    DECLARE @Lot1 int = (SELECT MIN(id) FROM dbo.ParkingLot WHERE name = N'Bãi Trung Tâm'),
        @Lot2 int = (SELECT MIN(id) FROM dbo.ParkingLot WHERE name = N'Bãi Đại Học');
    INSERT dbo.Users(name,normalized_email,password_hash,phone,role,assigned_parking_lot_id)
    SELECT d.name,d.email,@DemoHash,d.phone,d.role,d.lot_id
    FROM (VALUES
        (N'Quản trị viên demo',N'admin@parking.test','0900000001','Admin',CAST(NULL AS int)),
        (N'Nhân viên Trung Tâm',N'staff1@parking.test','0900000002','Staff',@Lot1),
        (N'Nhân viên Đại Học',N'staff2@parking.test','0900000003','Staff',@Lot2),
        (N'Khách hàng số 1',N'customer1@parking.test','0900000004','Customer',CAST(NULL AS int)),
        (N'Khách hàng số 2',N'customer2@parking.test','0900000005','Customer',CAST(NULL AS int))
    ) d(name,email,phone,role,lot_id)
    WHERE NOT EXISTS (SELECT 1 FROM dbo.Users u WHERE u.normalized_email = d.email);
    INSERT dbo.Zone(parking_lot_id,name,floor_label,vehicle_type)
    SELECT d.lot_id,d.name,N'Tầng trệt',d.vehicle_type
    FROM (VALUES (@Lot1,N'Khu xe máy','MOTORBIKE'),(@Lot1,N'Khu ô tô','CAR'),
        (@Lot2,N'Khu xe máy','MOTORBIKE'),(@Lot2,N'Khu ô tô','CAR')) d(lot_id,name,vehicle_type)
    WHERE NOT EXISTS (SELECT 1 FROM dbo.Zone z WHERE z.parking_lot_id = d.lot_id AND z.name = d.name);
    INSERT dbo.ParkingSlot(zone_id,code,accepts_reservations)
    SELECT z.id,CONCAT(CASE WHEN z.vehicle_type = 'MOTORBIKE' THEN 'M' ELSE 'C' END,
        CASE WHEN n.n <= 4 THEN '-R' ELSE '-W' END,RIGHT(CONCAT('0',n.n),2)),CAST(CASE WHEN n.n <= 4 THEN 1 ELSE 0 END AS bit)
    FROM dbo.Zone z CROSS JOIN (VALUES(1),(2),(3),(4),(5),(6)) n(n)
    WHERE z.parking_lot_id IN (@Lot1,@Lot2) AND z.name IN (N'Khu xe máy',N'Khu ô tô')
        AND NOT EXISTS (SELECT 1 FROM dbo.ParkingSlot s WHERE s.zone_id = z.id AND s.code = CONCAT(
            CASE WHEN z.vehicle_type = 'MOTORBIKE' THEN 'M' ELSE 'C' END,
            CASE WHEN n.n <= 4 THEN '-R' ELSE '-W' END,RIGHT(CONCAT('0',n.n),2)));
    INSERT dbo.PricingRule(vehicle_type,price_per_hour)
    SELECT d.vehicle_type,d.price FROM (VALUES ('MOTORBIKE',5000),('CAR',20000)) d(vehicle_type,price)
    WHERE NOT EXISTS (SELECT 1 FROM dbo.PricingRule p WHERE p.vehicle_type = d.vehicle_type AND p.is_active = 1);
    DECLARE @Customer1 int = (SELECT id FROM dbo.Users WHERE normalized_email = N'customer1@parking.test'),
        @Customer2 int = (SELECT id FROM dbo.Users WHERE normalized_email = N'customer2@parking.test');
    INSERT dbo.Vehicle(user_id,plate_number,normalized_plate_number,vehicle_type)
    SELECT d.user_id,d.plate,dbo.fn_NormalizePlate(d.plate),d.vehicle_type
    FROM (VALUES (@Customer1,N'59-A1 123.45','MOTORBIKE'),(@Customer1,N'51A-123.45','CAR'),
        (@Customer2,N'59-B1 678.90','MOTORBIKE'),(@Customer2,N'51B-678.90','CAR')) d(user_id,plate,vehicle_type)
    WHERE NOT EXISTS (SELECT 1 FROM dbo.Vehicle v WHERE v.normalized_plate_number = dbo.fn_NormalizePlate(d.plate));
    COMMIT;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO

-- N. ROLE DATABASE CHO BACKEND. Không cấp db_owner/db_datawriter cho tài khoản chạy API.
-- Chỉ có quyền đọc catalog công khai và EXEC các procedure công khai.
IF DATABASE_PRINCIPAL_ID(N'parking_backend') IS NULL
    EXEC(N'CREATE ROLE parking_backend AUTHORIZATION dbo;');
GO
-- Metadata cần cho kiểm tra cấu trúc kết quả, không cấp quyền đọc bảng riêng tư.
GRANT VIEW DEFINITION ON OBJECT::dbo.usp_ListReservations TO parking_backend;
GRANT VIEW DEFINITION ON OBJECT::dbo.usp_ListSessions TO parking_backend;
GRANT SELECT ON OBJECT::dbo.ParkingLot TO parking_backend;
GRANT SELECT ON OBJECT::dbo.Zone TO parking_backend;
GRANT SELECT ON OBJECT::dbo.ParkingSlot TO parking_backend;
GRANT SELECT ON OBJECT::dbo.PricingRule TO parking_backend;
GRANT SELECT ON OBJECT::dbo.vw_SlotInventory TO parking_backend;
GO
DECLARE @GrantSql nvarchar(max) = N'';
SELECT @GrantSql = @GrantSql + N'GRANT EXECUTE ON OBJECT::dbo.' + QUOTENAME(name) + N' TO parking_backend;' + CHAR(13) + CHAR(10)
FROM sys.procedures WHERE schema_id = SCHEMA_ID(N'dbo') AND name LIKE N'usp[_]%'
    AND name NOT LIKE N'usp[_]Internal%';
EXEC sys.sp_executesql @GrantSql;
GO
-- Không tạo SQL login/password trong script. Sau khi tạo DB user cho API:
-- ALTER ROLE parking_backend ADD MEMBER [TenDatabaseUserCuaAPI];

-- O. KIỂM TRA KẾT QUẢ KHỞI TẠO.
SELECT DB_NAME() AS database_name, SYSUTCDATETIME() AS server_utc;
SELECT name FROM sys.tables WHERE schema_id = SCHEMA_ID(N'dbo') ORDER BY name;
SELECT id,name,normalized_email,role,assigned_parking_lot_id,is_active FROM dbo.Users ORDER BY id;
SELECT * FROM dbo.vw_CurrentOccupancy ORDER BY parking_lot_id;
SELECT id,vehicle_type,price_per_hour FROM dbo.PricingRule WHERE is_active = 1;
PRINT N'Đã khởi tạo SQL cho Quản lý bãi đỗ xe trực tuyến.';
GO
```

## 2. Các lệnh dùng thử sau khi khởi tạo

Mỗi khối dưới đây chạy **riêng**. Dùng email/code để tìm id, không mặc định identity luôn là 1, 2, 3. Các lệnh ghi tạo giao dịch thật trong database demo; đổi `@Key` khi thực hiện thao tác mới, giữ nguyên key và tham số khi thử gửi lại cùng yêu cầu.

### 2.1. Xem bãi, xe và lịch sử

```sql
USE [ParkingLotOnline];
GO
DECLARE @Customer int = (SELECT id FROM dbo.Users WHERE normalized_email = N'customer1@parking.test'),
    @Staff int = (SELECT id FROM dbo.Users WHERE normalized_email = N'staff1@parking.test'),
    @Lot int = (SELECT assigned_parking_lot_id FROM dbo.Users WHERE normalized_email = N'staff1@parking.test');
SELECT * FROM dbo.ParkingLot WHERE is_active = 1;
EXEC dbo.usp_GetMyVehicles @ActorId = @Customer;
EXEC dbo.usp_ListReservations @ActorId = @Customer;
EXEC dbo.usp_ListSessions @ActorId = @Customer;
EXEC dbo.usp_ListPayments @ActorId = @Customer;
EXEC dbo.usp_GetSlotOperations @ActorId = @Staff,@ParkingLotId = @Lot;
```

### 2.2. Tìm chỗ và đặt xe máy, khởi đầu sau 5 phút

```sql
USE [ParkingLotOnline];
GO
DECLARE @Customer int = (SELECT id FROM dbo.Users WHERE normalized_email = N'customer1@parking.test'),
    @Lot int = (SELECT assigned_parking_lot_id FROM dbo.Users WHERE normalized_email = N'staff1@parking.test'),
    @Vehicle int = (SELECT id FROM dbo.Vehicle WHERE normalized_plate_number = '59A112345'),
    @Slot int,@Start datetime2(7) = DATEADD(MINUTE,5,SYSUTCDATETIME()),@End datetime2(7),
    @Key varchar(128) = CONVERT(varchar(36),NEWID());
SET @End = DATEADD(HOUR,1,@Start);
SELECT TOP(1) @Slot = slot_id FROM dbo.vw_SlotInventory
WHERE parking_lot_id = @Lot AND vehicle_type = 'MOTORBIKE' AND accepts_reservations = 1
    AND code = 'M-R01';
EXEC dbo.usp_GetAvailability @ActorId = @Customer,@VehicleId = @Vehicle,@ParkingLotId = @Lot,@StartUtc = @Start,@EndUtc = @End;
EXEC dbo.usp_CreateReservation @ActorId = @Customer,@VehicleId = @Vehicle,@SlotId = @Slot,@StartUtc = @Start,@EndUtc = @End,@Key = @Key;
-- Xem reservationCode trong response_json hoặc:
EXEC dbo.usp_ListReservations @ActorId = @Customer;
```

### 2.3. Check-in lượt vừa đặt (được sớm tối đa 15 phút)

```sql
USE [ParkingLotOnline];
GO
DECLARE @Staff int = (SELECT id FROM dbo.Users WHERE normalized_email = N'staff1@parking.test'),
    @Customer int = (SELECT id FROM dbo.Users WHERE normalized_email = N'customer1@parking.test'),
    @ReservationCode varchar(40),@Slot int,@Key varchar(128) = CONVERT(varchar(36),NEWID());
SELECT TOP(1) @ReservationCode = r.reservation_code,@Slot = r.slot_id
FROM dbo.Reservation r JOIN dbo.ParkingSlot s ON s.id = r.slot_id JOIN dbo.Zone z ON z.id = s.zone_id
WHERE r.user_id = @Customer AND r.status = 'CONFIRMED'
    AND z.parking_lot_id = (SELECT assigned_parking_lot_id FROM dbo.Users WHERE id = @Staff)
ORDER BY r.created_at DESC;
IF @ReservationCode IS NULL THROW 51004, N'Chưa có lượt đặt để dùng thử.', 1;
EXEC dbo.usp_CheckIn @ActorId = @Staff,@SlotId = @Slot,@Key = @Key,@ReservationCode = @ReservationCode;
```

### 2.4. Walk-in chưa có tài khoản

```sql
USE [ParkingLotOnline];
GO
DECLARE @Staff int = (SELECT id FROM dbo.Users WHERE normalized_email = N'staff1@parking.test'),
    @Slot int,@Key varchar(128) = CONVERT(varchar(36),NEWID());
SELECT TOP(1) @Slot = slot_id FROM dbo.vw_SlotInventory
WHERE parking_lot_id = (SELECT assigned_parking_lot_id FROM dbo.Users WHERE id = @Staff)
    AND code = 'C-W05' AND vehicle_type = 'CAR';
EXEC dbo.usp_CheckIn @ActorId = @Staff,@SlotId = @Slot,@Key = @Key,@Plate = N'51C-999.99',@VehicleType = 'CAR';
```

### 2.5. Xem phí, thu tiền và xe ra; gửi lại không thu trùng

```sql
USE [ParkingLotOnline];
GO
DECLARE @Staff int = (SELECT id FROM dbo.Users WHERE normalized_email = N'staff1@parking.test'),
    @Session int,@Amount decimal(18,0),@Key varchar(128) = CONVERT(varchar(36),NEWID());
SELECT TOP(1) @Session = id FROM dbo.vw_SessionDetails
WHERE status = 'OPEN' AND parking_lot_id = (SELECT assigned_parking_lot_id FROM dbo.Users WHERE id = @Staff)
ORDER BY check_in_time DESC;
IF @Session IS NULL THROW 51004, N'Chưa có phiên OPEN để dùng thử.', 1;
EXEC dbo.usp_GetSessionFee @ActorId = @Staff,@SessionId = @Session;
SELECT @Amount = dbo.fn_BillableHours(check_in_time,SYSUTCDATETIME()) * applied_price_per_hour
FROM dbo.ParkingSession WHERE id = @Session;
EXEC dbo.usp_CheckOut @ActorId = @Staff,@SessionId = @Session,@PaymentMethod = 'SIMULATED',@ConfirmedAmount = @Amount,@Key = @Key;
-- Giữ cùng key/cùng tham số: trả kết quả cũ, is_replay = 1, chỉ có 1 Payment.
EXEC dbo.usp_CheckOut @ActorId = @Staff,@SessionId = @Session,@PaymentMethod = 'SIMULATED',@ConfirmedAmount = @Amount,@Key = @Key;
SELECT * FROM dbo.Payment WHERE session_id = @Session;
SELECT s.code,s.operational_status,s.buffer_until FROM dbo.ParkingSlot s
JOIN dbo.ParkingSession ps ON ps.slot_id = s.id WHERE ps.id = @Session;
-- Nếu đúng lúc chuyển giờ tính phí nhận 51009, xem lại phí rồi xác nhận lại.
```

### 2.6. Hủy, sự cố, bảo trì, cấu hình và giá

Các lệnh dưới đây để trong comment vì cần chọn đúng id và trạng thái trước khi chạy. Bỏ `--` ở lệnh cần dùng và điền tham số; không chạy nguyên khối để đổi hàng loạt dữ liệu.

```sql
USE [ParkingLotOnline];
GO
DECLARE @Admin int = (SELECT id FROM dbo.Users WHERE normalized_email = N'admin@parking.test'),
    @Staff int = (SELECT id FROM dbo.Users WHERE normalized_email = N'staff1@parking.test'),
    @Customer int = (SELECT id FROM dbo.Users WHERE normalized_email = N'customer1@parking.test');

-- EXEC dbo.usp_CancelReservation @ActorId=@Customer, @ReservationId=ID_CAN_HUY, @Key='cancel-001';
-- EXEC dbo.usp_ReservationServiceIssue @ActorId=@Staff, @ReservationId=ID_CAN_XU_LY,
--     @Reason=N'Khách đã đến, vị trí đặt còn xe quá giờ', @MarkUnfulfilled=0, @Key='issue-001';
-- EXEC dbo.usp_ReservationServiceIssue @ActorId=@Staff, @ReservationId=ID_CAN_XU_LY,
--     @Reason=N'Không còn vị trí thay thế phù hợp', @MarkUnfulfilled=1, @Key='unfulfilled-001';
-- EXEC dbo.usp_CheckIn @ActorId=@Staff, @SlotId=ID_SLOT_THAY_THE, @Key='swap-001',
--     @ReservationCode='MA_RESERVATION', @ReplacementReason=N'Chỗ cũ chưa phục vụ được', @CustomerAgreed=1;
-- EXEC dbo.usp_CorrectWalkInPlate @ActorId=@Staff, @SessionId=ID_WALK_IN,
--     @Plate=N'51C-999.98', @Reason=N'Nhập nhầm một chữ số khi nhận xe', @Key='plate-001';
-- EXEC dbo.usp_SetSlotMaintenance @ActorId=@Staff, @SlotId=ID_SLOT,
--     @IsMaintenance=1, @Reason=N'Sửa nền vị trí', @Key='maintenance-001';
-- EXEC dbo.usp_SetSlotMaintenance @ActorId=@Staff, @SlotId=ID_SLOT,
--     @IsMaintenance=0, @Reason=N'Đã kiểm tra phục vụ lại được', @Key='maintenance-002';
-- EXEC dbo.usp_SaveVehicle @ActorId=@Customer, @VehicleId=NULL, @Plate=N'59-C1 112.23',
--     @VehicleType='MOTORBIKE', @IsActive=1, @Key='vehicle-new-001';
-- EXEC dbo.usp_AdminSaveParkingConfig @ActorId=@Admin, @Entity='ParkingLot', @Id=NULL,
--     @Name=N'Bãi mới', @Address=N'Địa chỉ bãi mới', @IsActive=1, @Reason=N'Thêm bãi', @Key='lot-new-001';
-- EXEC dbo.usp_AdminSaveParkingConfig @ActorId=@Admin, @Entity='Zone', @Id=NULL, @ParentId=ID_BAI,
--     @Name=N'Khu xe máy mới', @FloorLabel=N'Tầng 1', @VehicleType='MOTORBIKE',
--     @IsActive=1, @Reason=N'Thêm khu', @Key='zone-new-001';
-- EXEC dbo.usp_AdminSaveParkingConfig @ActorId=@Admin, @Entity='ParkingSlot', @Id=NULL, @ParentId=ID_KHU,
--     @Name=N'M-R07', @AcceptsReservations=1, @IsActive=1, @Reason=N'Thêm vị trí', @Key='slot-new-001';
-- EXEC dbo.usp_AdminSetPrice @ActorId=@Admin, @VehicleType='MOTORBIKE', @PricePerHour=6000,
--     @Reason=N'Cập nhật bảng giá demo', @Key='price-001';
-- EXEC dbo.usp_AdminSaveUser @ActorId=@Admin, @UserId=ID_USER, @Name=N'Nhân viên mới',
--     @Email=N'staff-new@parking.test', @Role='Staff', @AssignedLotId=ID_BAI, @IsActive=1,
--     @Reason=N'Phân công nhân viên', @Key='user-001';
-- Tạo user mới: UserId=NULL và thêm PasswordHash do PasswordHasher ở backend sinh.
EXEC dbo.usp_ExpireReservations;
EXEC dbo.usp_AdminListUsers @ActorId=@Admin;
```

### 2.7. Báo cáo ngày hôm nay tại Việt Nam

```sql
USE [ParkingLotOnline];
GO
DECLARE @Admin int = (SELECT id FROM dbo.Users WHERE normalized_email = N'admin@parking.test'),
    @TodayVN date = CONVERT(date,DATEADD(HOUR,7,SYSUTCDATETIME())),@TomorrowVN date;
SET @TomorrowVN = DATEADD(DAY,1,@TodayVN);
EXEC dbo.usp_GetOccupancy @ActorId=@Admin;
EXEC dbo.usp_AdminRevenueReport @ActorId=@Admin,@FromDateVN=@TodayVN,@ToDateVNExclusive=@TomorrowVN;
EXEC dbo.usp_GetTrafficReport @ActorId=@Admin,@FromDateVN=@TodayVN,@ToDateVNExclusive=@TomorrowVN;
```

### 2.8. Đối chiếu tính toàn vẹn (SSMS, tài khoản quản trị database)

Ba truy vấn cuối phải không trả bản ghi nếu mọi lệnh ghi đi qua procedure. Hai dòng kiểm tra phí phải trả `1` và `2`.

```sql
USE [ParkingLotOnline];
GO
SELECT dbo.fn_BillableHours('2026-10-11T00:00:00','2026-10-11T01:00:00') AS exact_one_hour,
    dbo.fn_BillableHours('2026-10-11T00:00:00','2026-10-11T01:00:00.0000001') AS over_one_hour;
SELECT ps.id,ps.status,p.id AS payment_id FROM dbo.ParkingSession ps LEFT JOIN dbo.Payment p ON p.session_id = ps.id
WHERE (ps.status = 'COMPLETED' AND p.id IS NULL) OR (ps.status = 'OPEN' AND p.id IS NOT NULL);
SELECT s.id,s.operational_status,ps.id AS open_session_id FROM dbo.ParkingSlot s
LEFT JOIN dbo.ParkingSession ps ON ps.slot_id = s.id AND ps.status = 'OPEN'
WHERE (s.operational_status = 'OCCUPIED' AND ps.id IS NULL) OR (s.operational_status <> 'OCCUPIED' AND ps.id IS NOT NULL);
DECLARE @Now datetime2(7) = SYSUTCDATETIME();
SELECT a.id AS reservation_a,b.id AS reservation_b,a.slot_id
FROM dbo.fn_EffectiveReservations(@Now) a JOIN dbo.fn_EffectiveReservations(@Now) b ON a.id < b.id
WHERE (a.slot_id = b.slot_id AND a.start_time < DATEADD(MINUTE,15,b.end_time) AND b.start_time < DATEADD(MINUTE,15,a.end_time))
    OR (a.vehicle_id = b.vehicle_id AND a.start_time < b.end_time AND b.start_time < a.end_time);
```

## 3. Quy ước khi nối ASP.NET Core

- **ActorId lấy từ user đã xác thực**; đọc vai trò/bãi hiện tại từ database. Không nhận ActorId, PasswordHash, giá hay trạng thái từ JSON công khai. SQL role `parking_backend` là danh tính backend, không phải tài khoản trực tiếp cho từng Customer/Staff. Procedure nhận ActorId vì API là ranh giới xác thực.
- Gọi procedure bằng tham số (`SqlParameter`/ADO.NET hoặc EF Core parameterized SQL), không ghép chuỗi từ input. Backend kiểm tra độ dài trước khi gán tham số để tránh SQL cắt ngắn chuỗi; xác thực email/mật khẩu/biển số ở DTO. PasswordHash được sinh/verify bằng ASP.NET Core Identity, JWT được tạo ở backend.
- Lệnh ghi sau đăng nhập yêu cầu `Idempotency-Key`: mỗi thao tác mới một khóa, retry giữ cùng khóa và cùng tham số. RequestRecord và thay đổi nghiệp vụ commit cùng transaction; không tự xóa RequestRecord trong MVP. Đăng ký chưa có actor dùng email unique; một yêu cầu đăng ký lặp báo xung đột, không tự đăng nhập hoặc trả user theo email.
- Procedure ghi trả `http_status`, `response_json`, `is_replay`; thời gian trong JSON vẫn là UTC nhưng `FOR JSON` không thêm `Z`: API phải serialize thành ISO 8601 có `Z`/offset. Procedure đọc trả các dòng dữ liệu thông thường, báo cáo doanh thu có hai result set (chi tiết, tổng).
- Mã SQL `51000` → HTTP 400; `51001` → 403; `51004` → 404; `51009`, lỗi unique `2601/2627` → 409; `51010`, deadlock `1205` là lỗi tạm thời có thể retry tối đa 3 lần với cùng key. Không trả raw SQL exception/stack trace cho client. API tự trả 401 khi chưa đăng nhập.
- Chạy `usp_ExpireReservations` mỗi 60 giây bằng `BackgroundService`. Không phụ thuộc SQL Server Agent vì Express/LocalDB không cung cấp Agent. Availability và check-in vẫn xét deadline khi job chưa chạy. Một lệnh thất bại rollback cả cleanup kèm theo; job hoặc lệnh thành công kế tiếp sẽ cập nhật lại, trong lúc đó truy vấn dùng `effective_status`.
- Các lệnh ghi dùng `sp_getapplock` khóa chung trong transaction: đơn giản và phù hợp quy mô demo/MVP, đổi lại các yêu cầu ghi phải chờ nhau. Khi mở rộng tải, chuyển sang khóa theo biển số/Vehicle/Slot và thứ tự nhất quán, có kiểm thử đồng thời. Không ghi trực tiếp bằng EF CRUD vào các bảng nghiệp vụ trong khi dùng cơ chế này; lệnh ghi ngoài procedure có thể bỏ qua kiểm tra khoảng thời gian.
- Mỗi procedure ghi tự quản lý transaction; gọi như một lệnh độc lập, không bọc thêm transaction EF bên ngoài. Một procedure thất bại rollback toàn bộ transaction hiện tại. Khi tạo user, nếu cần retry, giữ nguyên hash đã sinh cho cùng thao tác để nội dung yêu cầu không đổi.
- CHECK/unique/FK bảo vệ dữ liệu tại từng bảng; những bất biến liên bảng như “COMPLETED luôn có Payment”, slot OCCUPIED có session và quyền Staff được bảo vệ bằng procedure + transaction + quyền database. Không cấp quyền sửa/xóa bảng cho tài khoản API. Người có quyền `db_owner` vẫn có thể can thiệp dữ liệu trực tiếp.
- `available_slots` trong dashboard là trạng thái vận hành AVAILABLE, có thể còn cooldown hoặc lịch sắp tới; số có thể **nhận xe ngay/đặt được** phải lấy từ truy vấn khả dụng tương ứng. Không cộng reservation vào occupied_slots.
- Sửa biển số walk-in không đổi customer_id/vehicle_id. Nếu phiên đã gắn xe đăng ký, chỉ sửa cách trình bày biển số, không đổi biển số chuẩn hóa sang xe khác; không tự gán lịch sử sang chủ mới.
- Khóa Customer không đóng phiên đang gửi: Staff vẫn check-out được. Các lịch đặt của tài khoản bị khóa cần xử lý theo nghiệp vụ; không xóa lịch sử. Không đổi bãi/khu của cấu hình đã tạo để báo cáo lịch sử giữ đúng địa điểm.
- Backend hiện tại gọi procedure qua `Microsoft.Data.SqlClient`, có API/giao diện thật cho đăng nhập, phương tiện, đặt/hủy/lịch sử, nhận/trả xe, thu tiền, quản trị bãi/giá/tài khoản, dashboard/báo cáo, xử lý sự cố phục vụ và sửa biển số walk-in. Customer có lịch sử gửi xe/phiếu thu và lý do xử lý sự cố. Xem tiến độ/phạm vi còn lại trong `README.md`. Database cũ nâng cấp bằng các script trong `scripts/sql` theo thứ tự ngày, kết thúc bằng `20261025_staff_exceptions.sql`; không tạo lại bảng. Máy hiện tại đã cập nhật. Nếu chọn EF migration về sau, dùng một quy trình quản lý schema nhất quán, không tự chạy `EnsureCreated()` hoặc initial migration lên database đã tạo bằng script này.

Connection string mẫu cho môi trường cục bộ (chỉnh server theo máy; giữ thông tin nhạy cảm trong User Secrets/cấu hình môi trường):

```json
{
  "ConnectionStrings": {
    "ParkingDatabase": "Server=localhost;Database=ParkingLotOnline;Trusted_Connection=True;Encrypt=True;TrustServerCertificate=True;"
  }
}
```

Máy hiện tại sau khi cài lại Windows dùng instance mặc định `localhost`; nếu cài instance có tên Express thì dùng `localhost\\SQLEXPRESS`. Nếu dùng LocalDB, phần server là `(localdb)\\MSSQLLocalDB`. `TrustServerCertificate=True` trong ví dụ phục vụ kết nối cục bộ với chứng chỉ tự ký. Khi chạy API bằng tài khoản database riêng, gán user đó vào role `parking_backend`; tài khoản Windows quản trị dùng để chạy script khởi tạo không phải cấu hình phân quyền chạy API.

## 4. Kiểm tra đã thực hiện

Đã chạy script trên SQL Server cục bộ trong database kiểm thử riêng, không nạp vào database đồ án. Các lỗi phát hiện khi chạy đã được sửa trong script ở trên.

- Khởi tạo đủ 11 bảng, khóa/index, function/view/procedure và dữ liệu demo; chạy lại giữ thanh toán, mức giá đã sửa và dữ liệu hiện có.
- 77 lượt kiểm tra bằng assertion/gọi procedure: chuẩn hóa biển số, ranh giới phí đúng 60 phút và vượt 100ns, đặt trùng slot/xe, quyền chủ xe và bãi của Staff, replay, rollback khi phí sai, thu tiền một lần, cooldown, bảo trì, sự cố/đổi slot, no-show, cấu hình/tài khoản/xe, báo cáo và quyền database backend.
- Hai kết nối đặt cùng slot/khung giờ: một yêu cầu commit, yêu cầu còn lại chờ khóa rồi nhận xung đột; chỉ có một reservation được tạo.

Đây là kiểm tra SQL, chưa thay thế kiểm thử API/frontend, chạy tải, các kịch bản còn lại ở mục 21 của blueprint hoặc kiểm tra trên phiên bản SQL Server bạn triển khai.
