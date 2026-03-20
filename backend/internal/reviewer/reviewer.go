package reviewer

import (
	"database/sql"
	"net/http"

	"github.com/gin-gonic/gin"
	"kyc-platform/internal/storage"
)

type ReviewRequest struct {
	Status  string `json:"status" binding:"required,oneof=approved rejected needs_more_docs"`
	Comment string `json:"comment"`
}

func ListApplications(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		if c.GetString("role") != "reviewer" {
			c.JSON(http.StatusForbidden, gin.H{"error": "Access denied"})
			return
		}

		statusFilter := c.Query("status")
		query := `
			SELECT a.id, u.full_name, u.email, a.business_name,
			       a.country, a.mcc, a.status, a.created_at, a.updated_at
			FROM applications a
			JOIN users u ON u.id = a.merchant_id
		`
		args := []interface{}{}
		if statusFilter != "" {
			query += " WHERE a.status = $1"
			args = append(args, statusFilter)
		}
		query += " ORDER BY a.updated_at DESC"

		rows, err := db.Query(query, args...)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get applications"})
			return
		}
		defer rows.Close()

		type AppItem struct {
			ID           string  `json:"id"`
			MerchantName string  `json:"merchant_name"`
			Email        string  `json:"email"`
			BusinessName *string `json:"business_name"`
			Country      *string `json:"country"`
			MCC          *string `json:"mcc"`
			Status       string  `json:"status"`
			CreatedAt    string  `json:"created_at"`
			UpdatedAt    string  `json:"updated_at"`
		}

		apps := []AppItem{}
		for rows.Next() {
			var a AppItem
			rows.Scan(&a.ID, &a.MerchantName, &a.Email, &a.BusinessName,
				&a.Country, &a.MCC, &a.Status, &a.CreatedAt, &a.UpdatedAt)
			apps = append(apps, a)
		}
		c.JSON(http.StatusOK, apps)
	}
}

func GetApplication(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		if c.GetString("role") != "reviewer" {
			c.JSON(http.StatusForbidden, gin.H{"error": "Access denied"})
			return
		}

		appID := c.Param("id")
		row := db.QueryRow(`
			SELECT a.id, u.full_name, u.email, a.business_name, a.business_category, a.business_subcategory,
			       a.free_zone, a.country, a.website, a.business_description, a.monthly_volume,
			       a.owner_name, a.contact_phone, a.contact_address,
			       a.mcc, a.store_type, a.contact_email, a.city,
			       a.address_line1, a.address_line2, a.business_activities,
			       a.accept_international_payments, a.settlement_currency,
			       a.settlement_bank_name, a.settlement_bank_iban, a.settlement_frequency,
			       a.status, a.reviewer_comment,
			       a.created_at, a.updated_at
			FROM applications a
			JOIN users u ON u.id = a.merchant_id
			WHERE a.id = $1
		`, appID)

		var app struct {
			ID                         string  `json:"id"`
			MerchantName               string  `json:"merchant_name"`
			Email                      string  `json:"email"`
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
			Documents                  []Doc   `json:"documents"`
			Owners                     []Owner `json:"owners"`
		}

		err := row.Scan(
			&app.ID, &app.MerchantName, &app.Email, &app.BusinessName,
			&app.BusinessCategory, &app.BusinessSubcategory, &app.FreeZone,
			&app.Country, &app.Website, &app.BusinessDescription, &app.MonthlyVolume,
			&app.OwnerName, &app.ContactPhone, &app.ContactAddress,
			&app.MCC, &app.StoreType, &app.ContactEmail, &app.City,
			&app.AddressLine1, &app.AddressLine2, &app.BusinessActivities,
			&app.AcceptInternationalPayments, &app.SettlementCurrency,
			&app.SettlementBankName, &app.SettlementBankIban, &app.SettlementFrequency,
			&app.Status, &app.ReviewerComment, &app.CreatedAt, &app.UpdatedAt,
		)
		if err == sql.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "Application not found"})
			return
		}

		// Load documents
		docRows, _ := db.Query(`
			SELECT id, doc_type, original_name, storage_path, validation_status, validation_details, uploaded_at
			FROM documents WHERE application_id = $1
		`, appID)
		defer docRows.Close()
		app.Documents = []Doc{}
		for docRows.Next() {
			var d Doc
			docRows.Scan(&d.ID, &d.DocType, &d.OriginalName, &d.StoragePath, &d.ValidationStatus, &d.ValidationDetails, &d.UploadedAt)
			app.Documents = append(app.Documents, d)
		}

		// Load owners
		ownerRows, _ := db.Query(`
			SELECT id, ownership_type, owner_type, first_name, last_name, company_name, email, identity_type
			FROM owners WHERE application_id = $1 ORDER BY created_at
		`, appID)
		defer ownerRows.Close()
		app.Owners = []Owner{}
		for ownerRows.Next() {
			var o Owner
			ownerRows.Scan(&o.ID, &o.OwnershipType, &o.OwnerType, &o.FirstName, &o.LastName,
				&o.CompanyName, &o.Email, &o.IdentityType)
			app.Owners = append(app.Owners, o)
		}

		c.JSON(http.StatusOK, app)
	}
}

type Doc struct {
	ID                string  `json:"id"`
	DocType           string  `json:"doc_type"`
	OriginalName      string  `json:"original_name"`
	StoragePath       string  `json:"storage_path"`
	ValidationStatus  *string `json:"validation_status"`
	ValidationDetails *string `json:"validation_details"`
	UploadedAt        string  `json:"uploaded_at"`
}

type Owner struct {
	ID            string  `json:"id"`
	OwnershipType string  `json:"ownership_type"`
	OwnerType     *string `json:"owner_type"`
	FirstName     *string `json:"first_name"`
	LastName      *string `json:"last_name"`
	CompanyName   *string `json:"company_name"`
	Email         *string `json:"email"`
	IdentityType  *string `json:"identity_type"`
}

func ReviewApplication(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		if c.GetString("role") != "reviewer" {
			c.JSON(http.StatusForbidden, gin.H{"error": "Access denied"})
			return
		}

		reviewerID := c.GetString("user_id")
		appID := c.Param("id")

		var req ReviewRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		var oldStatus string
		err := db.QueryRow(`SELECT status FROM applications WHERE id=$1`, appID).Scan(&oldStatus)
		if err == sql.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "Application not found"})
			return
		}

		// Allow status change from any non-draft status (fix: was only working from pending)
		if oldStatus == "draft" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Cannot review a draft application"})
			return
		}

		_, err = db.Exec(`
			UPDATE applications
			SET status=$1, reviewer_id=$2, reviewer_comment=$3, updated_at=NOW()
			WHERE id=$4
		`, req.Status, reviewerID, req.Comment, appID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update status"})
			return
		}

		db.Exec(`
			INSERT INTO status_history (application_id, changed_by, old_status, new_status, comment)
			VALUES ($1, $2, $3, $4, $5)
		`, appID, reviewerID, oldStatus, req.Status, req.Comment)

		c.JSON(http.StatusOK, gin.H{"message": "Status updated", "status": req.Status})
	}
}

func GetDocumentURL(db *sql.DB, store *storage.MinIOClient) gin.HandlerFunc {
	return func(c *gin.Context) {
		docID := c.Param("docId")

		var path, originalName, mimeType string
		err := db.QueryRow(
			`SELECT storage_path, original_name, COALESCE(mime_type, 'application/octet-stream') FROM documents WHERE id = $1`, docID,
		).Scan(&path, &originalName, &mimeType)
		if err == sql.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "Document not found"})
			return
		}

		c.Header("Content-Type", mimeType)
		c.Header("Content-Disposition", "inline; filename=\""+originalName+"\"")

		_, _, err = store.StreamTo(path, c.Writer)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to stream document"})
		}
	}
}
