// End-to-end browser/SQL checks in a uniquely tagged lot; no demo data is changed.
// node tests/ui-sessions.cjs <node_modules containing playwright>
const { chromium } = require(require('node:path').join(process.argv[2], 'playwright'));
const { randomUUID } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const assert = require('node:assert/strict');
const database = process.env.PARKING_TEST_DATABASE || 'ParkingLotOnline';
if (process.env.PARKING_TEST_DATABASE) {
  assert.match(database, /^ParkingAdminVerify_[a-f0-9]{12}$/);
  assert.match(process.env.PARKING_TEST_UI, /^http:\/\/127\.0\.0\.1:\d+$/);
}
const tag = randomUUID().replaceAll('-', '').slice(0, 10), lotName = `session-ui-${tag}`;
const password = 'SessionUi123!', accounts = [];
let browser, page;
function sql(statement) {
  const settings = 'SET NOCOUNT ON; SET QUOTED_IDENTIFIER ON; SET ANSI_NULLS ON; SET ANSI_PADDING ON; SET ANSI_WARNINGS ON; SET ARITHABORT ON; SET CONCAT_NULL_YIELDS_NULL ON; SET NUMERIC_ROUNDABORT OFF; SET XACT_ABORT ON; ';
  const r = spawnSync(process.env.PARKING_TEST_SQLCMD || 'sqlcmd', ['-S','localhost','-E','-C','-d',database,'-b','-l','5','-Q',settings + statement], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
}
async function json(response, status = 200) { assert.equal(response.status(), status, await response.text()); return response.json(); }
(async () => {
  try { browser = await chromium.launch({ headless: true }); }
  catch { browser = await chromium.launch({ headless: true, channel: 'msedge' }); }
  const context = await browser.newContext({ baseURL: process.env.PARKING_TEST_UI || 'http://127.0.0.1:3000', viewport: { width: 1440, height: 1100 }, timezoneId: 'UTC' });
  for (let n = 0; n < 2; n++) {
    const result = await json(await context.request.post('/api/auth/register', { data: { name: 'Kiểm tra xe vào ra', email: `${lotName}-${n}@parking.test`, password } }), 201);
    accounts.push(result.id);
  }
  sql(`BEGIN TRANSACTION;
INSERT dbo.ParkingLot(name,address) VALUES(N'${lotName}',N'Browser fixture');
DECLARE @lot int=SCOPE_IDENTITY();
UPDATE dbo.Users SET role='Staff',assigned_parking_lot_id=@lot WHERE id=${accounts[1]} AND normalized_email=N'${lotName}-1@parking.test';
INSERT dbo.Zone(parking_lot_id,name,vehicle_type) VALUES(@lot,N'UI cars','CAR');
DECLARE @zone int=SCOPE_IDENTITY();
INSERT dbo.ParkingSlot(zone_id,code,accepts_reservations) VALUES(@zone,'R1',1),(@zone,'W1',0);
COMMIT;`);
  const customerAuth = await json(await context.request.post('/api/auth/login', { data: { email: `${lotName}-0@parking.test`, password } }));
  const staffAuth = await json(await context.request.post('/api/auth/login', { data: { email: `${lotName}-1@parking.test`, password } }));
  const customerHeaders = { Authorization: `Bearer ${customerAuth.token}` }, staffHeaders = { Authorization: `Bearer ${staffAuth.token}` };
  const vehicle = await json(await context.request.post('/api/vehicles', { headers: { ...customerHeaders, 'Idempotency-Key': randomUUID() }, data: { plateNumber: `USR${tag.toUpperCase()}`, vehicleType: 'CAR' } }), 201);
  const ops = await json(await context.request.get('/api/staff/operations', { headers: staffHeaders }));
  const start = new Date(Date.now() + 5 * 60000), end = new Date(start.getTime() + 3600000);
  const slotId = ops.find(s => s.code === 'R1').id;
  const reserve = (arrival, departure) => context.request.post('/api/reservations', {
    headers: { ...customerHeaders, 'Idempotency-Key': randomUUID() },
    data: { vehicleId: vehicle.id, slotId, startTime: arrival.toISOString(), endTime: departure.toISOString() }
  });
  const reservation = await json(await reserve(start, end), 201);
  await json(await reserve(new Date(start.getTime() + 7200000), new Date(end.getTime() + 7200000)), 201);
  page = await context.newPage(); const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/login');
  await page.getByLabel('Email', { exact: false }).fill(`${lotName}-1@parking.test`);
  await page.getByLabel(/^Mật khẩu/).fill(password);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await page.waitForURL('**/staff/dashboard');
  await page.goto('/staff/checkin');
  const lookup = page.getByLabel('Biển số hoặc mã đặt chỗ');
  const search = page.getByRole('button', { name: 'Tra cứu', exact: true });
  await lookup.fill('59-Z2 000.01');
  await search.click();
  await page.getByText(/chưa có lượt đặt đã xác nhận tại bãi/).waitFor();
  await lookup.fill(vehicle.plateNumber.toLowerCase());
  await search.click();
  const windows = page.getByRole('combobox', { name: 'Chọn khung giờ đặt' });
  await windows.waitFor();
  assert.equal(await page.getByRole('button', { name: 'Xác nhận xe vào', exact: true }).count(), 0);
  const previewDir = process.env.PARKING_TEST_WORK || '.work';
  await page.screenshot({ path: `${previewDir}/checkin-lookup-desktop.png`, animations: 'disabled' });
  await page.setViewportSize({ width: 390, height: 844 });
  await windows.click();
  assert.equal(await page.getByRole('option').count(), 2);
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Plate lookup overflows on mobile');
  await page.screenshot({ path: `${previewDir}/checkin-lookup-mobile.png`, animations: 'disabled' });
  await page.getByRole('option').first().click();
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.getByText(new RegExp(vehicle.plateNumber)).waitFor();
  let lostCheckin = false;
  const inKeys = [];
  await page.route('**/api/sessions/checkin', async route => {
    inKeys.push(route.request().headers()['idempotency-key']);
    assert.equal(route.request().postDataJSON().reservationCode, reservation.reservationCode);
    const response = await route.fetch(); assert.equal(response.status(), 201, await response.text());
    if (!lostCheckin) { lostCheckin = true; return route.abort('failed'); }
    return route.fulfill({ response });
  });
  await page.getByRole('button', { name: 'Xác nhận xe vào', exact: true }).click();
  await page.getByText(/Không kết nối được máy chủ/).waitFor();
  assert.equal(await page.getByText(/Đã nhận xe!/).count(), 0);
  // Updating inventory must still allow replay even though the selected slot is now occupied.
  await page.getByRole('button', { name: 'Cập nhật vị trí', exact: true }).click();
  await page.getByRole('button', { name: 'Xác nhận xe vào', exact: true }).click();
  await page.getByText(/Đã nhận xe! Mã phiên: PS-/).waitFor();
  assert.equal(inKeys.length, 2); assert.equal(inKeys[0], inKeys[1]);
  const sessions = await json(await context.request.get('/api/sessions', { headers: customerHeaders }));
  assert.equal(sessions.length, 1); const session = sessions[0];
  await page.getByRole('link', { name: 'Xem lượt gửi xe', exact: true }).click();
  const row = page.getByRole('row').filter({ hasText: session.sessionCode });
  const openFee = row.getByRole('button', { name: 'Xem phí và xe ra', exact: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await openFee.waitFor();
  const actionBounds = await openFee.boundingBox();
  assert(actionBounds && actionBounds.x >= 0 && actionBounds.x + actionBounds.width <= 390, 'Checkout action needs horizontal scrolling');
  await openFee.click();
  const dialog = page.getByRole('dialog');
  await dialog.getByText('Phí tạm tính', { exact: true }).waitFor();
  const printReceipt = dialog.getByRole('button', { name: 'In phiếu thu', exact: true });
  assert.equal(await printReceipt.count(), 0);
  const checkboxBounds = await dialog.getByRole('checkbox').boundingBox();
  const contentBounds = await dialog.locator('.MuiDialogContent-root').boundingBox();
  assert(checkboxBounds && contentBounds && checkboxBounds.y + checkboxBounds.height <= contentBounds.y + contentBounds.height, 'Checkout confirmation is clipped on mobile');
  await dialog.screenshot({ path: `${previewDir}/checkout-mobile.png`, animations: 'disabled' });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await dialog.screenshot({ path: `${previewDir}/checkout-desktop.png`, animations: 'disabled' });
  const payButton = dialog.getByRole('button', { name: 'Xác nhận thu tiền và xe ra', exact: true });
  assert(await payButton.isDisabled());
  await dialog.getByRole('checkbox').check();
  // Move only this test's session across a billing boundary after the quote was displayed.
  sql(`UPDATE dbo.ParkingSession SET check_in_time=DATEADD(MINUTE,-61,SYSUTCDATETIME()) WHERE id=${session.id} AND customer_id=${accounts[0]};`);
  await payButton.click();
  await dialog.getByText(/Phí đã thay đổi/).waitFor();
  assert(await payButton.isDisabled()); assert(!await dialog.getByRole('checkbox').isChecked());
  let dropped = false; const outKeys = [];
  await page.route(`**/api/sessions/${session.id}/checkout`, async route => {
    outKeys.push(route.request().headers()['idempotency-key']);
    const response = await route.fetch(); assert.equal(response.status(), 200, await response.text());
    if (!dropped) { dropped = true; return route.abort('failed'); }
    return route.fulfill({ response });
  });
  await dialog.getByRole('checkbox').check(); await payButton.click();
  await dialog.getByText(/Không kết nối được máy chủ/).waitFor();
  assert.equal(await dialog.getByText('Đã thanh toán', { exact: true }).count(), 0);
  await payButton.click();
  await dialog.getByText('Đã thanh toán', { exact: true }).waitFor();
  assert.equal(outKeys.length, 2); assert.equal(outKeys[0], outKeys[1]);
  await page.evaluate(() => {
    window.receiptPrintCalls = 0;
    window.print = () => { window.receiptPrintCalls++; };
  });
  await printReceipt.click();
  assert.equal(await page.evaluate(() => window.receiptPrintCalls), 1);
  await page.emulateMedia({ media: 'print' });
  try {
    assert(await dialog.isVisible());
    assert(await dialog.getByText('Tổng tiền đã thu', { exact: true }).isVisible());
    assert.equal(await page.locator('main').isVisible(), false);
    assert.equal(await printReceipt.isVisible(), false);
    await page.pdf({ path: `${previewDir}/receipt-print.pdf`, preferCSSPageSize: true, displayHeaderFooter: false });
  } finally {
    await page.emulateMedia({ media: null });
  }
  await page.screenshot({ path: '.work/ui-checkout-receipt.png', fullPage: true });
  await dialog.screenshot({ path: `${previewDir}/checkout-paid.png`, animations: 'disabled' });
  const paid = await json(await context.request.get(`/api/sessions/${session.id}`, { headers: customerHeaders }));
  assert.equal(paid.billableHours, 2); assert.equal(paid.paidAmount, 2 * paid.appliedPricePerHour);
  await dialog.getByRole('button', { name: 'Đóng', exact: true }).click();
  await page.getByRole('combobox', { name: 'Trạng thái', exact: true }).click();
  await page.getByRole('option', { name: 'Đã kết thúc', exact: true }).click();
  await row.getByRole('button', { name: 'Xem phiếu thu', exact: true }).click();
  await printReceipt.waitFor();
  await dialog.getByRole('button', { name: 'Đóng', exact: true }).click();
  await page.goto('/staff/checkin');
  await page.getByRole('button', { name: 'Khách đến trực tiếp', exact: true }).click();
  await page.getByLabel(/Biển số xe/).fill(`WUI${tag.toUpperCase()}`);
  await page.getByRole('combobox', { name: /Loại xe/ }).click(); await page.getByRole('option', { name: 'Ô tô', exact: true }).click();
  await page.getByRole('combobox', { name: /Vị trí thực tế/ }).click(); await page.getByRole('option', { name: 'UI cars · W1', exact: true }).click();
  await page.unroute('**/api/sessions/checkin');
  await page.getByRole('button', { name: 'Xác nhận xe vào', exact: true }).click();
  await page.getByText(/Đã nhận xe! Mã phiên: PS-/).waitFor();
  // Customer sees the receipt for the linked reservation; staff-only mutations stay unavailable.
  await page.evaluate(token => localStorage.setItem('token', token), customerAuth.token);
  await page.goto('/customer/sessions');
  await page.getByRole('row').filter({ hasText: session.sessionCode }).getByRole('button', { name: 'Xem phiếu thu', exact: true }).click();
  await dialog.getByText('Đã thanh toán', { exact: true }).waitFor();
  assert.equal(await dialog.getByRole('checkbox').count(), 0);
  assert.equal(await dialog.getByRole('button', { name: 'Xác nhận thu tiền và xe ra', exact: true }).count(), 0);
  assert.equal(await printReceipt.count(), 0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() => document.documentElement.scrollWidth <= window.innerWidth);
  await dialog.getByText('Đã thanh toán', { exact: true }).waitFor();
  await page.screenshot({ path: '.work/ui-customer-receipt-mobile.png', fullPage: true, animations: 'disabled' });
  assert.deepEqual(errors, []);
  console.log('PASS: real browser reservation/walk-in check-in, lost-response replay, fee reconfirmation, paid receipt print and reprint, customer readonly view; no page errors.');
})().catch(async error => {
  console.error(error);
  if (page) { await page.screenshot({ path: '.work/ui-sessions-failure.png', fullPage: true }); console.error((await page.locator('body').innerText()).slice(0, 5000)); }
  process.exitCode = 1;
}).finally(async () => {
  if (browser) await browser.close();
  if (accounts.length) {
    assert(accounts.every(id => Number.isSafeInteger(id) && id > 0)); const own = accounts.join(',');
    sql(`IF EXISTS(SELECT 1 FROM dbo.Users WHERE id IN (${own}) AND normalized_email NOT LIKE N'${lotName}-%@parking.test') THROW 51999,'Unsafe fixture identity',1;
BEGIN TRANSACTION;
DELETE dbo.AuditLog WHERE actor_user_id IN (${own}) OR (actor_user_id IS NULL AND entity_type='Reservation' AND entity_id IN (SELECT id FROM dbo.Reservation WHERE user_id IN (${own})));
DELETE dbo.RequestRecord WHERE actor_user_id IN (${own});
DELETE p FROM dbo.Payment p JOIN dbo.ParkingSession ps ON ps.id=p.session_id JOIN dbo.ParkingSlot s ON s.id=ps.slot_id JOIN dbo.Zone z ON z.id=s.zone_id JOIN dbo.ParkingLot l ON l.id=z.parking_lot_id WHERE l.name=N'${lotName}';
DELETE ps FROM dbo.ParkingSession ps JOIN dbo.ParkingSlot s ON s.id=ps.slot_id JOIN dbo.Zone z ON z.id=s.zone_id JOIN dbo.ParkingLot l ON l.id=z.parking_lot_id WHERE l.name=N'${lotName}';
DELETE dbo.Reservation WHERE user_id IN (${own}); DELETE dbo.Vehicle WHERE user_id IN (${own}); DELETE dbo.Users WHERE id IN (${own});
DELETE s FROM dbo.ParkingSlot s JOIN dbo.Zone z ON z.id=s.zone_id JOIN dbo.ParkingLot l ON l.id=z.parking_lot_id WHERE l.name=N'${lotName}';
DELETE z FROM dbo.Zone z JOIN dbo.ParkingLot l ON l.id=z.parking_lot_id WHERE l.name=N'${lotName}';
DELETE dbo.ParkingLot WHERE name=N'${lotName}'; COMMIT;`);
  }
});
