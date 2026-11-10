// Disposable browser + SQL test, including a committed request whose response is lost.
// Run through: python tests/run_admin_tests.py --suite customer
const { chromium } = require(require('node:path').join(process.argv[2], 'playwright'));
const { randomUUID } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const assert = require('node:assert/strict');
const database = process.env.PARKING_TEST_DATABASE, ui = process.env.PARKING_TEST_UI;
assert.match(database || '', /^ParkingAdminVerify_[a-f0-9]{12}$/);
assert.match(ui || '', /^http:\/\/127\.0\.0\.1:\d+$/);
const sqlcmd = process.env.PARKING_TEST_SQLCMD;
assert(sqlcmd, 'Run through run_admin_tests.py --suite customer');
const tag = randomUUID().replaceAll('-', '').slice(0, 10);
const email = `booking-ui-${tag}@parking.test`, lotName = `booking-ui-${tag}`;
const password = 'BookingUi123!', plate = `UIR${tag.toUpperCase()}`;
let browser, userId, page;
function sql(query) {
  const settings = 'SET NOCOUNT ON; SET QUOTED_IDENTIFIER ON; SET ANSI_NULLS ON; SET ANSI_PADDING ON; SET ANSI_WARNINGS ON; SET ARITHABORT ON; SET CONCAT_NULL_YIELDS_NULL ON; SET NUMERIC_ROUNDABORT OFF; SET XACT_ABORT ON; ';
  const result = spawnSync(sqlcmd, ['-S','localhost','-E','-C','-d',database,'-b','-l','5','-Q',settings + query], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stdout + result.stderr);
}
async function json(response, status = 200) {
  assert.equal(response.status(), status, await response.text());
  return response.json();
}
(async () => {
  try { browser = await chromium.launch({ headless: true }); }
  catch { browser = await chromium.launch({ headless: true, channel: 'msedge' }); }
  // A browser outside Vietnam must still submit and display the selected Vietnam time.
  const context = await browser.newContext({ baseURL: ui, timezoneId: 'UTC', viewport: { width: 1440, height: 1000 } });
  const user = await json(await context.request.post('/api/auth/register', { data: { name: 'Kiểm tra đặt chỗ', email, password } }), 201);
  userId = user.id;
  const login = await json(await context.request.post('/api/auth/login', { data: { email, password } }));
  const headers = { Authorization: `Bearer ${login.token}` };
  page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/login');
  await page.getByLabel('Email', { exact: false }).fill(email);
  await page.getByLabel(/^Mật khẩu/).fill(password);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await page.waitForURL('**/customer/dashboard');
  await page.goto('/customer/search');
  await page.getByText(/Bạn cần thêm phương tiện đang hoạt động/).waitFor();
  async function addVehicle(value, active = true) {
    return json(await context.request.post('/api/vehicles', { headers: { ...headers, 'Idempotency-Key': randomUUID() }, data: { plateNumber: value, vehicleType: 'CAR', isActive: active } }), 201);
  }
  const vehicle = await addVehicle(plate), other = await addVehicle(plate + 'B');
  await addVehicle(plate + 'OFF', false);
  sql(`BEGIN TRANSACTION;
INSERT dbo.ParkingLot(name,address) VALUES(N'${lotName}',N'Browser fixture');
DECLARE @lot int=SCOPE_IDENTITY();
INSERT dbo.Zone(parking_lot_id,name,vehicle_type) VALUES(@lot,N'UI cars','CAR');
DECLARE @zone int=SCOPE_IDENTITY();
INSERT dbo.ParkingSlot(zone_id,code,accepts_reservations) VALUES(@zone,'R1',1),(@zone,'R2',1);
COMMIT;`);
  await page.getByRole('button', { name: 'Tải lại danh sách bãi và xe' }).click();
  await page.getByRole('combobox', { name: /Phương tiện/ }).click();
  assert.equal(await page.getByRole('option', { name: /OFF/ }).count(), 0);
  await page.getByRole('option', { name: `${plate} — Ô tô`, exact: true }).click();
  await page.getByRole('combobox', { name: /Bãi đỗ/ }).click();
  await page.getByRole('option', { name: lotName, exact: true }).click();
  const start = new Date(Date.now() + 2 * 3600000), end = new Date(start.getTime() + 3600000);
  const inputTime = date => new Date(date.getTime() + 7 * 3600000).toISOString().slice(0, 16);
  await page.getByLabel(/Giờ bắt đầu/).fill(inputTime(start));
  await page.getByLabel(/Giờ kết thúc/).fill(inputTime(end));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Tìm chỗ trống', exact: true }).click();
  const slotButton = page.getByRole('region', { name: 'UI cars', exact: true }).getByRole('button', { name: 'UI cars · R1', exact: true });
  await slotButton.waitFor();
  await page.waitForFunction(() => document.activeElement?.textContent === 'Chọn vị trí');
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Slot selection overflows on mobile');
  const previewDir = process.env.PARKING_TEST_WORK || '.work';
  await page.screenshot({ path: `${previewDir}/booking-slots-mobile.png`, fullPage: true, animations: 'disabled' });
  await slotButton.click();
  const lots = await json(await context.request.get('/api/parking-lots', { headers }));
  const lot = lots.find(l => l.name === lotName);
  const window = { vehicleId: vehicle.id, startTime: new Date(inputTime(start) + '+07:00').toISOString(), endTime: new Date(inputTime(end) + '+07:00').toISOString() };
  const available = await json(await context.request.get(`/api/parking-lots/${lot.id}/availability`, { headers, params: window }));
  const competing = await json(await context.request.post('/api/reservations', { headers: { ...headers, 'Idempotency-Key': randomUUID() }, data: { ...window, vehicleId: other.id, slotId: available.find(s => s.code === 'R1').id } }), 201);
  await page.getByRole('button', { name: 'Xác nhận đặt chỗ', exact: true }).click();
  await page.getByText(/Vui lòng chọn lại vị trí hoặc đổi điều kiện/).waitFor();
  await page.getByRole('button', { name: 'UI cars · R1', exact: true }).waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: 'UI cars · R2', exact: true }).waitFor({ state: 'visible' });
  assert.equal(await page.getByRole('button', { name: 'UI cars · R1', exact: true }).count(), 0);
  await page.getByRole('button', { name: 'UI cars · R2', exact: true }).click();
  await page.waitForFunction(() => document.activeElement?.textContent === 'Xác nhận đặt chỗ');
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Booking confirmation overflows on mobile');
  await page.screenshot({ path: `${previewDir}/booking-confirm-mobile.png`, fullPage: true, animations: 'disabled' });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: `${previewDir}/booking-confirm-desktop.png`, fullPage: true, animations: 'disabled' });
  let dropped = false;
  const sentKeys = [];
  await page.route('**/api/reservations', async route => {
    if (route.request().method() !== 'POST') return route.continue();
    sentKeys.push(route.request().headers()['idempotency-key']);
    const result = await route.fetch();
    assert.equal(result.status(), 201);
    if (!dropped) { dropped = true; await route.abort('failed'); }
    else await route.fulfill({ response: result });
  });
  await page.getByRole('button', { name: 'Xác nhận đặt chỗ', exact: true }).click();
  await page.getByText(/Không kết nối được máy chủ/).waitFor();
  await page.getByRole('button', { name: 'Xác nhận đặt chỗ', exact: true }).click();
  await page.waitForURL('**/customer/history');
  assert.equal(sentKeys.length, 2); assert.equal(sentKeys[0], sentKeys[1]);
  await page.getByText(/Đặt chỗ thành công! Mã: RS-/).waitFor();
  const history = await json(await context.request.get('/api/reservations/my', { headers }));
  const own = history.filter(r => r.vehicleId === vehicle.id);
  assert.equal(own.length, 1); assert.equal(own[0].startTime, window.startTime.replace('.000Z', 'Z'));
  assert.equal(own[0].status, 'CONFIRMED');
  await page.reload();
  const row = page.getByRole('row').filter({ hasText: own[0].reservationCode });
  const cancel = row.getByRole('button', { name: 'Hủy', exact: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await cancel.waitFor();
  const cancelBounds = await cancel.boundingBox();
  assert(cancelBounds && cancelBounds.x >= 0 && cancelBounds.x + cancelBounds.width <= 390, 'Reservation action needs horizontal scrolling');
  await page.screenshot({ path: `${previewDir}/booking-history-mobile.png`, fullPage: true, animations: 'disabled' });
  await cancel.click();
  await page.getByRole('dialog').getByRole('button', { name: 'Xác nhận hủy', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await row.getByText('Đã hủy', { exact: true }).waitFor();
  await page.reload();
  await row.getByText('Đã hủy', { exact: true }).waitFor();
  await page.screenshot({ path: '.work/ui-reservations.png', fullPage: true, animations: 'disabled' });
  // Errors must be shown explicitly; a failed history request must never reveal mock rows.
  await page.route('**/api/reservations/my?*', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Lỗi kiểm thử kết nối' }) }));
  await page.getByRole('button', { name: 'Làm mới', exact: true }).click();
  await page.getByText('Chưa tải được dữ liệu.', { exact: true }).waitFor();
  assert.equal(await page.getByText(own[0].reservationCode, { exact: true }).count(), 0);
  await page.unroute('**/api/reservations/my?*');
  await page.getByRole('button', { name: 'Tải lại', exact: true }).click();
  await row.getByText('Đã hủy', { exact: true }).waitFor();
  await json(await context.request.post(`/api/reservations/${competing.id}/cancel`, { headers: { ...headers, 'Idempotency-Key': randomUUID() } }));
  assert.deepEqual(errors, []);
  console.log('PASS: browser empty vehicles, active vehicle selection, actual search, 409 refresh, lost-response replay, UTC+7 in UTC browser, persisted history/cancellation, honest error/retry; no page errors.');
})().catch(async error => {
  console.error(error);
  if (page) { await page.screenshot({ path: '.work/ui-reservations-failure.png', fullPage: true, animations: 'disabled' }); console.error((await page.locator('body').innerText()).slice(0, 6000)); }
  process.exitCode = 1;
}).finally(async () => {
  if (browser) await browser.close();
  if (userId) {
    assert(Number.isSafeInteger(userId) && userId > 0);
    sql(`IF NOT EXISTS(SELECT 1 FROM dbo.Users WHERE id=${userId} AND normalized_email=N'${email}') THROW 51999,'Unsafe fixture cleanup',1;
BEGIN TRANSACTION;
DELETE dbo.AuditLog WHERE actor_user_id=${userId} OR (actor_user_id IS NULL AND entity_type='Reservation' AND entity_id IN (SELECT id FROM dbo.Reservation WHERE user_id=${userId}));
DELETE dbo.RequestRecord WHERE actor_user_id=${userId};
DELETE dbo.Reservation WHERE user_id=${userId};
DELETE dbo.Vehicle WHERE user_id=${userId};
DELETE dbo.Users WHERE id=${userId} AND normalized_email=N'${email}';
DELETE s FROM dbo.ParkingSlot s JOIN dbo.Zone z ON z.id=s.zone_id JOIN dbo.ParkingLot l ON l.id=z.parking_lot_id WHERE l.name=N'${lotName}';
DELETE z FROM dbo.Zone z JOIN dbo.ParkingLot l ON l.id=z.parking_lot_id WHERE l.name=N'${lotName}';
DELETE dbo.ParkingLot WHERE name=N'${lotName}';
COMMIT;`);
  }
});
