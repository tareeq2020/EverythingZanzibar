# ============================================================================
# Everything Zanzibar — clean-URL route scaffolder (Phase 1)
# Creates an extension-less folder/index.html tree for EN + locale mirrors.
# Re-runnable & idempotent. Skeletons are noindex until Phase 2/3 populate them.
#   Run:  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\scaffold-routes.ps1
# ============================================================================
$ErrorActionPreference = 'Stop'
$root   = 'C:\Users\HP\Everything Zanzibar'
$domain = 'https://everything-zanzibar.com'  # production domain

# Routes mirrored across every locale (en = root, it + de = subdirectories)
$routes  = @(
  'yachts',
  'yachts/luxury-catamaran',
  'yachts/mega-yacht',
  'yachts/sunset-dhow',
  'villas',
  'hotels',
  'experiences',
  'transfers',
  'guides',
  'about'
)
$locales = @('it','de')
$utf8    = New-Object System.Text.UTF8Encoding($false)   # UTF-8, no BOM

function New-Skeleton([string]$Rel, [string]$Lang) {
  $leaf = ($Rel -split '/')[-1]
  if ($leaf -in @('it','de')) { $h1 = 'Everything Zanzibar' }   # locale homepage
  else { $h1 = (Get-Culture).TextInfo.ToTitleCase(($leaf -replace '-',' ')) }
  $canon = "$domain/" + $(if ($Rel) { "$Rel/" })
  $dir = Join-Path $root ($Rel -replace '/','\')
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  $html = @"
<!doctype html>
<html lang="$Lang">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>$h1 &mdash; Everything Zanzibar</title>
  <meta name="robots" content="noindex,follow"><!-- REMOVE once Phase 2/3 populate this page -->
  <link rel="canonical" href="$canon">
  <!-- PHASE 2 injects here: SEO title/description, hreflang cluster, JSON-LD -->
  <!-- PHASE 4 injects here: <link rel="stylesheet" href="/assets/css/app.min.css"> -->
</head>
<body>
  <!-- PHASE 3 injects the pre-rendered Supabase catalogue (static HTML) here, then hydrates client-side -->
  <main>
    <h1>$h1</h1>
    <p>Clean-URL route scaffold for Everything Zanzibar. Static content is generated in Phase 3 (SSG pre-render); the SEO head is generated in Phase 2.</p>
    <p><a href="/everything-zanzibar.html">&larr; Everything Zanzibar</a></p>
  </main>
</body>
</html>
"@
  [System.IO.File]::WriteAllText((Join-Path $dir 'index.html'), $html, $utf8)
  Write-Host ("  + /{0}/" -f $Rel)
}

Write-Host "Scaffolding clean-URL routes under $root"
foreach ($r in $routes) { New-Skeleton $r 'en' }              # English = site root
foreach ($loc in $locales) {                                   # locale mirrors
  New-Skeleton $loc $loc                                       #   /it/ , /de/ homepage
  foreach ($r in $routes) { New-Skeleton "$loc/$r" $loc }
}
Write-Host ("Done. EN + {0} locales created." -f ($locales -join ', '))
