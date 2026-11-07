# =========================================================
# HS Sourced It - switch on checkout + emails (Supabase functions)
#
# Run from the top folder of the repo:
#   powershell -ExecutionPolicy Bypass -File .\setup\deploy-functions.ps1
#
# Needs Node.js installed (nodejs.org, the "LTS" version).
# Your secret keys are typed in here and sent straight to Supabase.
# They are NOT saved in this file or in GitHub.
# =========================================================

$ErrorActionPreference = "Stop"
$ProjectRef = "ndefypnaczwiryiiqopm"

function Ask($label, $current) {
  $v = Read-Host $label
  if ([string]::IsNullOrWhiteSpace($v)) { return $current }
  return $v.Trim()
}

Write-Host ""
Write-Host "HS Sourced It - Supabase setup" -ForegroundColor White
Write-Host "--------------------------------"

if (-not (Get-Command npx -ErrorAction SilentlyContinue)) {
  Write-Host "Node.js isn't installed. Install the LTS version from https://nodejs.org then run this again." -ForegroundColor Red
  exit 1
}
if (-not (Test-Path ".\supabase\functions")) {
  Write-Host "Run this from the top folder of the hssourcedit repo (the one containing index.html)." -ForegroundColor Red
  exit 1
}

Write-Host ""
Write-Host "Step 1: sign in to Supabase (a browser window will open)..." -ForegroundColor Cyan
npx --yes supabase@latest login

Write-Host ""
Write-Host "Step 2: your keys. Press Enter to skip any you don't have yet." -ForegroundColor Cyan
$brevo   = Ask "Brevo API key (starts xkeysib-)" ""
$stripe  = Ask "Stripe SECRET key (starts sk_test_ or sk_live_) - Enter to skip for now" ""
$whsec   = Ask "Stripe webhook signing secret (starts whsec_) - Enter to skip for now" ""
$listId  = Ask "Brevo newsletter list ID (number) - Enter to skip" ""

$unsub = -join ((1..48) | ForEach-Object { '{0:x}' -f (Get-Random -Maximum 16) })

$secrets = @(
  "SITE_URL=https://hssourcedit.com/",
  "SITE_ORIGIN=*",
  "EMAIL_FROM_NAME=HS Sourced It",
  "EMAIL_FROM_ORDERS=orders@hssourcedit.com",
  "EMAIL_FROM_MARKETING=news@hssourcedit.com",
  "REPLY_TO=hello@hssourcedit.com",
  "WELCOME_CODE=WELCOME5",
  "WELCOME_PERCENT=5",
  "SHIPPING_COST=4.95",
  "FREE_SHIPPING_OVER=75",
  "CURRENCY=gbp"
)
if ($brevo)  { $secrets += "BREVO_API_KEY=$brevo" }
if ($stripe) { $secrets += "STRIPE_SECRET_KEY=$stripe" }
if ($whsec)  { $secrets += "STRIPE_WEBHOOK_SECRET=$whsec" }
if ($listId) { $secrets += "BREVO_LIST_ID=$listId" }

# Only create the unsubscribe secret the first time (changing it would break old unsubscribe links)
$existing = (npx --yes supabase@latest secrets list --remote=$ProjectRef 2>$null) -join "`n"
if ($existing -notmatch "UNSUBSCRIBE_SECRET") { $secrets += "UNSUBSCRIBE_SECRET=$unsub" }

Write-Host ""
Write-Host "Step 3: saving settings to Supabase..." -ForegroundColor Cyan
npx --yes supabase@latest secrets set --remote=$ProjectRef --yes @secrets

Write-Host ""
Write-Host "Step 4: uploading the functions..." -ForegroundColor Cyan
$functions = @("subscribe", "create-checkout", "stripe-webhook", "order-update", "send-email", "unsubscribe")
foreach ($f in $functions) {
  Write-Host "  - $f"
  npx --yes supabase@latest functions deploy $f --remote=$ProjectRef --no-verify-jwt --use-api --yes
}

Write-Host ""
Write-Host "Done!" -ForegroundColor Green
Write-Host "Stripe webhook URL (paste into Stripe > Developers > Webhooks):"
Write-Host "  https://$ProjectRef.supabase.co/functions/v1/stripe-webhook" -ForegroundColor Yellow
Write-Host ""
Write-Host "You can run this script again any time to add or change keys."
