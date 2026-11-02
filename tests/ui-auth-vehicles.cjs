// Browser integration checks in the disposable database owned by run_admin_tests.py.
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
const email = `ui-check-${tag}@parking.test`;
const password = 'ParkingUi123!';
const plate = `UI-${tag.toUpperCase()}`;
let browser, userId;
function cleanup() {
  if (!userId) return;
  assert(Number.isSafeInteger(userId) && userId > 0);
  const sql = `SET NOCOUNT ON; SET QUOTED_IDENTIFIER ON; SET ANSI_NULLS ON; SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON; SET ARITHABORT ON; SET CONCAT_NULL_YIELDS_NULL ON; SET NUMERIC_ROUNDABORT OFF; SET XACT_ABORT ON;
IF NOT EXISTS(SELECT 1 FROM dbo.Users WHERE id=${userId} AND normalized_email=N'${email}') THROW 51999,'Test identity mismatch',1;
BEGIN TRANSACTION;
DELETE dbo.RequestRecord WHERE actor_user_id=${userId};
DELETE dbo.AuditLog WHERE actor_user_id=${userId};
DELETE dbo.Vehicle WHERE user_id=${userId};
DELETE dbo.Users WHERE id=${userId} AND normalized_email=N'${email}';
COMMIT;`;
  const result = spawnSync(sqlcmd, ['-S','localhost','-E','-C','-d',database,'-b','-l','5','-Q',sql], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stdout + result.stderr);
}
(async () => {
  try { browser = await chromium.launch({ headless: true }); }
  catch { browser = await chromium.launch({ headless: true, channel: 'msedge' }); }
  const context = await browser.newContext({ baseURL: ui, viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const runtimeErrors = [];
  page.on('pageerror', error => runtimeErrors.push(error.message));
  const registration = await context.request.post('/api/auth/register', { data: { name: 'Kiểm tra giao diện', email, password, phone: '0900000020' } });
  assert.equal(registration.status(), 201, await registration.text());
  userId = (await registration.json()).id;
  await page.goto('/customer/vehicles');
  await page.waitForURL('**/login');
  await page.getByLabel('Email', { exact: false }).fill(email);
  await page.getByLabel(/^Mật khẩu/).fill('wrong-password');
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await page.getByText('Email hoặc mật khẩu không đúng.', { exact: true }).waitFor();
  await page.getByLabel(/^Mật khẩu/).fill(password);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await page.waitForURL('**/customer/dashboard');
  await page.goto('/customer/vehicles');
  await page.getByText('Chưa có phương tiện nào', { exact: true }).waitFor();
  let loseCreate = true;
  const createKeys = [];
  await page.route('**/api/vehicles', async route => {
    if (route.request().method() !== 'POST') return route.continue();
    createKeys.push(route.request().headers()['idempotency-key']);
    const response = await route.fetch();
    assert.equal(response.status(), 201, await response.text());
    if (loseCreate) { loseCreate = false; return route.abort('failed'); }
    return route.fulfill({ response });
  });
  await page.getByRole('button', { name: 'Thêm xe', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Biển số xe', { exact: true }).fill(plate);
  await dialog.getByRole('combobox').click();
  await page.getByRole('option', { name: /Ô tô/ }).click();
  await dialog.getByRole('button', { name: 'Thêm mới', exact: true }).click();
  await dialog.getByText(/Không kết nối được máy chủ/).waitFor();
  await dialog.getByRole('button', { name: 'Hủy', exact: true }).click();
  await page.getByRole('button', { name: 'Thêm xe', exact: true }).click();
  await dialog.getByLabel('Biển số xe', { exact: true }).fill(plate);
  await dialog.getByRole('combobox').click();
  await page.getByRole('option', { name: /Ô tô/ }).click();
  await dialog.getByRole('button', { name: 'Thêm mới', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  assert.equal(createKeys.length, 2);
  assert.equal(createKeys[0], createKeys[1], 'Reopened vehicle dialog lost retry key');
  await page.getByText(plate, { exact: true }).waitFor();
  await page.reload();
  await page.getByText(plate, { exact: true }).waitFor();
  let row = page.getByRole('row').filter({ hasText: plate });
  await row.getByRole('button', { name: 'Chỉnh sửa', exact: true }).click();
  await dialog.getByLabel('Biển số xe', { exact: true }).fill(plate + 'X');
  await dialog.getByRole('button', { name: 'Cập nhật', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  await page.getByText(plate + 'X', { exact: true }).waitFor();
  row = page.getByRole('row').filter({ hasText: plate + 'X' });
  page.once('dialog', event => event.accept());
  await row.getByRole('button', { name: 'Ngừng sử dụng', exact: true }).click();
  await page.getByText('Đã ngừng sử dụng', { exact: true }).waitFor();
  await page.screenshot({ path: '.work/ui-vehicles.png', fullPage: true, animations: 'disabled' });
  await page.goto('/admin/users');
  await page.waitForURL('**/customer/dashboard');
  await page.evaluate(() => localStorage.setItem('user', JSON.stringify({ role: 'Admin', name: 'Tampered' })));
  await page.goto('/admin/users');
  await page.waitForURL('**/customer/dashboard');
  assert.equal(await page.evaluate(() => localStorage.getItem('user')), null);
  await page.evaluate(() => localStorage.setItem('token', 'mock-token-123'));
  await page.goto('/customer/vehicles');
  await page.waitForURL('**/login');
  assert.equal(runtimeErrors.length, 0, runtimeErrors.join('\n'));
  console.log('PASS: browser login errors, real login, lost-create-response/reopen retry, create/edit/deactivate vehicle, persistence after reload, route scope, forged browser role, old mock session removal; no page errors.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (browser) await browser.close();
  cleanup();
});
