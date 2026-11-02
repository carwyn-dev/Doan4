-- Chạy sau các migration 22/10 và 25/10; chỉ cấp quyền metadata cho 2 procedure.
USE [ParkingLotOnline];
GO
GRANT VIEW DEFINITION ON OBJECT::dbo.usp_ListReservations TO parking_backend;
GRANT VIEW DEFINITION ON OBJECT::dbo.usp_ListSessions TO parking_backend;
GO
