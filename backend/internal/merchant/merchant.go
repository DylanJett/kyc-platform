package merchant

import (
	"bytes"
	"database/sql"
	"io"
	"net/http"

	"github.com/gin-gonic/gin"
	"kyc-platform/internal/docvalidation"
	"kyc-platform/internal/storage"
)

type ApplicationRequest struct {
	BusinessName               string `json:"business_name"`
	BusinessCategory           string `json:"business_category"`
	BusinessSubcategory        string `json:"business_subcategory"`
	FreeZone                   bool   `json:"free_zone"`
	Country                    string `json:"country"`
	Website                    string `json:"website"`
	BusinessDescription        string `json:"business_description"`
	MonthlyVolume              string `json:"monthly_volume"`
	OwnerName                  string `json:"owner_name"`
	ContactPhone               string `json:"contact_phone"`
	ContactAddress             string `json:"contact_address"`
	MCC                        string `json:"mcc"`
	StoreType                  string `json:"store_type"`
	ContactEmail               string `json:"contact_email"`
	City                       string `json:"city"`
	AddressLine1               string `json:"address_line1"`
	AddressLine2               string `json:"address_line2"`
	BusinessActivities         string `json:"business_activities"`
	AcceptInternationalPayments bool  `json:"accept_international_payments"`
	SettlementCurrency         string `json:"settlement_currency"`
	SettlementBankName         string `json:"settlement_bank_name"`
	SettlementBankIban         string `json:"settlement_bank_iban"`
	SettlementFrequency        string `json:"settlement_frequency"`
}

type OwnerRequest struct {
	OwnershipType string `json:"ownership_type"`
	OwnerType     string `json:"owner_type"`
	FirstName     string `json:"first_name"`
	LastName      string `json:"last_name"`
	CompanyName   string `json:"company_name"`
	Email         string `json:"email"`
	IdentityType  string `json:"identity_type"`
}

// GetMyApplication returns the latest application for the current merchant (backward compat)
func GetMyApplication(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		merchantID := c.GetString("user_id")
		app, err := scanApplication(db, `
			SELECT id, business_name, business_category, business_subcategory, free_zone,
			       country, website, business_description, monthly_volume,
			       owner_name, contact_phone, contact_address,
			       mcc, store_type, contact_email, city, address_line1, address_line2,
			       business_activities, accept_international_payments,
			       settlement_currency, settlement_bank_name, settlement_bank_iban, settlement_frequency,
			       status, reviewer_comment, created_at, updated_at
			FROM applications WHERE merchant_id = $1
			ORDER BY created_at DESC LIMIT 1
		`, merchantID)
		if err == sql.ErrNoRows {
			c.JSON(http.StatusOK, nil)
			return
		}
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get application"})
			return
		}

		// Load documents
		app.Documents = getDocuments(db, app.ID)

		c.JSON(http.StatusOK, app)
	}
}

// GetMyApplications returns ALL applications for the current merchant
func GetMyApplications(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		merchantID := c.GetString("user_id")

		rows, err := db.Query(`
			SELECT id, business_name, business_category, business_subcategory, free_zone,
			       country, website, business_description, monthly_volume,
			       owner_name, contact_phone, contact_address,
			       mcc, store_type, contact_email, city, address_line1, address_line2,
			       business_activities, accept_international_payments,
			       settlement_currency, settlement_bank_name, settlement_bank_iban, settlement_frequency,
			       status, reviewer_comment, created_at, updated_at
			FROM applications WHERE merchant_id = $1
			ORDER BY created_at DESC
		`, merchantID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get applications"})
			return
		}
		defer rows.Close()

		apps := []AppResponse{}
		for rows.Next() {
			var app AppResponse
			err := rows.Scan(
				&app.ID, &app.BusinessName, &app.BusinessCategory, &app.BusinessSubcategory,
				&app.FreeZone, &app.Country, &app.Website, &app.BusinessDescription,
				&app.MonthlyVolume, &app.OwnerName, &app.ContactPhone, &app.ContactAddress,
				&app.MCC, &app.StoreType, &app.ContactEmail, &app.City,
				&app.AddressLine1, &app.AddressLine2, &app.BusinessActivities,
				&app.AcceptInternationalPayments, &app.SettlementCurrency,
				&app.SettlementBankName, &app.SettlementBankIban, &app.SettlementFrequency,
				&app.Status, &app.ReviewerComment, &app.CreatedAt, &app.UpdatedAt,
			)
			if err != nil {
				continue
			}
			app.Documents = getDocuments(db, app.ID)
			apps = append(apps, app)
		}
		c.JSON(http.StatusOK, apps)
	}
}

func CreateApplication(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		merchantID := c.GetString("user_id")

		var req ApplicationRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		var id string
		err := db.QueryRow(`
			INSERT INTO applications
			  (merchant_id, business_name, business_category, business_subcategory, free_zone,
			   country, website, business_description, monthly_volume,
			   owner_name, contact_phone, contact_address,
			   mcc, store_type, contact_email, city, address_line1, address_line2,
			   business_activities, accept_international_payments,
			   settlement_currency, settlement_bank_name, settlement_bank_iban, settlement_frequency)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
			RETURNING id
		`, merchantID, req.BusinessName, req.BusinessCategory, req.BusinessSubcategory,
			req.FreeZone, req.Country, req.Website, req.BusinessDescription,
			req.MonthlyVolume, req.OwnerName, req.ContactPhone, req.ContactAddress,
			req.MCC, req.StoreType, req.ContactEmail, req.City,
			req.AddressLine1, req.AddressLine2, req.BusinessActivities,
			req.AcceptInternationalPayments, req.SettlementCurrency,
			req.SettlementBankName, req.SettlementBankIban, req.SettlementFrequency,
		).Scan(&id)

		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create application"})
			return
		}
		c.JSON(http.StatusCreated, gin.H{"id": id, "status": "draft"})
	}
}

func UpdateApplication(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		merchantID := c.GetString("user_id")

		var req ApplicationRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		_, err := db.Exec(`
			UPDATE applications SET
			  business_name=$1, business_category=$2, business_subcategory=$3, free_zone=$4,
			  country=$5, website=$6, business_description=$7, monthly_volume=$8,
			  owner_name=$9, contact_phone=$10, contact_address=$11,
			  mcc=$12, store_type=$13, contact_email=$14, city=$15,
			  address_line1=$16, address_line2=$17, business_activities=$18,
			  accept_international_payments=$19, settlement_currency=$20,
			  settlement_bank_name=$21, settlement_bank_iban=$22, settlement_frequency=$23,
			  updated_at=NOW()
			WHERE merchant_id=$24 AND status IN ('draft','needs_more_docs','rejected')
		`, req.BusinessName, req.BusinessCategory, req.BusinessSubcategory, req.FreeZone,
			req.Country, req.Website, req.BusinessDescription, req.MonthlyVolume,
			req.OwnerName, req.ContactPhone, req.ContactAddress,
			req.MCC, req.StoreType, req.ContactEmail, req.City,
			req.AddressLine1, req.AddressLine2, req.BusinessActivities,
			req.AcceptInternationalPayments, req.SettlementCurrency,
			req.SettlementBankName, req.SettlementBankIban, req.SettlementFrequency,
			merchantID,
		)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update application"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "Updated"})
	}
}

// UpdateApplicationByID updates a specific application by ID
func UpdateApplicationByID(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		merchantID := c.GetString("user_id")
		appID := c.Param("id")

		var req ApplicationRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		result, err := db.Exec(`
			UPDATE applications SET
			  business_name=$1, business_category=$2, business_subcategory=$3, free_zone=$4,
			  country=$5, website=$6, business_description=$7, monthly_volume=$8,
			  owner_name=$9, contact_phone=$10, contact_address=$11,
			  mcc=$12, store_type=$13, contact_email=$14, city=$15,
			  address_line1=$16, address_line2=$17, business_activities=$18,
			  accept_international_payments=$19, settlement_currency=$20,
			  settlement_bank_name=$21, settlement_bank_iban=$22, settlement_frequency=$23,
			  updated_at=NOW()
			WHERE id=$24 AND merchant_id=$25 AND status IN ('draft','needs_more_docs','rejected')
		`, req.BusinessName, req.BusinessCategory, req.BusinessSubcategory, req.FreeZone,
			req.Country, req.Website, req.BusinessDescription, req.MonthlyVolume,
			req.OwnerName, req.ContactPhone, req.ContactAddress,
			req.MCC, req.StoreType, req.ContactEmail, req.City,
			req.AddressLine1, req.AddressLine2, req.BusinessActivities,
			req.AcceptInternationalPayments, req.SettlementCurrency,
			req.SettlementBankName, req.SettlementBankIban, req.SettlementFrequency,
			appID, merchantID,
		)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update application"})
			return
		}

		rows, _ := result.RowsAffected()
		if rows == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Application not found or not editable"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "Updated"})
	}
}

func SubmitApplication(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		merchantID := c.GetString("user_id")

		var appID, oldStatus string
		err := db.QueryRow(`
			SELECT id, status FROM applications
			WHERE merchant_id=$1 AND status IN ('draft','needs_more_docs','rejected')
			ORDER BY created_at DESC LIMIT 1
		`, merchantID).Scan(&appID, &oldStatus)

		if err == sql.ErrNoRows {
			c.JSON(http.StatusBadRequest, gin.H{"error": "No application to submit"})
			return
		}

		_, err = db.Exec(`
			UPDATE applications SET status='pending', updated_at=NOW() WHERE id=$1
		`, appID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to submit application"})
			return
		}

		db.Exec(`
			INSERT INTO status_history (application_id, changed_by, old_status, new_status)
			VALUES ($1, $2, $3, 'pending')
		`, appID, merchantID, oldStatus)

		c.JSON(http.StatusOK, gin.H{"message": "Application submitted for review"})
	}
}

// SubmitApplicationByID submits a specific application by ID
func SubmitApplicationByID(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		merchantID := c.GetString("user_id")
		appID := c.Param("id")

		var oldStatus string
		err := db.QueryRow(`
			SELECT status FROM applications
			WHERE id=$1 AND merchant_id=$2 AND status IN ('draft','needs_more_docs','rejected')
		`, appID, merchantID).Scan(&oldStatus)

		if err == sql.ErrNoRows {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Application not found or cannot be submitted"})
			return
		}

		_, err = db.Exec(`
			UPDATE applications SET status='pending', updated_at=NOW() WHERE id=$1
		`, appID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to submit application"})
			return
		}

		db.Exec(`
			INSERT INTO status_history (application_id, changed_by, old_status, new_status)
			VALUES ($1, $2, $3, 'pending')
		`, appID, merchantID, oldStatus)

		c.JSON(http.StatusOK, gin.H{"message": "Application submitted for review"})
	}
}

func UploadDocument(db *sql.DB, store *storage.MinIOClient) gin.HandlerFunc {
	return func(c *gin.Context) {
		merchantID := c.GetString("user_id")

		var appID string
		err := db.QueryRow(`
			SELECT id FROM applications WHERE merchant_id=$1
			ORDER BY created_at DESC LIMIT 1
		`, merchantID).Scan(&appID)
		if err == sql.ErrNoRows {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Create an application first"})
			return
		}

		uploadDocForApp(c, db, store, appID)
	}
}

// UploadDocumentForApp uploads a document for a specific application
func UploadDocumentForApp(db *sql.DB, store *storage.MinIOClient) gin.HandlerFunc {
	return func(c *gin.Context) {
		merchantID := c.GetString("user_id")
		appID := c.Param("id")

		// Verify ownership
		var exists bool
		db.QueryRow(`SELECT EXISTS(SELECT 1 FROM applications WHERE id=$1 AND merchant_id=$2)`,
			appID, merchantID).Scan(&exists)
		if !exists {
			c.JSON(http.StatusForbidden, gin.H{"error": "Access denied"})
			return
		}

		uploadDocForApp(c, db, store, appID)
	}
}

func uploadDocForApp(c *gin.Context, db *sql.DB, store *storage.MinIOClient, appID string) {
	docType := c.PostForm("doc_type")
	if docType == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "doc_type is required"})
		return
	}

	file, header, err := c.Request.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "File not found"})
		return
	}
	defer file.Close()

	// Read file content for validation
	fileData, err := io.ReadAll(file)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to read file"})
		return
	}

	// Validate document content
	claimedMIME := header.Header.Get("Content-Type")
	validation := docvalidation.ValidateDocument(fileData, header.Filename, claimedMIME, docType)

	// Reject invalid documents
	if !validation.Valid {
		c.JSON(http.StatusBadRequest, gin.H{
			"error":              "Document validation failed",
			"validation_status":  validation.Status,
			"validation_errors":  validation.Errors,
			"validation_details": validation.Details,
		})
		return
	}

	// Reset file reader for upload (use bytes reader since we consumed the original)
	reader := bytes.NewReader(fileData)

	path, err := store.UploadFromReader(reader, header, appID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to upload file"})
		return
	}

	var docID string
	err = db.QueryRow(`
		INSERT INTO documents (application_id, doc_type, original_name, storage_path, mime_type, file_size,
		                       validation_status, validation_details)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id
	`, appID, docType, header.Filename, path,
		claimedMIME, header.Size,
		validation.Status, validation.Details,
	).Scan(&docID)

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save document"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"id":                 docID,
		"path":               path,
		"validation_status":  validation.Status,
		"validation_errors":  validation.Errors,
		"validation_details": validation.Details,
	})
}

// AddOwner adds an owner to an application
func AddOwner(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		merchantID := c.GetString("user_id")
		appID := c.Param("id")

		// Verify ownership
		var exists bool
		db.QueryRow(`SELECT EXISTS(SELECT 1 FROM applications WHERE id=$1 AND merchant_id=$2)`,
			appID, merchantID).Scan(&exists)
		if !exists {
			c.JSON(http.StatusForbidden, gin.H{"error": "Access denied"})
			return
		}

		var req OwnerRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		var id string
		err := db.QueryRow(`
			INSERT INTO owners (application_id, ownership_type, owner_type, first_name, last_name, company_name, email, identity_type)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id
		`, appID, req.OwnershipType, req.OwnerType, req.FirstName, req.LastName,
			req.CompanyName, req.Email, req.IdentityType,
		).Scan(&id)

		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to add owner"})
			return
		}

		c.JSON(http.StatusCreated, gin.H{"id": id})
	}
}

// DeleteOwner removes an owner from an application
func DeleteOwner(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		merchantID := c.GetString("user_id")
		appID := c.Param("id")
		ownerID := c.Param("ownerId")

		// Verify ownership
		var exists bool
		db.QueryRow(`SELECT EXISTS(SELECT 1 FROM applications WHERE id=$1 AND merchant_id=$2)`,
			appID, merchantID).Scan(&exists)
		if !exists {
			c.JSON(http.StatusForbidden, gin.H{"error": "Access denied"})
			return
		}

		db.Exec(`DELETE FROM owners WHERE id=$1 AND application_id=$2`, ownerID, appID)
		c.JSON(http.StatusOK, gin.H{"message": "Owner removed"})
	}
}

// GetOwners returns all owners for an application
func GetOwners(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		appID := c.Param("id")

		rows, err := db.Query(`
			SELECT id, ownership_type, owner_type, first_name, last_name, company_name, email, identity_type, created_at
			FROM owners WHERE application_id = $1 ORDER BY created_at
		`, appID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get owners"})
			return
		}
		defer rows.Close()

		type Owner struct {
			ID            string  `json:"id"`
			OwnershipType string  `json:"ownership_type"`
			OwnerType     *string `json:"owner_type"`
			FirstName     *string `json:"first_name"`
			LastName      *string `json:"last_name"`
			CompanyName   *string `json:"company_name"`
			Email         *string `json:"email"`
			IdentityType  *string `json:"identity_type"`
			CreatedAt     string  `json:"created_at"`
		}

		owners := []Owner{}
		for rows.Next() {
			var o Owner
			rows.Scan(&o.ID, &o.OwnershipType, &o.OwnerType, &o.FirstName, &o.LastName,
				&o.CompanyName, &o.Email, &o.IdentityType, &o.CreatedAt)
			owners = append(owners, o)
		}
		c.JSON(http.StatusOK, owners)
	}
}

// --- Helpers ---

type AppResponse struct {
	ID                         string  `json:"id"`
	BusinessName               *string `json:"business_name"`
	BusinessCategory           *string `json:"business_category"`
	BusinessSubcategory        *string `json:"business_subcategory"`
	FreeZone                   bool    `json:"free_zone"`
	Country                    *string `json:"country"`
	Website                    *string `json:"website"`
	BusinessDescription        *string `json:"business_description"`
	MonthlyVolume              *string `json:"monthly_volume"`
	OwnerName                  *string `json:"owner_name"`
	ContactPhone               *string `json:"contact_phone"`
	ContactAddress             *string `json:"contact_address"`
	MCC                        *string `json:"mcc"`
	StoreType                  *string `json:"store_type"`
	ContactEmail               *string `json:"contact_email"`
	City                       *string `json:"city"`
	AddressLine1               *string `json:"address_line1"`
	AddressLine2               *string `json:"address_line2"`
	BusinessActivities         *string `json:"business_activities"`
	AcceptInternationalPayments bool   `json:"accept_international_payments"`
	SettlementCurrency         *string `json:"settlement_currency"`
	SettlementBankName         *string `json:"settlement_bank_name"`
	SettlementBankIban         *string `json:"settlement_bank_iban"`
	SettlementFrequency        *string `json:"settlement_frequency"`
	Status                     string  `json:"status"`
	ReviewerComment            *string `json:"reviewer_comment"`
	CreatedAt                  string  `json:"created_at"`
	UpdatedAt                  string  `json:"updated_at"`
	Documents                  []DocInfo `json:"documents"`
}

type DocInfo struct {
	ID                string  `json:"id"`
	DocType           string  `json:"doc_type"`
	OriginalName      string  `json:"original_name"`
	ValidationStatus  *string `json:"validation_status"`
	ValidationDetails *string `json:"validation_details"`
	UploadedAt        string  `json:"uploaded_at"`
}

func scanApplication(db *sql.DB, query string, args ...interface{}) (AppResponse, error) {
	row := db.QueryRow(query, args...)
	var app AppResponse
	err := row.Scan(
		&app.ID, &app.BusinessName, &app.BusinessCategory, &app.BusinessSubcategory,
		&app.FreeZone, &app.Country, &app.Website, &app.BusinessDescription,
		&app.MonthlyVolume, &app.OwnerName, &app.ContactPhone, &app.ContactAddress,
		&app.MCC, &app.StoreType, &app.ContactEmail, &app.City,
		&app.AddressLine1, &app.AddressLine2, &app.BusinessActivities,
		&app.AcceptInternationalPayments, &app.SettlementCurrency,
		&app.SettlementBankName, &app.SettlementBankIban, &app.SettlementFrequency,
		&app.Status, &app.ReviewerComment, &app.CreatedAt, &app.UpdatedAt,
	)
	return app, err
}

func getDocuments(db *sql.DB, appID string) []DocInfo {
	rows, err := db.Query(`
		SELECT id, doc_type, original_name, validation_status, validation_details, uploaded_at
		FROM documents WHERE application_id = $1 ORDER BY uploaded_at
	`, appID)
	if err != nil {
		return []DocInfo{}
	}
	defer rows.Close()

	docs := []DocInfo{}
	for rows.Next() {
		var d DocInfo
		rows.Scan(&d.ID, &d.DocType, &d.OriginalName, &d.ValidationStatus, &d.ValidationDetails, &d.UploadedAt)
		docs = append(docs, d)
	}
	return docs
}
