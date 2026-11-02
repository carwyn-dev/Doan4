"""Readiness must reject missing procedures and obsolete result contracts."""
import json
import os
from pathlib import Path
import re
import subprocess
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
DB = os.environ['PARKING_TEST_DATABASE']
assert re.fullmatch(r'ParkingAdminVerify_[a-f0-9]{12}', DB)
SQLCMD = os.environ['PARKING_TEST_SQLCMD']

def sql(statement):
    result = subprocess.run([SQLCMD, '-S', 'localhost', '-E', '-C', '-b', '-d', DB,
                             '-h', '-1', '-W', '-Q', 'SET NOCOUNT ON; ' + statement],
                            capture_output=True, text=True, timeout=30)
    assert result.returncode == 0, result.stdout + result.stderr
    return result.stdout.strip()

def health(status):
    try:
        with urllib.request.urlopen(os.environ['PARKING_TEST_API'] + '/health', timeout=30) as response:
            actual, body = response.status, json.load(response)
    except urllib.error.HTTPError as response:
        actual, body = response.code, json.load(response)
    assert actual == status, (actual, body)
    if status == 503: assert body['code'] == 'DATABASE_NOT_READY', body

def migration(filename):
    target = Path(os.environ['PARKING_TEST_WORK']) / ('readiness-' + filename)
    target.write_text((ROOT / 'scripts/sql' / filename).read_text(encoding='utf-8').replace('ParkingLotOnline', DB), encoding='utf-8')
    result = subprocess.run([SQLCMD, '-S', 'localhost', '-E', '-C', '-b', '-f', '65001', '-i', str(target)], capture_output=True, timeout=30)
    assert result.returncode == 0, result.stdout + result.stderr

health(200)
sql("EXEC sp_rename N'dbo.usp_GetDashboard',N'health_held_dashboard';")
try:
    health(503)
finally:
    sql("EXEC sp_rename N'dbo.health_held_dashboard',N'usp_GetDashboard';")
health(200)
try:
    migration('20261022_staff_queries.sql')
    health(503)
finally:
    migration('20261025_staff_exceptions.sql')
    migration('20261102_readiness.sql')
health(200)
# Verify metadata inspection works with the intended limited database role.
source = (ROOT / 'backend/Data/ParkingRepository.cs').read_text(encoding='utf-8')
query = re.search(r'new SqlCommand\("""\s*(SELECT CASE.*?)""", connection\)', source, re.S).group(1)
sql('CREATE USER readiness_verify WITHOUT LOGIN; ALTER ROLE parking_backend ADD MEMBER readiness_verify;')
try:
    assert sql("EXECUTE AS USER='readiness_verify'; " + query + ' REVERT;') == '1'
finally:
    sql('DROP USER readiness_verify;')
print('PASS readiness: current database, missing procedure, old migration, recovery and limited database role')
