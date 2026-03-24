#!/bin/bash
set -e

API="http://localhost:8080"
PASSWORD="Test1234!"
MIN_PDF_KB=25

echo "============================================"
echo "  KYC Platform — Database Seed Script"
echo "============================================"
echo ""

# ── Helper: create a valid PDF large enough to pass validation ──
create_pdf() {
  local title="$1"
  local output="$2"
  python3 -c "
import sys
title = sys.argv[1]
content = f'BT\n/F1 14 Tf\n100 750 Td\n({title}) Tj\n/F1 11 Tf\n'
for i in range(40):
    content += f'0 -18 Td\n(Document line {i+1} — {title}) Tj\n'
content += 'ET\n'
# Pad to meet min size
padding = '% ' + 'X' * 78 + '\n'
while len(content.encode()) < ${MIN_PDF_KB} * 1024:
    content += padding
cb = content.encode('latin-1', errors='replace')
sl = len(cb)
header = b'%PDF-1.4\n'
o1 = b'1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n'
o2 = b'2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n'
o3 = b'3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n'
o4 = f'4 0 obj\n<< /Length {sl} >>\nstream\n'.encode() + cb + b'\nendstream\nendobj\n'
o5 = b'5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n'
body = o1 + o2 + o3 + o4 + o5
offsets = []
pos = len(header)
for o in [o1, o2, o3, o4, o5]:
    offsets.append(pos)
    pos += len(o)
xref = f'xref\n0 6\n0000000000 65535 f \n'
for off in offsets:
    xref += f'{off:010d} 00000 n \n'
trailer = f'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n{pos}\n%%EOF\n'
sys.stdout.buffer.write(header + body + xref.encode() + trailer.encode())
" "$title" > "$output"
}

# ── 1. Clear database ──
echo "1/6  Clearing database..."
docker exec kyc_postgres psql -U kyc_user -d kyc_db -c \
  "TRUNCATE status_history, documents, owners, applications, users RESTART IDENTITY CASCADE;" > /dev/null 2>&1
echo "     Done."

# ── 2. Create reviewer ──
echo "2/6  Creating reviewer..."
REV=$(curl -s -X POST "$API/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"sarah.reviewer@fortispay.com\",\"password\":\"$PASSWORD\",\"full_name\":\"Sarah Al Mansouri\",\"role\":\"reviewer\"}")
REV_TOKEN=$(echo "$REV" | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))")
echo "     sarah.reviewer@fortispay.com / $PASSWORD"

# ── 3. Register merchants ──
echo "3/6  Registering 8 merchants..."

declare -a M_EMAILS=(
  "ahmed.mansouri@goldenbazaar.ae"
  "fatima.hassan@spiceroute.ae"
  "raj.krishna@nexgentech.ae"
  "omar.deira@deiragems.ae"
  "priya.patel@medcareplus.ae"
  "nadia.alfalasi@desertdreamstravel.ae"
  "wei.chen@skylinebuilding.ae"
  "maria.gonzalez@smartedu.ae"
)
declare -a M_NAMES=(
  "Ahmed Al Mansoori"
  "Fatima Hassan"
  "Raj Krishnamurthy"
  "Omar Deira"
  "Dr. Priya Patel"
  "Nadia Al Falasi"
  "Wei Chen"
  "Maria Gonzalez"
)

TOKENS=()
for i in "${!M_EMAILS[@]}"; do
  REG=$(curl -s -X POST "$API/api/auth/register" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"${M_EMAILS[$i]}\",\"password\":\"$PASSWORD\",\"full_name\":\"${M_NAMES[$i]}\",\"role\":\"merchant\"}")
  TK=$(echo "$REG" | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))")
  TOKENS+=("$TK")
  echo "     ${M_NAMES[$i]} — ${M_EMAILS[$i]}"
done

# ── 4. Create applications ──
echo "4/6  Creating applications with full data..."

# Helper: create app, returns app ID
create_app() {
  local token="$1"; shift
  local json="$1"
  local res=$(curl -s -X POST "$API/api/application" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $token" \
    -d "$json")
  echo "$res" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))"
}

add_owner() {
  local token="$1"; local app_id="$2"; local json="$3"
  curl -s -X POST "$API/api/application/$app_id/owners" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $token" \
    -d "$json" > /dev/null
}

upload_doc() {
  local token="$1"; local app_id="$2"; local file="$3"; local doc_type="$4"
  local owner_id="${5:-}"
  local extra=""
  [ -n "$owner_id" ] && extra="-F owner_id=$owner_id"
  curl -s -X POST "$API/api/application/$app_id/documents" \
    -H "Authorization: Bearer $token" \
    -F "file=@$file;type=application/pdf" \
    -F "doc_type=$doc_type" $extra > /dev/null
}

submit_app() {
  local token="$1"; local app_id="$2"
  curl -s -X POST "$API/api/application/$app_id/submit" \
    -H "Authorization: Bearer $token" > /dev/null
}

review_app() {
  local app_id="$1"; local status="$2"; local comment="$3"
  curl -s -X POST "$API/api/applications/$app_id/review" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $REV_TOKEN" \
    -d "{\"status\":\"$status\",\"comment\":\"$comment\"}" > /dev/null
}

# --- App 1: Golden Bazaar General Trading → APPROVED ---
APP1=$(create_app "${TOKENS[0]}" '{
  "business_name":"Golden Bazaar General Trading LLC",
  "business_category":"Retail & Trading",
  "business_subcategory":"General Trading",
  "store_type":"registeredBusiness",
  "mcc":"5399",
  "country":"United Arab Emirates",
  "city":"Dubai",
  "address_line1":"Deira, Al Rigga Street",
  "address_line2":"Building 45, Office 12",
  "website":"https://www.goldenbazaar.ae",
  "business_description":"Multi-category general trading company specializing in electronics, textiles, and FMCG goods, serving B2B and B2C customers across the GCC",
  "business_activities":"General Trading",
  "monthly_volume":"850000",
  "free_zone":false,
  "accept_international_payments":true,
  "owner_name":"Ahmed Al Mansoori",
  "contact_phone":"+971-4-222-3344",
  "contact_email":"ahmed.mansouri@goldenbazaar.ae",
  "contact_address":"Deira, Al Rigga Street, Dubai",
  "settlement_currency":"AED",
  "settlement_bank_name":"Emirates NBD",
  "settlement_bank_iban":"AE070331234567890123456",
  "settlement_frequency":"Daily"
}')

add_owner "${TOKENS[0]}" "$APP1" '{"ownership_type":"shareHolder","owner_type":"individual","first_name":"Ahmed","last_name":"Al Mansoori","email":"ahmed.mansouri@goldenbazaar.ae","identity_type":"emiratesId"}'
add_owner "${TOKENS[0]}" "$APP1" '{"ownership_type":"authorizedSignatory","owner_type":"individual","first_name":"Mohammed","last_name":"Al Mansoori","email":"mohammed@goldenbazaar.ae","identity_type":"emiratesId"}'

create_pdf "Trade License - Golden Bazaar General Trading LLC - DED Dubai 2024" /tmp/seed_tl1.pdf
create_pdf "Ahmed Al Mansoori - Emirates ID Document" /tmp/seed_eid1.pdf
upload_doc "${TOKENS[0]}" "$APP1" /tmp/seed_tl1.pdf trade_license
upload_doc "${TOKENS[0]}" "$APP1" /tmp/seed_eid1.pdf identity_document
submit_app "${TOKENS[0]}" "$APP1"
review_app "$APP1" "approved" "All documents verified. KYC checks passed. Business activities align with trade license."
echo "     1. Golden Bazaar General Trading LLC — APPROVED"

# --- App 2: Spice Route Restaurant → APPROVED ---
APP2=$(create_app "${TOKENS[1]}" '{
  "business_name":"Spice Route Restaurant LLC",
  "business_category":"Food & Beverage",
  "business_subcategory":"Restaurant",
  "store_type":"registeredBusiness",
  "mcc":"5812",
  "country":"United Arab Emirates",
  "city":"Dubai",
  "address_line1":"Al Karama, Trade Centre Road",
  "address_line2":"Shop 8, Ground Floor",
  "website":"https://www.spiceroute.ae",
  "business_description":"Authentic South Indian and Middle Eastern fusion restaurant with two branches in Dubai, catering and delivery services",
  "business_activities":"Restaurant",
  "monthly_volume":"420000",
  "free_zone":false,
  "accept_international_payments":false,
  "owner_name":"Fatima Hassan",
  "contact_phone":"+971-4-335-6677",
  "contact_email":"fatima.hassan@spiceroute.ae",
  "contact_address":"Al Karama, Dubai",
  "settlement_currency":"AED",
  "settlement_bank_name":"Abu Dhabi Commercial Bank",
  "settlement_bank_iban":"AE430350000012345678",
  "settlement_frequency":"Daily"
}')

add_owner "${TOKENS[1]}" "$APP2" '{"ownership_type":"shareHolder","owner_type":"individual","first_name":"Fatima","last_name":"Hassan","email":"fatima.hassan@spiceroute.ae","identity_type":"passport"}'

create_pdf "Fatima Hassan - Passport - United Arab Emirates" /tmp/seed_pass2.pdf
create_pdf "Trade License - Spice Route Restaurant LLC 2024" /tmp/seed_tl2.pdf
upload_doc "${TOKENS[1]}" "$APP2" /tmp/seed_pass2.pdf passport
upload_doc "${TOKENS[1]}" "$APP2" /tmp/seed_tl2.pdf trade_license
submit_app "${TOKENS[1]}" "$APP2"
review_app "$APP2" "approved" "Documents verified. Restaurant license valid. Approved."
echo "     2. Spice Route Restaurant LLC — APPROVED"

# --- App 3: NexGen Technologies → PENDING ---
APP3=$(create_app "${TOKENS[2]}" '{
  "business_name":"NexGen Technologies FZCO",
  "business_category":"Technology",
  "business_subcategory":"Software Development",
  "store_type":"registeredBusiness",
  "mcc":"7372",
  "country":"United Arab Emirates",
  "city":"Dubai",
  "address_line1":"Dubai Silicon Oasis",
  "address_line2":"Techno Hub 2, Office 405",
  "website":"https://www.nexgentech.ae",
  "business_description":"SaaS provider offering enterprise resource planning and supply chain management solutions to mid-market companies across MENA",
  "business_activities":"IT Services",
  "monthly_volume":"1250000",
  "free_zone":true,
  "accept_international_payments":true,
  "owner_name":"Raj Krishnamurthy",
  "contact_phone":"+971-4-501-2233",
  "contact_email":"raj.krishna@nexgentech.ae",
  "contact_address":"Dubai Silicon Oasis, Dubai",
  "settlement_currency":"USD",
  "settlement_bank_name":"HSBC",
  "settlement_bank_iban":"AE860200000012345678",
  "settlement_frequency":"Weekly"
}')

add_owner "${TOKENS[2]}" "$APP3" '{"ownership_type":"shareHolder","owner_type":"individual","first_name":"Raj","last_name":"Krishnamurthy","email":"raj.krishna@nexgentech.ae","identity_type":"passport"}'
add_owner "${TOKENS[2]}" "$APP3" '{"ownership_type":"shareHolder","owner_type":"corporate","company_name":"NexGen Holdings Pvt Ltd","email":"holdings@nexgentech.com","identity_type":"tradeLicense"}'

create_pdf "Raj Krishnamurthy - Passport - Republic of India" /tmp/seed_pass3.pdf
create_pdf "NexGen Holdings Pvt Ltd - Trade License Certificate" /tmp/seed_corp3.pdf
create_pdf "NexGen Technologies FZCO - Trade License DSO 2024" /tmp/seed_tl3.pdf
upload_doc "${TOKENS[2]}" "$APP3" /tmp/seed_pass3.pdf passport
upload_doc "${TOKENS[2]}" "$APP3" /tmp/seed_corp3.pdf trade_license
upload_doc "${TOKENS[2]}" "$APP3" /tmp/seed_tl3.pdf trade_license
submit_app "${TOKENS[2]}" "$APP3"
echo "     3. NexGen Technologies FZCO — PENDING"

# --- App 4: Deira Gem & Jewellery → NEEDS_MORE_DOCS ---
APP4=$(create_app "${TOKENS[3]}" '{
  "business_name":"Deira Gem & Jewellery Trading",
  "business_category":"Luxury & Jewellery",
  "business_subcategory":"Precious Metals & Stones",
  "store_type":"registeredBusiness",
  "mcc":"5944",
  "country":"United Arab Emirates",
  "city":"Dubai",
  "address_line1":"Gold Souk, Deira",
  "address_line2":"Shop 112",
  "website":"https://www.deiragems.ae",
  "business_description":"Wholesale and retail trader of gold, diamonds, and precious stones operating from the Dubai Gold Souk since 1998",
  "business_activities":"Jewellery Trade",
  "monthly_volume":"2800000",
  "free_zone":false,
  "accept_international_payments":true,
  "owner_name":"Omar Deira",
  "contact_phone":"+971-4-226-8899",
  "contact_email":"omar.deira@deiragems.ae",
  "contact_address":"Gold Souk, Deira, Dubai",
  "settlement_currency":"AED",
  "settlement_bank_name":"National Bank of Fujairah",
  "settlement_bank_iban":"AE410400000012345678",
  "settlement_frequency":"Daily"
}')

add_owner "${TOKENS[3]}" "$APP4" '{"ownership_type":"shareHolder","owner_type":"individual","first_name":"Omar","last_name":"Deira","email":"omar.deira@deiragems.ae","identity_type":"emiratesId"}'

create_pdf "Omar Deira - Emirates Identity Card" /tmp/seed_eid4.pdf
upload_doc "${TOKENS[3]}" "$APP4" /tmp/seed_eid4.pdf identity_document
submit_app "${TOKENS[3]}" "$APP4"
review_app "$APP4" "needs_more_docs" "High-value jewellery trading requires enhanced due diligence. Please provide: 1) Source of funds documentation 2) Supplier invoices 3) Updated bank statement (last 6 months)."
echo "     4. Deira Gem & Jewellery Trading — NEEDS_MORE_DOCS"

# --- App 5: MedCare Plus Clinic → REJECTED ---
APP5=$(create_app "${TOKENS[4]}" '{
  "business_name":"MedCare Plus Clinic",
  "business_category":"Healthcare",
  "business_subcategory":"Medical Clinic",
  "store_type":"registeredBusiness",
  "mcc":"8011",
  "country":"United Arab Emirates",
  "city":"Sharjah",
  "address_line1":"Al Nahda, King Faisal Street",
  "address_line2":"Medical Center Building, 2nd Floor",
  "website":"https://www.medcareplus.ae",
  "business_description":"Multi-specialty medical clinic providing general practice, dermatology, and dental services with DHA and MOH licensed practitioners",
  "business_activities":"Medical Services",
  "monthly_volume":"180000",
  "free_zone":false,
  "accept_international_payments":false,
  "owner_name":"Dr. Priya Patel",
  "contact_phone":"+971-6-555-1234",
  "contact_email":"priya.patel@medcareplus.ae",
  "contact_address":"Al Nahda, Sharjah",
  "settlement_currency":"AED",
  "settlement_bank_name":"RAK Bank",
  "settlement_bank_iban":"AE520400000098765432",
  "settlement_frequency":"Weekly"
}')

add_owner "${TOKENS[4]}" "$APP5" '{"ownership_type":"shareHolder","owner_type":"individual","first_name":"Priya","last_name":"Patel","email":"priya.patel@medcareplus.ae","identity_type":"passport"}'

create_pdf "Priya Patel - Passport - Republic of India" /tmp/seed_pass5.pdf
upload_doc "${TOKENS[4]}" "$APP5" /tmp/seed_pass5.pdf passport
submit_app "${TOKENS[4]}" "$APP5"
review_app "$APP5" "rejected" "Application rejected: DHA medical license expired. Sharjah MOH license number could not be verified. Please renew your medical license and reapply."
echo "     5. MedCare Plus Clinic — REJECTED"

# --- App 6: Desert Dreams Travel → DRAFT (not submitted) ---
APP6=$(create_app "${TOKENS[5]}" '{
  "business_name":"Desert Dreams Travel Agency LLC",
  "business_category":"Travel & Tourism",
  "business_subcategory":"Travel Agency",
  "store_type":"registeredBusiness",
  "mcc":"4722",
  "country":"United Arab Emirates",
  "city":"Abu Dhabi",
  "address_line1":"Corniche Road, Tourist Club Area",
  "address_line2":"Office 301, Al Nahyan Tower",
  "website":"https://www.desertdreamstravel.ae",
  "business_description":"Full-service travel agency specializing in UAE inbound tours, Hajj/Umrah packages, and corporate travel management",
  "business_activities":"Travel Agency",
  "monthly_volume":"620000",
  "free_zone":false,
  "accept_international_payments":true,
  "owner_name":"Nadia Al Falasi",
  "contact_phone":"+971-2-444-8899",
  "contact_email":"nadia.alfalasi@desertdreamstravel.ae",
  "contact_address":"Corniche Road, Abu Dhabi",
  "settlement_currency":"AED",
  "settlement_bank_name":"First Abu Dhabi Bank",
  "settlement_bank_iban":"AE070351234567890124",
  "settlement_frequency":"Weekly"
}')

add_owner "${TOKENS[5]}" "$APP6" '{"ownership_type":"shareHolder","owner_type":"individual","first_name":"Nadia","last_name":"Al Falasi","email":"nadia.alfalasi@desertdreamstravel.ae","identity_type":"emiratesId"}'
echo "     6. Desert Dreams Travel Agency LLC — DRAFT"

# --- App 7: Skyline Building Contractors → PENDING ---
APP7=$(create_app "${TOKENS[6]}" '{
  "business_name":"Skyline Building Contractors LLC",
  "business_category":"Construction & Real Estate",
  "business_subcategory":"General Contracting",
  "store_type":"registeredBusiness",
  "mcc":"1520",
  "country":"United Arab Emirates",
  "city":"Sharjah",
  "address_line1":"Industrial Area 12",
  "address_line2":"Block C, Unit 45",
  "website":"https://www.skylinebuilding.ae",
  "business_description":"Licensed general contractor providing civil construction, fit-out, and infrastructure works across UAE",
  "business_activities":"Contractor Services",
  "monthly_volume":"3200000",
  "free_zone":false,
  "accept_international_payments":false,
  "owner_name":"Wei Chen",
  "contact_phone":"+971-6-533-7700",
  "contact_email":"wei.chen@skylinebuilding.ae",
  "contact_address":"Industrial Area 12, Sharjah",
  "settlement_currency":"AED",
  "settlement_bank_name":"Mashreq Bank",
  "settlement_bank_iban":"AE280330000012345678",
  "settlement_frequency":"Bi-Weekly"
}')

add_owner "${TOKENS[6]}" "$APP7" '{"ownership_type":"shareHolder","owner_type":"individual","first_name":"Wei","last_name":"Chen","email":"wei.chen@skylinebuilding.ae","identity_type":"passport"}'
add_owner "${TOKENS[6]}" "$APP7" '{"ownership_type":"shareHolder","owner_type":"corporate","company_name":"Chen Construction Holdings Ltd","email":"holding@chenconstruction.hk","identity_type":"tradeLicense"}'
add_owner "${TOKENS[6]}" "$APP7" '{"ownership_type":"authorizedSignatory","owner_type":"individual","first_name":"Amira","last_name":"Khalil","email":"amira.khalil@skylinebuilding.ae","identity_type":"emiratesId"}'

create_pdf "Skyline Building Contractors LLC - Trade License Sharjah DED 2024" /tmp/seed_tl7.pdf
create_pdf "Wei Chen - Passport - People Republic of China" /tmp/seed_pass7.pdf
create_pdf "Skyline Building - Mashreq Bank Statement Jan 2024" /tmp/seed_bs7.pdf
upload_doc "${TOKENS[6]}" "$APP7" /tmp/seed_tl7.pdf trade_license
upload_doc "${TOKENS[6]}" "$APP7" /tmp/seed_pass7.pdf passport
upload_doc "${TOKENS[6]}" "$APP7" /tmp/seed_bs7.pdf bank_statement
submit_app "${TOKENS[6]}" "$APP7"
echo "     7. Skyline Building Contractors LLC — PENDING"

# --- App 8: SmartEdu Learning Platform → APPROVED ---
APP8=$(create_app "${TOKENS[7]}" '{
  "business_name":"SmartEdu Learning Platform FZ LLC",
  "business_category":"Education & Training",
  "business_subcategory":"E-Learning Platform",
  "store_type":"registeredBusiness",
  "mcc":"8299",
  "country":"United Arab Emirates",
  "city":"Dubai",
  "address_line1":"Dubai Internet City",
  "address_line2":"Building 12, Office 204",
  "website":"https://www.smartedu.ae",
  "business_description":"Online learning management system offering K-12 and professional certification courses in Arabic and English, serving 50,000+ students across MENA",
  "business_activities":"Educational Services",
  "monthly_volume":"980000",
  "free_zone":true,
  "accept_international_payments":true,
  "owner_name":"Maria Gonzalez",
  "contact_phone":"+971-4-369-8800",
  "contact_email":"maria.gonzalez@smartedu.ae",
  "contact_address":"Dubai Internet City, Building 12, Dubai",
  "settlement_currency":"USD",
  "settlement_bank_name":"Emirates NBD",
  "settlement_bank_iban":"AE560260001015446647",
  "settlement_frequency":"Monthly"
}')

add_owner "${TOKENS[7]}" "$APP8" '{"ownership_type":"shareHolder","owner_type":"individual","first_name":"Maria","last_name":"Gonzalez","email":"maria.gonzalez@smartedu.ae","identity_type":"passport"}'
add_owner "${TOKENS[7]}" "$APP8" '{"ownership_type":"shareHolder","owner_type":"individual","first_name":"Khalid","last_name":"Al Rashidi","email":"khalid.rashidi@smartedu.ae","identity_type":"emiratesId"}'
add_owner "${TOKENS[7]}" "$APP8" '{"ownership_type":"authorizedSignatory","owner_type":"individual","first_name":"Maria","last_name":"Gonzalez","email":"maria.gonzalez@smartedu.ae","identity_type":"passport"}'

create_pdf "SmartEdu Learning Platform FZ LLC - Trade License DIC 2024" /tmp/seed_tl8.pdf
create_pdf "Maria Gonzalez - Passport - Kingdom of Spain" /tmp/seed_pass8.pdf
create_pdf "SmartEdu - Memorandum of Association DIC" /tmp/seed_moa8.pdf
create_pdf "SmartEdu - Emirates NBD Bank Statement Q4 2023" /tmp/seed_bs8.pdf
upload_doc "${TOKENS[7]}" "$APP8" /tmp/seed_tl8.pdf trade_license
upload_doc "${TOKENS[7]}" "$APP8" /tmp/seed_pass8.pdf passport
upload_doc "${TOKENS[7]}" "$APP8" /tmp/seed_moa8.pdf memorandum_of_association
upload_doc "${TOKENS[7]}" "$APP8" /tmp/seed_bs8.pdf bank_statement
submit_app "${TOKENS[7]}" "$APP8"
review_app "$APP8" "approved" "All documents verified and meet compliance requirements. Business activities align with Free Zone license. KYC checks passed."
echo "     8. SmartEdu Learning Platform FZ LLC — APPROVED"

# ── 5. Summary ──
echo ""
echo "5/6  Cleaning up temp files..."
rm -f /tmp/seed_*.pdf
echo "     Done."

echo ""
echo "============================================"
echo "  6/6  Seed complete!"
echo "============================================"
echo ""
echo "  8 merchants, 8 applications:"
echo "    3x APPROVED    (Golden Bazaar, Spice Route, SmartEdu)"
echo "    2x PENDING     (NexGen Technologies, Skyline Building)"
echo "    1x NEEDS_DOCS  (Deira Gem & Jewellery)"
echo "    1x REJECTED    (MedCare Plus Clinic)"
echo "    1x DRAFT       (Desert Dreams Travel)"
echo ""
echo "  Credentials (password: $PASSWORD):"
echo "  ┌────────────────────────────────────────────────────┐"
echo "  │ REVIEWER                                           │"
echo "  │   sarah.reviewer@fortispay.com                     │"
echo "  ├────────────────────────────────────────────────────┤"
echo "  │ MERCHANTS                                          │"
echo "  │   ahmed.mansouri@goldenbazaar.ae                   │"
echo "  │   fatima.hassan@spiceroute.ae                      │"
echo "  │   raj.krishna@nexgentech.ae                        │"
echo "  │   omar.deira@deiragems.ae                          │"
echo "  │   priya.patel@medcareplus.ae                       │"
echo "  │   nadia.alfalasi@desertdreamstravel.ae             │"
echo "  │   wei.chen@skylinebuilding.ae                      │"
echo "  │   maria.gonzalez@smartedu.ae                       │"
echo "  └────────────────────────────────────────────────────┘"
echo ""
