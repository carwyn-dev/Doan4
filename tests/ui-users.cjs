// Run through run_admin_tests.py. Only isolated API/database are permitted.
const { chromium } = require(require('node:path').join(process.argv[2], 'playwright'));
const { randomUUID } = require('node:crypto');
const assert = require('node:assert/strict');
assert.match(process.env.PARKING_TEST_DATABASE || '', /^ParkingAdminVerify_[a-f0-9]{12}$/);
const api = process.env.PARKING_TEST_API, ui = process.env.PARKING_TEST_UI;
assert.match(api, /^http:\/\/127\.0\.0\.1:\d+\/api$/);
assert.match(ui, /^http:\/\/127\.0\.0\.1:\d+$/);
let browser, page;
const email = `user-ui-${randomUUID().slice(0, 8)}@parking.test`, password = 'UserUiTest123!';
const errors = [];
const dialog = () => page.getByRole('dialog');
const row = text => page.getByRole('row').filter({ hasText: text });
async function json(response, status = 200) {
  assert.equal(response.status(), status, await response.text());
  return response.json();
}
async function save(reason) {
  await dialog().getByLabel(/Lý do thay đổi/).fill(reason);
  await dialog().getByRole('button', { name: 'Lưu tài khoản', exact: true }).click();
  await dialog().waitFor({ state: 'hidden' });
  await page.getByText('Đang tải dữ liệu...', { exact: true }).waitFor({ state: 'hidden' });
}
async function select(locator, option) {
  await locator.click();
  await page.getByRole('option', { name: option, exact: true }).click();
}
async function search(value) {
  await page.getByLabel('Tìm tên, email, số điện thoại', { exact: true }).fill(value);
  await page.getByRole('button', { name: 'Tìm kiếm', exact: true }).click();
  await page.getByText('Đang tải dữ liệu...', { exact: true }).waitFor({ state: 'hidden' });
}
(async () => {
  try { browser = await chromium.launch({ headless: true }); }
  catch { browser = await chromium.launch({ headless: true, channel: 'msedge' }); }
  const context = await browser.newContext({ baseURL: ui, viewport: { width: 1440, height: 1100 }, timezoneId: 'UTC' });
  const auth = await json(await context.request.post(api + '/auth/login', { data: { email: 'admin@parking.test', password: '123456' } }));
  const headers = { Authorization: `Bearer ${auth.token}` };
  const lots = await json(await context.request.get(api + '/admin/parking-lots', { headers }));
  page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/login');
  await page.getByLabel(/Email/).fill('admin@parking.test');
  await page.getByLabel(/Mật khẩu/).fill('123456');
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await page.waitForURL('**/admin/dashboard');
  await page.goto('/admin/users');
  await row('admin@parking.test').waitFor();
  assert.equal(await page.getByText(/hiện chỉ dùng để minh họa/).count(), 0);
  // The last active admin must see a real conflict from SQL.
  await row('admin@parking.test').getByRole('button', { name: 'Khóa tài khoản', exact: true }).click();
  await dialog().getByText(/Bạn đang sửa tài khoản của mình/).waitFor();
  await dialog().getByLabel(/Lý do thay đổi/).fill('Kiểm tra Admin cuối');
  await dialog().getByRole('button', { name: 'Lưu tài khoản', exact: true }).click();
  await dialog().getByText('Phải còn ít nhất một Admin hoạt động.', { exact: true }).waitFor();
  await dialog().getByRole('button', { name: 'Đóng', exact: true }).click();

  await page.getByRole('button', { name: 'Thêm tài khoản', exact: true }).click();
  await dialog().getByLabel(/Họ tên/).fill('Nhân viên thử giao diện');
  await dialog().getByLabel(/Email/).fill(email);
  await dialog().getByLabel('Số điện thoại', { exact: true }).fill('0901111222');
  await dialog().getByLabel(/Mật khẩu ban đầu/).fill(password);
  await dialog().getByRole('button', { name: 'Lưu tài khoản', exact: true }).click();
  assert.equal(await dialog().count(), 1, 'Assignment/reason required');
  await select(dialog().getByRole('combobox', { name: /Bãi phân công/ }), lots[0].name);
  await dialog().getByLabel(/Lý do thay đổi/).fill('Tạo nhân viên UI');
  const keys = []; let dropped = false;
  await page.route('**/api/admin/users', async route => {
    if (route.request().method() !== 'POST') return route.continue();
    keys.push(route.request().headers()['idempotency-key']);
    const response = await route.fetch();
    assert.equal(response.status(), 201, await response.text());
    if (!dropped) { dropped = true; return route.abort('failed'); }
    return route.fulfill({ response });
  });
  await dialog().getByRole('button', { name: 'Lưu tài khoản', exact: true }).click();
  await dialog().getByText(/Không kết nối được máy chủ/).waitFor();
  await dialog().getByRole('button', { name: 'Lưu tài khoản', exact: true }).click();
  await dialog().waitFor({ state: 'hidden' });
  await row(email).waitFor();
  assert.equal(keys.length, 2); assert.equal(keys[0], keys[1]);
  const accounts = await json(await context.request.get(api + '/admin/users?query=' + encodeURIComponent(email), { headers }));
  assert.equal(accounts.length, 1);
  assert(!JSON.stringify(accounts).toLowerCase().includes('password'));
  const id = accounts[0].id;
  const staffAuth = await json(await context.request.post(api + '/auth/login', { data: { email, password } }));
  const staffHeaders = { Authorization: `Bearer ${staffAuth.token}` };

  await search(email);
  await row(email).getByRole('button', { name: 'Sửa', exact: true }).click();
  assert.equal(await dialog().getByLabel(/Mật khẩu/).count(), 0, 'Password displayed during edit');
  await dialog().getByLabel(/Họ tên/).fill('Nhân viên đã sửa');
  await select(dialog().getByRole('combobox', { name: /Bãi phân công/ }), lots[1].name);
  await save('Đổi phân công');
  await row(email).getByText(lots[1].name, { exact: true }).waitFor();
  const profile = await json(await context.request.get(api + '/auth/me', { headers: staffHeaders }));
  assert.equal(profile.assignedParkingLotId, lots[1].id);

  await row(email).getByRole('button', { name: 'Khóa tài khoản', exact: true }).click();
  assert.equal(await dialog().getByRole('checkbox', { name: 'Đang hoạt động', exact: true }).isChecked(), false);
  await save('Khóa thử');
  assert.equal((await context.request.get(api + '/staff/operations', { headers: staffHeaders })).status(), 401);
  await select(page.getByRole('combobox', { name: 'Lọc trạng thái', exact: true }), 'Đã khóa');
  await row(email).getByRole('button', { name: 'Mở khóa', exact: true }).click();
  await save('Mở khóa thử');
  await page.getByText('Không có tài khoản phù hợp.', { exact: true }).waitFor();
  await select(page.getByRole('combobox', { name: 'Lọc trạng thái', exact: true }), 'Tất cả trạng thái');
  await row(email).getByRole('button', { name: 'Sửa', exact: true }).click();
  await select(dialog().getByRole('combobox', { name: /^Vai trò/ }), 'Khách hàng');
  assert.equal(await dialog().getByRole('combobox', { name: /Bãi phân công/ }).count(), 0);
  const updateKeys = []; let lostUpdate = false;
  await page.route(`**/api/admin/users/${id}`, async route => {
    updateKeys.push(route.request().headers()['idempotency-key']);
    const response = await route.fetch(); assert.equal(response.status(), 200, await response.text());
    if (!lostUpdate) { lostUpdate = true; return route.abort('failed'); }
    return route.fulfill({ response });
  });
  await dialog().getByLabel(/Lý do thay đổi/).fill('Đổi vai trò');
  await dialog().getByRole('button', { name: 'Lưu tài khoản', exact: true }).click();
  await dialog().getByText(/Không kết nối được máy chủ/).waitFor();
  await dialog().getByRole('button', { name: 'Lưu tài khoản', exact: true }).click();
  await dialog().waitFor({ state: 'hidden' });
  assert.equal(updateKeys.length, 2); assert.equal(updateKeys[0], updateKeys[1]);
  assert.equal((await context.request.get(api + '/staff/operations', { headers: staffHeaders })).status(), 403);
  const changed = await json(await context.request.get(api + '/auth/me', { headers: staffHeaders }));
  assert.equal(changed.role, 'Customer'); assert.equal(changed.assignedParkingLotId, null);
  await page.reload();
  await search(email);
  await row(email).getByText('Nhân viên đã sửa', { exact: true }).waitFor();
  await row(email).getByText('Khách hàng', { exact: true }).waitFor();
  await select(page.getByRole('combobox', { name: 'Lọc vai trò', exact: true }), 'Nhân viên');
  await page.getByText('Không có tài khoản phù hợp.', { exact: true }).waitFor();
  await select(page.getByRole('combobox', { name: 'Lọc vai trò', exact: true }), 'Tất cả vai trò');
  await row(email).waitFor();
  await page.screenshot({ path: '.work/users-desktop.png', fullPage: true, animations: 'disabled' });
  await page.setViewportSize({ width: 390, height: 844 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Mobile page overflow');
  const editBounds = await row(email).getByRole('button', { name: 'Sửa', exact: true }).boundingBox();
  assert(editBounds && editBounds.x >= 0 && editBounds.x + editBounds.width <= 390, 'Account edit action needs horizontal scrolling');
  await page.screenshot({ path: '.work/users-mobile.png', fullPage: true, animations: 'disabled' });
  await page.setViewportSize({ width: 1440, height: 1100 });

  // Read failure must not keep stale user rows visible.
  await page.route('**/api/admin/users?*', route => route.abort('failed'));
  await page.getByRole('button', { name: 'Tải lại', exact: true }).click();
  await page.getByText(/Không kết nối được máy chủ/).waitFor();
  assert.equal(await page.getByRole('table').count(), 0);
  await page.unroute('**/api/admin/users?*');
  await page.getByRole('button', { name: 'Tải lại', exact: true }).click();
  await row(email).waitFor();

  // Self-demotion is allowed only with another active admin and must update routing.
  const secondEmail = `ui-second-${randomUUID().slice(0, 8)}@parking.test`;
  await json(await context.request.post(api + '/admin/users', { headers: { ...headers, 'Idempotency-Key': randomUUID() }, data: {
    name: 'Second UI admin', email: secondEmail, password, role: 'Admin', isActive: true, assignedParkingLotId: null, reason: 'Self role test'
  } }), 201);
  await search('admin@parking.test');
  await row('admin@parking.test').getByRole('button', { name: 'Sửa', exact: true }).click();
  await select(dialog().getByRole('combobox', { name: /^Vai trò/ }), 'Khách hàng');
  await dialog().getByLabel(/Lý do thay đổi/).fill('Tự đổi vai trò');
  await dialog().getByRole('button', { name: 'Lưu tài khoản', exact: true }).click();
  await page.waitForURL('**/customer/dashboard');
  assert.deepEqual(errors, [], `Browser errors: ${errors.join('; ')}`);
  console.log('PASS users browser: create/edit/filter, lost responses, assignment, lock/unlock, last admin, self-role routing, reload, mobile');
})().catch(async error => {
  console.error(error);
  if (page) { await page.screenshot({ path: '.work/users-ui-failure.png', fullPage: true }).catch(() => {}); console.error((await page.locator('body').innerText()).slice(-4500)); }
  process.exitCode = 1;
}).finally(async () => { if (browser) await browser.close(); });
