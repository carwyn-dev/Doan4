"""Real session/fee/payment tests in two tagged lots, without modifying demo data."""
import concurrent.futures
import datetime as dt
import json
import os
import re
import subprocess
import threading
import urllib.error
import urllib.parse
import urllib.request
import uuid

BASE = os.environ.get('PARKING_TEST_API', 'http://localhost:5143/api')
DATABASE = os.environ.get('PARKING_TEST_DATABASE', 'ParkingLotOnline')
if 'PARKING_TEST_DATABASE' in os.environ:
    assert re.fullmatch(r'ParkingAdminVerify_[a-f0-9]{12}', DATABASE), 'Invalid disposable database'
    assert BASE.startswith('http://127.0.0.1:')
TAG = uuid.uuid4().hex[:10]
PREFIX = 'session-check-' + TAG
PASSWORD = 'SessionTest123!'
accounts, tokens = [], []
passed = 0
SETTINGS = ('SET NOCOUNT ON; SET QUOTED_IDENTIFIER ON; SET ANSI_NULLS ON; SET ANSI_PADDING ON; '
            'SET ANSI_WARNINGS ON; SET ARITHABORT ON; SET CONCAT_NULL_YIELDS_NULL ON; SET NUMERIC_ROUNDABORT OFF; SET XACT_ABORT ON; ')

def sql(statement):
    result = subprocess.run([os.environ.get('PARKING_TEST_SQLCMD', 'sqlcmd'), '-S', 'localhost', '-E', '-C', '-d', DATABASE, '-b', '-l', '5', '-h', '-1', '-W', '-Q', SETTINGS + statement], capture_output=True, text=True, timeout=30)
    assert result.returncode == 0, result.stdout + result.stderr
    return result.stdout.strip()

def check(condition, label):
    global passed
    assert condition, label
    passed += 1

def uid(): return str(uuid.uuid4())
def call(method, route, body=None, token=None, key=None, expected=200):
    headers = {'Content-Type': 'application/json'}
    if token: headers['Authorization'] = 'Bearer ' + token
    if key: headers['Idempotency-Key'] = key
    req = urllib.request.Request(BASE + route, method=method, headers=headers, data=None if body is None else json.dumps(body).encode())
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            status, raw, hs = response.status, response.read(), response.headers
    except urllib.error.HTTPError as response:
        status, raw, hs = response.code, response.read(), response.headers
    if expected is not None: check(status == expected, (method, route, status, expected, raw.decode()[:700]))
    return status, json.loads(raw) if raw else None, hs

def parallel(actions):
    barrier = threading.Barrier(len(actions))
    def run(action):
        barrier.wait(timeout=10)
        return action()
    with concurrent.futures.ThreadPoolExecutor(max_workers=len(actions)) as pool: return list(pool.map(run, actions))

try:
    sql(f"""BEGIN TRANSACTION;
DECLARE @lot int,@zone int;
INSERT dbo.ParkingLot(name,address) VALUES(N'{PREFIX}-A',N'Test only'); SET @lot=SCOPE_IDENTITY();
INSERT dbo.Zone(parking_lot_id,name,vehicle_type) VALUES(@lot,N'Test cars','CAR'); SET @zone=SCOPE_IDENTITY();
INSERT dbo.ParkingSlot(zone_id,code,accepts_reservations) VALUES(@zone,'R1',1),(@zone,'R2',1),(@zone,'W1',0),(@zone,'W2',0);
INSERT dbo.Zone(parking_lot_id,name,vehicle_type) VALUES(@lot,N'Test bikes','MOTORBIKE'); SET @zone=SCOPE_IDENTITY();
INSERT dbo.ParkingSlot(zone_id,code,accepts_reservations) VALUES(@zone,'M1',0);
INSERT dbo.ParkingLot(name,address) VALUES(N'{PREFIX}-B',N'Test only'); SET @lot=SCOPE_IDENTITY();
INSERT dbo.Zone(parking_lot_id,name,vehicle_type) VALUES(@lot,N'Test cars','CAR'); SET @zone=SCOPE_IDENTITY();
INSERT dbo.ParkingSlot(zone_id,code,accepts_reservations) VALUES(@zone,'W1',0);
COMMIT;""")
    for n in range(5):
        _, user, _ = call('POST', '/auth/register', {'name': 'Session fixture', 'email': f'{PREFIX}-{n}@parking.test', 'password': PASSWORD}, expected=201)
        accounts.append(int(user['id']))
    sql(f"UPDATE dbo.Users SET role='Staff',assigned_parking_lot_id=(SELECT id FROM dbo.ParkingLot WHERE name=N'{PREFIX}-A') WHERE id IN ({accounts[2]},{accounts[3]}); UPDATE dbo.Users SET role='Staff',assigned_parking_lot_id=(SELECT id FROM dbo.ParkingLot WHERE name=N'{PREFIX}-B') WHERE id={accounts[4]};")
    for n in range(5):
        _, auth, _ = call('POST', '/auth/login', {'email': f'{PREFIX}-{n}@parking.test', 'password': PASSWORD})
        tokens.append(auth['token'])
    customer, other, staff, colleague, outside = tokens
    vehicles = []
    for n in range(2):
        _, vehicle, _ = call('POST', '/vehicles', {'plateNumber': f'SE{TAG.upper()}{n}', 'vehicleType': 'CAR'}, tokens[n], uid(), 201)
        vehicles.append(vehicle)
    _, ops, _ = call('GET', '/staff/operations', token=staff)
    check(len(ops) == 5 and all(s['parkingLotName'] == PREFIX + '-A' for s in ops), 'Operations leaked another lot')
    slots = {s['code']: s['id'] for s in ops}
    call('GET', '/staff/operations', token=customer, expected=403)
    call('GET', '/sessions', expected=401)
    start = dt.datetime.now(dt.timezone.utc).replace(microsecond=0) + dt.timedelta(minutes=5)
    window = {'vehicleId': vehicles[0]['id'], 'slotId': slots['R1'], 'startTime': start.isoformat(), 'endTime': (start + dt.timedelta(hours=1)).isoformat()}
    _, reservation, _ = call('POST', '/reservations', window, customer, uid(), 201)
    rid = reservation['id']
    code = reservation['reservationCode']
    _, found, _ = call('GET', '/staff/reservations/lookup?code=' + code, token=staff)
    check(found['id'] == rid, 'Exact reservation lookup failed')
    call('GET', '/staff/reservations/lookup?code=' + code, token=outside, expected=404)
    call('GET', '/staff/reservations/lookup?code=invalid', token=staff, expected=400)
    plate = f'SE-{TAG.lower()[:5]} {TAG.lower()[5:]}.0'
    plate_route = '/staff/reservations/by-plate?' + urllib.parse.urlencode({'plate': plate})
    later_start = start + dt.timedelta(hours=2)
    later_window = {**window, 'startTime': later_start.isoformat(), 'endTime': (later_start + dt.timedelta(hours=1)).isoformat()}
    _, later, _ = call('POST', '/reservations', later_window, customer, uid(), 201)
    _, matches, _ = call('GET', plate_route, token=staff)
    check([row['id'] for row in matches] == [rid, later['id']], 'Plate did not find both confirmed windows in arrival order')
    check(all(row['status'] == 'CONFIRMED' for row in matches), 'Lookup exposed a non-confirmed reservation')
    check(call('GET', plate_route, token=outside)[1] == [], 'Plate lookup leaked another lot')
    call('GET', plate_route, token=customer, expected=403)
    call('GET', plate_route, expected=401)
    call('GET', '/staff/reservations/by-plate?plate=---', token=staff, expected=400)
    call('POST', f"/reservations/{later['id']}/cancel", token=customer, key=uid())
    check([row['id'] for row in call('GET', plate_route, token=staff)[1]] == [rid], 'Plate lookup returned a cancelled window')
    data = {'slotId': slots['R1'], 'reservationCode': code}
    call('POST', '/sessions/checkin', data, customer, uid(), 403)
    call('POST', '/sessions/checkin', data, outside, uid(), 403)
    call('POST', '/sessions/checkin', data, staff, expected=400)
    call('POST', '/sessions/checkin', {**data, 'price': 1}, staff, uid(), 400)
    call('POST', '/sessions/checkin', {**data, 'plateNumber': 'OVERRIDE'}, staff, uid(), 400)
    call('POST', '/sessions/checkin', {**data, 'slotId': slots['W1']}, staff, uid(), 409)
    call('POST', '/sessions/checkin', {**data, 'slotId': slots['R2']}, staff, uid(), 400)
    data = {**data, 'slotId': slots['R2'], 'replacementReason': 'Customer agreed to replacement', 'customerAgreed': True}
    key = uid()
    results = parallel([lambda: call('POST', '/sessions/checkin', data, staff, key, 201) for _ in range(2)])
    received = results[0][1]; sid = received['id']
    check(results[1][1] == received and any(r[2].get('Idempotency-Replayed') == 'true' for r in results), 'Check-in replay created two sessions')
    check(received['checkInTime'].endswith('Z'), 'Check-in time missing UTC')
    call('POST', '/sessions/checkin', {**data, 'replacementReason': 'Changed'}, staff, key, 409)
    check(sql(f"SELECT COUNT(*) FROM dbo.AuditLog WHERE actor_user_id={accounts[2]} AND action='SLOT_REASSIGNED' AND entity_id={rid};") == '1', 'Slot swap audit missing/duplicated')
    check(sql(f"SELECT status FROM dbo.Reservation WHERE id={rid};") == 'CHECKED_IN', 'Reservation did not transition')
    check(call('GET', plate_route, token=staff)[1] == [], 'Plate lookup returned a checked-in window')
    _, detail, _ = call('GET', f'/sessions/{sid}', token=customer)
    check(detail['customerId'] == accounts[0] and detail['slotId'] == slots['R2'] and detail['reservationCode'] == code, 'Session ownership/snapshot mismatch')
    for token in [other, outside]:
        call('GET', f'/sessions/{sid}', token=token, expected=404)
        call('GET', f'/sessions/{sid}/fee', token=token, expected=404)
    _, fee, _ = call('GET', f'/sessions/{sid}/fee', token=staff)
    check(fee['billableHours'] == 1 and fee['amount'] == received['appliedPricePerHour'] and fee['isEstimate'], 'Incorrect server fee')
    payment = {'paymentMethod': 'CASH', 'confirmedAmount': fee['amount']}
    call('POST', f'/sessions/{sid}/checkout', payment, customer, uid(), 403)
    call('POST', f'/sessions/{sid}/checkout', payment, outside, uid(), 403)
    call('POST', f'/sessions/{sid}/checkout', payment, staff, expected=400)
    call('POST', f'/sessions/{sid}/checkout', {**payment, 'confirmedAmount': fee['amount'] + 0.5}, staff, uid(), 400)
    call('POST', f'/sessions/{sid}/checkout', {**payment, 'confirmedAmount': fee['amount'] + 1}, staff, uid(), 409)
    call('POST', f'/sessions/{sid}/checkout', {**payment, 'paymentMethod': 'BANK'}, staff, uid(), 400)
    call('POST', f'/sessions/{sid}/checkout', {**payment, 'paidAt': start.isoformat()}, staff, uid(), 400)
    check(sql(f"SELECT COUNT(*) FROM dbo.Payment WHERE session_id={sid};") == '0', 'Failed checkout created payment')
    check(sql(f"SELECT status FROM dbo.ParkingSession WHERE id={sid};") == 'OPEN', 'Failed checkout closed session')
    keys = [uid(), uid()]
    results = parallel([
        lambda: call('POST', f'/sessions/{sid}/checkout', payment, staff, keys[0], None),
        lambda: call('POST', f'/sessions/{sid}/checkout', payment, colleague, keys[1], None)])
    check(sorted(r[0] for r in results) == [200, 409], 'Concurrent staff collected payment twice')
    winner = next(n for n, r in enumerate(results) if r[0] == 200)
    paid = results[winner][1]
    _, replay, hs = call('POST', f'/sessions/{sid}/checkout', payment, [staff, colleague][winner], keys[winner])
    check(replay == paid and hs.get('Idempotency-Replayed') == 'true', 'Checkout replay changed result')
    check(sql(f"SELECT COUNT(*) FROM dbo.Payment WHERE session_id={sid};") == '1', 'Payment is not unique')
    check(sql(f"SELECT status FROM dbo.Reservation WHERE id={rid};") == 'COMPLETED', 'Reservation not completed with checkout')
    _, detail, _ = call('GET', f'/sessions/{sid}', token=customer)
    check(detail['status'] == 'COMPLETED' and detail['paymentId'] == paid['paymentId'] and detail['paidAmount'] == paid['amount'], 'Customer receipt missing')
    _, final_fee, _ = call('GET', f'/sessions/{sid}/fee', token=customer)
    check(not final_fee['isEstimate'] and final_fee['amount'] == paid['amount'], 'Completed fee remained an estimate')
    _, ops, _ = call('GET', '/staff/operations', token=staff)
    actual = next(s for s in ops if s['id'] == slots['R2'])
    check(actual['status'] == 'AVAILABLE' and actual['isInBuffer'] and actual['openSessionId'] is None, 'Checkout did not free slot with cooldown')
    for query in [detail['sessionCode'].lower(), vehicles[0]['plateNumber']]:
        _, rows, _ = call('GET', '/sessions?' + urllib.parse.urlencode({'query': query}), token=staff)
        check(len(rows) == 1 and rows[0]['id'] == sid, 'Code/plate search failed')
    call('GET', '/sessions?page=0', token=staff, expected=400)
    call('GET', '/sessions?status=PAID', token=staff, expected=400)
    call('GET', '/sessions?query=PS-invalid', token=staff, expected=400)
    # Walk-in never acquires an account just by matching its registered plate.
    walkin = {'slotId': slots['W1'], 'plateNumber': vehicles[1]['plateNumber'], 'vehicleType': 'CAR'}
    call('POST', '/sessions/checkin', {**walkin, 'slotId': slots['R1']}, staff, uid(), 409)
    call('POST', '/sessions/checkin', {**walkin, 'slotId': slots['M1']}, staff, uid(), 409)
    walk_results = parallel([
        lambda: call('POST', '/sessions/checkin', walkin, staff, uid(), None),
        lambda: call('POST', '/sessions/checkin', {**walkin, 'slotId': slots['W2']}, colleague, uid(), None)])
    check(sorted(r[0] for r in walk_results) == [201, 409], 'Same plate admitted twice')
    walk = next(r[1] for r in walk_results if r[0] == 201)
    _, walk_detail, _ = call('GET', f"/sessions/{walk['id']}", token=staff)
    check(walk_detail['customerId'] is None and walk_detail['reservationId'] is None, 'Anonymous walk-in linked to an account')
    call('GET', f"/sessions/{walk['id']}", token=other, expected=404)
    _, walk_fee, _ = call('GET', f"/sessions/{walk['id']}/fee", token=staff)
    _, walk_paid, _ = call('POST', f"/sessions/{walk['id']}/checkout", {'paymentMethod': 'SIMULATED', 'confirmedAmount': walk_fee['amount']}, staff, uid())
    call('POST', '/sessions/checkin', {**walkin, 'slotId': walk_detail['slotId'], 'plateNumber': 'COOL' + TAG.upper()}, staff, uid(), 409)
    _, receipt, _ = call('GET', f"/sessions/{walk['id']}", token=staff)
    check(receipt['paymentMethod'] == 'SIMULATED' and receipt['paidAmount'] == walk_paid['amount'], 'Walk-in receipt incorrect')
    print(f'PASS: {passed} checks: role/lot/owner scope, reservation swap, walk-in, concurrent check-in/checkout, replay, server fee, payment, cooldown, customer receipt.')
finally:
    own = ','.join(str(i) for i in accounts) or '-1'
    sql(f"""IF EXISTS(SELECT 1 FROM dbo.Users WHERE id IN ({own}) AND normalized_email NOT LIKE N'{PREFIX}-%@parking.test') THROW 51999,'Unsafe fixture identity',1;
BEGIN TRANSACTION;
DELETE dbo.AuditLog WHERE actor_user_id IN ({own}) OR (actor_user_id IS NULL AND entity_type='Reservation' AND entity_id IN(SELECT id FROM dbo.Reservation WHERE user_id IN ({own})));
DELETE dbo.RequestRecord WHERE actor_user_id IN ({own});
DELETE pay FROM dbo.Payment pay JOIN dbo.ParkingSession ps ON ps.id=pay.session_id JOIN dbo.ParkingSlot s ON s.id=ps.slot_id JOIN dbo.Zone z ON z.id=s.zone_id JOIN dbo.ParkingLot l ON l.id=z.parking_lot_id WHERE l.name IN (N'{PREFIX}-A',N'{PREFIX}-B');
DELETE ps FROM dbo.ParkingSession ps JOIN dbo.ParkingSlot s ON s.id=ps.slot_id JOIN dbo.Zone z ON z.id=s.zone_id JOIN dbo.ParkingLot l ON l.id=z.parking_lot_id WHERE l.name IN (N'{PREFIX}-A',N'{PREFIX}-B');
DELETE dbo.Reservation WHERE user_id IN ({own});
DELETE dbo.Vehicle WHERE user_id IN ({own});
DELETE dbo.Users WHERE id IN ({own});
DELETE s FROM dbo.ParkingSlot s JOIN dbo.Zone z ON z.id=s.zone_id JOIN dbo.ParkingLot l ON l.id=z.parking_lot_id WHERE l.name IN (N'{PREFIX}-A',N'{PREFIX}-B');
DELETE z FROM dbo.Zone z JOIN dbo.ParkingLot l ON l.id=z.parking_lot_id WHERE l.name IN (N'{PREFIX}-A',N'{PREFIX}-B');
DELETE dbo.ParkingLot WHERE name IN (N'{PREFIX}-A',N'{PREFIX}-B');
COMMIT;""")
    print('Removed only this run\'s tagged accounts, lots, sessions and payments.')
