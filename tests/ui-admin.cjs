// Run via run_admin_tests.py: all requests go to an isolated API/database.
const { chromium } = require(require('node:path').join(process.argv[2], 'playwright'));
const { randomUUID } = require('node:crypto');
const { mkdirSync } = require('node:fs');
const assert = require('node:assert/strict');
assert.match(process.env.PARKING_TEST_DATABASE || '', /^ParkingAdminVerify_[a-f0-9]{12}$/);
const api = process.env.PARKING_TEST_API, ui = process.env.PARKING_TEST_UI;
assert.match(api, /^http:\/\/127\.0\.0\.1:\d+\/api$/);
assert.match(ui, /^http:\/\/127\.0\.0\.1:\d+$/);
let browser, page;
const name = `Bãi UI ${randomUUID().slice(0, 8)}`;
const errors = [];
async function data(response, status = 200) {
  assert.equal(response.status(), status, await response.text());
  return response.json();
}
async function select(label, option) {
  await page.getByRole('combobox', { name: label, exact: true }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}
const dialog = () => page.getByRole('dialog');
const row = text => page.getByRole('row').filter({ hasText: text });
async function reasonAndSave(reason) {
  await dialog().getByLabel(/Lý do thay đổi/).fill(reason);
  await dialog().getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
  await dialog().waitFor({ state: 'hidden' });
  await page.getByText('Đang tải dữ liệu...', { exact: true }).waitFor({ state: 'hidden' });
}
(async () => {
  try { browser = await chromium.launch({ headless: true }); }
  catch { browser = await chromium.launch({ headless: true, channel: 'msedge' }); }
  const context = await browser.newContext({ baseURL: ui, viewport: { width: 1440, height: 1050 }, timezoneId: 'UTC' });
  const auth = await data(await context.request.post(api + '/auth/login', { data: { email: 'admin@parking.test', password: '123456' } }));
  const headers = { Authorization: `Bearer ${auth.token}` };
  const apiRead = async path => data(await context.request.get(api + path, { headers }));
  page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/login');
  await page.getByLabel(/Email/).fill('admin@parking.test');
  await page.getByLabel(/Mật khẩu/).fill('123456');
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await page.waitForURL('**/admin/dashboard');
  await page.goto('/admin/parking-lots');
  await page.getByRole('button', { name: 'Thêm bãi đỗ xe', exact: true }).click();
  await dialog().getByLabel('Tên', { exact: false }).fill(name);
  await dialog().getByLabel(/Địa chỉ/).fill('Địa chỉ kiểm thử trình duyệt');
  await dialog().getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
  assert.equal(await dialog().count(), 1, 'Missing reason accepted');
  // Simulate a lost response after SQL commit. Retry must keep the same key.
  let lost = false;
  const createKeys = [];
  await page.route('**/api/admin/parking-lots', async route => {
    if (route.request().method() !== 'POST') return route.continue();
    createKeys.push(route.request().headers()['idempotency-key']);
    const response = await route.fetch();
    assert.equal(response.status(), 201, await response.text());
    if (!lost) { lost = true; return route.abort('failed'); }
    return route.fulfill({ response });
  });
  await dialog().getByLabel(/Lý do thay đổi/).fill('Tạo bãi kiểm thử UI');
  await dialog().getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
  await dialog().getByText(/Không kết nối được máy chủ/).waitFor();
  await dialog().getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
  await dialog().waitFor({ state: 'hidden' });
  await row(name).waitFor();
  assert.equal(createKeys.length, 2); assert.equal(createKeys[0], createKeys[1]);
  let lots = await apiRead('/admin/parking-lots');
  assert.equal(lots.filter(l => l.name === name).length, 1);
  const lot = lots.find(l => l.name === name);
  await row(name).getByRole('button', { name: 'Sửa', exact: true }).click();
  await dialog().getByLabel(/Địa chỉ/).fill('Địa chỉ đã sửa');
  await reasonAndSave('Sửa địa chỉ');
  await page.reload();
  await row(name).getByText('Địa chỉ đã sửa', { exact: true }).waitFor();
  await row(name).getByRole('button', { name: 'Ngừng hoạt động', exact: true }).click();
  assert.equal(await dialog().getByRole('checkbox', { name: 'Đang hoạt động', exact: true }).isChecked(), false);
  await reasonAndSave('Tạm ngừng');
  await row(name).getByRole('button', { name: 'Kích hoạt lại', exact: true }).click();
  await reasonAndSave('Mở lại');

  await page.goto('/admin/zones');
  await page.getByRole('button', { name: 'Thêm khu vực', exact: true }).waitFor({ state: 'visible' });
  await page.getByText('Đang tải dữ liệu...', { exact: true }).waitFor({ state: 'hidden' });
  await select('Bãi đỗ xe', name);
  await page.getByRole('button', { name: 'Thêm khu vực', exact: true }).click();
  await dialog().getByLabel('Tên', { exact: false }).fill('Khu UI');
  await dialog().getByLabel('Tầng', { exact: true }).fill('Tầng 2');
  await dialog().getByRole('combobox', { name: /Loại xe/ }).click();
  await page.getByRole('option', { name: 'Ô tô', exact: true }).click();
  await reasonAndSave('Tạo khu');
  await row('Khu UI').getByText('Ô tô · 0 vị trí', { exact: true }).waitFor();
  await row('Khu UI').getByRole('button', { name: 'Sửa', exact: true }).click();
  await dialog().getByLabel('Tầng', { exact: true }).fill('Tầng 3');
  await reasonAndSave('Sửa tầng');
  const zones = await apiRead(`/admin/parking-lots/${lot.id}/zones`);
  const zone = zones.find(z => z.name === 'Khu UI');
  assert.equal(zone.floorLabel, 'Tầng 3');

  await page.goto('/admin/slots');
  await page.getByText('Đang tải dữ liệu...', { exact: true }).waitFor({ state: 'hidden' });
  await select('Bãi đỗ xe', name);
  await page.getByRole('button', { name: 'Thêm vị trí đỗ', exact: true }).click();
  await dialog().getByLabel(/Mã vị trí/).fill('UI_01');
  await dialog().getByRole('checkbox', { name: 'Cho phép đặt trước', exact: true }).uncheck();
  await reasonAndSave('Tạo vị trí');
  await row('UI_01').getByText('Khách trực tiếp', { exact: true }).waitFor();
  await row('UI_01').getByRole('button', { name: 'Bảo trì', exact: true }).click();
  await reasonAndSave('Sửa đèn');
  await row('UI_01').getByRole('button', { name: 'Kết thúc bảo trì', exact: true }).waitFor();
  let slots = await apiRead(`/admin/zones/${zone.id}/slots`);
  assert.equal(slots[0].operationalStatus, 'MAINTENANCE');
  // Genuine server conflict while the parent is inactive; UI must show the SQL reason.
  await data(await context.request.put(api + `/admin/parking-lots/${lot.id}`, { headers: { ...headers, 'Idempotency-Key': randomUUID() }, data: { name, address: 'Địa chỉ đã sửa', isActive: false, reason: 'Concurrent parent update' } }));
  await row('UI_01').getByRole('button', { name: 'Sửa', exact: true }).click();
  await dialog().getByLabel(/Mã vị trí/).fill('UI_02');
  await dialog().getByLabel(/Lý do thay đổi/).fill('Xung đột từ server');
  await dialog().getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
  await dialog().getByText(/Khu vực\/bãi cha không hoạt động/).waitFor();
  await dialog().getByRole('button', { name: 'Đóng', exact: true }).click();
  await data(await context.request.put(api + `/admin/parking-lots/${lot.id}`, { headers: { ...headers, 'Idempotency-Key': randomUUID() }, data: { name, address: 'Địa chỉ đã sửa', isActive: true, reason: 'Reopen parent' } }));
  await row('UI_01').getByRole('button', { name: 'Kết thúc bảo trì', exact: true }).click();
  await reasonAndSave('Hoàn thành sửa đèn');
  await row('UI_01').getByRole('button', { name: 'Ngừng hoạt động', exact: true }).click();
  await reasonAndSave('Tạm ngừng vị trí');
  slots = await apiRead(`/admin/zones/${zone.id}/slots`);
  assert.equal(slots[0].isActive, false);
  await row('UI_01').getByRole('button', { name: 'Kích hoạt lại', exact: true }).click();
  await reasonAndSave('Mở lại vị trí');
  mkdirSync('.work', { recursive: true });
  await page.screenshot({ path: '.work/admin-slots-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Mobile page overflow');
  const maintenanceBounds = await row('UI_01').getByRole('button', { name: 'Bảo trì', exact: true }).boundingBox();
  assert(maintenanceBounds && maintenanceBounds.x >= 0 && maintenanceBounds.x + maintenanceBounds.width <= 390, 'Admin maintenance action needs horizontal scrolling');
  await page.screenshot({ path: '.work/admin-slots-mobile.png', fullPage: true });

  await page.goto('/admin/pricing');
  await page.getByRole('heading', { name: 'Giá hiện hành', exact: true }).waitFor();
  const editPrice = row('Xe máy').getByRole('button', { name: 'Sửa giá', exact: true });
  const priceBounds = await editPrice.boundingBox();
  assert(priceBounds && priceBounds.x >= 0 && priceBounds.x + priceBounds.width <= 390, 'Price edit action needs horizontal scrolling');
  await page.setViewportSize({ width: 1440, height: 1050 });
  const pricesBefore = await apiRead('/admin/pricing?includeHistory=true');
  await editPrice.click();
  await dialog().getByLabel(/Giá mỗi giờ/).fill('7000');
  await dialog().getByLabel(/Lý do thay đổi/).fill('Điều chỉnh phí UI');
  const priceKeys = []; let lostPrice = false;
  await page.route('**/api/admin/pricing/MOTORBIKE', async route => {
    priceKeys.push(route.request().headers()['idempotency-key']);
    const response = await route.fetch();
    assert.equal(response.status(), 200, await response.text());
    if (!lostPrice) { lostPrice = true; return route.abort('failed'); }
    return route.fulfill({ response });
  });
  await dialog().getByRole('button', { name: 'Lưu giá', exact: true }).click();
  await dialog().getByText(/Không kết nối được máy chủ/).waitFor();
  // Closing/reopening with identical contents must still replay the pending mutation.
  await dialog().getByRole('button', { name: 'Đóng', exact: true }).click();
  await row('Xe máy').getByRole('button', { name: 'Sửa giá', exact: true }).click();
  await dialog().getByLabel(/Giá mỗi giờ/).fill('7000');
  await dialog().getByLabel(/Lý do thay đổi/).fill('Điều chỉnh phí UI');
  await dialog().getByRole('button', { name: 'Lưu giá', exact: true }).click();
  await dialog().waitFor({ state: 'hidden' });
  assert.equal(priceKeys.length, 2); assert.equal(priceKeys[0], priceKeys[1]);
  const pricesAfter = await apiRead('/admin/pricing?includeHistory=true');
  assert.equal(pricesAfter.length, pricesBefore.length + 1, 'Lost response duplicated price version');
  assert.equal(pricesAfter.find(p => p.isActive && p.vehicleType === 'MOTORBIKE').pricePerHour, 7000);
  await page.reload();
  await row('Xe máy').getByText(/7[.,]000/).waitFor();
  await page.getByRole('button', { name: 'Lịch sử giá', exact: true }).click();
  await page.getByText('Đã thay thế', { exact: true }).first().waitFor();
  assert.equal(await page.getByRole('button', { name: 'Sửa giá', exact: true }).count(), 0);
  await page.screenshot({ path: '.work/admin-prices-history.png', fullPage: true });

  // Read failure must not show stale prices or demo success.
  await page.route('**/api/admin/pricing?*', route => route.abort('failed'));
  await page.getByRole('button', { name: 'Tải lại', exact: true }).click();
  await page.getByText(/Không kết nối được máy chủ/).waitFor();
  assert.equal(await page.getByRole('table').count(), 0);
  assert.deepEqual(errors, [], `Browser errors: ${errors.join('; ')}`);
  console.log('PASS admin browser: CRUD, status, maintenance, SQL conflict, price history, lost responses, mobile, honest errors');
})().catch(async e => {
  console.error(e);
  if (page) { await page.screenshot({ path: '.work/admin-ui-failure.png', fullPage: true }).catch(() => {}); console.error((await page.locator('body').innerText()).slice(-4000)); }
  process.exitCode = 1;
}).finally(async () => { if (browser) await browser.close(); });
