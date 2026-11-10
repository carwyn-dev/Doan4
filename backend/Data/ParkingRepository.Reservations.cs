using System.Data;
using Microsoft.Data.SqlClient;
using ParkingLotAPI.Models;

namespace ParkingLotAPI.Data;

public sealed partial class ParkingRepository
{
    public async Task ExpireReservationsAsync(CancellationToken cancellation)
    {
        await using var connection = new SqlConnection(ConnectionString);
        await connection.OpenAsync(cancellation);
        await using var command = Command(connection, "dbo.usp_ExpireReservations");
        await command.ExecuteNonQueryAsync(cancellation);
    }
    private static SqlParameter Timestamp(string name, DateTime value) =>
        new(name, SqlDbType.DateTime2) { Scale = 7, Value = value };

    public async Task<List<ParkingLotView>> GetParkingLotsAsync(CancellationToken cancellation)
    {
        await using var connection = new SqlConnection(ConnectionString);
        await connection.OpenAsync(cancellation);
        await using var command = new SqlCommand("SELECT id,name,address FROM dbo.ParkingLot WHERE is_active=1 ORDER BY id", connection);
        await using var reader = await command.ExecuteReaderAsync(cancellation);
        var rows = new List<ParkingLotView>();
        while (await reader.ReadAsync(cancellation)) rows.Add(new(reader.GetInt32(0), reader.GetString(1), reader.GetString(2)));
        return rows;
    }
    public async Task<List<AvailableSlotView>> GetAvailabilityAsync(int actorId, int lotId, ReservationWindow request, CancellationToken cancellation)
    {
        var (start, end) = request.UtcWindow();
        await using var connection = new SqlConnection(ConnectionString);
        await connection.OpenAsync(cancellation);
        await using var command = Command(connection, "dbo.usp_GetAvailability", Number("@ActorId", actorId),
            Number("@VehicleId", request.VehicleId), Number("@ParkingLotId", lotId), Timestamp("@StartUtc", start), Timestamp("@EndUtc", end));
        await using var reader = await command.ExecuteReaderAsync(cancellation);
        var rows = new List<AvailableSlotView>();
        while (await reader.ReadAsync(cancellation)) rows.Add(new(reader.GetInt32(reader.GetOrdinal("slot_id")),
            reader.GetString(reader.GetOrdinal("code")), reader.GetInt32(reader.GetOrdinal("zone_id")),
            reader.GetString(reader.GetOrdinal("zone_name")), reader.GetString(reader.GetOrdinal("vehicle_type"))));
        return rows;
    }
    public Task<MutationResult> CreateReservationAsync(int actorId, CreateReservationRequest request, string key, CancellationToken cancellation)
    {
        var (start, end) = request.UtcWindow();
        return ExecuteMutationAsync("dbo.usp_CreateReservation", cancellation, Number("@ActorId", actorId),
            Number("@VehicleId", request.VehicleId), Number("@SlotId", request.SlotId), Timestamp("@StartUtc", start),
            Timestamp("@EndUtc", end), new SqlParameter("@Key", SqlDbType.VarChar, 128) { Value = key });
    }
    public Task<MutationResult> CancelReservationAsync(int actorId, int id, string key, CancellationToken cancellation) =>
        ExecuteMutationAsync("dbo.usp_CancelReservation", cancellation, Number("@ActorId", actorId), Number("@ReservationId", id),
            new SqlParameter("@Key", SqlDbType.VarChar, 128) { Value = key });

    public async Task<List<ReservationView>> GetReservationsAsync(int actorId, int? id, int page, int pageSize,
        CancellationToken cancellation, string? code = null, string? plate = null)
    {
        await using var connection = new SqlConnection(ConnectionString);
        await connection.OpenAsync(cancellation);
        await using var command = Command(connection, "dbo.usp_ListReservations", Number("@ActorId", actorId),
            Number("@ReservationId", id), Number("@Page", page), Number("@PageSize", pageSize),
            new SqlParameter("@ReservationCode", SqlDbType.VarChar, 40) { Value = (object?)code ?? DBNull.Value }, Text("@Plate", 32, plate));
        await using var reader = await command.ExecuteReaderAsync(cancellation);
        var rows = new List<ReservationView>();
        while (await reader.ReadAsync(cancellation))
        {
            var status = reader.GetString(reader.GetOrdinal("effective_status"));
            var start = Utc(reader, "start_time");
            rows.Add(new(reader.GetInt32(reader.GetOrdinal("id")), reader.GetString(reader.GetOrdinal("reservation_code")),
                reader.GetInt32(reader.GetOrdinal("vehicle_id")), reader.GetInt32(reader.GetOrdinal("slot_id")),
                reader.GetInt32(reader.GetOrdinal("parking_lot_id")), reader.GetString(reader.GetOrdinal("parking_lot_name")),
                reader.GetString(reader.GetOrdinal("zone_name")), reader.GetString(reader.GetOrdinal("slot_code")),
                reader.GetString(reader.GetOrdinal("plate_number_snapshot")), reader.GetString(reader.GetOrdinal("vehicle_type_snapshot")),
                start, Utc(reader, "end_time"), Utc(reader, "expires_at"), status, Utc(reader, "created_at"),
                reader.IsDBNull(reader.GetOrdinal("cancelled_at")) ? null : Utc(reader, "cancelled_at"),
                status == "CONFIRMED" && DateTime.UtcNow < start,
                OptionalUtc(reader, "service_issue_at"), OptionalString(reader, "issue_reason"), OptionalUtc(reader, "resolution_deadline"),
                OptionalUtc(reader, "resolved_at"), reader.GetBoolean(reader.GetOrdinal("can_record_issue")), reader.GetBoolean(reader.GetOrdinal("can_mark_unfulfilled"))));
        }
        return rows;
    }
}
