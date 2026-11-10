using System.Data;
using Microsoft.Data.SqlClient;
using ParkingLotAPI.Infrastructure;
using ParkingLotAPI.Models;

namespace ParkingLotAPI.Data;

public sealed partial class ParkingRepository(IConfiguration configuration)
{
    private string ConnectionString => configuration.GetConnectionString("ParkingDatabase")
        ?? throw new ApiException(503, "DATABASE_NOT_CONFIGURED", "Chưa cấu hình kết nối database.");
    private static SqlCommand Command(SqlConnection connection, string procedure, params SqlParameter[] parameters)
    {
        var command = new SqlCommand(procedure, connection) { CommandType = CommandType.StoredProcedure, CommandTimeout = 20 };
        command.Parameters.AddRange(parameters);
        return command;
    }
    private static SqlParameter Text(string name, int size, string? value) =>
        new(name, SqlDbType.NVarChar, size) { Value = (object?)value ?? DBNull.Value };
    private static SqlParameter Number(string name, int? value) =>
        new(name, SqlDbType.Int) { Value = (object?)value ?? DBNull.Value };
    private static DateTime Utc(SqlDataReader reader, string name) => DateTime.SpecifyKind(reader.GetDateTime(reader.GetOrdinal(name)), DateTimeKind.Utc);
    private static string? OptionalString(SqlDataReader reader, string name) => reader.IsDBNull(reader.GetOrdinal(name)) ? null : reader.GetString(reader.GetOrdinal(name));
    private static UserView ReadUser(SqlDataReader reader, bool login = false) => new(
        reader.GetInt32(reader.GetOrdinal("id")), reader.GetString(reader.GetOrdinal("name")),
        reader.GetString(reader.GetOrdinal("normalized_email")), OptionalString(reader, "phone"),
        reader.GetString(reader.GetOrdinal("role")), reader.GetBoolean(reader.GetOrdinal("is_active")),
        reader.IsDBNull(reader.GetOrdinal("assigned_parking_lot_id")) ? null : reader.GetInt32(reader.GetOrdinal("assigned_parking_lot_id")),
        login ? DateTime.SpecifyKind(DateTime.MinValue, DateTimeKind.Utc) : Utc(reader, "created_at"));

    public async Task CheckReadyAsync(CancellationToken cancellation)
    {
        await using var connection = new SqlConnection(ConnectionString);
        await connection.OpenAsync(cancellation);
        await using var command = new SqlCommand("""
            SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM (VALUES
                (N'dbo.usp_ExpireReservations'),
                (N'dbo.usp_GetAvailability'),
                (N'dbo.usp_CreateReservation'),
                (N'dbo.usp_CancelReservation'),
                (N'dbo.usp_ReservationServiceIssue'),
                (N'dbo.usp_CheckIn'),
                (N'dbo.usp_GetSessionFee'),
                (N'dbo.usp_CheckOut'),
                (N'dbo.usp_CorrectWalkInPlate'),
                (N'dbo.usp_SetSlotMaintenance'),
                (N'dbo.usp_RegisterCustomer'),
                (N'dbo.usp_GetLoginUser'),
                (N'dbo.usp_GetUserProfile'),
                (N'dbo.usp_SaveVehicle'),
                (N'dbo.usp_AdminSaveUser'),
                (N'dbo.usp_AdminSaveParkingConfig'),
                (N'dbo.usp_AdminSetPrice'),
                (N'dbo.usp_GetMyVehicles'),
                (N'dbo.usp_ListReservations'),
                (N'dbo.usp_ListSessions'),
                (N'dbo.usp_ListPayments'),
                (N'dbo.usp_GetSlotOperations'),
                (N'dbo.usp_AdminListUsers'),
                (N'dbo.usp_GetOccupancy'),
                (N'dbo.usp_AdminRevenueReport'),
                (N'dbo.usp_GetTrafficReport'),
                (N'dbo.usp_GetDashboard'),
                (N'dbo.usp_AdminDailyReport')
            ) AS required(name) WHERE OBJECT_ID(required.name,N'P') IS NULL)
            AND EXISTS (SELECT 1 FROM sys.parameters WHERE object_id=OBJECT_ID(N'dbo.usp_ListReservations') AND name=N'@Plate')
            AND (SELECT COUNT(DISTINCT name) FROM sys.dm_exec_describe_first_result_set_for_object(OBJECT_ID(N'dbo.usp_ListReservations'),0) WHERE error_number IS NULL AND name IN (N'resolution_deadline',N'can_record_issue',N'can_mark_unfulfilled'))=3
            AND (SELECT COUNT(DISTINCT name) FROM sys.dm_exec_describe_first_result_set_for_object(OBJECT_ID(N'dbo.usp_ListSessions'),0) WHERE error_number IS NULL AND name IN (N'plate_correction_deadline',N'can_correct_plate'))=2
            THEN 1 ELSE 0 END;
            """, connection) { CommandTimeout = 20 };
        if (Convert.ToInt32(await command.ExecuteScalarAsync(cancellation)) != 1)
            throw new ApiException(503, "DATABASE_NOT_READY", "Database thiếu thủ tục hoặc chưa cập nhật đủ migration. Hãy kiểm tra sql.md và các script cập nhật trong README.");
    }
    public async Task<LoginUser?> GetLoginUserAsync(string email, CancellationToken cancellation)
    {
        await using var connection = new SqlConnection(ConnectionString);
        await connection.OpenAsync(cancellation);
        await using var command = Command(connection, "dbo.usp_GetLoginUser", Text("@Email", 256, email));
        await using var reader = await command.ExecuteReaderAsync(cancellation);
        return await reader.ReadAsync(cancellation) ? new LoginUser(ReadUser(reader, true), reader.GetString(reader.GetOrdinal("password_hash"))) : null;
    }
    public async Task<UserView> GetProfileAsync(int actorId, CancellationToken cancellation)
    {
        await using var connection = new SqlConnection(ConnectionString);
        await connection.OpenAsync(cancellation);
        await using var command = Command(connection, "dbo.usp_GetUserProfile", Number("@ActorId", actorId));
        await using var reader = await command.ExecuteReaderAsync(cancellation);
        if (!await reader.ReadAsync(cancellation)) throw new ApiException(401, "UNAUTHENTICATED", "Tài khoản không còn khả dụng.");
        return ReadUser(reader);
    }
    public Task<MutationResult> RegisterAsync(RegisterRequest request, string hash, CancellationToken cancellation) =>
        ExecuteMutationAsync("dbo.usp_RegisterCustomer", cancellation, Text("@Name", 100, request.Name.Trim()),
            Text("@Email", 256, request.Email.Trim().ToLowerInvariant()), Text("@PasswordHash", 512, hash),
            new SqlParameter("@Phone", SqlDbType.VarChar, 20) { Value = (object?)request.Phone?.Trim() ?? DBNull.Value });
    public async Task<List<VehicleView>> GetVehiclesAsync(int actorId, CancellationToken cancellation)
    {
        await using var connection = new SqlConnection(ConnectionString);
        await connection.OpenAsync(cancellation);
        await using var command = Command(connection, "dbo.usp_GetMyVehicles", Number("@ActorId", actorId));
        await using var reader = await command.ExecuteReaderAsync(cancellation);
        var rows = new List<VehicleView>();
        while (await reader.ReadAsync(cancellation)) rows.Add(new(
            reader.GetInt32(reader.GetOrdinal("id")), reader.GetInt32(reader.GetOrdinal("user_id")),
            reader.GetString(reader.GetOrdinal("plate_number")), reader.GetString(reader.GetOrdinal("normalized_plate_number")),
            reader.GetString(reader.GetOrdinal("vehicle_type")), reader.GetBoolean(reader.GetOrdinal("is_active")), Utc(reader, "created_at")));
        return rows;
    }
    public Task<MutationResult> SaveVehicleAsync(int actorId, int? id, VehicleWriteRequest request, string key, CancellationToken cancellation) =>
        ExecuteMutationAsync("dbo.usp_SaveVehicle", cancellation, Number("@ActorId", actorId), Number("@VehicleId", id),
            Text("@Plate", 32, request.PlateNumber.Trim()), new SqlParameter("@VehicleType", SqlDbType.VarChar, 12) { Value = request.VehicleType },
            new SqlParameter("@IsActive", SqlDbType.Bit) { Value = request.IsActive }, new SqlParameter("@Key", SqlDbType.VarChar, 128) { Value = key });
    private async Task<MutationResult> ExecuteMutationAsync(string procedure, CancellationToken cancellation, params SqlParameter[] parameters)
    {
        await using var connection = new SqlConnection(ConnectionString);
        await connection.OpenAsync(cancellation);
        // Procedure tự quản lý transaction; không bọc thêm transaction bên ngoài.
        await using var command = Command(connection, procedure, parameters);
        await using var reader = await command.ExecuteReaderAsync(cancellation);
        if (!await reader.ReadAsync(cancellation)) throw new InvalidOperationException("Procedure did not return a result.");
        return new(Convert.ToInt32(reader["http_status"]), reader.GetString(reader.GetOrdinal("response_json")), reader.GetBoolean(reader.GetOrdinal("is_replay")));
    }
}
