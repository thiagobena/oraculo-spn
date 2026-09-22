Write-Host "===============================================================" -ForegroundColor Cyan
Write-Host "        ORACULO SPN - SCRIPT DE INICIALIZACAO SEGURA          " -ForegroundColor Yellow
Write-Host "===============================================================" -ForegroundColor Cyan

$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if ($null -ne $nodeCmd) {
    $nodeVer = node -v
    Write-Host "[OK] Node.js detectado: $nodeVer" -ForegroundColor Green
}
if ($null -eq $nodeCmd) {
    Write-Host "[ERRO] Node.js nao foi encontrado no PATH do sistema!" -ForegroundColor Red
    exit 1
}

# Limite de Heap do Node.js (512MB) para otimização de RAM
$env:NODE_OPTIONS = "--max-old-space-size=512"

npx tsx scripts/start-secure.ts
