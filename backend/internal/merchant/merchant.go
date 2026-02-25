package merchant

import (
	"database/sql"
	"net/http"

	"github.com/gin-gonic/gin"
	"kyc-platform/internal/storage"
)

type ApplicationRequest struct {
	BusinessName        string `json:"business_name"`
	BusinessCategory    string `json:"business_category"`
	BusinessSubcategory string `json:"business_subcategory"`
	FreeZone            bool   `json:"free_zone"`
	Country             string `json:"country"`
	Website             string `json:"website"`
	BusinessDescription string `json:"business_description"`
	MonthlyVolume       string `json:"monthly_volume"`
	OwnerName           string `json:"owner_name"`
	ContactPhone        string `json:"contact_phone"`
	ContactAddress      string `json:"contact_address"`
}

func GetMyApplication(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		merchantID := c.GetString("user_id")

		row := db.QueryRow(`
			SELECT id, business_name, business_category, business_subcategory, free_zone,
			       country, website, business_description, monthly_volume,
			       owner_name, contact_phone, contact_address,
			       status, reviewer_comment, created_at, updated_at
			FROM applications WHERE merchant_id = $1
			ORDER BY created_at DESC LIMIT 1
		`, merchantID)

		var app struct {
			ID                  string  `json:"id"`
			BusinessName        *string `json:"business_name"`
			BusinessCategory    *string `json:"business_category"`
			BusinessSubcategory *string `json:"business_subcategory"`
			FreeZone            bool    `json:"free_zone"`
			Country             *string `json:"country"`
			Website             *string `json:"website"`
			BusinessDescription *string `json:"business_description"`
			MonthlyVolume       *string `json:"monthly_volume"`
			OwnerName           *string `json:"owner_name"`
			ContactPhone        *string `json:"contact_phone"`
			ContactAddress      *string `json:"contact_address"`
			Status              string  `json:"status"`
			ReviewerComment     *string `json:"reviewer_comment"`
			CreatedAt           string  `json:"created_at"`
			UpdatedAt           string  `json:"updated_at"`
		}

		err := row.Scan(
			&app.ID, &app.BusinessName, &app.BusinessCategory, &app.BusinessSubcategory,
			&app.FreeZone, &app.Country, &app.Website, &app.BusinessDescription,
			&app.MonthlyVolume, &app.OwnerName, &app.ContactPhone, &app.ContactAddress,
			&app.Status, &app.ReviewerComment, &app.CreatedAt, &app.UpdatedAt,
		)
		if err == sql.ErrNoRows {
			c.JSON(http.StatusOK, nil)
			return
		}
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get application"})
			return
		}
		c.JSON(http.StatusOK, app)
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
			   owner_name, contact_phone, contact_address)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
			RETURNING id
		`, merchantID, req.BusinessName, req.BusinessCategory, req.BusinessSubcategory,
			req.FreeZone, req.Country, req.Website, req.BusinessDescription,
			req.MonthlyVolume, req.OwnerName, req.ContactPhone, req.ContactAddress,
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
			  owner_name=$9, contact_phone=$10, contact_address=$11, updated_at=NOW()
			WHERE merchant_id=$12 AND status IN ('draft','needs_more_docs')
		`, req.BusinessName, req.BusinessCategory, req.BusinessSubcategory, req.FreeZone,
			req.Country, req.Website, req.BusinessDescription, req.MonthlyVolume,
			req.OwnerName, req.ContactPhone, req.ContactAddress, merchantID,
		)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update application"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "Updated"})
	}
}

func SubmitApplication(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		merchantID := c.GetString("user_id")

		var appID string
		err := db.QueryRow(`
			SELECT id FROM applications
			WHERE merchant_id=$1 AND status IN ('draft','needs_more_docs')
			ORDER BY created_at DESC LIMIT 1
		`, merchantID).Scan(&appID)

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
			VALUES ($1, $2, 'draft', 'pending')
		`, appID, merchantID)

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

		path, err := store.Upload(file, header, appID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to upload file"})
			return
		}

		var docID string
		err = db.QueryRow(`
			INSERT INTO documents (application_id, doc_type, original_name, storage_path, mime_type, file_size)
			VALUES ($1, $2, $3, $4, $5, $6) RETURNING id
		`, appID, docType, header.Filename, path,
			header.Header.Get("Content-Type"), header.Size,
		).Scan(&docID)

		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save document"})
			return
		}

		c.JSON(http.StatusCreated, gin.H{"id": docID, "path": path})
	}
}