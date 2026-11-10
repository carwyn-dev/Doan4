// Real staff parking board, maintenance and route guards in a disposable DB.
const { chromium }=require(require('node:path').join(process.argv[2],'playwright'));
const { readFileSync }=require('node:fs');
const { join }=require('node:path');
const { randomUUID }=require('node:crypto');
const assert=require('node:assert/strict');
const api=process.env.PARKING_TEST_API, ui=process.env.PARKING_TEST_UI, db=process.env.PARKING_TEST_DATABASE;
assert.match(db||'',/^ParkingAdminVerify_[a-f0-9]{12}$/);
assert.match(api,/^http:\/\/127\.0\.0\.1:\d+\/api$/); assert.match(ui,/^http:\/\/127\.0\.0\.1:\d+$/);
const f=JSON.parse(readFileSync(join(process.env.PARKING_TEST_WORK,'maintenance-fixture.json'),'utf8'));
assert.equal(f.database,db);
const errors=[]; let browser,page;
const row=code=>page.getByRole('row',{ name:`${code==='M1'?'Bikes':'Cars'} · ${code}`,exact:true });
const dialog=()=>page.getByRole('dialog');
async function json(response,status=200) { assert.equal(response.status(),status,await response.text()); return response.json(); }
async function login(email,role) {
  const context=await browser.newContext({ baseURL:ui,viewport:{ width:1440,height:1100 },timezoneId:'UTC' });
  const tab=await context.newPage(); tab.on('pageerror',e=>errors.push(e.message));
  await tab.goto('/login'); await tab.getByLabel(/Email/).fill(email); await tab.getByLabel(/Mật khẩu/).fill('MaintenanceTest123!');
  const response=tab.waitForResponse(r=>r.url().endsWith('/api/auth/login')&&r.request().method()==='POST');
  await tab.getByRole('button',{ name:'Đăng nhập',exact:true }).click();
  const auth=await json(await response); await tab.waitForURL(`**/${role}/dashboard`);
  return { context,tab,token:auth.token };
}
async function select(label,option) {
  await page.getByRole('combobox',{ name:label,exact:true }).click();
  await page.getByRole('option',{ name:option,exact:true }).click();
}
async function clearFilters() { await page.getByRole('button',{ name:'Xóa bộ lọc',exact:true }).click(); }
async function prepare(reason) { await dialog().getByLabel(/Lý do bảo trì hoặc mở lại/).fill(reason); await dialog().getByRole('checkbox').check(); }
async function save(reason) {
  await prepare(reason); await dialog().getByRole('button',{ name:'Xác nhận bảo trì',exact:true }).click();
  await dialog().waitFor({ state:'hidden' }); await page.getByText('Đang tải trạng thái bãi…',{ exact:true }).waitFor({ state:'hidden' });
}
async function metric(label,value) { await page.getByRole('group',{ name:label,exact:true }).getByText(String(value),{ exact:true }).waitFor(); }
(async()=>{
  try { browser=await chromium.launch({ headless:true }); } catch { browser=await chromium.launch({ headless:true,channel:'msedge' }); }
  const staff=await login(f.staffEmail,'staff'); page=staff.tab;
  await page.getByRole('link',{ name:'Trạng thái bãi',exact:true }).click();
  await page.getByRole('heading',{ name:'Trạng thái bãi và bảo trì',exact:true }).waitFor();
  await metric('Vị trí hoạt động',6); await metric('Vị trí có xe',1); await metric('Vị trí bảo trì',1); await metric('Vị trí còn đệm',1);
  await row('R1').waitFor();
  assert(await row('W2').getByRole('button',{ name:'Bảo trì',exact:true }).isDisabled(),'Occupied maintenance allowed');
  await select('Loại xe','Xe máy'); await row('M1').waitFor();
  assert.equal(await row('W1').count(),0); await metric('Vị trí hoạt động',6);
  await clearFilters(); await select('Nhóm vị trí','Đặt trước'); await row('R1').waitFor();
  assert.equal(await row('W2').count(),0);
  await clearFilters(); await select('Trạng thái vị trí','Còn đệm'); await row('W3').waitFor();
  assert.equal(await row('W1').count(),0);
  await clearFilters(); await select('Trạng thái vị trí','Ngừng hoạt động'); await row('I1').waitFor(); await row('X1').waitFor();
  assert.equal(await row('W1').count(),0);
  await clearFilters(); await select('Khu vực','Cars · B1'); assert.equal(await row('M1').count(),0);
  await clearFilters();
  await page.getByLabel('Tìm mã vị trí, khu hoặc biển số',{ exact:true }).fill('W1'); await row('W1').waitFor(); assert.equal(await row('W2').count(),0);
  await clearFilters();

  await row('R1').getByRole('button',{ name:'Bảo trì',exact:true }).click();
  await dialog().getByText(/đang có 1 lịch đặt còn hiệu lực/).waitFor();
  assert(await dialog().getByRole('button',{ name:'Xác nhận bảo trì',exact:true }).isDisabled(),'Missing reason/verification accepted');
  await prepare('Sửa đèn tại vị trí R1');
  const keys=[]; let lost=false;
  await page.route(`**/api/staff/slots/${f.slots.R1}/maintenance`,async route=>{
    keys.push(route.request().headers()['idempotency-key']);
    const response=await route.fetch(); assert.equal(response.status(),200,await response.text());
    if(!lost) { lost=true; return route.abort('failed'); }
    return route.fulfill({ response });
  });
  await dialog().getByRole('button',{ name:'Xác nhận bảo trì',exact:true }).click();
  await dialog().getByText(/Không kết nối được máy chủ/).waitFor();
  await dialog().getByRole('button',{ name:'Xác nhận bảo trì',exact:true }).click();
  await dialog().waitFor({ state:'hidden' });
  await row('R1').getByRole('button',{ name:'Kết thúc bảo trì',exact:true }).waitFor();
  assert.equal(keys.length,2); assert.equal(keys[0],keys[1]);
  await page.unroute(`**/api/staff/slots/${f.slots.R1}/maintenance`);
  await page.reload(); await row('R1').getByRole('button',{ name:'Kết thúc bảo trì',exact:true }).waitFor();
  await row('R1').getByRole('button',{ name:'Kết thúc bảo trì',exact:true }).click(); await save('Hoàn thành sửa đèn');
  const headers={ Authorization:`Bearer ${staff.token}` };
  let positions=await json(await staff.context.request.get(api+'/staff/operations',{ headers }));
  assert.equal(positions.find(s=>s.id===f.slots.R1).confirmedReservationCount,1);
  const buffer=positions.find(s=>s.id===f.slots.W3).bufferUntil;
  await row('W3').getByRole('button',{ name:'Bảo trì',exact:true }).click(); await save('Kiểm tra vị trí còn đệm');
  await row('W3').getByRole('button',{ name:'Kết thúc bảo trì',exact:true }).click(); await save('Đã phục vụ được');
  await row('W3').getByText('Còn đệm',{ exact:true }).waitFor();
  positions=await json(await staff.context.request.get(api+'/staff/operations',{ headers }));
  assert.equal(positions.find(s=>s.id===f.slots.W3).bufferUntil,buffer);
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.screenshot({ path:'.work/staff-parking-desktop.png',fullPage:true,animations:'disabled' });
  await page.setViewportSize({ width:390,height:844 });
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'Parking board mobile overflow');
  const boardBounds=await page.getByRole('region',{ name:'Danh sách vị trí đỗ' }).boundingBox();
  const maintenanceBounds=await row('R1').getByRole('button',{ name:'Bảo trì',exact:true }).boundingBox();
  assert(boardBounds && maintenanceBounds && maintenanceBounds.x>=boardBounds.x && maintenanceBounds.x+maintenanceBounds.width<=boardBounds.x+boardBounds.width,'Maintenance action needs horizontal scrolling');
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.screenshot({ path:'.work/staff-parking-mobile.png',fullPage:true,animations:'disabled' });
  await page.setViewportSize({ width:1440,height:1100 });

  // Inventory can change after opening the dialog; the API must reject maintenance.
  await row('W1').getByRole('button',{ name:'Bảo trì',exact:true }).click();
  const received=await json(await staff.context.request.post(api+'/sessions/checkin',{ headers:{ ...headers,'Idempotency-Key':randomUUID() },data:{ slotId:f.slots.W1,plateNumber:'MU'+randomUUID().slice(0,8),vehicleType:'CAR' } }),201);
  await prepare('Tình trạng đã đổi sau khi mở biểu mẫu');
  await dialog().getByRole('button',{ name:'Xác nhận bảo trì',exact:true }).click();
  await dialog().getByText(/Không thể thay đổi bảo trì khi có xe OPEN/).waitFor();
  await dialog().getByRole('button',{ name:'Đóng',exact:true }).click();
  await page.getByRole('button',{ name:'Làm mới vị trí',exact:true }).click();
  await metric('Vị trí có xe',2);
  assert(await row('W1').getByRole('button',{ name:'Bảo trì',exact:true }).isDisabled());
  await row('W1').getByRole('link',{ name:'Xem lượt gửi',exact:true }).click();
  await page.waitForURL('**/staff/checkout?query=*');
  await page.getByRole('row').filter({ hasText:received.sessionCode }).waitFor();
  await page.getByRole('link',{ name:'Trạng thái bãi',exact:true }).click(); await row('R1').waitFor();

  await page.route('**/api/staff/operations',route=>route.abort('failed'));
  await page.getByRole('button',{ name:'Làm mới vị trí',exact:true }).click();
  await page.getByText(/Không kết nối được máy chủ/).waitFor(); assert.equal(await page.getByRole('table').count(),0);
  assert.equal(await page.getByRole('group',{ name:'Vị trí hoạt động',exact:true }).count(),0);
  await page.unroute('**/api/staff/operations'); await page.getByRole('button',{ name:'Làm mới vị trí',exact:true }).click(); await row('R1').waitFor();
  const customer=await login(f.customerEmail,'customer'); page=customer.tab;
  const reservation=await json(await customer.context.request.get(api+`/reservations/${f.reservation.id}`,{ headers:{ Authorization:`Bearer ${customer.token}` } }));
  assert.equal(reservation.status,'CONFIRMED');
  await page.goto('/staff/parking-status'); await page.waitForURL('**/customer/dashboard');
  assert.equal(await page.getByRole('heading',{ name:'Trạng thái bãi và bảo trì',exact:true }).count(),0);
  assert.deepEqual(errors,[],errors.join('; '));
  console.log('PASS maintenance browser: scoped inventory, filters, replay, future booking, buffer, occupied race, session link, error/retry, role guard, mobile');
})().catch(async error=>{
  console.error(error);
  if(page) { await page.screenshot({ path:'.work/maintenance-ui-failure.png',fullPage:true }).catch(()=>{}); console.error((await page.locator('body').innerText()).slice(-5000)); }
  process.exitCode=1;
}).finally(async()=>{ if(browser) await browser.close(); });
