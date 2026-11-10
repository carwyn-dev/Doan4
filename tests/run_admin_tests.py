"""Run admin API/browser tests in an owned disposable database and isolated processes.

Build the backend first. Requires local Windows-auth SQL Server, Python, Node,
frontend dependencies and Playwright. No writes to ParkingLotOnline.
"""
import argparse
import os
from pathlib import Path
import re
import shutil
import socket
import subprocess
import sys
import time
import urllib.request
import uuid

ROOT = Path(__file__).resolve().parents[1]
RUNTIME = Path.home() / '.cache/codex-runtimes/codex-primary-runtime/dependencies/node'
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--node', default=shutil.which('node') or str(RUNTIME / 'bin/node.exe'))
parser.add_argument('--node-modules', default=str(RUNTIME / 'node_modules'))
parser.add_argument('--suite', choices=['parking', 'users', 'reports', 'maintenance', 'operations', 'sessions', 'customer', 'design', 'readiness', 'all'], default='all')
args = parser.parse_args()
database = 'ParkingAdminVerify_' + uuid.uuid4().hex[:12]
assert re.fullmatch(r'ParkingAdminVerify_[a-f0-9]{12}', database)
work = ROOT / '.work' / database
work.mkdir(parents=True)
sqlcmd = shutil.which('sqlcmd') or r'C:\Program Files\Microsoft SQL Server\Client SDK\ODBC\170\Tools\Binn\SQLCMD.EXE'
hidden = {'creationflags': subprocess.CREATE_NO_WINDOW} if os.name == 'nt' else {}
processes, logs = [], []
created = False

def sql(statement, db='master'):
    result = subprocess.run([sqlcmd, '-S', 'localhost', '-E', '-C', '-b', '-l', '5', '-h', '-1', '-W', '-d', db, '-Q', 'SET NOCOUNT ON; ' + statement], capture_output=True, text=True, timeout=30, **hidden)
    if result.returncode: raise RuntimeError(result.stdout + result.stderr)
    return result.stdout.strip()

def port():
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        return sock.getsockname()[1]

def launch(command, cwd, env, name):
    log = (work / (name + '.log')).open('w', encoding='utf-8')
    logs.append(log)
    process = subprocess.Popen(command, cwd=cwd, env=env, stdout=log, stderr=subprocess.STDOUT, **hidden)
    processes.append(process)
    return process

def ready(url, process):
    for _ in range(80):
        if process.poll() is not None: raise RuntimeError(f'Process exited. Logs: {work}')
        try:
            with urllib.request.urlopen(url, timeout=2) as response:
                if response.status == 200: return
        except (OSError, TimeoutError): pass
        time.sleep(.25)
    raise RuntimeError(f'Not ready: {url}. Logs: {work}')

def run_test(command, env, name, timeout):
    result = subprocess.run(command, cwd=ROOT, env=env, capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=timeout, **hidden)
    (work / (name + '.log')).write_text(result.stdout + result.stderr, encoding='utf-8')
    print(result.stdout.strip(), flush=True)
    if result.returncode:
        print(result.stderr.strip(), file=sys.stderr, flush=True)
        raise RuntimeError(f'{name} failed. Logs: {work}')

try:
    assert sql(f"SELECT COUNT(*) FROM sys.databases WHERE name=N'{database}'") == '0'
    # Create first so cleanup can only remove the exact database owned by this run.
    sql(f'CREATE DATABASE [{database}] COLLATE Latin1_General_100_CI_AS_SC;')
    created = True
    source = (ROOT / 'sql.md').read_text(encoding='utf-8')
    script = re.search(r'```sql\s*\n(.*?)```', source, re.S).group(1).replace('ParkingLotOnline', database)
    init = work / 'init.sql'
    init.write_text(script, encoding='utf-8')
    with (work / 'init.log').open('w', encoding='utf-8') as log:
        subprocess.run([sqlcmd, '-S', 'localhost', '-E', '-C', '-b', '-f', '65001', '-i', str(init)], stdout=log, stderr=subprocess.STDOUT, check=True, timeout=120, **hidden)
    # Kiểm tra migration chạy lặp được và khớp với script khởi tạo mới.
    for filename in ['20261022_admin_users.sql', '20261022_reports.sql', '20261025_staff_exceptions.sql', '20261102_readiness.sql', '20261111_staff_reservation_plate.sql']:
        migration = work / filename
        migration.write_text((ROOT / 'scripts/sql' / filename).read_text(encoding='utf-8').replace('ParkingLotOnline', database), encoding='utf-8')
        with (work / (filename + '.log')).open('w', encoding='utf-8') as log:
            subprocess.run([sqlcmd, '-S', 'localhost', '-E', '-C', '-b', '-f', '65001', '-i', str(migration)], stdout=log, stderr=subprocess.STDOUT, check=True, timeout=30, **hidden)
    env = os.environ.copy()
    api_port, ui_port = port(), port()
    while ui_port == api_port: ui_port = port()
    api = f'http://127.0.0.1:{api_port}'
    ui = f'http://127.0.0.1:{ui_port}'
    env.update({
        'ConnectionStrings__ParkingDatabase': f'Server=localhost;Database={database};Integrated Security=True;Encrypt=True;TrustServerCertificate=True',
        'ASPNETCORE_ENVIRONMENT': 'Development', 'API_PROXY_TARGET': api,
        'PARKING_TEST_API': api + '/api', 'PARKING_TEST_DATABASE': database,
        'PARKING_TEST_UI': ui, 'PARKING_TEST_SQLCMD': sqlcmd,
        'PARKING_TEST_WORK': str(work),
        'PYTHONIOENCODING': 'utf-8',
    })
    backend = launch(['dotnet', str(ROOT / 'backend/bin/Debug/net10.0/ParkingLotAPI.dll'), '--urls', api], ROOT / 'backend', env, 'backend')
    ready(api + '/api/health', backend)
    frontend = launch([args.node, 'node_modules/vite/bin/vite.js', '--port', str(ui_port), '--strictPort'], ROOT / 'frontend', env, 'frontend')
    ready(ui, frontend)
    print(f'Isolated database: {database}', flush=True)
    if args.suite in ['readiness', 'all']:
        run_test([sys.executable, str(ROOT / 'tests/readiness_integration.py')], env, 'readiness-tests', 120)
    if args.suite in ['parking', 'all']:
        run_test([sys.executable, str(ROOT / 'tests/admin_integration.py')], env, 'api-tests', 120)
        run_test([args.node, str(ROOT / 'tests/ui-admin.cjs'), args.node_modules], env, 'browser-tests', 180)
    if args.suite in ['reports', 'all']:
        run_test([sys.executable, str(ROOT / 'tests/reports_integration.py')], env, 'report-api-tests', 120)
        run_test([args.node, str(ROOT / 'tests/ui-reports.cjs'), args.node_modules], env, 'report-browser-tests', 180)
    if args.suite in ['maintenance', 'all']:
        run_test([sys.executable, str(ROOT / 'tests/maintenance_integration.py')], env, 'maintenance-api-tests', 120)
        run_test([args.node, str(ROOT / 'tests/ui-maintenance.cjs'), args.node_modules], env, 'maintenance-browser-tests', 180)
    if args.suite in ['operations', 'all']:
        run_test([sys.executable, str(ROOT / 'tests/operations_integration.py')], env, 'operations-api-tests', 150)
        run_test([args.node, str(ROOT / 'tests/ui-operations.cjs'), args.node_modules], env, 'operations-browser-tests', 180)
    if args.suite in ['sessions', 'all']:
        run_test([sys.executable, str(ROOT / 'tests/sessions_integration.py')], env, 'session-api-tests', 120)
        run_test([args.node, str(ROOT / 'tests/ui-sessions.cjs'), args.node_modules], env, 'session-browser-tests', 180)
    if args.suite in ['customer', 'all']:
        run_test([args.node, str(ROOT / 'tests/ui-auth-vehicles.cjs'), args.node_modules], env, 'customer-vehicle-browser-tests', 180)
        run_test([args.node, str(ROOT / 'tests/ui-reservations.cjs'), args.node_modules], env, 'customer-booking-browser-tests', 180)
    if args.suite in ['design', 'all']:
        run_test([args.node, str(ROOT / 'tests/ui-design.cjs'), args.node_modules], env, 'design-browser-tests', 240)
    if args.suite in ['users', 'all']:
        run_test([sys.executable, str(ROOT / 'tests/users_integration.py')], env, 'user-api-tests', 120)
        run_test([args.node, str(ROOT / 'tests/ui-users.cjs'), args.node_modules], env, 'user-browser-tests', 180)
    print('PASS admin API + browser. Main database was not modified.', flush=True)
finally:
    for process in reversed(processes):
        if process.poll() is None:
            process.terminate()
            try: process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)
    for log in logs: log.close()
    if created:
        assert re.fullmatch(r'ParkingAdminVerify_[a-f0-9]{12}', database)
        sql(f'ALTER DATABASE [{database}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [{database}];')
        print(f'Removed owned test database: {database}', flush=True)
