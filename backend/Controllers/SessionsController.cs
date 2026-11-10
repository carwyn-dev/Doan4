using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ParkingLotAPI.Data;
using ParkingLotAPI.Infrastructure;
using ParkingLotAPI.Models;

namespace ParkingLotAPI.Controllers;

[ApiController, Route("api/staff"), Authorize(Roles = "Staff")]
public sealed class StaffOperationsController(ParkingRepository repository) : ControllerBase
{
    private int ActorId => int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
    [HttpPut("slots/{id:int:min(1)}/maintenance")]
    public async Task<IActionResult> Maintenance(int id, StaffMaintenanceRequest request,
        [FromHeader(Name="Idempotency-Key")] string? key, CancellationToken cancellation)
    {
        if (request.PositionVerified != true)
            throw new ApiException(400,"POSITION_NOT_VERIFIED","Cần xác nhận đã kiểm tra vị trí thực tế.");
        if (key is null || !Regex.IsMatch(key,@"\A[A-Za-z0-9][A-Za-z0-9._:-]{0,127}\z"))
            throw new ApiException(400,"IDEMPOTENCY_KEY_REQUIRED","Cần mã yêu cầu hợp lệ cho thao tác bảo trì.");
        var result=await repository.SetSlotMaintenanceAsync(ActorId,id,new MaintenanceWriteRequest
        { IsMaintenance=request.IsMaintenance, Reason=request.Reason },key,cancellation);
        using var json=JsonDocument.Parse(result.Json);
        if (result.IsReplay) Response.Headers["Idempotency-Replayed"]="true";
        return StatusCode(result.Status,json.RootElement.Clone());
    }
    [HttpGet("operations")]
    public async Task<IActionResult> Operations(CancellationToken cancellation)
    {
        var user = (UserView)HttpContext.Items[typeof(UserView)]!;
        if (user.AssignedParkingLotId is not int lotId) throw new ApiException(403, "FORBIDDEN", "Tài khoản chưa được phân công bãi.");
        return Ok(await repository.GetSlotOperationsAsync(ActorId, lotId, cancellation));
    }
    [HttpGet("reservations/lookup")]
    public async Task<IActionResult> Lookup([FromQuery, Required, RegularExpression(@"^RS-[A-F0-9]{32}$")] string code, CancellationToken cancellation)
    {
        var rows = await repository.GetReservationsAsync(ActorId, null, 1, 1, cancellation, code);
        return rows.Count == 0 ? throw new ApiException(404, "NOT_FOUND", "Không tìm thấy mã đặt chỗ trong bãi được phân công.") : Ok(rows[0]);
    }
    [HttpGet("reservations/by-plate")]
    public async Task<IActionResult> ReservationsByPlate([FromQuery, Required, StringLength(32)] string plate, CancellationToken cancellation)
    {
        var normalized = plate.ToUpperInvariant().Replace(" ", "").Replace("-", "").Replace(".", "");
        if (!Regex.IsMatch(normalized, @"\A[A-Z0-9]{3,20}\z"))
            throw new ApiException(400, "INVALID_INPUT", "Nhập biển số hợp lệ, ví dụ 59-Z2 928.41.");
        return Ok(await repository.GetReservationsAsync(ActorId, null, 1, 1, cancellation, plate: plate));
    }
}

[ApiController, Route("api/sessions"), Authorize(Roles = "Customer,Staff")]
public sealed class SessionsController(ParkingRepository repository) : ControllerBase
{
    private int ActorId => int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
    private static string Key(string? key)
    {
        if (key is null || !Regex.IsMatch(key, @"\A[A-Za-z0-9][A-Za-z0-9._:-]{0,127}\z"))
            throw new ApiException(400, "IDEMPOTENCY_KEY_REQUIRED", "Cần mã yêu cầu hợp lệ cho thao tác xe vào/ra.");
        return key;
    }
    private static DateTime JsonUtc(JsonElement body, string property) => DateTime.SpecifyKind(body.GetProperty(property).GetDateTime(), DateTimeKind.Utc);
    [HttpPost("checkin"), Authorize(Roles = "Staff")]
    public async Task<IActionResult> CheckIn(CheckInRequest request, [FromHeader(Name = "Idempotency-Key")] string? key, CancellationToken cancellation)
    {
        if (request.ReservationCode is null && (string.IsNullOrWhiteSpace(request.PlateNumber) || request.VehicleType is null))
            throw new ApiException(400, "INVALID_INPUT", "Khách đến trực tiếp cần có biển số và loại xe.");
        var result = await repository.CheckInAsync(ActorId, request, Key(key), cancellation);
        using var json = JsonDocument.Parse(result.Json);
        var b = json.RootElement;
        if (result.IsReplay) Response.Headers["Idempotency-Replayed"] = "true";
        return StatusCode(result.Status, new CheckInResult(b.GetProperty("id").GetInt32(), b.GetProperty("sessionCode").GetString()!,
            b.GetProperty("status").GetString()!, JsonUtc(b, "checkInTime"), b.GetProperty("slotId").GetInt32(), b.GetProperty("appliedPricePerHour").GetDecimal()));
    }
    [HttpPost("{id:int:min(1)}/checkout"), Authorize(Roles = "Staff")]
    public async Task<IActionResult> CheckOut(int id, CheckOutRequest request, [FromHeader(Name = "Idempotency-Key")] string? key, CancellationToken cancellation)
    {
        if (request.ConfirmedAmount != decimal.Truncate(request.ConfirmedAmount!.Value))
            throw new ApiException(400, "INVALID_INPUT", "Số tiền VND phải là số nguyên.");
        var result = await repository.CheckOutAsync(ActorId, id, request, Key(key), cancellation);
        using var json = JsonDocument.Parse(result.Json);
        var b = json.RootElement;
        if (result.IsReplay) Response.Headers["Idempotency-Replayed"] = "true";
        return StatusCode(result.Status, new CheckOutResult(b.GetProperty("id").GetInt32(), b.GetProperty("status").GetString()!,
            b.GetProperty("paymentId").GetInt32(), b.GetProperty("amount").GetDecimal(), b.GetProperty("billableHours").GetInt32(), JsonUtc(b, "checkOutTime"), JsonUtc(b, "bufferUntil")));
    }
    [HttpGet]
    public async Task<IActionResult> List([FromQuery, RegularExpression("^(OPEN|COMPLETED)$")] string? status,
        [FromQuery, StringLength(40)] string? query, [FromQuery, Range(1, 1000000)] int page = 1,
        [FromQuery, Range(1, 200)] int pageSize = 20, CancellationToken cancellation = default)
    {
        query = string.IsNullOrWhiteSpace(query) ? null : query.Trim().ToUpperInvariant();
        var code = query?.StartsWith("PS-") == true ? query : null;
        if (query is not null && (code is not null ? !Regex.IsMatch(code, @"\APS-[A-F0-9]{32}\z") : query.Length > 32 || !Regex.IsMatch(query, @"\A[A-Z0-9 .-]+\z")))
            throw new ApiException(400, "INVALID_INPUT", "Nhập biển số hoặc mã phiên PS- hợp lệ.");
        return Ok(await repository.GetSessionsAsync(ActorId, null, status, code is null ? query : null, code, page, pageSize, cancellation));
    }
    [HttpGet("{id:int:min(1)}")]
    public async Task<IActionResult> Detail(int id, CancellationToken cancellation)
    {
        var rows = await repository.GetSessionsAsync(ActorId, id, null, null, null, 1, 1, cancellation);
        return rows.Count == 0 ? throw new ApiException(404, "NOT_FOUND", "Không tìm thấy lượt gửi xe trong phạm vi tài khoản.") : Ok(rows[0]);
    }
    [HttpGet("{id:int:min(1)}/fee")]
    public async Task<IActionResult> Fee(int id, CancellationToken cancellation) => Ok(await repository.GetSessionFeeAsync(ActorId, id, cancellation));
}
