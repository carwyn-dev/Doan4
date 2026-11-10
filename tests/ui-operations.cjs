// End-to-end staff exceptions. Run only through the disposable-database test runner.
const { chromium } = require(require('node:path').join(process.argv[2],'playwright'));
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { spawnSync } = require('node:child_process');
const assert = require('node:assert/strict');
const api=process.env.PARKING_TEST_API, ui=process.env.PARKING_TEST_UI, db=process.env.PARKING_TEST_DATABASE;
assert.match(db||'',/^ParkingAdminVerify_[a-f0-9]{12}$/);
assert.match(api,/^http:\/\/127\.0\.0\.1:\d+\/api$/); assert.match(ui,/^http:\/\/127\.0\.0\.1:\d+$/);
const fixture=JSON.parse(readFileSync(join(process.env.PARKING_TEST_WORK,'operations-fixture.json'),'utf8'));
assert.equal(fixture.database,db);
const errors=[]; let browser,page;
const dialog=()=>page.getByRole('dialog');
async function login(email,role) {
  const context=await browser.newContext({ baseURL:ui,viewport:{ width:1440,height:1100 },timezoneId:'UTC' });
  const tab=await context.newPage(); tab.on('pageerror',e=>errors.push(e.message));
  await tab.goto('/login'); await tab.getByLabel(/Email/).fill(email); await tab.getByLabel(/Mật khẩu/).fill('OperationTest123!');
  await tab.getByRole('button',{ name:'Đăng nhập',exact:true }).click(); await tab.waitForURL(`**/${role}/dashboard`);
  return { context,tab };
}
async function lookup(reservation) {
  await page.getByLabel('Biển số hoặc mã đặt chỗ').fill(reservation.reservationCode);
  await page.getByRole('button',{ name:'Tra cứu',exact:true }).click();
  await page.getByRole('button',{ name:'Cập nhật lượt đặt',exact:true }).waitFor();
}
async function form(reason) {
  await dialog().getByLabel(/Lý do xử lý/).fill(reason);
  await dialog().getByRole('checkbox').check();
}
async function save() {
  await dialog().getByRole('button',{ name:'Xác nhận xử lý',exact:true }).click();
  await dialog().waitFor({ state:'hidden' });
}
function sql(statement) {
  const flags='SET NOCOUNT ON; SET QUOTED_IDENTIFIER ON; SET ANSI_NULLS ON; SET ANSI_PADDING ON; SET ANSI_WARNINGS ON; SET ARITHABORT ON; SET CONCAT_NULL_YIELDS_NULL ON; SET NUMERIC_ROUNDABORT OFF; SET XACT_ABORT ON; ';
  const r=spawnSync(process.env.PARKING_TEST_SQLCMD||'sqlcmd',['-S','localhost','-E','-C','-b','-d',db,'-Q',flags+statement],{ encoding:'utf8' });
  assert.equal(r.status,0,r.stdout+r.stderr);
}
(async()=>{
  try { browser=await chromium.launch({ headless:true }); } catch { browser=await chromium.launch({ headless:true,channel:'msedge' }); }
  const staff=await login(fixture.staffEmail,'staff'); page=staff.tab;
  await page.goto('/staff/checkin');
  const [first,second,third]=fixture.reservations;
  await lookup(first);
  await page.getByRole('button',{ name:'Ghi nhận sự cố',exact:true }).click();
  assert(await dialog().getByRole('button',{ name:'Xác nhận xử lý',exact:true }).isDisabled(),'No verification/reason required');
  await form('Cổng bãi hỏng, khách đã đến');
  const keys=[]; let lost=false;
  await page.route(`**/api/reservations/${first.id}/service-issue`,async route=>{
    keys.push(route.request().headers()['idempotency-key']);
    const response=await route.fetch(); assert.equal(response.status(),200,await response.text());
    if(!lost) { lost=true; return route.abort('failed'); }
    return route.fulfill({ response });
  });
  await dialog().getByRole('button',{ name:'Xác nhận xử lý',exact:true }).click();
  await dialog().getByText(/Không kết nối được máy chủ/).waitFor();
  await save();
  assert.equal(keys.length,2); assert.equal(keys[0],keys[1]);
  await page.getByText(/Hạn giải quyết:/).waitFor();
  assert(await page.getByRole('button',{ name:'Ghi nhận sự cố',exact:true }).isDisabled(),'Recorded issue can be extended');
  await page.screenshot({ path:'.work/staff-incident-desktop.png',fullPage:true,animations:'disabled' });
  await page.getByRole('button',{ name:'Không phục vụ được',exact:true }).click();
  await form('Không còn chỗ thay thế, khách từ chối chờ'); await save();
  await page.getByText(/Đã ghi nhận không phục vụ được/).waitFor();
  assert.equal(await page.getByRole('button',{ name:'Xác nhận xe vào',exact:true }).count(),0);

  // A recorded incident may still be resolved through the normal check-in path.
  await lookup(second); await page.getByRole('button',{ name:'Ghi nhận sự cố',exact:true }).click();
  await form('Khách chờ kiểm tra cổng'); await save();
  await page.getByRole('button',{ name:'Xác nhận xe vào',exact:true }).click();
  await page.getByText(/Đã nhận xe! Mã phiên:/).waitFor();

  // A stale form must obey the server's elapsed deadline.
  await lookup(third); await page.getByRole('button',{ name:'Ghi nhận sự cố',exact:true }).click();
  await form('Khách đã đến gặp sự cố'); await save();
  await page.getByRole('button',{ name:'Không phục vụ được',exact:true }).click();
  sql(`DECLARE @n datetime2(7)=SYSUTCDATETIME(); UPDATE dbo.Reservation SET start_time=DATEADD(MINUTE,-30,@n),end_time=DATEADD(MINUTE,30,@n),expires_at=DATEADD(MINUTE,-15,@n),service_issue_at=DATEADD(MINUTE,-16,@n) WHERE id=${third.id};`);
  await form('Thử lưu sau hạn'); await dialog().getByRole('button',{ name:'Xác nhận xử lý',exact:true }).click();
  await dialog().getByText(/không còn trong thời gian/).waitFor();
  await dialog().getByRole('button',{ name:'Đóng',exact:true }).click();
  await page.getByRole('button',{ name:'Cập nhật lượt đặt',exact:true }).click();
  await page.getByRole('region', { name: 'Phiếu đặt chỗ' }).getByText('Không phục vụ được', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button',{ name:'Xác nhận xe vào',exact:true }).count(),0);

  await page.goto('/staff/checkout?query='+fixture.walk.sessionCode);
  const row=page.getByRole('row').filter({ hasText:fixture.walk.sessionCode });
  await row.getByRole('button',{ name:'Sửa biển số',exact:true }).click();
  await dialog().getByLabel(/Biển số đúng/).fill('Biển sai'); await form('Sửa lỗi nhập biển số');
  await dialog().getByRole('button',{ name:'Xác nhận xử lý',exact:true }).click();
  await dialog().getByText('Vui lòng kiểm tra dữ liệu nhập.',{ exact:true }).waitFor();
  await dialog().getByLabel(/Biển số đúng/).fill(fixture.newPlate);
  await page.setViewportSize({ width:390,height:844 });
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'Correction mobile overflow');
  await page.screenshot({ path:'.work/staff-plate-mobile.png',fullPage:true,animations:'disabled' });
  const plateKeys=[]; let lostPlate=false;
  await page.route(`**/api/sessions/${fixture.walk.id}/plate`,async route=>{
    plateKeys.push(route.request().headers()['idempotency-key']);
    const response=await route.fetch(); assert.equal(response.status(),200,await response.text());
    if(!lostPlate) { lostPlate=true; return route.abort('failed'); }
    return route.fulfill({ response });
  });
  await dialog().getByRole('button',{ name:'Xác nhận xử lý',exact:true }).click();
  await dialog().getByText(/Không kết nối được máy chủ/).waitFor(); await save();
  assert.equal(plateKeys.length,2); assert.equal(plateKeys[0],plateKeys[1]);
  await row.getByText(fixture.newPlate,{ exact:true }).waitFor();
  await page.reload(); await row.getByText(fixture.newPlate,{ exact:true }).waitFor();
  await row.getByRole('button',{ name:'Xem phí và xe ra',exact:true }).click();
  await dialog().getByText(fixture.newPlate,{ exact:true }).waitFor();
  await dialog().getByRole('button',{ name:'Đóng',exact:true }).click();

  const customer=await login(fixture.customerEmail,'customer'); page=customer.tab;
  await page.goto('/customer/history');
  const historical=page.getByRole('row').filter({ hasText:first.reservationCode });
  await historical.getByText('Không phục vụ được',{ exact:true }).waitFor();
  await historical.getByText('Lý do: Không còn chỗ thay thế, khách từ chối chờ',{ exact:true }).waitFor();
  assert.equal(await page.getByRole('button',{ name:'Ghi nhận sự cố',exact:true }).count(),0);
  await page.screenshot({ path:'.work/customer-incident-history.png',fullPage:true,animations:'disabled' });
  assert.deepEqual(errors,[],errors.join('; '));
  console.log('PASS operations browser: incident, deadlines, unfulfilled, recovery check-in, correction, lost responses, history, mobile');
})().catch(async error=>{
  console.error(error);
  if(page) { await page.screenshot({ path:'.work/operations-ui-failure.png',fullPage:true }).catch(()=>{}); console.error((await page.locator('body').innerText()).slice(-5000)); }
  process.exitCode=1;
}).finally(async()=>{ if(browser) await browser.close(); });
