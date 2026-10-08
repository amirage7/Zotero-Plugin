$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.IO.Compression
$manifest = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$output = Join-Path $PSScriptRoot "TagStudio-Zotero10-v$($manifest.version).xpi"
$stream = [IO.File]::Open($output, [IO.FileMode]::Create)
$archive = [IO.Compression.ZipArchive]::new($stream, [IO.Compression.ZipArchiveMode]::Create)
try {
    foreach ($name in @('manifest.json', 'bootstrap.js', 'app.js', 'quick-tags.js', 'tag.svg', 'locale/zh-CN/tagstudio.ftl', 'locale/en-US/tagstudio.ftl')) {
        [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, (Join-Path $PSScriptRoot $name), $name) | Out-Null
    }
} finally {
    $archive.Dispose()
    $stream.Dispose()
}
Write-Output $output
