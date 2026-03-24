package docvalidation

import (
	"bytes"
	"fmt"
	"image"
	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"net/http"
	"strings"

	"github.com/otiai10/gosseract/v2"
)

// ValidationResult holds the outcome of document validation
type ValidationResult struct {
	Valid    bool     `json:"valid"`
	Status  string   `json:"validation_status"`  // "passed", "warning", "rejected"
	Errors  []string `json:"validation_errors"`
	Details string   `json:"validation_details"`
}

// DocTypeExpectation maps doc_type to what we expect
var DocTypeExpectation = map[string]struct {
	Label       string
	MinSizeKB   int64
	AllowedMIME []string
	Keywords    []string // keywords to look for in PDFs for extra confidence
}{
	"trade_license": {
		Label: "Trade License", MinSizeKB: 10,
		AllowedMIME: []string{"application/pdf", "image/"},
		Keywords:    []string{"license", "trade", "commercial", "registration", "ministry", "economic", "ded", "department"},
	},
	"memorandum_of_association": {
		Label: "Memorandum of Association", MinSizeKB: 10,
		AllowedMIME: []string{"application/pdf", "image/"},
		Keywords:    []string{"memorandum", "association", "articles", "incorporation", "company", "shareholder", "director"},
	},
	"utility_bill": {
		Label: "Utility Bill", MinSizeKB: 5,
		AllowedMIME: []string{"application/pdf", "image/"},
		Keywords:    []string{"bill", "utility", "electricity", "water", "gas", "telecom", "etisalat", "du", "dewa", "sewa", "fewa"},
	},
	"tax": {
		Label: "Tax Certificate", MinSizeKB: 5,
		AllowedMIME: []string{"application/pdf", "image/"},
		Keywords:    []string{"tax", "trn", "vat", "registration", "certificate", "federal", "authority"},
	},
	"passport": {
		Label: "Passport", MinSizeKB: 20,
		AllowedMIME: []string{"application/pdf", "image/"},
		Keywords:    []string{"passport", "surname", "given name", "nationality", "date of birth"},
	},
	"visa": {
		Label: "Visa", MinSizeKB: 10,
		AllowedMIME: []string{"application/pdf", "image/"},
		Keywords:    []string{"visa", "residence", "permit", "entry", "uid", "file number"},
	},
	"identity_document": {
		Label: "Identity Document (Emirates ID)", MinSizeKB: 10,
		AllowedMIME: []string{"application/pdf", "image/"},
		Keywords:    []string{"identity", "emirates", "id number", "card number", "الهوية"},
	},
	"bank_statement": {
		Label: "Bank Statement", MinSizeKB: 10,
		AllowedMIME: []string{"application/pdf", "image/"},
		Keywords:    []string{"bank", "statement", "account", "balance", "transaction", "credit", "debit"},
	},
	"business_documents": {
		Label: "Business Documents", MinSizeKB: 5,
		AllowedMIME: []string{"application/pdf", "image/", "application/msword", "application/vnd.openxmlformats"},
		Keywords:    []string{},
	},
	"business_license": {
		Label: "Business License", MinSizeKB: 10,
		AllowedMIME: []string{"application/pdf", "image/"},
		Keywords:    []string{"license", "business", "commercial", "registration"},
	},
	"other": {
		Label: "Other Document", MinSizeKB: 1,
		AllowedMIME: []string{}, // accept any
		Keywords:    []string{},
	},
}

// ValidateDocument reads the uploaded file content and validates it.
// matchName: for passport/identity_document, the expected person name.
// businessName: for utility_bill/tax, the expected company name.
func ValidateDocument(fileData []byte, fileName string, claimedMIME string, docType string, matchName string, businessName string) ValidationResult {
	result := ValidationResult{Valid: true, Status: "passed", Errors: []string{}}

	expectation, hasExpectation := DocTypeExpectation[docType]
	if !hasExpectation {
		// Unknown doc type — just do basic checks
		expectation = DocTypeExpectation["other"]
	}

	fileSize := int64(len(fileData))

	// 1. Check file is not empty
	if fileSize == 0 {
		return ValidationResult{
			Valid:   false,
			Status:  "rejected",
			Errors:  []string{"File is empty (0 bytes)"},
			Details: "The uploaded file contains no data. Please upload a valid document.",
		}
	}

	// 2. Check minimum file size
	minBytes := expectation.MinSizeKB * 1024
	if fileSize < minBytes {
		result.Valid = false
		result.Status = "rejected"
		result.Errors = append(result.Errors, fmt.Sprintf(
			"File too small (%d KB). A valid %s should be at least %d KB",
			fileSize/1024, expectation.Label, expectation.MinSizeKB,
		))
	}

	// 3. Detect actual MIME type from content (not from header which can be faked)
	detectedMIME := http.DetectContentType(fileData)

	// 4. Validate MIME type matches expectations
	if len(expectation.AllowedMIME) > 0 {
		mimeOK := false
		for _, allowed := range expectation.AllowedMIME {
			if strings.HasPrefix(detectedMIME, allowed) {
				mimeOK = true
				break
			}
		}
		if !mimeOK {
			// Also check the claimed MIME (browser-detected) as fallback
			for _, allowed := range expectation.AllowedMIME {
				if strings.HasPrefix(claimedMIME, allowed) {
					mimeOK = true
					break
				}
			}
		}
		if !mimeOK {
			result.Valid = false
			result.Status = "rejected"
			result.Errors = append(result.Errors, fmt.Sprintf(
				"Invalid file type '%s'. Expected PDF or image for %s",
				detectedMIME, expectation.Label,
			))
		}
	}

	// 5. PDF-specific validation
	if strings.HasPrefix(detectedMIME, "application/pdf") || strings.HasSuffix(strings.ToLower(fileName), ".pdf") {
		pdfResult := validatePDF(fileData, expectation, docType, matchName, businessName)
		if len(pdfResult.Errors) > 0 {
			result.Errors = append(result.Errors, pdfResult.Errors...)
			if pdfResult.Status == "rejected" {
				result.Valid = false
				result.Status = "rejected"
			} else if result.Status != "rejected" {
				result.Status = pdfResult.Status
			}
		}
		if pdfResult.Details != "" {
			result.Details = pdfResult.Details
		}
	}

	// 6. Image-specific validation
	if strings.HasPrefix(detectedMIME, "image/") {
		imgResult := validateImage(fileData, expectation)
		if len(imgResult.Errors) > 0 {
			result.Errors = append(result.Errors, imgResult.Errors...)
			if imgResult.Status == "rejected" {
				result.Valid = false
				result.Status = "rejected"
			} else if result.Status != "rejected" {
				result.Status = imgResult.Status
			}
		}

		// OCR text extraction for name matching on images
		if (docType == "passport" || docType == "identity_document") && matchName != "" {
			ocrText := extractImageText(fileData)
			if len(ocrText) > 0 {
				textLower := strings.ToLower(ocrText)
				nameParts := strings.Fields(strings.ToLower(matchName))
				matchedParts := 0
				for _, part := range nameParts {
					if len(part) > 1 && strings.Contains(textLower, part) {
						matchedParts++
					}
				}
				if matchedParts == 0 {
					if result.Status != "rejected" {
						result.Status = "warning"
					}
					result.Errors = append(result.Errors, fmt.Sprintf(
						"Name '%s' was not found in the document image. Please verify this document belongs to the correct person.", matchName))
				}
			} else {
				if result.Status != "rejected" {
					result.Status = "warning"
				}
				result.Errors = append(result.Errors, "Could not read text from the image — quality may be too low for name verification. Please upload a clearer image or a PDF.")
			}
		}
		if (docType == "utility_bill" || docType == "tax") && businessName != "" {
			ocrText := extractImageText(fileData)
			if len(ocrText) > 0 {
				textLower := strings.ToLower(ocrText)
				skipWords := map[string]bool{"llc": true, "ltd": true, "inc": true, "fzco": true, "fz": true, "co": true}
				nameParts := strings.Fields(strings.ToLower(businessName))
				matchedParts, totalParts := 0, 0
				for _, part := range nameParts {
					if len(part) <= 2 || skipWords[part] {
						continue
					}
					totalParts++
					if strings.Contains(textLower, part) {
						matchedParts++
					}
				}
				if totalParts > 0 && matchedParts == 0 {
					if result.Status != "rejected" {
						result.Status = "warning"
					}
					result.Errors = append(result.Errors, fmt.Sprintf(
						"Company name '%s' was not found in the document image. Please verify this document belongs to the correct company.", businessName))
				}
			} else {
				if result.Status != "rejected" {
					result.Status = "warning"
				}
				result.Errors = append(result.Errors, "Could not read text from the image — quality may be too low for company name verification. Please upload a clearer image or a PDF.")
			}
		}
	}

	// Build summary details
	if result.Valid && len(result.Errors) == 0 {
		result.Details = fmt.Sprintf("Document validated: %s, %d KB, %s", expectation.Label, fileSize/1024, detectedMIME)
	} else if len(result.Errors) > 0 {
		result.Details = strings.Join(result.Errors, "; ")
	}

	return result
}

// validatePDF checks PDF-specific validity
func validatePDF(data []byte, expectation struct {
	Label       string
	MinSizeKB   int64
	AllowedMIME []string
	Keywords    []string
}, docType string, matchName string, businessName string) ValidationResult {
	result := ValidationResult{Valid: true, Status: "passed", Errors: []string{}}

	// Check PDF header
	if len(data) < 5 || string(data[:5]) != "%PDF-" {
		result.Status = "rejected"
		result.Errors = append(result.Errors, "File does not have a valid PDF header")
		return result
	}

	// Check for %%EOF marker (basic PDF completeness)
	tail := data
	if len(data) > 1024 {
		tail = data[len(data)-1024:]
	}
	if !bytes.Contains(tail, []byte("%%EOF")) {
		result.Status = "warning"
		result.Errors = append(result.Errors, "PDF may be incomplete or corrupted (missing EOF marker)")
	}

	// Extract text content for analysis (simple extraction — look for text between parentheses and stream data)
	textContent := extractPDFText(data)

	// Check if PDF has any meaningful text content
	if len(textContent) < 20 {
		// Very little text — might be a blank/scanned PDF
		// Check if it at least has image objects (scanned documents)
		hasImages := bytes.Contains(data, []byte("/Image")) || bytes.Contains(data, []byte("/XObject"))
		if !hasImages {
			result.Status = "rejected"
			result.Errors = append(result.Errors, "PDF appears to be blank — no text or image content found")
			result.Details = "The uploaded PDF does not contain any readable content. Please upload a document with actual content."
			return result
		}
		// Has images but no text — likely a scanned document, OK
	}

	// Keyword matching for document type verification (warning, not rejection)
	if len(expectation.Keywords) > 0 && len(textContent) > 0 {
		textLower := strings.ToLower(textContent)
		matchCount := 0
		for _, kw := range expectation.Keywords {
			if strings.Contains(textLower, strings.ToLower(kw)) {
				matchCount++
			}
		}
		if matchCount == 0 && len(textContent) > 50 {
			result.Status = "warning"
			result.Errors = append(result.Errors, fmt.Sprintf(
				"Document content does not appear to match expected '%s'. Please verify you uploaded the correct document.",
				expectation.Label,
			))
		}
	}

	// Check page count (basic — count /Type /Page occurrences)
	pageCount := bytes.Count(data, []byte("/Type /Page"))
	// Subtract catalog references
	catalogCount := bytes.Count(data, []byte("/Type /Pages"))
	actualPages := pageCount - catalogCount
	if actualPages == 0 {
		// Alternative detection
		actualPages = bytes.Count(data, []byte("/Type/Page"))
		catalogCount2 := bytes.Count(data, []byte("/Type/Pages"))
		actualPages = actualPages - catalogCount2
	}
	if actualPages <= 0 {
		result.Status = "warning"
		result.Errors = append(result.Errors, "Could not determine page count — document may be empty")
	}

	// Name matching for identity documents (passport, emirates ID)
	if (docType == "passport" || docType == "identity_document") && matchName != "" && len(textContent) > 0 {
		textLower := strings.ToLower(textContent)
		nameParts := strings.Fields(strings.ToLower(matchName))
		matchedParts := 0
		for _, part := range nameParts {
			if len(part) > 1 && strings.Contains(textLower, part) {
				matchedParts++
			}
		}
		if matchedParts == 0 {
			if result.Status != "rejected" {
				result.Status = "warning"
			}
			result.Errors = append(result.Errors, fmt.Sprintf(
				"Name '%s' was not found in the document. Please verify this document belongs to the correct shareholder.", matchName))
		}
	}

	// Company name matching for utility bill / tax
	if (docType == "utility_bill" || docType == "tax") && businessName != "" && len(textContent) > 0 {
		textLower := strings.ToLower(textContent)
		nameLower := strings.ToLower(businessName)
		skipWords := map[string]bool{"llc": true, "ltd": true, "inc": true, "fzco": true, "fz": true, "co": true}
		nameParts := strings.Fields(nameLower)
		matchedParts := 0
		totalParts := 0
		for _, part := range nameParts {
			if len(part) <= 2 || skipWords[part] {
				continue
			}
			totalParts++
			if strings.Contains(textLower, part) {
				matchedParts++
			}
		}
		if totalParts > 0 && matchedParts == 0 {
			if result.Status != "rejected" {
				result.Status = "warning"
			}
			result.Errors = append(result.Errors, fmt.Sprintf(
				"Company name '%s' was not found in the document. Please verify this document belongs to the correct company.", businessName))
		}
	}

	return result
}

// extractPDFText extracts visible text from a PDF (simple heuristic)
func extractPDFText(data []byte) string {
	var text strings.Builder
	dataStr := string(data)

	// Method 1: Extract text from parenthesized strings (PDF text objects)
	inParen := false
	escape := false
	for _, ch := range dataStr {
		if escape {
			escape = false
			if inParen {
				text.WriteRune(ch)
			}
			continue
		}
		if ch == '\\' {
			escape = true
			continue
		}
		if ch == '(' {
			inParen = true
			continue
		}
		if ch == ')' {
			inParen = false
			text.WriteRune(' ')
			continue
		}
		if inParen && ch >= 32 && ch < 127 {
			text.WriteRune(ch)
		}
	}

	// Method 2: Look for text between BT and ET markers (text objects)
	result := text.String()

	// Clean up — remove long runs of whitespace
	result = strings.Join(strings.Fields(result), " ")
	return result
}

// validateImage checks image-specific validity
func validateImage(data []byte, expectation struct {
	Label       string
	MinSizeKB   int64
	AllowedMIME []string
	Keywords    []string
}) ValidationResult {
	result := ValidationResult{Valid: true, Status: "passed", Errors: []string{}}

	// Try to decode the image
	reader := bytes.NewReader(data)
	config, format, err := image.DecodeConfig(reader)
	if err != nil {
		result.Status = "warning"
		result.Errors = append(result.Errors, "Could not decode image — file may be corrupted")
		return result
	}

	_ = format

	// Check dimensions
	if config.Width < 100 || config.Height < 100 {
		result.Status = "rejected"
		result.Errors = append(result.Errors, fmt.Sprintf(
			"Image too small (%dx%d pixels). A valid document scan should be at least 100x100 pixels",
			config.Width, config.Height,
		))
		return result
	}

	// Check for suspiciously small dimensions for document types
	if config.Width < 300 || config.Height < 300 {
		result.Status = "warning"
		result.Errors = append(result.Errors, fmt.Sprintf(
			"Image resolution is low (%dx%d pixels). Document may be hard to read. Recommended minimum: 600x400 pixels",
			config.Width, config.Height,
		))
	}

	// Check for single-color images (likely blank)
	if isSingleColorImage(data, config) {
		result.Status = "rejected"
		result.Errors = append(result.Errors, "Image appears to be blank (single color). Please upload an actual document scan.")
	}

	return result
}

// isSingleColorImage checks if the image is a single solid color (blank)
func isSingleColorImage(data []byte, config image.Config) bool {
	reader := bytes.NewReader(data)
	img, _, err := image.Decode(reader)
	if err != nil {
		return false
	}

	bounds := img.Bounds()
	// Sample a grid of pixels
	if bounds.Dx() < 10 || bounds.Dy() < 10 {
		return false
	}

	firstR, firstG, firstB, _ := img.At(bounds.Min.X+5, bounds.Min.Y+5).RGBA()
	samplePoints := [][2]int{
		{bounds.Min.X + bounds.Dx()/4, bounds.Min.Y + bounds.Dy()/4},
		{bounds.Min.X + bounds.Dx()/2, bounds.Min.Y + bounds.Dy()/2},
		{bounds.Min.X + 3*bounds.Dx()/4, bounds.Min.Y + 3*bounds.Dy()/4},
		{bounds.Min.X + bounds.Dx()/4, bounds.Min.Y + 3*bounds.Dy()/4},
		{bounds.Min.X + 3*bounds.Dx()/4, bounds.Min.Y + bounds.Dy()/4},
		{bounds.Min.X + bounds.Dx()/2, bounds.Min.Y + bounds.Dy()/4},
		{bounds.Min.X + bounds.Dx()/4, bounds.Min.Y + bounds.Dy()/2},
		{bounds.Min.X + 3*bounds.Dx()/4, bounds.Min.Y + bounds.Dy()/2},
	}

	threshold := uint32(1000) // allow tiny color variance
	for _, pt := range samplePoints {
		r, g, b, _ := img.At(pt[0], pt[1]).RGBA()
		dr := absDiff(r, firstR)
		dg := absDiff(g, firstG)
		db := absDiff(b, firstB)
		if dr > threshold || dg > threshold || db > threshold {
			return false // found a pixel that differs → not single color
		}
	}
	return true // all sampled pixels are the same color
}

func absDiff(a, b uint32) uint32 {
	if a > b {
		return a - b
	}
	return b - a
}

// extractImageText uses Tesseract OCR to extract text from an image
func extractImageText(imageData []byte) string {
	client := gosseract.NewClient()
	defer client.Close()
	if err := client.SetImageFromBytes(imageData); err != nil {
		return ""
	}
	text, err := client.Text()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(text)
}

// ReadAll reads the entire content from a reader
func ReadAll(r io.Reader) ([]byte, error) {
	return io.ReadAll(r)
}
