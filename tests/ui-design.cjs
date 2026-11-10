// Responsive layout, navigation and public forms against the isolated real API.
const { chromium } = require(require('node:path').join(process.argv[2], 'playwright'));
const { mkdirSync } = require('node:fs');
const { join } = require('node:path');
const { randomUUID } = require('node:crypto');
const assert = require('node:assert/strict');
const ui = process.env.PARKING_TEST_UI, database = process.env.PARKING_TEST_DATABASE;
assert.match(database || '', /^ParkingAdminVerify_[a-f0-9]{12}$/);
assert.match(ui || '', /^http:\/\/127\.0\.0\.1:\d+$/);
const screenshots = join(process.env.PARKING_TEST_WORK, 'design');
mkdirSync(screenshots, { recursive: true });
const errors = [], warnings = [];
const routes = {
  admin: ['dashboard', 'parking-lots', 'zones', 'slots', 'pricing', 'users', 'reports'],
  staff: ['dashboard', 'parking-status', 'checkin', 'checkout'],
  customer: ['dashboard', 'vehicles', 'search', 'history', 'sessions'],
};
const sizes = [{ width: 360, height: 800 }, { width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1440, height: 1000 }];
let browser, checked = 0;
function watch(page) {
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (/MUI:|does not recognize|not a valid|deprecated prop/i.test(message.text())) warnings.push(message.text());
  });
}
async function inspect(page, name) {
  await page.locator('h1').waitFor();
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
  assert.equal(await page.locator('h1').count(), 1, `${name}: ambiguous main heading`);
  for (const size of sizes) {
    await page.setViewportSize(size);
    await page.evaluate(() => scrollTo(0, 0));
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${name}: page overflow at ${size.width}px`);
    assert(await page.locator('h1').isVisible(), `${name}: missing heading at ${size.width}px`);
    if (size.width === 390 || size.width === 1440) {
      await page.screenshot({ path: join(screenshots, `${name}-${size.width}.png`), fullPage: true, animations: 'disabled' });
    }
    checked++;
  }
}
(async () => {
  try { browser = await chromium.launch({ headless: true }); }
  catch { browser = await chromium.launch({ headless: true, channel: 'msedge' }); }
  const context = await browser.newContext({ baseURL: ui });
  const page = await context.newPage(); watch(page);
  for (const [path, name] of [['/', 'home'], ['/login', 'login'], ['/register', 'register']]) {
    await page.goto(path); await inspect(page, name);
  }
  // Check the public entry links and password visibility without submitting.
  await page.goto('/'); await page.getByRole('link', { name: 'Đăng nhập để đặt chỗ', exact: true }).click();
  await page.waitForURL('**/login');
  await page.getByLabel(/Mật khẩu/).fill('Visibility123!');
  await page.getByRole('button', { name: 'Hiện mật khẩu', exact: true }).click();
  assert.equal(await page.getByLabel(/Mật khẩu/).getAttribute('type'), 'text');
  await page.getByRole('button', { name: 'Ẩn mật khẩu', exact: true }).click();
  assert.equal(await page.getByLabel(/Mật khẩu/).getAttribute('type'), 'password');
  // Exercise the redesigned registration form, including its local validation.
  await page.getByRole('link', { name: 'Đăng ký ngay', exact: true }).click();
  await page.getByLabel(/Họ tên/).fill('Khách kiểm thử giao diện');
  await page.getByLabel(/Email/).fill(`design-${randomUUID().slice(0, 8)}@parking.test`);
  await page.getByLabel(/Số điện thoại/).fill('0900000099');
  await page.getByLabel(/Mật khẩu/).fill('1234567');
  await page.getByRole('button', { name: 'Đăng ký', exact: true }).click();
  await page.getByRole('alert').getByText('Mật khẩu mới cần ít nhất 8 ký tự.', { exact: true }).waitFor();
  await page.getByLabel(/Mật khẩu/).fill('DesignTest123!');
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Đăng ký', exact: true }).click();
  await page.waitForURL('**/login');
  await context.close();
  for (const [role, paths] of Object.entries(routes)) {
    const c = await browser.newContext({ baseURL: ui, viewport: sizes[3], timezoneId: 'UTC' });
    const p = await c.newPage(); watch(p);
    await p.goto('/login');
    const demo = { admin: 'Quản trị viên', staff: 'Nhân viên', customer: 'Khách hàng' }[role];
    await p.getByRole('button', { name: demo, exact: true }).click();
    await p.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    await p.waitForURL(`**/${role}/dashboard`);
    for (const path of paths) {
      await p.goto(`/${role}/${path}`); await inspect(p, `${role}-${path}`);
      // On desktop the selected navigation item must be exposed to assistive tech.
      assert.equal(await p.getByRole('navigation', { name: 'Điều hướng chính' }).locator('[aria-current="page"]').count(), 1);
    }
    await p.setViewportSize(sizes[1]);
    await p.getByRole('button', { name: 'Mở menu', exact: true }).click();
    await p.getByRole('navigation', { name: 'Điều hướng chính' }).getByRole('link', { name: role === 'staff' ? 'Quầy trực bãi' : 'Tổng quan', exact: true }).click();
    await p.waitForURL(`**/${role}/dashboard`);
    await p.getByRole('navigation', { name: 'Điều hướng chính' }).waitFor({ state: 'hidden' });
    // The skip link is the first keyboard destination in the application shell.
    await p.goto(`/${role}/dashboard`); await p.locator('h1').waitFor();
    await p.keyboard.press('Tab');
    assert.equal(await p.locator(':focus').textContent(), 'Đến nội dung chính');
    await p.keyboard.press('Enter');
    assert.equal(await p.locator(':focus').getAttribute('id'), 'main-content');
    await c.close();
  }
  assert.deepEqual(errors, []); assert.deepEqual(warnings, []);
  assert.equal(checked, 76);
  console.log('PASS design browser: 19 pages × 4 widths, public links, registration validation/save, password visibility, demo login, mobile menus, current navigation, keyboard skip link; no overflow, MUI warnings or runtime errors.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { if (browser) await browser.close(); });
