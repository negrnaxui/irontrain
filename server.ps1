$ErrorActionPreference = 'Stop'
$root = [System.IO.Path]::GetFullPath((Split-Path -Parent $MyInvocation.MyCommand.Path))
$port = 8765
$listener = $null

function Get-ContentType([string]$path) {
    switch ([System.IO.Path]::GetExtension($path).ToLowerInvariant()) {
        '.html' { 'text/html; charset=utf-8' }
        '.css'  { 'text/css; charset=utf-8' }
        '.js'   { 'application/javascript; charset=utf-8' }
        '.json' { 'application/json; charset=utf-8' }
        '.png'  { 'image/png' }
        '.jpg'  { 'image/jpeg' }
        '.jpeg' { 'image/jpeg' }
        '.webp' { 'image/webp' }
        '.svg'  { 'image/svg+xml' }
        '.ico'  { 'image/x-icon' }
        default { 'application/octet-stream' }
    }
}

function Send-Response($stream, [int]$status, [string]$statusText, [byte[]]$body, [string]$contentType, [long]$contentLength = -1) {
    if ($contentLength -lt 0) { $contentLength = $body.Length }
    $header = "HTTP/1.1 $status $statusText`r`nContent-Type: $contentType`r`nContent-Length: $contentLength`r`nConnection: close`r`nCache-Control: no-cache`r`n`r`n"
    $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($header)
    $stream.Write($headerBytes, 0, $headerBytes.Length)
    if ($body.Length -gt 0) { $stream.Write($body, 0, $body.Length) }
    $stream.Flush()
}

try {
    while ($port -le 8775) {
        try {
            $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $port)
            $listener.Start()
            break
        }
        catch {
            if ($listener) { try { $listener.Stop() } catch {} }
            $listener = $null
            $port++
        }
    }

    if (-not $listener) {
        throw 'No free local port found in range 8765-8775.'
    }

    $url = "http://127.0.0.1:$port/index.html"
    Write-Host ''
    Write-Host 'IRON WASTES local server started.' -ForegroundColor Green
    Write-Host "Open: $url"
    Write-Host 'Keep this window open while playing.' -ForegroundColor Yellow
    Write-Host 'Press Ctrl+C or close this window to stop the server.'
    Write-Host ''

    Start-Process $url

    while ($true) {
        $client = $listener.AcceptTcpClient()
        try {
            $stream = $client.GetStream()
            $reader = New-Object System.IO.StreamReader($stream, [System.Text.Encoding]::ASCII, $false, 1024, $true)
            $requestLine = $reader.ReadLine()
            if ([string]::IsNullOrWhiteSpace($requestLine)) { continue }

            while ($true) {
                $line = $reader.ReadLine()
                if ([string]::IsNullOrEmpty($line)) { break }
            }

            $parts = $requestLine.Split(' ')
            if ($parts.Length -lt 2 -or ($parts[0] -ne 'GET' -and $parts[0] -ne 'HEAD')) {
                $body = [System.Text.Encoding]::UTF8.GetBytes('Method Not Allowed')
                Send-Response $stream 405 'Method Not Allowed' $body 'text/plain; charset=utf-8'
                continue
            }

            $rawPath = $parts[1].Split('?')[0]
            $relative = [System.Uri]::UnescapeDataString($rawPath.TrimStart('/'))
            if ([string]::IsNullOrWhiteSpace($relative)) { $relative = 'index.html' }
            $relative = $relative.Replace('/', [System.IO.Path]::DirectorySeparatorChar)

            $fullPath = [System.IO.Path]::GetFullPath((Join-Path $root $relative))
            if (-not $fullPath.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase)) {
                $body = [System.Text.Encoding]::UTF8.GetBytes('Forbidden')
                Send-Response $stream 403 'Forbidden' $body 'text/plain; charset=utf-8'
                continue
            }

            if (-not [System.IO.File]::Exists($fullPath)) {
                $body = [System.Text.Encoding]::UTF8.GetBytes('Not Found')
                Send-Response $stream 404 'Not Found' $body 'text/plain; charset=utf-8'
                continue
            }

            $fileInfo = New-Object System.IO.FileInfo($fullPath)
            if ($parts[0] -eq 'HEAD') {
                $bytes = [byte[]]@()
                Send-Response $stream 200 'OK' $bytes (Get-ContentType $fullPath) $fileInfo.Length
            }
            else {
                $bytes = [System.IO.File]::ReadAllBytes($fullPath)
                Send-Response $stream 200 'OK' $bytes (Get-ContentType $fullPath) $fileInfo.Length
            }
        }
        catch {
            Write-Host "Request error: $($_.Exception.Message)" -ForegroundColor DarkYellow
        }
        finally {
            if ($client) { $client.Close() }
        }
    }
}
catch {
    Write-Host ''
    Write-Host "SERVER ERROR: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
finally {
    if ($listener) { try { $listener.Stop() } catch {} }
}
