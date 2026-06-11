param(
  [string]$Owner = "AhmedSudad",
  [string]$Repo = "auto-replenishments",
  [string]$Branch = "main",
  [string]$ProjectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path,
  [string]$Message = "Publish auto replenishments project"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function ConvertTo-PlainText {
  param([Security.SecureString]$SecureValue)

  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureValue)
  try {
    [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  }
  finally {
    if ($bstr -ne [IntPtr]::Zero) {
      [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    }
  }
}

function Test-IncludedPath {
  param([string]$RelativePath)

  $path = $RelativePath -replace "\\", "/"

  if ($path -match "(^|/)(\.git|\.wrangler|node_modules|\.cache|\.parcel-cache|\.vite|dist|build|coverage|tmp|temp)(/|$)") {
    return $false
  }

  if ($path -match "(^|/)(\.DS_Store|Thumbs\.db|desktop\.ini)$") {
    return $false
  }

  if ($path -notmatch "/" -and $path -match "\.txt$") {
    return $false
  }

  if ($path -match "\.(xlsx|xls|xlsm|csv|pdf|log|tmp|bak)$") {
    return $false
  }

  if ([IO.Path]::GetFileName($path).StartsWith("~$")) {
    return $false
  }

  return $true
}

function Invoke-GitHubApi {
  param(
    [Parameter(Mandatory = $true)][string]$Method,
    [Parameter(Mandatory = $true)][string]$Path,
    [object]$Body = $null
  )

  $uri = "https://api.github.com$Path"

  if ($null -eq $Body) {
    return Invoke-RestMethod -Method $Method -Uri $uri -Headers $script:Headers -TimeoutSec 60
  }

  $json = $Body | ConvertTo-Json -Depth 30
  Invoke-RestMethod -Method $Method -Uri $uri -Headers $script:Headers -ContentType "application/json" -Body $json -TimeoutSec 120
}

$root = (Resolve-Path -LiteralPath $ProjectRoot).Path.TrimEnd("\", "/")
if (-not (Test-Path -LiteralPath (Join-Path $root "README.md"))) {
  throw "Project root does not look right: $root"
}

$secureToken = Read-Host "GitHub token with repository contents write access" -AsSecureString
$token = ConvertTo-PlainText -SecureValue $secureToken
if ([string]::IsNullOrWhiteSpace($token)) {
  throw "No token entered."
}

$script:Headers = @{
  Authorization          = "Bearer $token"
  Accept                 = "application/vnd.github+json"
  "X-GitHub-Api-Version" = "2022-11-28"
  "User-Agent"           = "auto-replenishments-publisher"
}

Write-Host "Reading $Owner/$Repo branch $Branch..."
$baseCommitSha = $null
$isEmptyRepository = $false
try {
  $ref = Invoke-GitHubApi -Method "GET" -Path "/repos/$Owner/$Repo/git/ref/heads/$Branch"
  $baseCommitSha = $ref.object.sha
}
catch {
  $message = $_.Exception.Message
  if ($message -match "409" -or $message -match "Git Repository is empty" -or $message -match "404") {
    $isEmptyRepository = $true
    Write-Host "Repository is empty. Creating the first commit on $Branch..."
  }
  else {
    throw
  }
}

$files = Get-ChildItem -LiteralPath $root -Recurse -File -Force |
  ForEach-Object {
    $relative = $_.FullName.Substring($root.Length).TrimStart([char[]]"\/")
    $relative = $relative -replace "\\", "/"

    if (Test-IncludedPath -RelativePath $relative) {
      [pscustomobject]@{
        FullName = $_.FullName
        Path     = $relative
      }
    }
  } |
  Sort-Object Path

if (-not $files -or $files.Count -eq 0) {
  throw "No files found to publish."
}

if ($isEmptyRepository) {
  Write-Host "Bootstrapping empty repository..."
  $bootstrap = Invoke-GitHubApi -Method "PUT" -Path "/repos/$Owner/$Repo/contents/.github-bootstrap" -Body @{
    message = "Initialize repository"
    content = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes("bootstrap"))
    branch  = $Branch
  }

  $baseCommitSha = $bootstrap.commit.sha
  $isEmptyRepository = $false
}

Write-Host "Uploading $($files.Count) files as Git blobs..."
$treeEntries = @()
foreach ($file in $files) {
  Write-Host "  $($file.Path)"
  $bytes = [IO.File]::ReadAllBytes($file.FullName)
  $blob = Invoke-GitHubApi -Method "POST" -Path "/repos/$Owner/$Repo/git/blobs" -Body @{
    content  = [Convert]::ToBase64String($bytes)
    encoding = "base64"
  }

  $treeEntries += @{
    path = $file.Path
    mode = "100644"
    type = "blob"
    sha  = $blob.sha
  }
}

Write-Host "Creating repository tree..."
$tree = Invoke-GitHubApi -Method "POST" -Path "/repos/$Owner/$Repo/git/trees" -Body @{
  tree = $treeEntries
}

Write-Host "Creating commit..."
$commitBody = @{
  message = $Message
  tree    = $tree.sha
}

if (-not $isEmptyRepository -and -not [string]::IsNullOrWhiteSpace($baseCommitSha)) {
  $commitBody.parents = @($baseCommitSha)
}

$commit = Invoke-GitHubApi -Method "POST" -Path "/repos/$Owner/$Repo/git/commits" -Body $commitBody

if ($isEmptyRepository) {
  Write-Host "Creating $Branch..."
  Invoke-GitHubApi -Method "POST" -Path "/repos/$Owner/$Repo/git/refs" -Body @{
    ref = "refs/heads/$Branch"
    sha = $commit.sha
  } | Out-Null
}
else {
  Write-Host "Updating $Branch..."
  Invoke-GitHubApi -Method "PATCH" -Path "/repos/$Owner/$Repo/git/refs/heads/$Branch" -Body @{
    sha   = $commit.sha
    force = $false
  } | Out-Null
}

Write-Host "Done. Published commit $($commit.sha) to https://github.com/$Owner/$Repo/tree/$Branch"
