USE [ParkingLotOnline];
GO
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

CREATE OR ALTER PROCEDURE dbo.usp_ListReservations
    @ActorId int,@ReservationId int = NULL,@ParkingLotId int = NULL,@Status varchar(15) = NULL,
    @Page int = 1,@PageSize int = 50,@ReservationCode varchar(40) = NULL,@Plate nvarchar(32) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    EXEC dbo.usp_InternalAssertActor @ActorId;
    IF @Page IS NULL OR @Page < 1 OR @Page > 1000000 OR @PageSize IS NULL OR @PageSize NOT BETWEEN 1 AND 200
        THROW 51000, N'Tham số phân trang không hợp lệ.', 1;
    DECLARE @Now datetime2(7) = SYSUTCDATETIME(),@Normalized varchar(32) = dbo.fn_NormalizePlate(@Plate);
    SELECT r.*,z.parking_lot_id,s.code AS slot_code,z.name AS zone_name,p.name AS parking_lot_name,
        state.effective_status,
        CASE WHEN r.service_issue_at IS NOT NULL THEN
            CASE WHEN DATEADD(MINUTE,15,r.service_issue_at)<r.end_time THEN DATEADD(MINUTE,15,r.service_issue_at) ELSE r.end_time END END AS resolution_deadline,
        CAST(CASE WHEN u.role='Staff' AND r.status='CONFIRMED' AND r.service_issue_at IS NULL
            AND @Now>=DATEADD(MINUTE,-15,r.start_time) AND @Now<r.expires_at THEN 1 ELSE 0 END AS bit) AS can_record_issue,
        CAST(CASE WHEN u.role='Staff' AND r.status='CONFIRMED' AND @Now>=DATEADD(MINUTE,-15,r.start_time)
            AND ((r.service_issue_at IS NULL AND @Now<r.expires_at) OR (r.service_issue_at IS NOT NULL
                AND @Now<DATEADD(MINUTE,15,r.service_issue_at) AND @Now<r.end_time)) THEN 1 ELSE 0 END AS bit) AS can_mark_unfulfilled
    FROM dbo.Reservation r JOIN dbo.ParkingSlot s ON s.id = r.slot_id JOIN dbo.Zone z ON z.id = s.zone_id
    JOIN dbo.ParkingLot p ON p.id = z.parking_lot_id JOIN dbo.Users u ON u.id = @ActorId
    CROSS APPLY (VALUES (CASE WHEN r.status = 'CONFIRMED' AND r.service_issue_at IS NULL AND @Now >= r.expires_at THEN 'EXPIRED'
        WHEN r.status = 'CONFIRMED' AND r.service_issue_at IS NOT NULL
            AND (@Now >= DATEADD(MINUTE,15,r.service_issue_at) OR @Now >= r.end_time) THEN 'UNFULFILLED'
        ELSE r.status END)) state(effective_status)
    WHERE (@ReservationId IS NULL OR r.id = @ReservationId) AND (@ParkingLotId IS NULL OR z.parking_lot_id = @ParkingLotId)
        AND (@ReservationCode IS NULL OR r.reservation_code = @ReservationCode)
        AND (@Status IS NULL OR r.status = @Status)
        AND (@Plate IS NULL OR (u.role = 'Staff' AND state.effective_status = 'CONFIRMED'
            AND dbo.fn_NormalizePlate(r.plate_number_snapshot) = @Normalized COLLATE Latin1_General_100_BIN2))
        AND (u.role = 'Admin' OR (u.role = 'Customer' AND r.user_id = @ActorId)
            OR (u.role = 'Staff' AND u.assigned_parking_lot_id = z.parking_lot_id))
    -- Tra theo biển số trả các khung giờ còn hiệu lực để nhân viên chọn.
    ORDER BY CASE WHEN @Plate IS NOT NULL THEN r.start_time END, r.created_at DESC, r.id DESC
    OFFSET (CASE WHEN @Plate IS NULL THEN (@Page - 1) * @PageSize ELSE 0 END) ROWS
    FETCH NEXT (CASE WHEN @Plate IS NULL THEN @PageSize ELSE 2147483647 END) ROWS ONLY;
END;
GO
