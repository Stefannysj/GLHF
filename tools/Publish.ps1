[CmdletBinding()]
param([string]$BasePath = "/")
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
if (-not $BasePath.StartsWith("/") -or -not $BasePath.EndsWith("/") -or $BasePath -match '[<>"?\#]') {
    throw 'BasePath debe ser / o /nombre-repositorio/.'
}
Push-Location $root
try {
    $output = Join-Path $root "artifacts/publish"
    dotnet publish ./GLHF.csproj -c Release -o $output
    if ($LASTEXITCODE -ne 0) { throw "Fallo en dotnet publish." }
    $index = Join-Path $output "wwwroot/index.html"
    $text = [IO.File]::ReadAllText($index).Replace('<base href="./" />', '<base href="' + $BasePath + '" />')
    [IO.File]::WriteAllText($index, $text, [Text.UTF8Encoding]::new($false))
    [IO.File]::WriteAllText((Join-Path $output "wwwroot/.nojekyll"), "")
    Write-Host "Archivos publicados: $output/wwwroot"
    Write-Host "Base href: $BasePath"
} finally { Pop-Location }
