// Real browser report tests; all URLs and fixtures belong to run_admin_tests.py.
const { chromium } = require(require('node:path').join(process.argv[2], 'playwright'));
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { randomUUID } = require('node:crypto');
const assert = require('node:assert/strict');
const api = process.env.PARKING_TEST_API, ui = process.env.PARKING_TEST_UI;
assert.match(process.env.PARKING_TEST_DATABASE || '', /^ParkingAdminVerify_[a-f0-9]{12}$/);
assert.match(api, /^http:\/\/127\.0\.0\.1:\d+\/api$/);
assert.match(ui, /^http:\/\/127\.0\.0\.1:\d+$/);
const fixture = JSON.parse(readFileSync(join(process.env.PARKING_TEST_WORK, 'report-fixture.json'), 'utf8'));
assert.equal(fixture.database, process.env.PARKING_TEST_DATABASE);
const money = value => new Intl.NumberFormat('vi-VN', { style:'currency', currency:'VND' }).format(value);
const errors = [];
let browser, page;
async function data(response, status=200) { assert.equal(response.status(),status,await response.text()); return response.json(); }
async function login(email,password,role) {
  const context = await browser.newContext({ baseURL:ui, viewport:{ width:1440,height:1100 }, timezoneId:'UTC' });
  const tab = await context.newPage(); tab.on('pageerror',e=>errors.push(e.message));
  await tab.goto('/login');
  await tab.getByLabel(/Email/).fill(email); await tab.getByLabel(/Mật khẩu/).fill(password);
  await tab.getByRole('button',{ name:'Đăng nhập',exact:true }).click();
  await tab.waitForURL(`**/${role}/dashboard`);
  await tab.getByText('Đang tải số liệu...', { exact:true }).waitFor({ state:'hidden' });
  return { context,tab };
}
async function metric(label,value) { await page.getByRole('group',{ name:label,exact:true }).getByText(String(value),{ exact:true }).waitFor(); }
async function selectLot(name) {
  await page.getByRole('combobox',{ name:'Bãi đỗ xe',exact:true }).click();
  await page.getByRole('option',{ name,exact:true }).click();
}
async function range(from,to) {
  await page.getByLabel(/Từ ngày/).fill(from); await page.getByLabel(/Đến hết ngày/).fill(to);
  await page.getByRole('button',{ name:'Xem báo cáo',exact:true }).click();
}
(async()=>{
  try { browser=await chromium.launch({ headless:true }); } catch { browser=await chromium.launch({ headless:true,channel:'msedge' }); }
  const admin = await login('admin@parking.test','123456','admin'); page=admin.tab;
  const auth = await data(await admin.context.request.post(api+'/auth/login',{ data:{ email:'admin@parking.test',password:'123456' } }));
  const expected = await data(await admin.context.request.get(api+'/dashboard',{ headers:{ Authorization:`Bearer ${auth.token}` } }));
  await metric('Bãi đang hoạt động',expected.summary.activeLotCount);
  await metric('Vị trí hoạt động',expected.summary.totalActiveSlots);
  await metric('Xe đang gửi',expected.summary.openSessions);
  await metric('Thu ghi nhận hôm nay',money(expected.summary.todayRevenue));
  assert.equal(await page.getByText(/hiện chỉ dùng để minh họa/).count(),0);
  await page.screenshot({ path:'.work/dashboard-admin.png',fullPage:true,animations:'disabled' });
  await page.getByRole('link',{ name:'Báo cáo',exact:true }).click();
  await page.getByText('Đang tải báo cáo...', { exact:true }).waitFor({ state:'hidden' });
  await selectLot(fixture.lotName);
  await range('2020-01-02','2020-01-02');
  await metric('Phiếu thu đã ghi nhận',2); await metric('Tổng thu ghi nhận',money(2*fixture.rate));
  await metric('Lượt xe vào',1); await metric('Lượt xe ra',1);
  await page.getByRole('img',{ name:'Tổng thu ghi nhận theo ngày Việt Nam',exact:true }).waitFor();
  assert.equal(await page.getByRole('columnheader',{ name:'Tỷ lệ lấp đầy',exact:true }).count(),0,'Historical occupancy invented');
  // Presets use Vietnam's date even when the browser runs in UTC.
  await page.getByRole('button',{ name:'Hôm nay',exact:true }).click();
  const vnToday = new Date(Date.now()+7*3600000).toISOString().slice(0,10);
  assert.equal(await page.getByLabel(/Từ ngày/).inputValue(),vnToday);
  assert.equal(await page.getByLabel(/Đến hết ngày/).inputValue(),vnToday);
  await page.getByRole('button',{ name:'7 ngày',exact:true }).click();
  const from=await page.getByLabel(/Từ ngày/).inputValue(), to=await page.getByLabel(/Đến hết ngày/).inputValue();
  assert.equal((Date.parse(to)-Date.parse(from))/86400000,6);
  await range('2020-01-04','2020-01-04');
  await metric('Tổng thu ghi nhận',money(0));
  await page.getByText('Chưa có phiếu thu trong khoảng ngày này.',{ exact:true }).waitFor();
  assert.equal(await page.getByRole('img',{ name:'Tổng thu ghi nhận theo ngày Việt Nam',exact:true }).count(),0);
  await range('2020-01-03','2020-01-02');
  await page.getByText('Chọn khoảng ngày hợp lệ, tối đa 366 ngày.',{ exact:true }).waitFor();

  // A delayed answer for lot A must not overwrite a newer answer for lot B.
  let release, entered, done;
  const gate=new Promise(resolve=>{ release=resolve; });
  const entry=new Promise(resolve=>{ entered=resolve; });
  const finished=new Promise(resolve=>{ done=resolve; });
  let held=false;
  await page.route('**/api/admin/reports?*',async route=>{
    const q=new URL(route.request().url()).searchParams;
    if (!held && q.get('parkingLotId')===String(fixture.lotA) && q.get('fromDate')==='2020-01-02') {
      held=true; const response=await route.fetch(); entered(); await gate; await route.fulfill({ response }); done();
    } else await route.continue();
  });
  await range('2020-01-02','2020-01-02'); await entry;
  const closedName=fixture.lotName.replace('Report A','Report B')+' (ngừng hoạt động)';
  await selectLot(closedName);
  await page.getByRole('button',{ name:'Xem báo cáo',exact:true }).click();
  await metric('Phiếu thu đã ghi nhận',1);
  release(); await finished;
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await metric('Phiếu thu đã ghi nhận',1); await metric('Tổng thu ghi nhận',money(fixture.rate));
  await page.unroute('**/api/admin/reports?*');
  await selectLot(fixture.lotName); await range('2020-01-02','2020-01-02');
  await metric('Tổng thu ghi nhận',money(2*fixture.rate));
  await page.screenshot({ path:'.work/reports-desktop.png',fullPage:true,animations:'disabled' });
  await page.setViewportSize({ width:390,height:844 });
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'Report mobile page overflow');
  await page.screenshot({ path:'.work/reports-mobile.png',fullPage:true,animations:'disabled' });
  await page.setViewportSize({ width:1440,height:1100 });
  await page.route('**/api/admin/reports?*',route=>route.abort('failed'));
  await page.getByRole('button',{ name:'Làm mới',exact:true }).click();
  await page.getByText(/Không kết nối được máy chủ/).waitFor();
  assert.equal(await page.getByRole('group',{ name:'Tổng thu ghi nhận',exact:true }).count(),0,'Stale report metrics shown on error');
  assert.equal(await page.getByRole('table').count(),0);
  await page.unroute('**/api/admin/reports?*');
  await page.getByRole('button',{ name:'Làm mới',exact:true }).click();
  await metric('Tổng thu ghi nhận',money(2*fixture.rate));

  const staff=await login(fixture.staffEmail,'ReportFixture123!','staff'); page=staff.tab;
  await metric('Vị trí hoạt động',6); await metric('Xe đang gửi',1); await metric('Chỗ chưa có xe',4); await metric('Đặt chỗ còn hiệu lực',1);
  await metric('Chỗ nhận trực tiếp',2);
  assert.equal(await page.getByRole('group',{ name:'Thu ghi nhận hôm nay',exact:true }).count(),0);
  assert.equal(await page.getByRole('link',{ name:'Báo cáo',exact:true }).count(),0);
  const staffAuth=await data(await staff.context.request.post(api+'/auth/login',{ data:{ email:fixture.staffEmail,password:'ReportFixture123!' } }));
  const hs={ Authorization:`Bearer ${staffAuth.token}` };
  const operations=await data(await staff.context.request.get(api+'/staff/operations',{ headers:hs }));
  const w2=operations.find(s=>s.code==='W2');
  await data(await staff.context.request.post(api+'/sessions/checkin',{ headers:{ ...hs,'Idempotency-Key':randomUUID() },data:{ slotId:w2.id,plateNumber:'UI'+randomUUID().slice(0,8).replaceAll('-',''),vehicleType:'CAR' } }),201);
  await page.getByRole('button',{ name:'Làm mới',exact:true }).click(); await metric('Xe đang gửi',2); await metric('Chỗ chưa có xe',3);
  await metric('Chỗ nhận trực tiếp',1);
  await page.screenshot({ path:'.work/dashboard-staff.png',fullPage:true,animations:'disabled' });

  const customer=await login(fixture.customerEmail,'ReportFixture123!','customer'); page=customer.tab;
  await metric('Phương tiện hoạt động',3); await metric('Xe đang gửi',1); await metric('Đặt chỗ còn hiệu lực',1); await metric('Tổng tiền đã trả',money(fixture.rate));
  assert.equal(await page.getByRole('table').count(),0,'Customer received global occupancy');
  await page.setViewportSize({ width:390,height:844 });
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'Customer mobile overflow');
  await page.screenshot({ path:'.work/dashboard-customer-mobile.png',fullPage:true,animations:'disabled' });
  await page.route('**/api/dashboard',route=>route.abort('failed'));
  await page.getByRole('button',{ name:'Làm mới',exact:true }).click();
  await page.getByText(/Không kết nối được máy chủ/).waitFor();
  assert.equal(await page.getByRole('group',{ name:'Xe đang gửi',exact:true }).count(),0,'Dashboard kept stale metrics');
  assert.deepEqual(errors,[],errors.join('; '));
  console.log('PASS report browser: three role dashboards, real refresh, VN dates, filters, chart, empty/errors, delayed response, mobile');
})().catch(async error=>{
  console.error(error);
  if (page) { await page.screenshot({ path:'.work/reports-ui-failure.png',fullPage:true }).catch(()=>{}); console.error((await page.locator('body').innerText()).slice(-4500)); }
  process.exitCode=1;
}).finally(async()=>{ if(browser) await browser.close(); });
