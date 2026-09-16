$ErrorActionPreference = 'Continue'
$PSNativeCommandUseErrorActionPreference = $false

Write-Host "STEP 1: Login as BEL001" -ForegroundColor Cyan

$loginBody = @{ userId = 'BEL001'; password = 'BelAdmin@123' } | ConvertTo-Json
$loginResp = Invoke-RestMethod -Uri 'http://localhost:5000/api/auth/login' -Method POST -Body $loginBody -ContentType 'application/json' -UseBasicParsing
$token = $loginResp.token
if (-not $token) { Write-Host "[FATAL] Login failed" -ForegroundColor Red; exit 1 }
Write-Host "[OK] Logged in. Token obtained." -ForegroundColor Green

$headers = @{ 'Authorization' = "Bearer $token"; 'Content-Type' = 'application/json' }

Write-Host "STEP 2: Register Identities" -ForegroundColor Cyan
$identities = @(
    @{ identityId='BEL001'; name='BEL Admin'; organization='BEL'; role='Admin' },
    @{ identityId='BEL002'; name='BEL Manager'; organization='BEL'; role='Manager' },
    @{ identityId='BEL003'; name='BEL Employee'; organization='BEL'; role='Employee' },
    @{ identityId='AUD001'; name='Chief Auditor'; organization='Auditor'; role='Auditor' },
    @{ identityId='CON001'; name='Contractor Admin'; organization='Contractor'; role='Admin' },
    @{ identityId='CON002'; name='Contractor User'; organization='Contractor'; role='User' }
)
foreach ($id in $identities) {
    try {
        $body = $id | ConvertTo-Json
        $null = Invoke-RestMethod -Uri 'http://localhost:5000/api/identities' -Method POST -Headers $headers -Body $body -UseBasicParsing
        Write-Host "[OK] $($id.identityId) - $($id.name)" -ForegroundColor Green
    } catch {
        $errBody = ''; try { $s = $_.Exception.Response.GetResponseStream(); $r = New-Object System.IO.StreamReader($s); $errBody = $r.ReadToEnd() } catch {}
        Write-Host "[SKIP] $($id.identityId): $errBody" -ForegroundColor Yellow
    }
}

Write-Host "STEP 3: Mint Assets" -ForegroundColor Cyan
$assets = @(
    @{ assetId='ASSET001'; name='BEL Annual Report 2025'; assetType='Document'; owner='BEL001'; documentHash='sha256:a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2'; documentCID='QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG' },
    @{ assetId='ASSET002'; name='BEL Project Blueprint Alpha'; assetType='Blueprint'; owner='BEL001'; documentHash='sha256:b2c3d4e5f6a7b2c3d4e5f6a7b2c3d4e5f6a7b2c3d4e5f6a7b2c3d4e5f6a7b2c3'; documentCID='QmTkzDaeml9d6byzHbSMieHev6dh5rTMH85TMJF9rbFvHD' },
    @{ assetId='ASSET003'; name='Contractor Compliance Certificate'; assetType='Certificate'; owner='BEL001'; documentHash='sha256:c3d4e5f6a7b8c3d4e5f6a7b8c3d4e5f6a7b8c3d4e5f6a7b8c3d4e5f6a7b8c3d4'; documentCID='QmPZ9gcCEpqKTo9JQFu2z57M2hP8beLXt9QX97H5a9y8sW' }
)
foreach ($asset in $assets) {
    try {
        $body = $asset | ConvertTo-Json
        $null = Invoke-RestMethod -Uri 'http://localhost:5000/api/assets' -Method POST -Headers $headers -Body $body -UseBasicParsing
        Write-Host "[OK] $($asset.assetId) - $($asset.name)" -ForegroundColor Green
    } catch {
        $errBody = ''; try { $s = $_.Exception.Response.GetResponseStream(); $r = New-Object System.IO.StreamReader($s); $errBody = $r.ReadToEnd() } catch {}
        Write-Host "[FAIL] $($asset.assetId): $errBody" -ForegroundColor Red
    }
}

Write-Host "STEP 4: Grant Access" -ForegroundColor Cyan
$grants = @(
    @{ accessId='ACC001'; identityId='CON001'; assetId='ASSET001'; grantedTo='CON001'; permission='Read' },
    @{ accessId='ACC002'; identityId='CON001'; assetId='ASSET002'; grantedTo='CON001'; permission='Read' },
    @{ accessId='ACC003'; identityId='CON002'; assetId='ASSET003'; grantedTo='CON002'; permission='Read' },
    @{ accessId='ACC004'; identityId='AUD001'; assetId='ASSET001'; grantedTo='AUD001'; permission='Read' }
)
foreach ($grant in $grants) {
    try {
        $body = $grant | ConvertTo-Json
        $null = Invoke-RestMethod -Uri 'http://localhost:5000/api/access' -Method POST -Headers $headers -Body $body -UseBasicParsing
        Write-Host "[OK] $($grant.accessId): $($grant.grantedTo) -> $($grant.assetId) ($($grant.permission))" -ForegroundColor Green
    } catch {
        $errBody = ''; try { $s = $_.Exception.Response.GetResponseStream(); $r = New-Object System.IO.StreamReader($s); $errBody = $r.ReadToEnd() } catch {}
        Write-Host "[FAIL] $($grant.accessId): $errBody" -ForegroundColor Red
    }
}

Write-Host "SEEDING COMPLETE" -ForegroundColor Cyan
