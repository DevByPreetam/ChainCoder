$ErrorActionPreference = [System.Management.Automation.ActionPreference]::Continue

function Post([string]$url, [hashtable]$body, [string]$tok) {
  $h = @{ 'Content-Type' = 'application/json' }
  if ($tok) { $h['Authorization'] = 'Bearer ' + $tok }
  $j = $body | ConvertTo-Json -Compress
  try { return @{ ok=$true; r=(Invoke-RestMethod -Uri $url -Method POST -Headers $h -Body $j -ContentType 'application/json' -UseBasicParsing) } }
  catch { $m=$_.Exception.Message; try { $s=$_.Exception.Response.GetResponseStream(); $rd=New-Object System.IO.StreamReader($s); $m=$rd.ReadToEnd() } catch {}; return @{ ok=$false; err=$m } }
}

Write-Host 'STEP 1: Login' -ForegroundColor Cyan
$lr = Post 'http://localhost:5000/api/auth/login' @{ userId='BEL001'; password='BelAdmin@123' } $null
if (-not $lr.ok) { Write-Host '[FATAL] Login:' $lr.err -ForegroundColor Red; exit 1 }
$tok = $lr.r.token
if (-not $tok) { Write-Host '[FATAL] No token' -ForegroundColor Red; exit 1 }
Write-Host '[OK] Logged in as BEL001' -ForegroundColor Green

Write-Host '' 
Write-Host 'STEP 2: Register Identities' -ForegroundColor Cyan
$ids = @(
  @{ identityId='BEL001'; name='BEL Admin'; organization='BEL'; role='Admin' },
  @{ identityId='BEL002'; name='BEL Manager'; organization='BEL'; role='Manager' },
  @{ identityId='BEL003'; name='BEL Employee'; organization='BEL'; role='Employee' },
  @{ identityId='AUD001'; name='Chief Auditor'; organization='Auditor'; role='Auditor' },
  @{ identityId='CON001'; name='Contractor Admin'; organization='Contractor'; role='Admin' },
  @{ identityId='CON002'; name='Contractor User'; organization='Contractor'; role='User' }
)
foreach ($id in $ids) {
  $r = Post 'http://localhost:5000/api/identities' $id $tok
  if ($r.ok) { Write-Host ('[OK] ' + $id.identityId) -ForegroundColor Green }
  else { Write-Host ('[SKIP] ' + $id.identityId + ': ' + $r.err) -ForegroundColor Yellow }
}

Write-Host '' 
Write-Host 'STEP 3: Mint Assets' -ForegroundColor Cyan
$assets = @(
  @{ assetId='ASSET001'; name='BEL Annual Report 2025'; assetType='Document'; owner='BEL001'; documentHash='sha256:a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6'; documentCID='QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG' },
  @{ assetId='ASSET002'; name='BEL Project Blueprint Alpha'; assetType='Blueprint'; owner='BEL001'; documentHash='sha256:b2c3d4e5f6a7b2c3d4e5f6a7b2c3d4e5f6a7b2c3d4e5f6a7'; documentCID='QmTkzDaeml9d6byzHbSMieHev6dh5rTMH85TMJF9rbFvHD' },
  @{ assetId='ASSET003'; name='Contractor Compliance Certificate'; assetType='Certificate'; owner='BEL001'; documentHash='sha256:c3d4e5f6a7b8c3d4e5f6a7b8c3d4e5f6a7b8c3d4e5f6a7b8'; documentCID='QmPZ9gcCEpqKTo9JQFu2z57M2hP8beLXt9QX97H5a9y8sW' }
)
foreach ($a in $assets) {
  $r = Post 'http://localhost:5000/api/assets' $a $tok
  if ($r.ok) { Write-Host ('[OK] ' + $a.assetId) -ForegroundColor Green }
  else { Write-Host ('[FAIL] ' + $a.assetId + ': ' + $r.err) -ForegroundColor Red }
}

Write-Host '' 
Write-Host 'STEP 4: Grant Access' -ForegroundColor Cyan
$grants = @(
  @{ accessId='ACC001'; identityId='CON001'; assetId='ASSET001'; grantedTo='CON001'; permission='Read' },
  @{ accessId='ACC002'; identityId='CON001'; assetId='ASSET002'; grantedTo='CON001'; permission='Read' },
  @{ accessId='ACC003'; identityId='CON002'; assetId='ASSET003'; grantedTo='CON002'; permission='Read' },
  @{ accessId='ACC004'; identityId='AUD001'; assetId='ASSET001'; grantedTo='AUD001'; permission='Read' }
)
foreach ($g in $grants) {
  $r = Post 'http://localhost:5000/api/access' $g $tok
  if ($r.ok) { Write-Host ('[OK] ' + $g.accessId + ': ' + $g.grantedTo + ' -> ' + $g.assetId) -ForegroundColor Green }
  else { Write-Host ('[FAIL] ' + $g.accessId + ': ' + $r.err) -ForegroundColor Red }
}

Write-Host 'SEEDING COMPLETE' -ForegroundColor Cyan
