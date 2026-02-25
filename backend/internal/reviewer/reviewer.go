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
			       a.country, a.status, a.created_at, a.updated_at
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
			Status       string  `json:"status"`
			CreatedAt    string  `json:"created_at"`
			UpdatedAt    string  `json:"updated_at"`
		}

		apps := []AppItem{}
		for rows.Next() {
			var a AppItem
			rows.Scan(&a.ID, &a.MerchantName, &a.Email, &a.BusinessName,
				&a.Country, &a.Status, &a.CreatedAt, &a.UpdatedAt)
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
			SELECT a.id, u.full_name, u.email, a.business_name, a.business_type,
			       a.country, a.website, a.business_description, a.monthly_volume,
			       a.contact_phone, a.contact_address, a.status, a.reviewer_comment,
			       a.created_at, a.updated_at
			FROM applications a
			JOIN users u ON u.id = a.merchant_id
			WHERE a.id = $1
		`, appID)

		var app struct {
			ID                  string  `json:"id"`
			MerchantName        string  `json:"merchant_name"`
			Email               string  `json:"email"`
			BusinessName        *string `json:"business_name"`
			BusinessType        *string `json:"business_type"`
			Country             *string `json:"country"`
			Website             *string `json:"website"`
			BusinessDescription *string `json:"business_description"`
			MonthlyVolume       *string `json:"monthly_volume"`
			ContactPhone        *string `json:"contact_phone"`
			ContactAddress      *string `json:"contact_address"`
			Status              string  `json:"status"`
			ReviewerComment     *string `json:"reviewer_comment"`
			CreatedAt           string  `json:"created_at"`
			UpdatedAt           string  `json:"updated_at"`
			Documents           []Doc   `json:"documents"`
		}

		err := row.Scan(
			&app.ID, &app.MerchantName, &app.Email, &app.BusinessName,
			&app.BusinessType, &app.Country, &app.Website,
			&app.BusinessDescription, &app.MonthlyVolume,
			&app.ContactPhone, &app.ContactAddress,
			&app.Status, &app.ReviewerComment, &app.CreatedAt, &app.UpdatedAt,
		)
		if err == sql.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "Application not found"})
			return
		}

		docRows, _ := db.Query(`
			SELECT id, doc_type, original_name, storage_path, uploaded_at
			FROM documents WHERE application_id = $1
		`, appID)
		defer docRows.Close()

		app.Documents = []Doc{}
		for docRows.Next() {
			var d Doc
			docRows.Scan(&d.ID, &d.DocType, &d.OriginalName, &d.StoragePath, &d.UploadedAt)
			app.Documents = append(app.Documents, d)
		}

		c.JSON(http.StatusOK, app)
	}
}

type Doc struct {
	ID           string `json:"id"`
	DocType      string `json:"doc_type"`
	OriginalName string `json:"original_name"`
	StoragePath  string `json:"storage_path"`
	UploadedAt   string `json:"uploaded_at"`
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
		db.QueryRow(`SELECT status FROM applications WHERE id=$1`, appID).Scan(&oldStatus)

		_, err := db.Exec(`
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